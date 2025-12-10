import type { SSRManifest } from 'astro';
import { App } from 'astro/app';

export function createExports(manifest: SSRManifest) {
  const app = new App(manifest);

  const handler = async (request: Request): Promise<Response> => {
    // Match route using Astro's App
    const routeData = app.match(request);
    
    if (!routeData) {
      // Try to render 404 page if no route matches
      const url = new URL(request.url);
      const notFoundUrl = new URL('/404', url.origin);
      const notFoundRequest = new Request(notFoundUrl.toString(), {
        method: request.method,
        headers: request.headers,
      });
      
      const notFoundRouteData = app.match(notFoundRequest);
      if (notFoundRouteData) {
        // Render the 404 page
        return app.render(notFoundRequest, { routeData: notFoundRouteData });
      }
      
      // If no 404 page exists, return a simple 404 response
      return new Response('Not found', { status: 404 });
    }

    return app.render(request, { routeData });
  };

  return { default: handler };
}

