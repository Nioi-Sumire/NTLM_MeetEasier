const assert = require('assert');
const { createClient, DEFAULT_TIMEOUT_MS } = require('../app/ews/client.js');

const exchange = {
  uri: 'https://exchange.example.test/EWS/Exchange.asmx',
  username: 'service-account',
  password: 'not-a-real-password',
  domain: 'EXAMPLE'
};

const tests = [];

function test(name, run) {
  tests.push({ name, run });
}

function createNtlmStub(response) {
  const clients = [];

  function createNtlmClient(credentials, config) {
    const requests = [];
    clients.push({ credentials, config, requests });

    return {
      post(url, body, requestConfig) {
        requests.push({ url, body, config: requestConfig });
        return response.error
          ? Promise.reject(response.error)
          : Promise.resolve(response.value);
      }
    };
  }

  return {
    clients,
    createNtlmClient
  };
}

test('uses the default timeout when EWS_TIMEOUT_MS is missing', () => {
  const ntlm = createNtlmStub({});
  const client = createClient({ exchange, env: {}, createNtlmClient: ntlm.createNtlmClient });

  assert.strictEqual(client.getTimeoutMs(), DEFAULT_TIMEOUT_MS);
});

test('uses the configured positive timeout', () => {
  const client = createClient({
    exchange,
    env: { EWS_TIMEOUT_MS: '2500' },
    createNtlmClient: createNtlmStub({}).createNtlmClient
  });

  assert.strictEqual(client.getTimeoutMs(), 2500);
});

test('falls back to the default timeout for invalid values', () => {
  ['invalid', '0', '-1', ''].forEach(value => {
    const client = createClient({
      exchange,
      env: { EWS_TIMEOUT_MS: value },
      createNtlmClient: createNtlmStub({}).createNtlmClient
    });

    assert.strictEqual(client.getTimeoutMs(), DEFAULT_TIMEOUT_MS);
  });
});

test('passes shared EWS and NTLM options to axios-ntlm', async () => {
  const response = { status: 200, data: '<Envelope />' };
  const ntlm = createNtlmStub({ value: response });
  const agent = { name: 'test HTTPS agent' };
  const createAgent = () => agent;
  const client = createClient({
    exchange,
    env: { EWS_TIMEOUT_MS: '9000' },
    createNtlmClient: ntlm.createNtlmClient,
    createAgent
  });
  let callbackResponse;

  await new Promise((resolve, reject) => {
    client.post('GetRoomLists', '<soap />', (err, value) => {
      if (err) return reject(err);
      callbackResponse = value;
      resolve();
    });
  });

  assert.deepStrictEqual(callbackResponse, {
    statusCode: 200,
    body: '<Envelope />'
  });
  assert.strictEqual(ntlm.clients.length, 1);
  assert.deepStrictEqual(ntlm.clients[0].credentials, {
    username: exchange.username,
    password: exchange.password,
    domain: exchange.domain,
    workstation: ''
  });
  assert.deepStrictEqual(ntlm.clients[0].config, {
    timeout: 9000,
    httpsAgent: agent
  });
  assert.deepStrictEqual(ntlm.clients[0].requests, [{
    url: exchange.uri,
    body: '<soap />',
    config: {
      headers: {
        'Content-Type': 'text/xml'
      }
    }
  }]);
});

test('maps HTTP error responses to the existing EWS response contract', async () => {
  const httpError = new Error('Request failed with status code 500');
  httpError.response = {
    status: 500,
    data: '<Fault />'
  };
  const ntlm = createNtlmStub({ error: httpError });
  const client = createClient({
    exchange,
    env: {},
    createNtlmClient: ntlm.createNtlmClient
  });
  let callbackResponse;

  await new Promise((resolve, reject) => {
    client.post('FindItem', '<soap />', (err, value) => {
      if (err) return reject(err);
      callbackResponse = value;
      resolve();
    });
  });

  assert.deepStrictEqual(callbackResponse, {
    statusCode: 500,
    body: '<Fault />'
  });
});

test('adds operation context to transport errors', async () => {
  const transportError = new Error('request timed out');
  transportError.code = 'ETIMEDOUT';

  const ntlm = createNtlmStub({ error: transportError });
  const client = createClient({
    exchange,
    env: {},
    createNtlmClient: ntlm.createNtlmClient
  });
  let callbackError;

  await new Promise(resolve => {
    client.post('FindItem', '<soap />', err => {
      callbackError = err;
      resolve();
    });
  });

  assert(callbackError instanceof Error);
  assert.strictEqual(callbackError.message, 'EWS FindItem request failed: request timed out');
  assert.strictEqual(callbackError.code, 'ETIMEDOUT');
  assert.strictEqual(callbackError.operation, 'FindItem');
  assert.strictEqual(callbackError.hostname, 'exchange.example.test');
  assert.strictEqual(callbackError.isTlsError, false);
});

test('enables certificate verification on the default HTTPS agent', async () => {
  const ntlm = createNtlmStub({ value: { status: 200 } });
  const client = createClient({ exchange, env: {}, createNtlmClient: ntlm.createNtlmClient });

  await new Promise((resolve, reject) => {
    client.post('GetRoomLists', '<soap />', err => err ? reject(err) : resolve());
  });

  const agent = ntlm.clients[0].config.httpsAgent;
  assert(agent instanceof require('https').Agent);
  assert.strictEqual(agent.options.keepAlive, true);
  assert.strictEqual(agent.options.rejectUnauthorized, true);
});

test('uses a separate HTTPS agent for each NTLM request', async () => {
  const ntlm = createNtlmStub({ value: { status: 200 } });
  const client = createClient({ exchange, env: {}, createNtlmClient: ntlm.createNtlmClient });

  await Promise.all([
    new Promise((resolve, reject) => {
      client.post('GetRoomLists', '<soap />', err => err ? reject(err) : resolve());
    }),
    new Promise((resolve, reject) => {
      client.post('FindItem', '<soap />', err => err ? reject(err) : resolve());
    })
  ]);

  assert.notStrictEqual(
    ntlm.clients[0].config.httpsAgent,
    ntlm.clients[1].config.httpsAgent
  );
});

test('identifies certificate errors without exposing credentials', async () => {
  const certificateError = new Error('certificate has expired');
  certificateError.code = 'CERT_HAS_EXPIRED';
  const ntlm = createNtlmStub({ error: certificateError });
  const client = createClient({
    exchange,
    env: {},
    createNtlmClient: ntlm.createNtlmClient
  });
  let callbackError;

  await new Promise(resolve => {
    client.post('ExpandDL', '<soap />', err => {
      callbackError = err;
      resolve();
    });
  });

  assert.strictEqual(callbackError.code, 'CERT_HAS_EXPIRED');
  assert.strictEqual(callbackError.operation, 'ExpandDL');
  assert.strictEqual(callbackError.hostname, 'exchange.example.test');
  assert.strictEqual(callbackError.isTlsError, true);
  assert.strictEqual(callbackError.message.includes(exchange.username), false);
  assert.strictEqual(callbackError.message.includes(exchange.password), false);
});

async function runTests() {
  let failed = 0;

  for (const testCase of tests) {
    try {
      await testCase.run();
      console.log(`PASS ${testCase.name}`);
    } catch (error) {
      failed++;
      console.error(`FAIL ${testCase.name}`);
      console.error(error.stack || error);
    }
  }

  console.log(`\n${tests.length - failed}/${tests.length} backend tests passed`);

  if (failed > 0) process.exitCode = 1;
}

runTests();
