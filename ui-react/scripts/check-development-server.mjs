import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');

const server = await createServer({
  configFile: path.join(projectRoot, 'vite.config.mjs'),
  logLevel: 'silent',
  server: {
    host: '127.0.0.1',
    port: 0,
    strictPort: true
  }
});

try {
  await server.listen();

  const address = server.httpServer.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const headers = { Accept: 'text/html' };

  for (const route of ['/', '/single-room/room-test']) {
    const response = await fetch(`${baseUrl}${route}`, { headers });
    const html = await response.text();

    if (!response.ok || !html.includes('<div id="app"></div>')) {
      throw new Error(`Vite development route failed: ${route}`);
    }
  }

  const entryResponse = await fetch(`${baseUrl}/src/index.jsx`);
  if (!entryResponse.ok) {
    throw new Error('Vite did not transform the React entry point');
  }

  console.log('PASS Vite serves the development entry and single-room fallback');
} finally {
  server.httpServer?.closeAllConnections();
  await Promise.race([
    server.close(),
    new Promise((resolve) => setTimeout(resolve, 1000))
  ]);
}
