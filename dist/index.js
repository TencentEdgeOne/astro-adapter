/**
 * EdgeOne Astro Adapter
 *
 * Adapter to deploy Astro projects to EdgeOne Pages
 */
import { fileURLToPath } from 'node:url';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { globSync } from 'tinyglobby';
import { PACKAGE_NAME, ASSETS_DIR, SERVER_HANDLER_DIR } from './lib/constants.js';
import { analyzeDependencies, copyDependencies } from './lib/dependencies.js';
import { createSimpleServerPackageJson, createMetaConfig } from './lib/config.js';
import { optimizeNodeModules } from './lib/optimizer.js';
import { cleanOutputDirectory } from './lib/clean.js';
import { createServerEntryFile } from './lib/server-entry.js';
/**
 * Get adapter configuration
 */
function getAdapter() {
    const serverEntrypoint = fileURLToPath(new URL('./server.js', import.meta.url));
    return {
        name: PACKAGE_NAME,
        serverEntrypoint,
        exports: ['default'],
        supportedAstroFeatures: {
            hybridOutput: 'stable',
            staticOutput: 'stable',
            serverOutput: 'stable',
            i18nDomains: 'experimental',
            envGetSecret: 'stable',
            sharpImageService: 'stable',
        },
    };
}
/**
 * EdgeOne adapter main function
 */
export default function edgeoneAdapter(options = {}) {
    const { outDir = '.edgeone', includeFiles = [], excludeFiles = [] } = options;
    // Persisted config
    let _config;
    let _buildOutput;
    // NFT cache object (created per adapter instance, reset each build)
    let _nftCache = {};
    return {
        name: PACKAGE_NAME,
        hooks: {
            'astro:config:setup': ({ updateConfig }) => {
                updateConfig({
                    build: {
                        format: 'directory',
                        redirects: false,
                    },
                    vite: {
                        ssr: {
                            external: ['@vercel/nft', 'node:async_hooks'],
                        },
                    },
                });
            },
            'astro:config:done': ({ setAdapter, config, buildOutput }) => {
                _config = config;
                _buildOutput = buildOutput;
                setAdapter(getAdapter());
            },
            'astro:build:start': ({ logger }) => {
                // Reset NFT cache on each build start
                _nftCache = {};
                // Clean output dir at build start but keep project.json
                const edgeoneDir = fileURLToPath(new URL(`./${outDir}/`, _config.root));
                cleanOutputDirectory(edgeoneDir, ['project.json'], logger);
            },
            'astro:build:done': async ({ routes, logger }) => {
                const edgeoneDir = fileURLToPath(new URL(`./${outDir}/`, _config.root));
                const staticDir = fileURLToPath(new URL(`./${outDir}/${ASSETS_DIR}/`, _config.root));
                const serverDir = fileURLToPath(new URL(`./${outDir}/${SERVER_HANDLER_DIR}/`, _config.root));
                // Create output directories
                mkdirSync(edgeoneDir, { recursive: true });
                mkdirSync(staticDir, { recursive: true });
                if (_buildOutput === 'server') {
                    mkdirSync(serverDir, { recursive: true });
                }
                // Copy static files
                // In static mode: from dist/client
                // In server mode: from dist/client
                const sourceStaticDir = _buildOutput === 'static'
                    ? new URL('client/', _config.outDir) // dist/client
                    : _config.build.client;
                cpSync(fileURLToPath(sourceStaticDir), staticDir, {
                    recursive: true,
                    force: true,
                });
                // Handle server files
                if (_buildOutput === 'server') {
                    const sourceServerDir = _config.build.server;
                    cpSync(fileURLToPath(sourceServerDir), serverDir, {
                        recursive: true,
                        force: true,
                    });
                    const rootDir = fileURLToPath(_config.root);
                    const serverEntryFile = String(_config.build.serverEntry || 'entry.mjs');
                    // Merge extra files from vite.assetsInclude
                    const extraIncludeFiles = [...includeFiles];
                    if (_config.vite?.assetsInclude) {
                        const processAssetsInclude = (pattern) => {
                            if (typeof pattern === 'string') {
                                try {
                                    const matched = globSync(pattern, { cwd: rootDir, absolute: false });
                                    matched.forEach(file => extraIncludeFiles.push(file));
                                }
                                catch (e) {
                                    logger.warn(`Failed to match vite.assetsInclude pattern "${pattern}": ${e}`);
                                }
                            }
                            else if (pattern instanceof RegExp) {
                                // RegExp not supported for globbing, skip
                            }
                            else if (Array.isArray(pattern)) {
                                for (const p of pattern) {
                                    processAssetsInclude(p);
                                }
                            }
                        };
                        processAssetsInclude(_config.vite.assetsInclude);
                    }
                    // Analyze and copy dependencies
                    const { fileList } = await analyzeDependencies(rootDir, serverDir, serverEntryFile, logger, _nftCache);
                    createSimpleServerPackageJson(serverDir);
                    await copyDependencies(rootDir, serverDir, fileList, logger, extraIncludeFiles, excludeFiles);
                    optimizeNodeModules(serverDir, logger);
                    createServerEntryFile(serverDir, serverEntryFile);
                }
                // Generate routing config (SSR only)
                // Fully aligned with the Vercel adapter: use route.patternRegex.source, do not pass trailingSlash
                if (_buildOutput === 'server') {
                    createMetaConfig(routes, edgeoneDir, serverDir, {
                        base: _config.base || '/',
                        buildOutput: _buildOutput
                    });
                }
                // No meta.json needed in static mode
                // Clean up temporary files from Astro build (SSR only)
                if (_buildOutput === 'server') {
                    try {
                        rmSync(fileURLToPath(_config.build.server), { recursive: true, force: true });
                    }
                    catch (error) {
                        logger.warn(`Failed to clean up build temp files: ${error}`);
                    }
                }
                logger.info(`✅ Build complete! Ready to deploy to EdgeOne Pages.`);
            },
        },
    };
}
//# sourceMappingURL=index.js.map