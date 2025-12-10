/**
 * Output directory cleaning utilities.
 */
import { existsSync, readdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
/**
 * Clean the output directory while preserving specific files.
 * @param outputDir Path to the output directory
 * @param preserveFiles List of files to preserve
 * @param logger Logger instance
 */
export function cleanOutputDirectory(outputDir, preserveFiles = ['project.json'], logger) {
    if (!existsSync(outputDir)) {
        return;
    }
    // Save contents of files that should be preserved
    const preservedContents = new Map();
    for (const file of preserveFiles) {
        const filePath = join(outputDir, file);
        if (existsSync(filePath)) {
            try {
                const content = readFileSync(filePath, 'utf-8');
                preservedContents.set(file, content);
            }
            catch (e) {
                logger.warn(`Failed to read ${file}: ${e}`);
            }
        }
    }
    // Remove all entries inside the directory
    try {
        const entries = readdirSync(outputDir);
        for (const entry of entries) {
            const entryPath = join(outputDir, entry);
            try {
                rmSync(entryPath, { recursive: true, force: true });
            }
            catch (e) {
                logger.warn(`Failed to remove ${entry}: ${e}`);
            }
        }
    }
    catch (e) {
        logger.warn(`Failed to clean directory: ${e}`);
    }
    // Restore preserved files
    for (const [file, content] of preservedContents) {
        const filePath = join(outputDir, file);
        try {
            writeFileSync(filePath, content);
        }
        catch (e) {
            logger.warn(`Failed to restore ${file}: ${e}`);
        }
    }
}
//# sourceMappingURL=clean.js.map