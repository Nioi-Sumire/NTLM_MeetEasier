const assert = require('assert');
const {
  createSocketController,
  getPollIntervalMs,
  DEFAULT_POLL_INTERVAL_MS
} = require('../app/socket-controller.js');

function createNamespace() {
  const handlers = {};
  const events = [];

  return {
    events,
    on(event, handler) {
      handlers[event] = handler;
    },
    emit(event, value) {
      events.push({ event, value });
    },
    connect() {
      handlers.connection({});
    }
  };
}

function createScheduler() {
  const tasks = [];

  return {
    tasks,
    setTimeout(callback, delay) {
      const task = { callback, delay, cancelled: false };
      tasks.push(task);
      return task;
    },
    clearTimeout(task) {
      task.cancelled = true;
    },
    runNext() {
      const task = tasks.find(entry => !entry.cancelled && !entry.ran);
      assert(task, 'Expected a scheduled timer');
      task.ran = true;
      task.callback();
    }
  };
}

function createFixture(options = {}) {
  const namespace = createNamespace();
  const scheduler = createScheduler();
  const callbacks = [];
  const logMessages = [];
  const io = {
    of(path) {
      assert.strictEqual(path, '/');
      return namespace;
    }
  };
  const controller = createSocketController(io, {
    getRooms: options.getRooms || (callback => callbacks.push(callback)),
    setTimeout: scheduler.setTimeout,
    clearTimeout: scheduler.clearTimeout,
    env: options.env || {},
    logger: {
      error(message) {
        logMessages.push(message);
      }
    }
  });

  return { namespace, scheduler, callbacks, logMessages, controller };
}

const tests = [];

function test(name, run) {
  tests.push({ name, run });
}

test('uses a 60-second default poll interval and validates overrides', () => {
  assert.strictEqual(getPollIntervalMs({}), DEFAULT_POLL_INTERVAL_MS);
  assert.strictEqual(getPollIntervalMs({ EWS_POLL_INTERVAL_MS: '5000' }), 5000);
  assert.strictEqual(getPollIntervalMs({ EWS_POLL_INTERVAL_MS: 'invalid' }), DEFAULT_POLL_INTERVAL_MS);
  assert.strictEqual(getPollIntervalMs({ EWS_POLL_INTERVAL_MS: '0' }), DEFAULT_POLL_INTERVAL_MS);
});

test('starts only one poller for multiple socket connections', () => {
  const fixture = createFixture();

  fixture.namespace.connect();
  fixture.namespace.connect();

  assert.strictEqual(fixture.callbacks.length, 1);
  assert.strictEqual(fixture.controller.getState().inFlight, true);
  assert.strictEqual(fixture.scheduler.tasks.length, 0);
});

test('schedules the next poll only after the current request completes', () => {
  const fixture = createFixture();
  fixture.namespace.connect();

  assert.strictEqual(fixture.scheduler.tasks.length, 0);
  fixture.callbacks[0](null, [{ RoomAlias: 'test-room' }]);

  assert.strictEqual(fixture.controller.getState().inFlight, false);
  assert.strictEqual(fixture.scheduler.tasks.length, 1);
  assert.strictEqual(fixture.scheduler.tasks[0].delay, DEFAULT_POLL_INTERVAL_MS);
  assert.deepStrictEqual(fixture.namespace.events, [
    { event: 'updatedRooms', value: [{ RoomAlias: 'test-room' }] },
    { event: 'controllerDone', value: 'done' }
  ]);

  fixture.scheduler.runNext();
  assert.strictEqual(fixture.callbacks.length, 2);
  assert.strictEqual(fixture.controller.getState().inFlight, true);
});

test('logs errors, signals completion and retries without emitting stale rooms', () => {
  const fixture = createFixture();
  fixture.namespace.connect();
  fixture.callbacks[0](new Error('request timed out'));

  assert.deepStrictEqual(fixture.logMessages, ['EWS update failed: request timed out']);
  assert.deepStrictEqual(fixture.namespace.events, [
    { event: 'controllerDone', value: 'done' }
  ]);
  assert.strictEqual(fixture.scheduler.tasks.length, 1);
});

test('ignores duplicate callbacks from the same EWS request', () => {
  const fixture = createFixture();
  fixture.namespace.connect();

  fixture.callbacks[0](null, []);
  fixture.callbacks[0](null, [{ RoomAlias: 'duplicate' }]);

  assert.deepStrictEqual(fixture.namespace.events, [
    { event: 'updatedRooms', value: [] },
    { event: 'controllerDone', value: 'done' }
  ]);
  assert.strictEqual(fixture.scheduler.tasks.length, 1);
});

test('turns synchronous EWS exceptions into a normal retry cycle', () => {
  const fixture = createFixture({
    getRooms() {
      throw new Error('synchronous failure');
    }
  });

  fixture.namespace.connect();

  assert.deepStrictEqual(fixture.logMessages, ['EWS update failed: synchronous failure']);
  assert.deepStrictEqual(fixture.namespace.events, [
    { event: 'controllerDone', value: 'done' }
  ]);
  assert.strictEqual(fixture.scheduler.tasks.length, 1);
});

test('stop cancels the scheduled retry', () => {
  const fixture = createFixture();
  fixture.namespace.connect();
  fixture.callbacks[0](null, []);

  fixture.controller.stop();

  assert.strictEqual(fixture.controller.getState().stopped, true);
  assert.strictEqual(fixture.scheduler.tasks[0].cancelled, true);
});

let failed = 0;

tests.forEach(({ name, run }) => {
  try {
    run();
    console.log(`PASS ${name}`);
  } catch (error) {
    failed++;
    console.error(`FAIL ${name}`);
    console.error(error.stack || error);
  }
});

console.log(`\n${tests.length - failed}/${tests.length} socket-controller tests passed`);
if (failed > 0) process.exit(1);
