/**
 * Server entry file generation utilities
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_PORT } from './constants.js';

/**
 * Create server entry file index.mjs
 */
export function createServerEntryFile(
  serverDir: string,
  serverEntryFile: string,
  port: number = DEFAULT_PORT
): void {
  const indexContent = generateServerEntryContent(serverEntryFile, port);
  writeFileSync(join(serverDir, 'handler.js'), indexContent);
}



/**
 * Generate server entry file content
 */
function generateServerEntryContent(serverEntryFile: string, port: number): string {
  return `
async function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => {
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const bodyBuffer = Buffer.concat(chunks);
        resolve(bodyBuffer.length ? bodyBuffer : undefined);
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

const handlerPromise = import('./${serverEntryFile}');

async  function astroHandler (req, res) {
  try {
    const host = req.headers.host || 'localhost';
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const url = new URL(req.url, proto + '://' + host);

    const { default: handler } = await handlerPromise;

    let bodyBuffer;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      bodyBuffer = await readRequestBody(req);
    }

    const headers = new Headers(req.headers);
    const requestInit = {
      method: req.method,
      headers,
      body: bodyBuffer,
    };

    const request = new Request(url.toString(), requestInit);
    const response = await handler(request);

    // await handleResponse(res, response);
    return response;
  } catch (error) {
    console.error('SSR Error:', error);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end('<html><body><h1>Error</h1><p>' + error.message + '</p></body></html>');
  }
}

export default astroHandler;
`;
}

