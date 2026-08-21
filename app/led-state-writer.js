const fs = require('fs');
const path = require('path');

const DEFAULT_LED_STATE_FILE = '/run/room-led/state.json';

function createLedStateWriter(dependencies = {}) {
  const fileSystem = dependencies.fs || fs;
  const pathModule = dependencies.path || path;
  const environment = dependencies.env || process.env;
  const logger = dependencies.logger || console;
  const targetRoomAlias = (environment.DISPLAY_ROOM_ALIAS || '').trim().toLowerCase();
  const stateFile = environment.LED_STATE_FILE || DEFAULT_LED_STATE_FILE;
  let lastState = null;

  function update(rooms) {
    if (!targetRoomAlias || !Array.isArray(rooms)) return false;

    const room = rooms.find(candidate =>
      candidate
      && typeof candidate.RoomAlias === 'string'
      && candidate.RoomAlias.toLowerCase() === targetRoomAlias
    );

    if (!room) return false;

    const state = {
      roomAlias: room.RoomAlias,
      busy: Boolean(room.Busy),
      error: Boolean(room.ErrorMessage)
    };
    const unchanged = lastState
      && lastState.busy === state.busy
      && lastState.error === state.error;

    if (unchanged && fileSystem.existsSync(stateFile)) return false;

    const temporaryFile = `${stateFile}.${process.pid}.tmp`;

    try {
      fileSystem.mkdirSync(pathModule.dirname(stateFile), { recursive: true });
      fileSystem.writeFileSync(temporaryFile, JSON.stringify({
        ...state,
        ts: Date.now()
      }));
      fileSystem.renameSync(temporaryFile, stateFile);
      lastState = state;
      return true;
    } catch (error) {
      try {
        if (fileSystem.existsSync(temporaryFile)) fileSystem.unlinkSync(temporaryFile);
      } catch (_) {
        // Best-effort cleanup only.
      }

      logger.error(`LED state update failed: ${error.message}`);
      return false;
    }
  }

  return {
    update,
    isEnabled: () => Boolean(targetRoomAlias),
    stateFile
  };
}

module.exports = createLedStateWriter();
module.exports.createLedStateWriter = createLedStateWriter;
module.exports.DEFAULT_LED_STATE_FILE = DEFAULT_LED_STATE_FILE;
