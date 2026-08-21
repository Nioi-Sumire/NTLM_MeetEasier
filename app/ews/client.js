const https = require('https');
const { NtlmClient } = require('axios-ntlm');
const auth = require('../../config/auth.js');

const DEFAULT_TIMEOUT_MS = 15000;
const TLS_ERROR_CODES = new Set([
  'CERT_HAS_EXPIRED',
  'CERT_NOT_YET_VALID',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'ERR_TLS_CERT_ALTNAME_INVALID',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_GET_ISSUER_CERT',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE'
]);

function createClient(options = {}) {
  const createNtlmClient = options.createNtlmClient || NtlmClient;
  const exchange = options.exchange || auth.exchange;
  const environment = options.env || process.env;
  const createAgent = options.createAgent || (() => new https.Agent({
    keepAlive: true,
    rejectUnauthorized: true
  }));

  function getTimeoutMs() {
    const configuredTimeout = parseInt(environment.EWS_TIMEOUT_MS, 10);

    return configuredTimeout > 0
      ? configuredTimeout
      : DEFAULT_TIMEOUT_MS;
  }

  function post(operation, soapBody, callback) {
    const client = createNtlmClient({
      username: exchange.username,
      password: exchange.password,
      domain: exchange.domain,
      workstation: ''
    }, {
      timeout: getTimeoutMs(),
      httpsAgent: createAgent()
    });

    client.post(exchange.uri, soapBody, {
      headers: {
        'Content-Type': 'text/xml'
      }
    }).then(res => callback(null, {
      statusCode: res.status,
      body: res.data
    }), err => {
      if (err.response) {
        return callback(null, {
          statusCode: err.response.status,
          body: err.response.data
        });
      }

      const requestError = new Error(`EWS ${operation} request failed: ${err.message}`);
      requestError.code = err.code;
      requestError.operation = operation;
      requestError.hostname = new URL(exchange.uri).hostname;
      requestError.isTlsError = TLS_ERROR_CODES.has(err.code);
      callback(requestError);
    });
  }

  return {
    post,
    getTimeoutMs
  };
}

const client = createClient();

module.exports = client;
module.exports.createClient = createClient;
module.exports.DEFAULT_TIMEOUT_MS = DEFAULT_TIMEOUT_MS;
module.exports.TLS_ERROR_CODES = TLS_ERROR_CODES;
