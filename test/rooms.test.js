const assert = require('assert');
const { createRoomsService } = require('../app/ews/rooms.js');

const SOAP_START = '<s:Envelope xmlns:s="urn:s" xmlns:m="urn:m" xmlns:t="urn:t"><s:Body>';
const SOAP_END = '</s:Body></s:Envelope>';

function roomListsXml(addresses = '') {
  return `${SOAP_START}
    <m:GetRoomListsResponse>
      <m:ResponseMessages>
        <m:GetRoomListsResponseMessage ResponseClass="Success">
          <m:ResponseCode>NoError</m:ResponseCode>
          <m:RoomLists>${addresses}</m:RoomLists>
        </m:GetRoomListsResponseMessage>
      </m:ResponseMessages>
    </m:GetRoomListsResponse>
  ${SOAP_END}`;
}

function expandDlXml(mailboxes = '', responseClass = 'Success', responseCode = 'NoError') {
  return `${SOAP_START}
    <m:ExpandDLResponse>
      <m:ResponseMessages>
        <m:ExpandDLResponseMessage ResponseClass="${responseClass}">
          <m:ResponseCode>${responseCode}</m:ResponseCode>
          <m:DLExpansion>${mailboxes}</m:DLExpansion>
        </m:ExpandDLResponseMessage>
      </m:ResponseMessages>
    </m:ExpandDLResponse>
  ${SOAP_END}`;
}

function findItemXml(items = '') {
  return `${SOAP_START}
    <m:FindItemResponse>
      <m:ResponseMessages>
        <m:FindItemResponseMessage ResponseClass="Success">
          <m:ResponseCode>NoError</m:ResponseCode>
          <m:RootFolder><t:Items>${items}</t:Items></m:RootFolder>
        </m:FindItemResponseMessage>
      </m:ResponseMessages>
    </m:FindItemResponse>
  ${SOAP_END}`;
}

const ROOM_LIST = `
  <t:Address>
    <t:Name>Test Rooms</t:Name>
    <t:EmailAddress>rooms@example.test</t:EmailAddress>
  </t:Address>`;

const ROOM = `
  <t:Mailbox>
    <t:Name>Test Room</t:Name>
    <t:EmailAddress>room@example.test</t:EmailAddress>
  </t:Mailbox>`;

function createClientStub(responses) {
  const calls = [];

  return {
    calls,
    post(operation, body, callback) {
      calls.push({ operation, body });
      const queue = responses[operation] || [];
      const response = queue.shift();

      if (!response) {
        return callback(new Error(`Unexpected ${operation} request`));
      }

      callback(response.error || null, response.value);
    }
  };
}

function runService(responses, dependencies = {}) {
  const ewsClient = createClientStub(responses);
  const logMessages = [];
  const service = createRoomsService({
    ewsClient,
    blacklist: [],
    ledStateWriter: dependencies.ledStateWriter,
    logger: {
      error(message) {
        logMessages.push(message);
      }
    }
  });

  return new Promise(resolve => {
    service((error, rooms) => resolve({ error, rooms, ewsClient, logMessages }));
  });
}

const tests = [];

function test(name, run) {
  tests.push({ name, run });
}

test('returns an empty result when Exchange has no room lists', async () => {
  const result = await runService({
    GetRoomLists: [{ value: { statusCode: 200, body: roomListsXml() } }]
  });

  assert.ifError(result.error);
  assert.deepStrictEqual(result.rooms, []);
  assert.deepStrictEqual(result.ewsClient.calls.map(call => call.operation), ['GetRoomLists']);
});

test('returns an empty result when a room list has no rooms', async () => {
  const result = await runService({
    GetRoomLists: [{ value: { statusCode: 200, body: roomListsXml(ROOM_LIST) } }],
    ExpandDL: [{ value: { statusCode: 200, body: expandDlXml() } }]
  });

  assert.ifError(result.error);
  assert.deepStrictEqual(result.rooms, []);
  assert.deepStrictEqual(result.ewsClient.calls.map(call => call.operation), [
    'GetRoomLists',
    'ExpandDL'
  ]);
});

test('returns a structured error for non-200 room-list responses', async () => {
  const result = await runService({
    GetRoomLists: [{ value: { statusCode: 503, body: '' } }]
  });

  assert(result.error instanceof Error);
  assert.strictEqual(result.error.code, 'EWS_HTTP_ERROR');
  assert.strictEqual(result.error.operation, 'GetRoomLists');
  assert.strictEqual(result.error.statusCode, 503);
  assert.strictEqual(result.rooms, undefined);
});

test('returns a structured error for malformed XML', async () => {
  const result = await runService({
    GetRoomLists: [{ value: { statusCode: 200, body: '<not-closed>' } }]
  });

  assert(result.error instanceof Error);
  assert.strictEqual(result.error.code, 'EWS_INVALID_XML');
  assert.strictEqual(result.error.operation, 'GetRoomLists');
});

test('propagates ExpandDL transport errors instead of returning partial rooms', async () => {
  const transportError = new Error('request timed out');
  transportError.code = 'ETIMEDOUT';
  transportError.operation = 'ExpandDL';

  const result = await runService({
    GetRoomLists: [{ value: { statusCode: 200, body: roomListsXml(ROOM_LIST) } }],
    ExpandDL: [{ error: transportError }]
  });

  assert.strictEqual(result.error, transportError);
  assert.strictEqual(result.rooms, undefined);
});

test('recognizes EWS errors returned with HTTP 200', async () => {
  const result = await runService({
    GetRoomLists: [{ value: { statusCode: 200, body: roomListsXml(ROOM_LIST) } }],
    ExpandDL: [{
      value: {
        statusCode: 200,
        body: expandDlXml('', 'Error', 'ErrorAccessDenied')
      }
    }]
  });

  assert(result.error instanceof Error);
  assert.strictEqual(result.error.code, 'EWS_RESPONSE_ERROR');
  assert.strictEqual(result.error.operation, 'ExpandDL');
  assert.strictEqual(result.error.responseCode, 'ErrorAccessDenied');
});

test('keeps other rooms usable when a calendar request fails', async () => {
  const result = await runService({
    GetRoomLists: [{ value: { statusCode: 200, body: roomListsXml(ROOM_LIST) } }],
    ExpandDL: [{ value: { statusCode: 200, body: expandDlXml(ROOM) } }],
    FindItem: [{ value: { statusCode: 500, body: '' } }]
  });

  assert.ifError(result.error);
  assert.strictEqual(result.rooms.length, 1);
  assert.strictEqual(result.rooms[0].RoomAlias, 'test-room');
  assert.deepStrictEqual(result.rooms[0].Appointments, []);
  assert.strictEqual(result.rooms[0].ErrorMessage, 'EWS FindItem failed: HTTP 500');
});

test('processes a complete successful response chain', async () => {
  const ledUpdates = [];
  const result = await runService({
    GetRoomLists: [{ value: { statusCode: 200, body: roomListsXml(ROOM_LIST) } }],
    ExpandDL: [{ value: { statusCode: 200, body: expandDlXml(ROOM) } }],
    FindItem: [{ value: { statusCode: 200, body: findItemXml() } }]
  }, {
    ledStateWriter: { update: rooms => ledUpdates.push(rooms) }
  });

  assert.ifError(result.error);
  assert.strictEqual(result.rooms.length, 1);
  assert.strictEqual(result.rooms[0].Name, 'Test Room');
  assert.deepStrictEqual(result.rooms[0].Appointments, []);
  assert.strictEqual(result.rooms[0].ErrorMessage, undefined);
  assert.strictEqual(ledUpdates.length, 1);
  assert.strictEqual(ledUpdates[0], result.rooms);
});

test('keeps the EWS result usable when the LED writer fails', async () => {
  const result = await runService({
    GetRoomLists: [{ value: { statusCode: 200, body: roomListsXml(ROOM_LIST) } }],
    ExpandDL: [{ value: { statusCode: 200, body: expandDlXml(ROOM) } }],
    FindItem: [{ value: { statusCode: 200, body: findItemXml() } }]
  }, {
    ledStateWriter: {
      update() {
        throw new Error('LED unavailable');
      }
    }
  });

  assert.ifError(result.error);
  assert.strictEqual(result.rooms.length, 1);
  assert(result.logMessages.includes('LED state update failed: LED unavailable'));
});

(async () => {
  let failed = 0;

  for (const { name, run } of tests) {
    try {
      await run();
      console.log(`PASS ${name}`);
    } catch (error) {
      failed++;
      console.error(`FAIL ${name}`);
      console.error(error.stack || error);
    }
  }

  console.log(`\n${tests.length - failed}/${tests.length} room-service tests passed`);
  if (failed > 0) process.exit(1);
})();
