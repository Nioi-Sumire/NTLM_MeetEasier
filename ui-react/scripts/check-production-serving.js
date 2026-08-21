const fs = require('fs');
const http = require('http');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');

const projectRoot = path.resolve(__dirname, '..', '..');
const buildRoot = path.join(projectRoot, 'ui-react', 'build');
const indexFile = path.join(buildRoot, 'index.html');

function findOpenPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function request(port, pathname) {
  return new Promise((resolve, reject) => {
    const req = http.get({
      hostname: '127.0.0.1',
      port,
      path: pathname,
      timeout: 2000
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({
        statusCode: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks)
      }));
    });

    req.once('timeout', () => req.destroy(new Error(`Request timed out: ${pathname}`)));
    req.once('error', reject);
  });
}

async function waitForServer(port, child) {
  const deadline = Date.now() + 10000;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`MeetEasier exited before serving requests (code ${child.exitCode})`);
    }

    try {
      const response = await request(port, '/api/heartbeat');
      if (response.statusCode === 200) return;
    } catch (_) {}

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error('MeetEasier did not start within 10 seconds');
}

function assertResponse(response, expectedBody, description) {
  if (response.statusCode !== 200) {
    throw new Error(`${description} returned HTTP ${response.statusCode}`);
  }

  if (!response.body.equals(expectedBody)) {
    throw new Error(`${description} did not return the expected file contents`);
  }
}

async function main() {
  if (!fs.existsSync(indexFile)) {
    throw new Error('Production build is missing. Run npm run build first.');
  }

  const port = await findOpenPort();
  const output = [];
  const child = spawn(process.execPath, ['server.js'], {
    cwd: projectRoot,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  child.stdout.on('data', (chunk) => output.push(chunk));
  child.stderr.on('data', (chunk) => output.push(chunk));

  try {
    await waitForServer(port, child);

    const heartbeat = await request(port, '/api/heartbeat');
    if (heartbeat.statusCode !== 200) {
      throw new Error(`heartbeat returned HTTP ${heartbeat.statusCode}`);
    }
    if (JSON.parse(heartbeat.body.toString('utf8')).status !== 'OK') {
      throw new Error('heartbeat did not return status OK');
    }

    const index = fs.readFileSync(indexFile);
    assertResponse(await request(port, '/'), index, 'root route');
    assertResponse(
      await request(port, '/single-room/raum055---media-lounge'),
      index,
      'single-room history fallback'
    );

    const html = index.toString('utf8');
    const assetPaths = Array.from(
      html.matchAll(/(?:src|href)=["']([^"']+)["']/gi),
      (match) => match[1]
    ).filter((reference) => (
      reference.startsWith('/') && !reference.startsWith('//')
    ));

    for (const assetPath of assetPaths) {
      const pathname = assetPath.split(/[?#]/, 1)[0];
      const relativeFile = pathname.replace(/^\/+/, '');
      const candidates = [
        path.join(projectRoot, 'static', relativeFile),
        path.join(buildRoot, relativeFile)
      ];
      const expectedFile = candidates.find((candidate) => fs.existsSync(candidate));

      if (!expectedFile) {
        throw new Error(`cannot resolve referenced asset ${assetPath}`);
      }

      assertResponse(
        await request(port, pathname),
        fs.readFileSync(expectedFile),
        `asset ${pathname}`
      );
    }

    console.log('PASS Express serves the production build and single-room fallback');
  } finally {
    if (child.exitCode === null) child.kill();
  }
}

main().catch((error) => {
  console.error(`Production serving check failed: ${error.message}`);
  process.exitCode = 1;
});
