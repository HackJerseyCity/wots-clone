'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { MockAgent, setGlobalDispatcher } = require('undici');

const { request } = require('../src/http');
const { DEFAULT_HEADERS, BASE_URL } = require('../src/constants');
const { WotsError } = require('../src/errors');

function withMock() {
  const agent = new MockAgent();
  agent.disableNetConnect();
  setGlobalDispatcher(agent);
  return agent;
}

function headerLookup(headers) {
  const map = new Map();
  for (const [k, v] of Object.entries(headers)) {
    map.set(k.toLowerCase(), v);
  }
  return (name) => map.get(name.toLowerCase());
}

test('GET sends default headers and no body', async (t) => {
  const agent = withMock();
  t.after(() => agent.close());
  let seen;
  agent.get(BASE_URL).intercept({ path: '/api/spy', method: 'GET' }).reply((opts) => {
    seen = opts;
    return { statusCode: 200, data: JSON.stringify({ ok: true }), responseOptions: { headers: { 'content-type': 'application/json' } } };
  });

  const data = await request('/api/spy', { method: 'GET' });
  assert.deepEqual(data, { ok: true });
  assert.equal(seen.method, 'GET');
  const h = headerLookup(seen.headers);
  for (const [k, v] of Object.entries(DEFAULT_HEADERS)) {
    assert.equal(h(k), v, `header ${k} mismatch`);
  }
  assert.equal(h('content-type'), undefined, 'no content-type on GET');
});

test('POST serializes body as compact JSON and sets Content-Type', async (t) => {
  const agent = withMock();
  t.after(() => agent.close());
  let seen;
  agent.get(BASE_URL).intercept({ path: '/api/echo', method: 'POST' }).reply((opts) => {
    seen = opts;
    return { statusCode: 200, data: '{}', responseOptions: { headers: { 'content-type': 'application/json' } } };
  });

  await request('/api/echo', { method: 'POST', body: { a: 1, b: 'x' } });
  const h = headerLookup(seen.headers);
  assert.equal(h('content-type'), 'application/json');
  assert.equal(seen.body, '{"a":1,"b":"x"}');
});

test('appends query params in the URL', async (t) => {
  const agent = withMock();
  t.after(() => agent.close());
  let seen;
  agent.get(BASE_URL).intercept({ path: /^\/api\/q\?.*$/, method: 'GET' }).reply((opts) => {
    seen = opts;
    return { statusCode: 200, data: '{}', responseOptions: { headers: { 'content-type': 'application/json' } } };
  });

  await request('/api/q', { method: 'GET', query: { id: 'u1', key: '1234' } });
  assert.match(seen.path, /^\/api\/q\?/);
  const params = new URL('http://x' + seen.path).searchParams;
  assert.equal(params.get('id'), 'u1');
  assert.equal(params.get('key'), '1234');
});

test('non-2xx JSON body with known { type } maps to WotsError.code', async (t) => {
  const agent = withMock();
  t.after(() => agent.close());
  agent.get(BASE_URL).intercept({ path: '/api/fail', method: 'POST' })
    .reply(403, { type: 'SMS_THRESHOLD' }, { headers: { 'content-type': 'application/json' } });

  await assert.rejects(
    request('/api/fail', { method: 'POST', body: {} }),
    (err) => err instanceof WotsError && err.code === 'SMS_THRESHOLD' && err.status === 403,
  );
});

test('non-2xx with unknown { type } falls back to failureCode', async (t) => {
  const agent = withMock();
  t.after(() => agent.close());
  agent.get(BASE_URL).intercept({ path: '/api/fail', method: 'POST' })
    .reply(500, { type: 'WEIRD_UNKNOWN' }, { headers: { 'content-type': 'application/json' } });

  await assert.rejects(
    request('/api/fail', { method: 'POST', body: {}, failureCode: 'REGISTER_FAILED' }),
    (err) => err.code === 'REGISTER_FAILED' && err.status === 500 && err.body.type === 'WEIRD_UNKNOWN',
  );
});

test('non-2xx with non-JSON body falls back to failureCode with raw text', async (t) => {
  const agent = withMock();
  t.after(() => agent.close());
  agent.get(BASE_URL).intercept({ path: '/api/fail', method: 'GET' })
    .reply(502, '<html>bad gateway</html>', { headers: { 'content-type': 'text/html' } });

  await assert.rejects(
    request('/api/fail', { method: 'GET', failureCode: 'ACTIVATE_FAILED' }),
    (err) => err.code === 'ACTIVATE_FAILED' && err.status === 502 && err.body === '<html>bad gateway</html>',
  );
});

test('AbortController fires TIMEOUT', async (t) => {
  const agent = withMock();
  t.after(() => agent.close());
  agent.get(BASE_URL).intercept({ path: '/api/slow', method: 'GET' })
    .reply(200, { ok: true }, { headers: { 'content-type': 'application/json' } })
    .delay(200);

  await assert.rejects(
    request('/api/slow', { method: 'GET', timeoutMs: 30 }),
    (err) => err.code === 'TIMEOUT',
  );
});

test('attaches Authorization: Bearer <token> when authToken is passed', async (t) => {
  const agent = withMock();
  t.after(() => agent.close());
  let seen;
  agent.get(BASE_URL).intercept({ path: '/api/whoami', method: 'GET' }).reply((opts) => {
    seen = opts;
    return { statusCode: 200, data: '{}', responseOptions: { headers: { 'content-type': 'application/json' } } };
  });

  await request('/api/whoami', { method: 'GET', authToken: 'jwt-abc' });
  const h = headerLookup(seen.headers);
  assert.equal(h('authorization'), 'Bearer jwt-abc');
});

test('omits Authorization when no token is passed', async (t) => {
  const agent = withMock();
  t.after(() => agent.close());
  let seen;
  agent.get(BASE_URL).intercept({ path: '/api/anon', method: 'GET' }).reply((opts) => {
    seen = opts;
    return { statusCode: 200, data: '{}', responseOptions: { headers: { 'content-type': 'application/json' } } };
  });

  await request('/api/anon', { method: 'GET' });
  const h = headerLookup(seen.headers);
  assert.equal(h('authorization'), undefined);
});

test('respects a custom baseUrl override', async (t) => {
  const agent = withMock();
  t.after(() => agent.close());
  const alt = 'https://alt.example.com';
  agent.get(alt).intercept({ path: '/api/pong', method: 'GET' })
    .reply(200, { ok: true }, { headers: { 'content-type': 'application/json' } });

  const data = await request('/api/pong', { method: 'GET', baseUrl: alt });
  assert.deepEqual(data, { ok: true });
});
