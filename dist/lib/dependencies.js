/**
 * Dependency analysis and copy utilities
 */
import { existsSync, readdirSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import nodePath, { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { nodeFileTrace } from '@vercel/nft';
import { globSync } from 'tinyglobby';
/**
 * Analyze dependencies via @vercel/nft and return package names and file list
 * @param rootDir - Project root directory
 * @param serverDir - Server output directory
 * @param serverEntryFile - Server entry file name
 * @param logger - Logger instance
 * @param cache - Optional NFT cache object to speed up repeated analysis
 */
export async function analyzeDependencies(rootDir, serverDir, serverEntryFile, logger, cache) {
    const entryFile = join(serverDir, serverEntryFile);
    const renderersFile = join(serverDir, 'renderers.mjs');
    if (!existsSync(entryFile)) {
        logger.warn(`${serverEntryFile} not found, skipping dependency analysis`);
        return { packageNames: new Set(), fileList: new Set() };
    }
    try {
        // Analyze dependencies with NFT
        const filesToAnalyze = [entryFile];
        if (existsSync(renderersFile)) {
            filesToAnalyze.push(renderersFile);
        }
        // Include all .mjs entry files under the pages/ directory
        const pagesDir = join(serverDir, 'pages');
        if (existsSync(pagesDir)) {
            const addPageFiles = (dir) => {
                const entries = readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = join(dir, entry.name);
                    if (entry.isDirectory()) {
                        addPageFiles(fullPath);
                    }
                    else if (entry.isFile() && entry.name.endsWith('.mjs')) {
                        filesToAnalyze.push(fullPath);
                    }
                }
            };
            addPageFiles(pagesDir);
        }
        const { fileList, warnings } = await nodeFileTrace(filesToAnalyze, {
            base: rootDir,
            processCwd: rootDir,
            ts: true,
            mixedModules: true,
            ...(cache && { cache }), // Use provided cache if available
        });
        // Handle warnings
        // Use a single regex to aggregate package names (sharp and its optional family)
        const aggregateRegex = /^(?:@img\/sharp.*|sharp(?:-|$).*)$/;
        const aggregatedModules = new Set();
        for (const warning of warnings) {
            if (warning.message.startsWith("Failed to resolve dependency")) {
                const match = /Cannot find module '(.+?)' loaded from (.+)/.exec(warning.message);
                if (match) {
                    const [, module, file] = match;
                    // Ignore Astro internal module resolution errors
                    if (module === "@astrojs/") {
                        continue;
                    }
                    // Aggregate matched modules, skip per-item printing
                    if (aggregateRegex.test(module)) {
                        aggregatedModules.add(module);
                        continue;
                    }
                    // Log other unresolved modules as warnings
                    logger.warn(`Module "${module}" couldn't be resolved from "${file}"`);
                }
            }
            else if (warning.message.startsWith("Failed to parse")) {
                // Skip parse errors
                continue;
            }
            else {
                // Log other warnings from NFT
                logger.warn(`NFT warning: ${warning.message}`);
            }
        }
        // Emit a single aggregated message if any matched modules exist
        if (aggregatedModules.size > 0) {
            const modulesList = Array.from(aggregatedModules).sort().join(', ');
            logger.warn(`Astro Image (sharp) is not supported on EdgeOne Pages runtime. The following optional image modules were skipped: ${modulesList}.`);
        }
        const packageNames = new Set();
        // Extract package names (do not copy files here)
        for (const file of fileList) {
            if (file.startsWith('node_modules/')) {
                const parts = file.split('/');
                if (parts[1].startsWith('@')) {
                    // Scoped package: @scope/name
                    if (parts.length >= 3) {
                        packageNames.add(`${parts[1]}/${parts[2]}`);
                    }
                }
                else {
                    // Regular package: name
                    packageNames.add(parts[1]);
                }
            }
        }
        return { packageNames, fileList: new Set(fileList) };
    }
    catch (error) {
        logger.error(`Failed to analyze dependencies: ${error}`);
        return { packageNames: new Set(['astro']), fileList: new Set() };
    }
}
/**
 * Copy files to folder with symlink resolution (adapted from @astrojs/internal-helpers/fs)
 * This handles pnpm's symlink structure by resolving real paths and creating relative symlinks
 *
 * @param files - List of file URLs to copy
 * @param outDir - Output directory URL
 * @param baseDir - Base directory to calculate relative paths from (e.g., rootDir)
 * @param exclude - List of file URLs to exclude
 */
async function copyFilesToFolder(files, outDir, baseDir, exclude = []) {
    const excludeList = exclude.map((url) => fileURLToPath(url));
    const fileList = files.map((url) => fileURLToPath(url)).filter((f) => !excludeList.includes(f));
    if (fileList.length === 0) {
        return;
    }
    // Use baseDir as the common ancestor to preserve directory structure (e.g., node_modules/)
    const commonAncestor = baseDir;
    // Copy files with symlink handling
    for (const origin of fileList) {
        const dest = new URL(nodePath.relative(commonAncestor, origin), outDir);
        const realpath = await fs.realpath(origin);
        const isSymlink = realpath !== origin;
        const isDir = (await fs.stat(origin)).isDirectory();
        if (isDir && !isSymlink) {
            await fs.mkdir(new URL('..', dest), { recursive: true });
        }
        else {
            await fs.mkdir(new URL('.', dest), { recursive: true });
        }
        if (isSymlink) {
            const realdest = fileURLToPath(new URL(nodePath.relative(commonAncestor, realpath), outDir));
            const target = nodePath.relative(fileURLToPath(new URL('.', dest)), realdest);
            if (!existsSync(dest)) {
                await fs.symlink(target, dest, isDir ? 'dir' : 'file');
            }
        }
        else if (!isDir) {
            await fs.copyFile(origin, dest);
        }
    }
}
/**
 * Copy dependencies using the same approach as @astrojs/vercel
 */
export async function copyDependencies(rootDir, serverDir, fileList, _logger, includeFiles = [], excludeFiles = []) {
    // Convert file list to URLs with rootDir as base
    const base = pathToFileURL(rootDir.endsWith('/') ? rootDir : `${rootDir}/`);
    const outDir = pathToFileURL(serverDir.endsWith('/') ? serverDir : `${serverDir}/`);
    // Filter files: only node_modules and package.json
    const filteredFiles = [];
    for (const file of fileList) {
        const sourcePath = join(rootDir, file);
        // Skip files already under the server-handler directory
        if (sourcePath.startsWith(serverDir)) {
            continue;
        }
        // Only process node_modules and package.json files
        if (!file.startsWith('node_modules/') && !file.endsWith('package.json')) {
            continue;
        }
        // Apply excludeFiles patterns
        if (excludeFiles.length > 0) {
            const shouldExclude = excludeFiles.some((pattern) => {
                const regex = new RegExp(pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*'));
                return regex.test(file);
            });
            if (shouldExclude) {
                continue;
            }
        }
        if (existsSync(sourcePath)) {
            filteredFiles.push(new URL(file, base));
        }
    }
    // Handle includeFiles - force include patterns (from project root)
    if (includeFiles.length > 0) {
        for (const pattern of includeFiles) {
            try {
                const matched = globSync(pattern, { cwd: rootDir, absolute: false });
                for (const f of matched) {
                    const sourcePath = join(rootDir, f);
                    if (existsSync(sourcePath)) {
                        filteredFiles.push(new URL(f, base));
                    }
                }
            }
            catch {
                // Ignore glob errors
            }
        }
    }
    // Copy files using the Vercel-style approach, preserving node_modules structure
    if (filteredFiles.length > 0) {
        await copyFilesToFolder(filteredFiles, outDir, rootDir, []);
    }
}
//# sourceMappingURL=dependencies.js.map