#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFile, spawn } = require('child_process');

const DEFAULTS = {
  chipLabel: 'pinctrl-rp1',
  stateFile: '/run/room-led/state.json',
  pollIntervalMs: 2000,
  retryIntervalMs: 2000,
  gpiodetect: '/usr/bin/gpiodetect',
  gpioinfo: '/usr/bin/gpioinfo',
  gpioset: '/usr/bin/gpioset'
};

function parsePositiveInteger(value, fallback, name) {
  if (value === undefined || value === '') return fallback;
  if (!/^\d+$/.test(String(value)) || Number(value) <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return Number(value);
}

function parseLine(value, name) {
  if (!/^\d+$/.test(String(value || ''))) {
    throw new Error(`${name} must be a non-negative GPIO line number`);
  }
  return Number(value);
}

function parseGpiodMajorVersion(output) {
  const match = String(output).match(/\blibgpiod\)\s+v(\d+)\./i);
  if (!match) {
    throw new Error('Unable to determine the installed libgpiod version');
  }

  const major = Number(match[1]);
  if (major !== 1 && major !== 2) {
    throw new Error(`Unsupported libgpiod major version: ${major}`);
  }
  return major;
}

function gpioinfoArgs(majorVersion, chip) {
  return majorVersion === 1 ? [chip] : ['--chip', chip];
}

function legacyGpiosetArgs(chip, pairs) {
  return ['--mode=exit', chip, ...pairs];
}

function findChipByLabel(output, label) {
  const matches = String(output)
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*(gpiochip\d+)\s+\[([^\]]+)\]/))
    .filter((match) => match && match[2] === label)
    .map((match) => match[1]);

  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one GPIO chip labelled ${label}, found ${matches.length}`
    );
  }

  return matches[0];
}

function validateLines(gpioinfoOutput, lines) {
  const available = new Set();
  String(gpioinfoOutput)
    .split(/\r?\n/)
    .forEach((line) => {
      const match = line.match(/^\s*line\s+(\d+):/);
      if (match) available.add(Number(match[1]));
    });

  lines.forEach((line) => {
    if (!available.has(line)) {
      throw new Error(`GPIO line ${line} does not exist on the selected chip`);
    }
  });
}

function stateToPairs(state, greenLine, redLine) {
  if (state.error) return [`${greenLine}=0`, `${redLine}=0`];
  if (state.busy) return [`${greenLine}=0`, `${redLine}=1`];
  return [`${greenLine}=1`, `${redLine}=0`];
}

function sameState(left, right) {
  return Boolean(
    left && right && left.busy === right.busy && left.error === right.error
  );
}

function normalizeState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('LED state must be a JSON object');
  }

  return {
    busy: Boolean(value.busy),
    error: Boolean(value.error)
  };
}

function createJsonLogger(output = console) {
  return (level, event, details = {}) => {
    const entry = Object.assign(
      { timestamp: new Date().toISOString(), level, event },
      details
    );
    const method = level === 'error' ? 'error' : 'log';
    output[method](JSON.stringify(entry));
  };
}

function createCommandRunner(execFileImplementation = execFile) {
  return (command, args) =>
    new Promise((resolve, reject) => {
      execFileImplementation(command, args, { encoding: 'utf8' }, (error, stdout, stderr) => {
        const result = {
          command,
          args: args.slice(),
          stdout: String(stdout || '').trim(),
          stderr: String(stderr || '').trim()
        };

        if (error) {
          error.commandResult = Object.assign(result, {
            exitCode: error.code,
            signal: error.signal || null
          });
          reject(error);
          return;
        }

        resolve(Object.assign(result, { exitCode: 0, signal: null }));
      });
    });
}

function createPersistentGpioSetter(options) {
  const {
    gpioset,
    chip,
    spawnProcess = spawn,
    startupTimeoutMs = 2000,
    stopTimeoutMs = 2000,
    onUnexpectedExit = () => {}
  } = options;

  let active = null;
  let stopped = false;

  function commandResult(entry, exitCode, signal) {
    return {
      command: gpioset,
      args: entry.args.slice(),
      stdout: entry.stdout.trim(),
      stderr: entry.stderr.trim(),
      exitCode,
      signal: signal || null
    };
  }

  function stopEntry(entry) {
    if (!entry || entry.closed) return Promise.resolve();
    entry.expectedExit = true;

    return new Promise((resolve) => {
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        resolve();
      };
      const timeout = setTimeout(() => {
        if (!entry.closed) entry.process.kill('SIGKILL');
        finish();
      }, stopTimeoutMs);

      entry.process.once('close', finish);
      entry.process.kill('SIGTERM');
    });
  }

  async function apply(pairs) {
    if (stopped) throw new Error('GPIO setter has been stopped');

    const previous = active;
    active = null;
    await stopEntry(previous);

    const args = ['--banner', '--chip', chip, ...pairs];
    return new Promise((resolve, reject) => {
      const child = spawnProcess(gpioset, args, {
        stdio: ['ignore', 'pipe', 'pipe']
      });
      const entry = {
        process: child,
        args,
        stdout: '',
        stderr: '',
        closed: false,
        expectedExit: false,
        started: false
      };
      active = entry;
      let startupTimer = null;

      if (child.stdout) {
        child.stdout.on('data', (chunk) => {
          entry.stdout += String(chunk);
          if (!entry.started) {
            entry.started = true;
            clearTimeout(startupTimer);
            resolve(commandResult(entry, null, null));
          }
        });
      }
      if (child.stderr) {
        child.stderr.on('data', (chunk) => {
          entry.stderr += String(chunk);
        });
      }

      startupTimer = setTimeout(() => {
        entry.expectedExit = true;
        if (active === entry) active = null;
        entry.process.kill('SIGTERM');
        const error = new Error('gpioset did not confirm GPIO line acquisition');
        error.commandResult = commandResult(entry, null, null);
        reject(error);
      }, startupTimeoutMs);

      child.once('error', (error) => {
        clearTimeout(startupTimer);
        if (active === entry) active = null;
        error.commandResult = commandResult(entry, null, null);
        reject(error);
      });

      child.once('close', (code, signal) => {
        clearTimeout(startupTimer);
        entry.closed = true;
        if (active === entry) active = null;

        const result = commandResult(entry, code, signal);
        if (!entry.started) {
          const error = new Error('gpioset exited before acquiring GPIO lines');
          error.commandResult = result;
          reject(error);
          return;
        }

        if (!entry.expectedExit && !stopped) onUnexpectedExit(result);
      });
    });
  }

  return {
    apply,
    async stop() {
      stopped = true;
      const current = active;
      active = null;
      await stopEntry(current);
    }
  };
}

function createStateController(options) {
  const {
    chip,
    greenLine,
    redLine,
    applyPairs,
    log,
    retryIntervalMs,
    setTimer = setTimeout,
    clearTimer = clearTimeout
  } = options;

  let desiredState = null;
  let appliedState = null;
  let applying = false;
  let stopped = false;
  let retryTimer = null;

  function scheduleRetry() {
    if (stopped || retryTimer) return;
    retryTimer = setTimer(() => {
      retryTimer = null;
      applyDesiredState();
    }, retryIntervalMs);
  }

  async function applyDesiredState() {
    if (stopped || applying || !desiredState || sameState(desiredState, appliedState)) {
      return;
    }

    applying = true;
    const target = Object.assign({}, desiredState);
    const pairs = stateToPairs(target, greenLine, redLine);

    try {
      const result = await applyPairs(pairs);
      appliedState = target;
      log('info', 'gpio_state_applied', {
        chip,
        greenLine,
        redLine,
        busy: target.busy,
        error: target.error,
        stdout: result.stdout,
        stderr: result.stderr
      });
    } catch (error) {
      const result = error.commandResult || {};
      log('error', 'gpio_state_failed', {
        chip,
        busy: target.busy,
        error: target.error,
        exitCode: result.exitCode === undefined ? null : result.exitCode,
        signal: result.signal || null,
        stdout: result.stdout || '',
        stderr: result.stderr || '',
        message: error.message
      });
      scheduleRetry();
    } finally {
      applying = false;
      if (!sameState(desiredState, appliedState) && !retryTimer) {
        applyDesiredState();
      }
    }
  }

  return {
    setState(state) {
      desiredState = normalizeState(state);
      applyDesiredState();
    },
    stop() {
      stopped = true;
      if (retryTimer) clearTimer(retryTimer);
      retryTimer = null;
    },
    getAppliedState() {
      return appliedState && Object.assign({}, appliedState);
    }
  };
}

async function start(options = {}) {
  const env = options.env || process.env;
  const fileSystem = options.fs || fs;
  const runCommand = options.runCommand || createCommandRunner();
  const log = options.log || createJsonLogger();

  const greenLine = parseLine(env.GPIO_GREEN, 'GPIO_GREEN');
  const redLine = parseLine(env.GPIO_RED, 'GPIO_RED');
  if (greenLine === redLine) {
    throw new Error('GPIO_GREEN and GPIO_RED must use different lines');
  }

  const stateFile = env.LED_STATE_FILE || DEFAULTS.stateFile;
  const chipLabel = env.GPIO_CHIP_LABEL || DEFAULTS.chipLabel;
  const pollIntervalMs = parsePositiveInteger(
    env.LED_POLL_INTERVAL_MS,
    DEFAULTS.pollIntervalMs,
    'LED_POLL_INTERVAL_MS'
  );
  const retryIntervalMs = parsePositiveInteger(
    env.GPIO_RETRY_INTERVAL_MS,
    DEFAULTS.retryIntervalMs,
    'GPIO_RETRY_INTERVAL_MS'
  );

  let chip = env.GPIO_CHIP;
  if (!chip) {
    const detection = await runCommand(DEFAULTS.gpiodetect, []);
    chip = findChipByLabel(detection.stdout, chipLabel);
  }

  if (!/^gpiochip\d+$/.test(chip)) {
    throw new Error(`Invalid GPIO chip name: ${chip}`);
  }

  const version = await runCommand(DEFAULTS.gpioset, ['--version']);
  const gpiodMajorVersion = parseGpiodMajorVersion(version.stdout);
  const gpioInformation = await runCommand(
    DEFAULTS.gpioinfo,
    gpioinfoArgs(gpiodMajorVersion, chip)
  );
  validateLines(gpioInformation.stdout, [greenLine, redLine]);

  let gpioSetter;
  if (gpiodMajorVersion === 1) {
    gpioSetter = {
      apply(pairs) {
        return runCommand(
          DEFAULTS.gpioset,
          legacyGpiosetArgs(chip, pairs)
        );
      },
      stop() {
        return Promise.resolve();
      }
    };
  } else {
    gpioSetter = createPersistentGpioSetter({
      gpioset: DEFAULTS.gpioset,
      chip,
      spawnProcess: options.spawn,
      startupTimeoutMs: options.gpioStartupTimeoutMs,
      stopTimeoutMs: options.gpioStopTimeoutMs,
      onUnexpectedExit(result) {
        log('error', 'gpio_process_exited', result);
        if (options.onFatalError) options.onFatalError(result);
      }
    });
  }

  const controller = createStateController({
    chip,
    greenLine,
    redLine,
    applyPairs: gpioSetter.apply,
    log,
    retryIntervalMs,
    setTimer: options.setTimeout,
    clearTimer: options.clearTimeout
  });

  let missingStateLogged = false;
  async function readState() {
    try {
      const data = await fileSystem.promises.readFile(stateFile, 'utf8');
      missingStateLogged = false;
      controller.setState(JSON.parse(data));
    } catch (error) {
      if (error.code === 'ENOENT') {
        if (!missingStateLogged) {
          log('info', 'state_file_waiting', { stateFile });
          missingStateLogged = true;
        }
        return;
      }
      log('error', 'state_file_read_failed', {
        stateFile,
        code: error.code || null,
        message: error.message
      });
    }
  }

  await fileSystem.promises.mkdir(path.dirname(stateFile), { recursive: true });
  await readState();

  let watcher = null;
  try {
    watcher = fileSystem.watch(path.dirname(stateFile), (event, filename) => {
      if (!filename || filename === path.basename(stateFile)) readState();
    });
  } catch (error) {
    log('error', 'state_file_watch_failed', {
      stateFile,
      code: error.code || null,
      message: error.message
    });
  }

  const interval = (options.setInterval || setInterval)(readState, pollIntervalMs);
  log('info', 'daemon_started', {
    chip,
    chipLabel,
    gpiodMajorVersion,
    greenLine,
    redLine,
    stateFile,
    pollIntervalMs,
    retryIntervalMs
  });

  return {
    chip,
    gpiodMajorVersion,
    stop() {
      controller.stop();
      gpioSetter.stop();
      (options.clearInterval || clearInterval)(interval);
      if (watcher) watcher.close();
    }
  };
}

if (require.main === module) {
  const log = createJsonLogger();
  start({
    log,
    onFatalError() {
      process.exit(1);
    }
  }).catch((error) => {
    log('error', 'daemon_start_failed', {
      message: error.message,
      command: error.commandResult || null
    });
    process.exitCode = 1;
  });
}

module.exports = {
  DEFAULTS,
  createCommandRunner,
  createJsonLogger,
  createPersistentGpioSetter,
  createStateController,
  findChipByLabel,
  gpioinfoArgs,
  legacyGpiosetArgs,
  normalizeState,
  parseGpiodMajorVersion,
  parseLine,
  parsePositiveInteger,
  sameState,
  start,
  stateToPairs,
  validateLines
};
