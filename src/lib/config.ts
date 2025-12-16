/**
 * Configuration generation utilities.
 */

import { existsSync, writeFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import type { MetaConfig, RouteConfig } from './types.js';

/**
 * Create a minimal server-handler package.json (type: module only)
 */
export function createSimpleServerPackageJson(serverDir: string): void {
  const serverPackageJson = {
    name: 'edgeone-server-handler',
    type: 'module',
    version: '1.0.0',
    private: true
  };
  
  writeFileSync(
    join(serverDir, 'package.json'),
    JSON.stringify(serverPackageJson, null, 2)
  );
}

function getMatchPattern(segments: any[][]): string {
  return segments
    .map((segment) => {
      return segment
        .map((part: any) => {
          if (part.spread) {
            const paramName = part.content.startsWith('...') ? part.content.slice(3) : part.content;
            return `:${paramName}*`;
          }
          if (part.dynamic) {
            return `:${part.content}`;
          }
          return part.content;
        })
        .join('');
    })
    .join('/');
}

/**
 * Get redirect destination path.
 */
function getRedirectLocation(route: any, base: string): string {
  if (route.redirectRoute) {
    const pattern = getMatchPattern(route.redirectRoute.segments);
    return posix.join(base, pattern).replace(/\/\//g, '/');
  }
  const destination = typeof route.redirect === 'object' ? route.redirect.destination : route.redirect ?? '';
  // Check if it's a remote URL (starts with http:// or https://)
  if (destination.startsWith('http://') || destination.startsWith('https://')) {
    return destination;
  }
  return posix.join(base, destination).replace(/\/\//g, '/');
}

/**
 * Get redirect status code.
 */
function getRedirectStatus(route: any): number {
  if (typeof route.redirect === 'object') {
    return route.redirect.status;
  }
  return 301;
}

/**
 * Build a source path pattern from route segments (for redirects).
 */
function getRedirectSource(route: any, base: string): string {
  if (route.segments) {
    const pattern = getMatchPattern(route.segments);
    return posix.join(base, pattern).replace(/\/\//g, '/');
  }
  // If no segments exist, fall back to route.route
  return posix.join(base, route.route || '').replace(/\/\//g, '/');
}

/**
 * Generate meta.json config file.
 */
/**
 * Convert Astro route to regex (aligned with Vercel).
 * @param route - route path
 * @param trailingSlash - trailingSlash config: true=require, false=forbid, undefined=optional
 */
function convertRouteToRegex(route: string): string {
  // Fallback logic: used only when route.pattern is not available
  // Use optional trailing slash by default (/?$)
  
  // Dynamic route conversion
  if (route.includes('[')) {
    // /blog/[...slug] → ^/blog(?:/(.*?))?/?$
    if (route.includes('[...')) {
      const basePath = route.split('[')[0].replace(/\/$/, '');
      return `^${basePath}(?:/(.*?))?/?$`;
    }
    // /blog/[slug] → ^/blog/([^/]+?)/?$
    const basePath = route.split('[')[0];
    return `^${basePath}([^/]+?)/?$`;
  }
  
  // Static route
  if (route === '/') {
    return '^/$';
  }
  
  // Default to optional trailing slash
  return `^${route}/?$`;
}

export function createMetaConfig(
  routes: any[],
  edgeoneDir: string,
  serverHandlerDir: string,
  config?: { base?: string; buildOutput?: 'static' | 'server' }
): void {
  // Extract redirect routes
  const redirectRoutes = routes.filter((route) => route.type === 'redirect');
  
  // Build redirects
  const redirects = redirectRoutes.map((route) => {
    const base = config?.base || '/';
    return {
      source: getRedirectSource(route, base),
      destination: getRedirectLocation(route, base),
      statusCode: getRedirectStatus(route)
    };
  });

  // Keep only non-redirect routes
  const normalRoutes = routes.filter((route) => route.type !== 'redirect');

  // Check for 404 page (404.astro or 404.ts)
  const fourOhFourRoute = normalRoutes.find((route) => route.pathname === '/404');
  
  // Determine has404 and ssr404 based on 404 page existence and prerender status
  // has404: whether there's a 404 page in static files (only true for prerendered 404)
  // ssr404: whether SSR rendering includes 404 handling
  let has404 = false;
  let ssr404 = false;
  
  const buildOutput = config?.buildOutput || 'server'; // Default to server mode when called
  
  if (fourOhFourRoute) {
    // Custom 404 page exists
    if (fourOhFourRoute.prerender) {
      // Prerendered 404 page: exists in static files
      has404 = true;
      ssr404 = false;
    } else {
      // SSR 404 page: exists in SSR rendering, but not in static files
      has404 = false;
      ssr404 = true;
    }
  } else {
    // No custom 404 page
    if (buildOutput === 'server') {
      // In SSR mode, Astro has default 404 handling (returns 404 response when no route matches)
      // So SSR rendering includes 404 handling, but no static 404 file
      has404 = false;  // No static 404 file
      ssr404 = true;   // SSR rendering includes 404 handling
    } else {
      // In static mode, no 404 handling without custom 404 page
      has404 = false;
      ssr404 = false;
    }
  }

  const metaData: MetaConfig = {
    conf: {
      headers: [],
      redirects,
      has404,
      ssr404,
    },
    frameworkRoutes: normalRoutes
      // Only exclude prerendered 404 routes from frameworkRoutes
      // SSR 404 routes should be included (aligned with Vercel adapter behavior)
      .filter((route) => !(route.pathname === '/404' && route.prerender))
      .map(route => {
      // Align with Vercel adapter: use route.patternRegex.source as-is
      // Vercel adapter reference: src: route.patternRegex.source
      let pattern: string;
      
      if (route.pattern) {
        // Use Astro-generated pattern; remove escapes for JSON serialization
        pattern = route.pattern.source.replace(/\\\//g, '/');
      } else {
        // If route.pattern is missing, fall back to conversion (normally Astro provides pattern)
        pattern = convertRouteToRegex(route.route);
        pattern = pattern.replace(/\\\//g, '/');
      }
      
      const routeConfig: RouteConfig = {
        // Use regex pattern
        regexPath: pattern,
      };
      
      // If prerendered, mark as static
      if (route.prerender) {
        routeConfig.isStatic = true;
        routeConfig.srcRoute = route.route;
      }
      
      return routeConfig;
    }),
  };

  // Write to server-handler directory (SSR only, when directory exists)
  // Note: serverHandlerDir may equal edgeoneDir in static mode
  if (serverHandlerDir !== edgeoneDir && existsSync(serverHandlerDir)) {
    const serverMetaPath = join(serverHandlerDir, 'meta.json');
    writeFileSync(serverMetaPath, JSON.stringify(metaData, null, 2));
  }
  
  // Also write to .edgeone directory
  const edgeoneMetaPath = join(edgeoneDir, 'meta.json');
  writeFileSync(edgeoneMetaPath, JSON.stringify(metaData, null, 2));
}

