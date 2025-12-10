/**
 * Dependency analysis and copy utilities
 */

import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { nodeFileTrace } from '@vercel/nft';
import { globSync } from 'tinyglobby';
import type { Logger } from './types.js';

/**
 * Analyze dependencies via @vercel/nft and return package names and file list
 * @param cache - Optional NFT cache object to speed up repeated analysis
 */
export async function analyzeDependencies(
  rootDir: string,
  serverDir: string,
  serverEntryFile: string,
  logger: Logger,
  cache?: any
): Promise<{ packageNames: Set<string>; fileList: Set<string> }> {
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
      const addPageFiles = (dir: string) => {
        const entries = readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = join(dir, entry.name);
          if (entry.isDirectory()) {
            addPageFiles(fullPath);
          } else if (entry.isFile() && entry.name.endsWith('.mjs')) {
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
    const aggregatedModules = new Set<string>();
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
      } else if (warning.message.startsWith("Failed to parse")) {
        // Skip parse errors
        continue;
      } else {
        // Log other warnings from NFT
        logger.warn(`NFT warning: ${warning.message}`);
      }
    }

    // Emit a single aggregated message if any matched modules exist
    if (aggregatedModules.size > 0) {
      const modulesList = Array.from(aggregatedModules).sort().join(', ');
      logger.warn(
        `Astro Image (sharp) is not supported on EdgeOne Pages runtime. The following optional image modules were skipped: ${modulesList}.`
      );
    }
    
    const packageNames = new Set<string>();
    
    // Extract package names (do not copy files here)
    for (const file of fileList) {
      if (file.startsWith('node_modules/')) {
        const parts = file.split('/');
        if (parts[1].startsWith('@')) {
          // Scoped package: @scope/name
          if (parts.length >= 3) {
            packageNames.add(`${parts[1]}/${parts[2]}`);
          }
        } else {
          // Regular package: name
          packageNames.add(parts[1]);
        }
      }
    }
    
    return { packageNames, fileList: new Set(fileList) };
  } catch (error) {
    logger.error(`Failed to analyze dependencies: ${error}`);
    return { packageNames: new Set(['astro']), fileList: new Set() };
  }
}

/**
 * Copy dependencies
 */
export async function copyDependencies(
  rootDir: string,
  serverDir: string,
  fileList: Set<string>,
  logger: Logger,
  includeFiles: string[] = [],
  excludeFiles: string[] = []
): Promise<void> {
  const copiedFiles = new Set<string>();
  let fileCount = 0;
  
  for (const file of fileList) {
    const sourcePath = join(rootDir, file);
    const targetPath = join(serverDir, file);
    
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
      const shouldExclude = excludeFiles.some(pattern => {
        const regex = new RegExp(pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*'));
        return regex.test(file);
      });
      if (shouldExclude) {
        continue;
      }
    }
    
    if (existsSync(sourcePath) && !copiedFiles.has(file)) {
      try {
        mkdirSync(dirname(targetPath), { recursive: true });
        cpSync(sourcePath, targetPath, { force: true });
        copiedFiles.add(file);
        fileCount++;
      } catch (e) {
        // Ignore individual file copy errors
      }
    }
  }
  
  // Handle includeFiles - force include patterns (from project root)
  if (includeFiles.length > 0) {
    const additionalFiles = new Set<string>();
    
    // Use glob to find matched files
    for (const pattern of includeFiles) {
      try {
        const matched = globSync(pattern, { cwd: rootDir, absolute: false });
        matched.forEach(file => additionalFiles.add(file));
      } catch (e) {
        logger.warn(`Failed to match pattern "${pattern}": ${e}`);
      }
    }
    
    // Copy additional files
    for (const file of additionalFiles) {
      if (!copiedFiles.has(file)) {
        const sourcePath = join(rootDir, file);
        const targetPath = join(serverDir, file);
        
        if (existsSync(sourcePath)) {
          try {
            mkdirSync(dirname(targetPath), { recursive: true });
            cpSync(sourcePath, targetPath, { force: true });
            copiedFiles.add(file);
            fileCount++;
          } catch (e) {
            logger.warn(`Failed to copy ${file}: ${e}`);
          }
        }
      }
    }
  }
}

