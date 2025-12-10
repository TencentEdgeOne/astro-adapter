/**
 * Type definitions
 */

export interface EdgeOneAdapterOptions {
  /**
   * Output directory for EdgeOne Pages
   * @default '.edgeone'
   */
  outDir?: string;
  
  /**
   * Force files to be bundled with your function.
   * This is helpful when you notice missing files.
   * @example ['src/locales/**']
   */
  includeFiles?: string[];
  
  /**
   * Exclude any files from the bundling process that would otherwise be included.
   * Mainly used for excluding files from node_modules.
   * @example ['node_modules/.cache/**']
   */
  excludeFiles?: string[];
}

export interface MetaConfig {
  conf: {
    headers: any[];
    redirects?: Array<{
      source: string;
      destination: string;
      statusCode: number;
    }>;
    has404: boolean;
    ssr404: boolean;
  };
  frameworkRoutes: RouteConfig[];
}

export interface RouteConfig {
  regexPath: string;
  isStatic?: boolean;
  srcRoute?: string;
  dataRoute?: string;
}

export interface Logger {
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
}

