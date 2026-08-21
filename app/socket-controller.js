const getRooms = require('./ews/rooms.js');

const DEFAULT_POLL_INTERVAL_MS = 60000;

function getPollIntervalMs(environment) {
  const configuredInterval = parseInt(environment.EWS_POLL_INTERVAL_MS, 10);

  return configuredInterval > 0
    ? configuredInterval
    : DEFAULT_POLL_INTERVAL_MS;
}

function createSocketController(io, options = {}) {
  const loadRooms = options.getRooms || getRooms;
  const scheduleTimeout = options.setTimeout || setTimeout;
  const cancelTimeout = options.clearTimeout || clearTimeout;
  const environment = options.env || process.env;
  const logger = options.logger || console;
  const pollIntervalMs = getPollIntervalMs(environment);
  const namespace = io.of('/');

  let started = false;
  let inFlight = false;
  let stopped = false;
  let timer = null;

  function scheduleNextPoll() {
    if (stopped) return;
    timer = scheduleTimeout(poll, pollIntervalMs);
  }

  function poll() {
    if (stopped || inFlight) return;

    inFlight = true;
    let completed = false;

    function complete(error, rooms) {
      if (completed) return;
      completed = true;
      inFlight = false;

      if (error) {
        logger.error(`EWS update failed: ${error.message}`);
      } else if (rooms !== undefined && rooms !== null) {
        namespace.emit('updatedRooms', rooms);
      }

      namespace.emit('controllerDone', 'done');
      scheduleNextPoll();
    }

    try {
      loadRooms(complete);
    } catch (error) {
      complete(error);
    }
  }

  namespace.on('connection', () => {
    if (started) return;
    started = true;
    poll();
  });

  return {
    stop() {
      stopped = true;
      if (timer !== null) cancelTimeout(timer);
      timer = null;
    },
    getState() {
      return {
        started,
        inFlight,
        stopped,
        pollIntervalMs
      };
    }
  };
}

module.exports = function socketController(io) {
  return createSocketController(io);
};

module.exports.createSocketController = createSocketController;
module.exports.getPollIntervalMs = getPollIntervalMs;
module.exports.DEFAULT_POLL_INTERVAL_MS = DEFAULT_POLL_INTERVAL_MS;
