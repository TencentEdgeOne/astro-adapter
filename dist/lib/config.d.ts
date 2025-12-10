/**
 * Configuration generation utilities.
 */
/**
 * Create a minimal server-handler package.json (type: module only)
 */
export declare function createSimpleServerPackageJson(serverDir: string): void;
export declare function createMetaConfig(routes: any[], edgeoneDir: string, serverHandlerDir: string, config?: {
    base?: string;
    buildOutput?: 'static' | 'server';
}): void;
//# sourceMappingURL=config.d.ts.map