'use strict';

const assert = require('assert');
const { EventEmitter } = require('events');
const { PassThrough } = require('stream');
const {
  createCommandRunner,
  createPersistentGpioSetter,
  createStateController,
  findChipByLabel,
  gpioinfoArgs,
  legacyGpiosetArgs,
  normalizeState,
  parseGpiodMajorVersion,
  parseLine,
  start,
  stateToPairs,
  validateLines
} = require('../ops/room-led/led-daemon');

const tests = [];

function test(name, run) {
  tests.push({ name, run });
}

function flushPromises() {
  return new Promise((resolve) => setImmediate(resolve));
}

test('finds the RP1 chip by label instead of by changing chip number', () => {
  const output = [
    'gpiochip11 [gpio-brcmstb@107d517c00] (17 lines)',
    'gpiochip15 [pinctrl-rp1] (54 lines)',
    'gpiochip16 [v2-touchscreen-pane] (2 lines)'
  ].join('\n');

  assert.strictEqual(findChipByLabel(output, 'pinctrl-rp1'), 'gpiochip15');
});

test('rejects missing and ambiguous GPIO chip labels', () => {
  assert.throws(
    () => findChipByLabel('gpiochip0 [something-else] (5 lines)', 'pinctrl-rp1'),
    /found 0/
  );
  assert.throws(
    () =>
      findChipByLabel(
        'gpiochip0 [pinctrl-rp1] (54 lines)\ngpiochip2 [pinctrl-rp1] (54 lines)',
        'pinctrl-rp1'
      ),
    /found 2/
  );
});

test('validates configured GPIO line numbers against gpioinfo', () => {
  const output = [
    'gpiochip15 - 54 lines:',
    '        line  17: "GPIO17" unused input active-high',
    '        line  25: "GPIO25" unused input active-high'
  ].join('\n');

  validateLines(output, [17, 25]);
  assert.throws(() => validateLines(output, [17, 54]), /line 54 does not exist/);
  assert.strictEqual(parseLine('17', 'GPIO_GREEN'), 17);
  assert.throws(() => parseLine('-1', 'GPIO_GREEN'), /non-negative/);
});

test('detects supported libgpiod versions and selects their command syntax', () => {
  assert.strictEqual(
    parseGpiodMajorVersion('gpioset (libgpiod) v1.6.3'),
    1
  );
  assert.strictEqual(
    parseGpiodMajorVersion('gpioset (libgpiod) v2.2.1'),
    2
  );
  assert.throws(
    () => parseGpiodMajorVersion('gpioset unknown'),
    /Unable to determine/
  );
  assert.throws(
    () => parseGpiodMajorVersion('gpioset (libgpiod) v3.0.0'),
    /Unsupported/
  );
  assert.deepStrictEqual(gpioinfoArgs(1, 'gpiochip15'), ['gpiochip15']);
  assert.deepStrictEqual(gpioinfoArgs(2, 'gpiochip0'), [
    '--chip',
    'gpiochip0'
  ]);
  assert.deepStrictEqual(legacyGpiosetArgs('gpiochip15', ['17=1', '25=0']), [
    '--mode=exit',
    'gpiochip15',
    '17=1',
    '25=0'
  ]);
});

test('maps open, busy and error states to the expected LED values', () => {
  assert.deepStrictEqual(stateToPairs({ busy: false, error: false }, 17, 25), [
    '17=1',
    '25=0'
  ]);
  assert.deepStrictEqual(stateToPairs({ busy: true, error: false }, 17, 25), [
    '17=0',
    '25=1'
  ]);
  assert.deepStrictEqual(stateToPairs({ busy: true, error: true }, 17, 25), [
    '17=0',
    '25=0'
  ]);
  assert.deepStrictEqual(normalizeState({ busy: 1, error: 0 }), {
    busy: true,
    error: false
  });
});

test('runs gpioset directly and skips an unchanged state', async () => {
  const calls = [];
  const controller = createStateController({
    chip: 'gpiochip15',
    greenLine: 17,
    redLine: 25,
    retryIntervalMs: 2000,
    applyPairs: async (pairs) => {
      calls.push(pairs);
      return { stdout: '', stderr: '' };
    },
    log() {}
  });

  controller.setState({ busy: false, error: false });
  await flushPromises();
  controller.setState({ busy: false, error: false });
  await flushPromises();

  assert.deepStrictEqual(calls, [
    ['17=1', '25=0']
  ]);
  controller.stop();
});

test('logs command diagnostics and retries a failed GPIO state', async () => {
  const calls = [];
  const logs = [];
  let retry = null;
  let attempts = 0;
  const controller = createStateController({
    chip: 'gpiochip15',
    greenLine: 17,
    redLine: 25,
    retryIntervalMs: 2000,
    setTimer(callback) {
      retry = callback;
      return 1;
    },
    clearTimer() {},
    async applyPairs(pairs) {
      calls.push(pairs);
      attempts += 1;
      if (attempts === 1) {
        const error = new Error('gpioset failed');
        error.commandResult = {
          exitCode: 1,
          signal: null,
          stdout: 'command output',
          stderr: 'permission denied'
        };
        throw error;
      }
      return { stdout: '', stderr: '' };
    },
    log(level, event, details) {
      logs.push({ level, event, details });
    }
  });

  controller.setState({ busy: true, error: false });
  await flushPromises();

  assert.strictEqual(calls.length, 1);
  assert.strictEqual(typeof retry, 'function');
  assert.strictEqual(logs[0].event, 'gpio_state_failed');
  assert.strictEqual(logs[0].details.exitCode, 1);
  assert.strictEqual(logs[0].details.stderr, 'permission denied');
  assert.strictEqual(controller.getAppliedState(), null);

  retry();
  await flushPromises();

  assert.strictEqual(calls.length, 2);
  assert.deepStrictEqual(controller.getAppliedState(), {
    busy: true,
    error: false
  });
  assert.strictEqual(logs[1].event, 'gpio_state_applied');
  controller.stop();
});

test('captures stdout, stderr and exit status from child processes', async () => {
  const successRunner = createCommandRunner((command, args, options, callback) => {
    callback(null, 'stdout text\n', 'stderr text\n');
  });
  const success = await successRunner('/usr/bin/example', ['one']);
  assert.strictEqual(success.exitCode, 0);
  assert.strictEqual(success.stdout, 'stdout text');
  assert.strictEqual(success.stderr, 'stderr text');

  const failureRunner = createCommandRunner((command, args, options, callback) => {
    const error = new Error('failed');
    error.code = 7;
    callback(error, 'partial output', 'failure details');
  });

  await assert.rejects(
    failureRunner('/usr/bin/example', ['two']),
    (error) =>
      error.commandResult.exitCode === 7 &&
      error.commandResult.stdout === 'partial output' &&
      error.commandResult.stderr === 'failure details'
  );
});

test('keeps libgpiod 2 gpioset alive and replaces it on state changes', async () => {
  const children = [];
  const unexpectedExits = [];

  function spawnProcess(command, args, options) {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kills = [];
    child.kill = (signal) => {
      child.kills.push(signal);
      setImmediate(() => child.emit('close', 0, signal));
      return true;
    };
    children.push({ command, args, options, child });
    setImmediate(() => child.stdout.write('GPIO lines acquired\n'));
    return child;
  }

  const setter = createPersistentGpioSetter({
    gpioset: '/usr/bin/gpioset',
    chip: 'gpiochip0',
    spawnProcess,
    startupTimeoutMs: 50,
    stopTimeoutMs: 50,
    onUnexpectedExit(result) {
      unexpectedExits.push(result);
    }
  });

  await setter.apply(['17=1', '25=0']);
  assert.deepStrictEqual(children[0].args, [
    '--banner',
    '--chip',
    'gpiochip0',
    '17=1',
    '25=0'
  ]);
  assert.deepStrictEqual(children[0].options, {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  await setter.apply(['17=0', '25=1']);
  assert.deepStrictEqual(children[0].child.kills, ['SIGTERM']);
  assert.deepStrictEqual(children[1].args, [
    '--banner',
    '--chip',
    'gpiochip0',
    '17=0',
    '25=1'
  ]);
  assert.strictEqual(unexpectedExits.length, 0);

  children[1].child.stderr.write('line request lost');
  children[1].child.emit('close', 1, null);
  assert.strictEqual(unexpectedExits.length, 1);
  assert.strictEqual(unexpectedExits[0].exitCode, 1);
  assert.strictEqual(unexpectedExits[0].stderr, 'line request lost');

  await setter.stop();
});

test('rejects libgpiod 2 startup when gpioset emits no success banner', async () => {
  let child;
  const setter = createPersistentGpioSetter({
    gpioset: '/usr/bin/gpioset',
    chip: 'gpiochip0',
    startupTimeoutMs: 1,
    stopTimeoutMs: 50,
    spawnProcess() {
      child = new EventEmitter();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.kill = (signal) => {
        setImmediate(() => child.emit('close', 0, signal));
        return true;
      };
      return child;
    }
  });

  await assert.rejects(
    setter.apply(['17=1', '25=0']),
    /did not confirm GPIO line acquisition/
  );
  await setter.stop();
});

test('starts with the dynamically detected chip and validates both lines', async () => {
  const commands = [];
  const logs = [];
  let intervalCleared = false;
  let watcherClosed = false;
  const fakeFs = {
    promises: {
      async mkdir() {},
      async readFile() {
        return '{"busy":false,"error":false}';
      }
    },
    watch() {
      return {
        close() {
          watcherClosed = true;
        }
      };
    }
  };

  const daemon = await start({
    env: {
      GPIO_GREEN: '17',
      GPIO_RED: '25',
      LED_STATE_FILE: '/run/room-led/state.json'
    },
    fs: fakeFs,
    async runCommand(command, args) {
      commands.push({ command, args });
      if (command.endsWith('gpiodetect')) {
        return { stdout: 'gpiochip15 [pinctrl-rp1] (54 lines)', stderr: '' };
      }
      if (command.endsWith('gpioset') && args[0] === '--version') {
        return { stdout: 'gpioset (libgpiod) v1.6.3', stderr: '' };
      }
      if (command.endsWith('gpioinfo')) {
        return {
          stdout: 'line  17: "GPIO17" unused input active-high\nline  25: "GPIO25" unused input active-high',
          stderr: ''
        };
      }
      return { stdout: '', stderr: '' };
    },
    log(level, event, details) {
      logs.push({ level, event, details });
    },
    setInterval() {
      return 123;
    },
    clearInterval(value) {
      assert.strictEqual(value, 123);
      intervalCleared = true;
    }
  });

  await flushPromises();
  assert.strictEqual(daemon.chip, 'gpiochip15');
  assert.deepStrictEqual(commands[0], {
    command: '/usr/bin/gpiodetect',
    args: []
  });
  assert.deepStrictEqual(commands[1], {
    command: '/usr/bin/gpioset',
    args: ['--version']
  });
  assert.deepStrictEqual(commands[2], {
    command: '/usr/bin/gpioinfo',
    args: ['gpiochip15']
  });
  assert.deepStrictEqual(commands[3], {
    command: '/usr/bin/gpioset',
    args: ['--mode=exit', 'gpiochip15', '17=1', '25=0']
  });
  assert.strictEqual(logs.some((entry) => entry.event === 'daemon_started'), true);

  daemon.stop();
  assert.strictEqual(intervalCleared, true);
  assert.strictEqual(watcherClosed, true);
});

test('starts libgpiod 2 with v2 gpioinfo and persistent gpioset syntax', async () => {
  const commands = [];
  const children = [];
  const fakeFs = {
    promises: {
      async mkdir() {},
      async readFile() {
        return '{"busy":true,"error":false}';
      }
    },
    watch() {
      return { close() {} };
    }
  };

  function spawnProcess(command, args) {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = (signal) => {
      setImmediate(() => child.emit('close', 0, signal));
      return true;
    };
    children.push({ command, args, child });
    setImmediate(() => child.stdout.write('GPIO lines acquired\n'));
    return child;
  }

  const daemon = await start({
    env: {
      GPIO_GREEN: '17',
      GPIO_RED: '25',
      LED_STATE_FILE: '/run/room-led/state.json'
    },
    fs: fakeFs,
    spawn: spawnProcess,
    gpioStartupTimeoutMs: 50,
    gpioStopTimeoutMs: 50,
    async runCommand(command, args) {
      commands.push({ command, args });
      if (command.endsWith('gpiodetect')) {
        return { stdout: 'gpiochip0 [pinctrl-rp1] (54 lines)', stderr: '' };
      }
      if (command.endsWith('gpioset')) {
        return { stdout: 'gpioset (libgpiod) v2.2.1', stderr: '' };
      }
      if (command.endsWith('gpioinfo')) {
        return {
          stdout: 'line  17: "GPIO17" input\nline  25: "GPIO25" input',
          stderr: ''
        };
      }
      throw new Error(`Unexpected command: ${command}`);
    },
    log() {},
    setInterval() {
      return 123;
    },
    clearInterval() {}
  });

  await flushPromises();
  assert.strictEqual(daemon.chip, 'gpiochip0');
  assert.strictEqual(daemon.gpiodMajorVersion, 2);
  assert.deepStrictEqual(commands[2], {
    command: '/usr/bin/gpioinfo',
    args: ['--chip', 'gpiochip0']
  });
  assert.strictEqual(children.length, 1);
  assert.deepStrictEqual(children[0].args, [
    '--banner',
    '--chip',
    'gpiochip0',
    '17=0',
    '25=1'
  ]);

  daemon.stop();
  await flushPromises();
});

(async () => {
  let failures = 0;

  for (const current of tests) {
    try {
      await current.run();
      console.log(`PASS ${current.name}`);
    } catch (error) {
      failures += 1;
      console.error(`FAIL ${current.name}`);
      console.error(error.stack || error);
    }
  }

  console.log(`\n${tests.length - failures}/${tests.length} room-led daemon tests passed`);
  if (failures) process.exitCode = 1;
})();
