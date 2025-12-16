/**
 * File optimization utilities.
 */
import { existsSync, readdirSync, statSync, rmSync } from 'node:fs';
import { join } from 'node:path';
/**
 * Optimize node_modules size.
 */
export function optimizeNodeModules(serverDir) {
    const nodeModulesPath = join(serverDir, 'node_modules');
    if (!existsSync(nodeModulesPath)) {
        return;
    }
    cleanDirectory(nodeModulesPath);
}
/**
 * Recursively traverse directories and remove unnecessary files.
 */
function cleanDirectory(dir) {
    const unnecessaryPatterns = [
        /\.map$/, // source maps
        /\.d\.ts$/, // TypeScript declaration files
        /\.md$/, // Markdown docs
        /^README/i, // README files
        /^CHANGELOG/i, // CHANGELOG files
        /^LICENSE/i, // LICENSE files
        /\.test\./, // test files
        /\.spec\./, // spec files
        /^__tests__$/, // __tests__ directory
        /^tests?$/, // test/tests directories
        /^example/i, // example directories
        /^\.git/, // git directories
    ];
    let removedCount = 0;
    function traverse(currentDir) {
        if (!existsSync(currentDir))
            return;
        try {
            const entries = readdirSync(currentDir);
            for (const entry of entries) {
                const fullPath = join(currentDir, entry);
                try {
                    const stat = statSync(fullPath);
                    // Determine whether the entry is unnecessary
                    const shouldRemove = unnecessaryPatterns.some(pattern => pattern.test(entry));
                    if (shouldRemove) {
                        rmSync(fullPath, { recursive: true, force: true });
                        removedCount++;
                        continue;
                    }
                    // Recurse into subdirectories
                    if (stat.isDirectory()) {
                        traverse(fullPath);
                    }
                }
                catch (e) {
                    // Ignore individual entry errors
                }
            }
        }
        catch (e) {
            // Ignore directory read errors
        }
    }
    traverse(dir);
}
//# sourceMappingURL=optimizer.js.map