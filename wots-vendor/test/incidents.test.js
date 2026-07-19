'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { MockAgent, setGlobalDispatcher } = require('undici');

const { all, detail } = require('../src/incidents');
const { BASE_URL } = require('../src/constants');

function withMock() {
  const agent = new MockAgent();
  agent.disableNetConnect();
  setGlobalDispatcher(agent);
  return agent;
}

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64')
    .replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function tokenFor(userId) {
  return `${b64url({ alg: 'HS512' })}.${b64url({ sub: userId, auth: 'USER', exp: 9_999_999_999 })}.AAAA`;
}

test('all: single short page returns those items', async (t) => {
  const agent = withMock();
  t.after(() => agent.close());

  const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  agent.get(BASE_URL).intercept({ path: '/api/incident/short/u1/0/20', method: 'GET' })
    .reply(200, items, { headers: { 'content-type': 'application/json' } });

  const out = await all(tokenFor('u1'));
  assert.deepEqual(out, items);
});

test('all: paginates until an empty page comes back', async (t) => {
  const agent = withMock();
  t.after(() => agent.close());

  const page1 = Array.from({ length: 20 }, (_, i) => ({ id: `a${i}` }));
  const page2 = Array.from({ length: 20 }, (_, i) => ({ id: `b${i}` }));
  const page3 = [];

  agent.get(BASE_URL).intercept({ path: '/api/incident/short/u1/0/20', method: 'GET' })
    .reply(200, page1, { headers: { 'content-type': 'application/json' } });
  agent.get(BASE_URL).intercept({ path: '/api/incident/short/u1/20/20', method: 'GET' })
    .reply(200, page2, { headers: { 'content-type': 'application/json' } });
  agent.get(BASE_URL).intercept({ path: '/api/incident/short/u1/40/20', method: 'GET' })
    .reply(200, page3, { headers: { 'content-type': 'application/json' } });

  const out = await all(tokenFor('u1'));
  assert.equal(out.length, 40);
  assert.equal(out[0].id, 'a0');
  assert.equal(out[39].id, 'b19');
});

test('all: stops early on a short page', async (t) => {
  const agent = withMock();
  t.after(() => agent.close());

  const page1 = Array.from({ length: 20 }, (_, i) => ({ id: `a${i}` }));
  const page2 = [{ id: 'tail-1' }, { id: 'tail-2' }];

  agent.get(BASE_URL).intercept({ path: '/api/incident/short/u1/0/20', method: 'GET' })
    .reply(200, page1, { headers: { 'content-type': 'application/json' } });
  agent.get(BASE_URL).intercept({ path: '/api/incident/short/u1/20/20', method: 'GET' })
    .reply(200, page2, { headers: { 'content-type': 'application/json' } });
  // No third intercept — a third call would blow up on assertNoPendingInterceptors.

  const out = await all(tokenFor('u1'));
  assert.equal(out.length, 22);
  assert.equal(out[21].id, 'tail-2');
});

test('all: sends Authorization: Bearer <token>', async (t) => {
  const agent = withMock();
  t.after(() => agent.close());
  let seen;
  const token = tokenFor('u1');

  agent.get(BASE_URL).intercept({ path: '/api/incident/short/u1/0/20', method: 'GET' })
    .reply((opts) => {
      seen = opts;
      return { statusCode: 200, data: '[]', responseOptions: { headers: { 'content-type': 'application/json' } } };
    });

  await all(token);
  const authHeader = Object.entries(seen.headers)
    .find(([k]) => k.toLowerCase() === 'authorization')?.[1];
  assert.equal(authHeader, `Bearer ${token}`);
});

test('all: derives userId from JWT sub claim', async (t) => {
  const agent = withMock();
  t.after(() => agent.close());

  agent.get(BASE_URL).intercept({ path: '/api/incident/short/user-xyz/0/20', method: 'GET' })
    .reply(200, [], { headers: { 'content-type': 'application/json' } });

  const out = await all(tokenFor('user-xyz'));
  assert.deepEqual(out, []);
});

test('all: handles wrapped response { data: [...] }', async (t) => {
  const agent = withMock();
  t.after(() => agent.close());

  agent.get(BASE_URL).intercept({ path: '/api/incident/short/u1/0/20', method: 'GET' })
    .reply(200, { data: [{ id: 'w1' }, { id: 'w2' }] }, { headers: { 'content-type': 'application/json' } });

  const out = await all(tokenFor('u1'));
  assert.deepEqual(out, [{ id: 'w1' }, { id: 'w2' }]);
});

test('all: honors a custom pageSize', async (t) => {
  const agent = withMock();
  t.after(() => agent.close());

  agent.get(BASE_URL).intercept({ path: '/api/incident/short/u1/0/50', method: 'GET' })
    .reply(200, [{ id: 'x' }], { headers: { 'content-type': 'application/json' } });

  const out = await all(tokenFor('u1'), { pageSize: 50 });
  assert.deepEqual(out, [{ id: 'x' }]);
});

test('all: propagates JWT decode error for a bad token', async (t) => {
  const agent = withMock();
  t.after(() => agent.close());

  await assert.rejects(all('not-a-jwt'), (err) => err.code === 'INVALID_JWT');
  agent.assertNoPendingInterceptors();
});

test('all: propagates server error as WotsError', async (t) => {
  const agent = withMock();
  t.after(() => agent.close());

  agent.get(BASE_URL).intercept({ path: '/api/incident/short/u1/0/20', method: 'GET' })
    .reply(401, { type: 'UNAUTHORIZED' }, { headers: { 'content-type': 'application/json' } });

  await assert.rejects(all(tokenFor('u1')), (err) => err.status === 401);
});

// --- detail ------------------------------------------------------------

test('detail: POSTs {incidentId, userId} and returns parsed body', async (t) => {
  const agent = withMock();
  t.after(() => agent.close());
  let seen;

  const shape = { id: 'inc-1', address: '123 Main St', typeName: 'Other illegal parking' };
  agent.get(BASE_URL).intercept({ path: '/api/incident/id', method: 'POST' })
    .reply((opts) => {
      seen = opts;
      return { statusCode: 200, data: JSON.stringify(shape), responseOptions: { headers: { 'content-type': 'application/json' } } };
    });

  const out = await detail(tokenFor('u1'), 'inc-1');
  assert.equal(seen.body, '{"incidentId":"inc-1","userId":"u1"}');
  assert.deepEqual(out, shape);
});

test('detail: sends Authorization: Bearer <token>', async (t) => {
  const agent = withMock();
  t.after(() => agent.close());
  let seen;
  const token = tokenFor('u1');

  agent.get(BASE_URL).intercept({ path: '/api/incident/id', method: 'POST' })
    .reply((opts) => {
      seen = opts;
      return { statusCode: 200, data: '{}', responseOptions: { headers: { 'content-type': 'application/json' } } };
    });

  await detail(token, 'inc-1');
  const authHeader = Object.entries(seen.headers)
    .find(([k]) => k.toLowerCase() === 'authorization')?.[1];
  assert.equal(authHeader, `Bearer ${token}`);
});

test('detail: rejects missing / non-string incidentId WITHOUT an HTTP call', async (t) => {
  const agent = withMock();
  t.after(() => agent.close());

  await assert.rejects(detail(tokenFor('u1'), undefined), (err) => err.code === 'INVALID_INCIDENT_ID');
  await assert.rejects(detail(tokenFor('u1'), ''), (err) => err.code === 'INVALID_INCIDENT_ID');
  await assert.rejects(detail(tokenFor('u1'), 123), (err) => err.code === 'INVALID_INCIDENT_ID');
  agent.assertNoPendingInterceptors();
});

test('detail: propagates JWT decode error for a bad token', async (t) => {
  const agent = withMock();
  t.after(() => agent.close());

  await assert.rejects(detail('not-a-jwt', 'inc-1'), (err) => err.code === 'INVALID_JWT');
  agent.assertNoPendingInterceptors();
});

test('detail: server 404 surfaces as WotsError with status', async (t) => {
  const agent = withMock();
  t.after(() => agent.close());

  agent.get(BASE_URL).intercept({ path: '/api/incident/id', method: 'POST' })
    .reply(404, { type: 'NOT_FOUND' }, { headers: { 'content-type': 'application/json' } });

  await assert.rejects(
    detail(tokenFor('u1'), 'missing'),
    (err) => err.status === 404 && err.code === 'DETAIL_FAILED',
  );
});
