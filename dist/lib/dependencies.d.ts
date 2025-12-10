/**
 * Dependency analysis and copy utilities
 */
import type { Logger } from './types.js';
/**
 * Analyze dependencies via @vercel/nft and return package names and file list
 * @param cache - Optional NFT cache object to speed up repeated analysis
 */
export declare function analyzeDependencies(rootDir: string, serverDir: string, serverEntryFile: string, logger: Logger, cache?: any): Promise<{
    packageNames: Set<string>;
    fileList: Set<string>;
}>;
/**
 * Copy dependencies
 */
export declare function copyDependencies(rootDir: string, serverDir: string, fileList: Set<string>, logger: Logger, includeFiles?: string[], excludeFiles?: string[]): Promise<void>;
//# sourceMappingURL=dependencies.d.ts.map