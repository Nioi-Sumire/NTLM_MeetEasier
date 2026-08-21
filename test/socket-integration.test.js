const assert = require('assert');
const http = require('http');
const { Server } = require('socket.io');
const { io: createClient } = require('socket.io-client');
const { createSocketController } = require('../app/socket-controller.js');

const TEST_TIMEOUT_MS = 5000;

function waitForEvent(socket, event) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off(event, handleEvent);
      reject(new Error(`Timed out waiting for ${event}`));
    }, TEST_TIMEOUT_MS);

    function handleEvent(...args) {
      clearTimeout(timeout);
      resolve(args);
    }

    socket.once(event, handleEvent);
  });
}

function createClientOptions() {
  return {
    transports: ['websocket'],
    reconnectionDelay: 10,
    reconnectionDelayMax: 20,
    randomizationFactor: 0,
    timeout: 1000
  };
}

async function closeServer(io, httpServer) {
  await new Promise((resolve) => io.close(resolve));

  if (httpServer.listening) {
    await new Promise((resolve, reject) => {
      httpServer.close(error => error ? reject(error) : resolve());
    });
  }
}

async function run() {
  const rooms = [{ RoomAlias: 'integration-room', Busy: false }];
  const httpServer = http.createServer();
  const io = new Server(httpServer, { serveClient: false });
  let loadCount = 0;
  const controller = createSocketController(io, {
    env: { EWS_POLL_INTERVAL_MS: '60000' },
    getRooms(callback) {
      loadCount++;
      setImmediate(() => callback(null, rooms));
    }
  });

  await new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(0, '127.0.0.1', resolve);
  });

  const { port } = httpServer.address();
  const url = `http://127.0.0.1:${port}`;
  let client = createClient(url, createClientOptions());

  try {
    const updatedRooms = waitForEvent(client, 'updatedRooms');
    const [receivedRooms] = await updatedRooms;

    assert.deepStrictEqual(receivedRooms, rooms);
    assert.strictEqual(loadCount, 1);

    const disconnected = waitForEvent(client, 'disconnect');
    const reconnected = waitForEvent(client, 'connect');
    client.io.engine.close();
    await disconnected;
    await reconnected;

    assert.strictEqual(loadCount, 1, 'network reconnect must not start another poller');

    client.close();
    client = createClient(url, createClientOptions());
    await waitForEvent(client, 'connect');

    assert.strictEqual(loadCount, 1, 'page reload must not start another poller');

    console.log('PASS Socket.IO 4 handshake, network reconnect and page reload');
    console.log('\n1/1 socket integration tests passed');
  } finally {
    client.close();
    controller.stop();
    await closeServer(io, httpServer);
  }
}

run().catch(error => {
  console.error('FAIL Socket.IO 4 handshake, network reconnect and page reload');
  console.error(error.stack || error);
  process.exitCode = 1;
});
