const assert = require('assert');
const { createLedStateWriter, DEFAULT_LED_STATE_FILE } = require('../app/led-state-writer.js');

function createFileSystemStub(options = {}) {
  const calls = [];
  let stateFileExists = Boolean(options.stateFileExists);
  let failWrites = options.failWrites || 0;

  return {
    calls,
    existsSync(file) {
      calls.push({ method: 'existsSync', file });
      return file === DEFAULT_LED_STATE_FILE && stateFileExists;
    },
    mkdirSync(directory, mkdirOptions) {
      calls.push({ method: 'mkdirSync', directory, options: mkdirOptions });
    },
    writeFileSync(file, contents) {
      calls.push({ method: 'writeFileSync', file, contents });
      if (failWrites > 0) {
        failWrites--;
        throw new Error('disk unavailable');
      }
    },
    renameSync(source, destination) {
      calls.push({ method: 'renameSync', source, destination });
      stateFileExists = true;
    },
    unlinkSync(file) {
      calls.push({ method: 'unlinkSync', file });
      if (file === DEFAULT_LED_STATE_FILE) stateFileExists = false;
    }
  };
}

const tests = [];

function test(name, run) {
  tests.push({ name, run });
}

test('stays disabled when no display room alias is configured', () => {
  const fs = createFileSystemStub();
  const writer = createLedStateWriter({ fs, env: {} });

  assert.strictEqual(writer.isEnabled(), false);
  assert.strictEqual(writer.update([{ RoomAlias: 'test-room', Busy: true }]), false);
  assert.deepStrictEqual(fs.calls, []);
});

test('writes the configured room state atomically', () => {
  const fs = createFileSystemStub();
  const writer = createLedStateWriter({
    fs,
    env: { DISPLAY_ROOM_ALIAS: 'TEST-ROOM' }
  });

  assert.strictEqual(writer.update([{
    RoomAlias: 'test-room',
    Busy: true,
    ErrorMessage: 'calendar unavailable'
  }]), true);

  const write = fs.calls.find(call => call.method === 'writeFileSync');
  const rename = fs.calls.find(call => call.method === 'renameSync');
  const payload = JSON.parse(write.contents);

  assert.strictEqual(payload.roomAlias, 'test-room');
  assert.strictEqual(payload.busy, true);
  assert.strictEqual(payload.error, true);
  assert.strictEqual(typeof payload.ts, 'number');
  assert.strictEqual(rename.source, write.file);
  assert.strictEqual(rename.destination, DEFAULT_LED_STATE_FILE);
});

test('does not rewrite an unchanged state while the state file exists', () => {
  const fs = createFileSystemStub();
  const writer = createLedStateWriter({
    fs,
    env: { DISPLAY_ROOM_ALIAS: 'test-room' }
  });
  const rooms = [{ RoomAlias: 'test-room', Busy: false }];

  assert.strictEqual(writer.update(rooms), true);
  assert.strictEqual(writer.update(rooms), false);
  assert.strictEqual(fs.calls.filter(call => call.method === 'writeFileSync').length, 1);
});

test('recreates a missing state file even when the state is unchanged', () => {
  const fs = createFileSystemStub();
  const writer = createLedStateWriter({
    fs,
    env: { DISPLAY_ROOM_ALIAS: 'test-room' }
  });
  const rooms = [{ RoomAlias: 'test-room', Busy: false }];

  writer.update(rooms);
  fs.unlinkSync(DEFAULT_LED_STATE_FILE);
  assert.strictEqual(writer.update(rooms), true);
  assert.strictEqual(fs.calls.filter(call => call.method === 'writeFileSync').length, 2);
});

test('logs write failures and retries the same state later', () => {
  const fs = createFileSystemStub({ failWrites: 1 });
  const messages = [];
  const writer = createLedStateWriter({
    fs,
    env: { DISPLAY_ROOM_ALIAS: 'test-room' },
    logger: { error: message => messages.push(message) }
  });
  const rooms = [{ RoomAlias: 'test-room', Busy: true }];

  assert.strictEqual(writer.update(rooms), false);
  assert.strictEqual(writer.update(rooms), true);
  assert.deepStrictEqual(messages, ['LED state update failed: disk unavailable']);
  assert.strictEqual(fs.calls.filter(call => call.method === 'writeFileSync').length, 2);
});

test('ignores room collections that do not contain the configured room', () => {
  const fs = createFileSystemStub();
  const writer = createLedStateWriter({
    fs,
    env: { DISPLAY_ROOM_ALIAS: 'another-room' }
  });

  assert.strictEqual(writer.update([{ RoomAlias: 'test-room', Busy: true }]), false);
  assert.deepStrictEqual(fs.calls, []);
});

let failed = 0;

for (const { name, run } of tests) {
  try {
    run();
    console.log(`PASS ${name}`);
  } catch (error) {
    failed++;
    console.error(`FAIL ${name}`);
    console.error(error.stack || error);
  }
}

console.log(`\n${tests.length - failed}/${tests.length} LED state-writer tests passed`);
if (failed > 0) process.exit(1);
