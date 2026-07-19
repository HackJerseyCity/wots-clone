'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { MockAgent, setGlobalDispatcher } = require('undici');

const { startLogin, completeLogin, resendCode, normalizeUsPhone } = require('../src/auth');
const { BASE_URL } = require('../src/constants');
const { WotsError } = require('../src/errors');

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

function makeJwt(payload) {
  return `${b64url({ alg: 'HS512' })}.${b64url(payload)}.AAAA`;
}

test('normalizeUsPhone strips punctuation, adds leading +1', () => {
  assert.equal(normalizeUsPhone('555-123-4567'), '+15551234567');
  assert.equal(normalizeUsPhone('(555) 123-4567'), '+15551234567');
  assert.equal(normalizeUsPhone('+1 555 123 4567'), '+15551234567');
  assert.equal(normalizeUsPhone('15551234567'), '+15551234567');
  assert.equal(normalizeUsPhone('+15551234567'), '+15551234567');
  assert.equal(normalizeUsPhone('5551234567'), '+15551234567');
  assert.equal(normalizeUsPhone('555.123.4567'), '+15551234567');
  assert.equal(normalizeUsPhone('+1-555-123-4567'), '+15551234567');
});

test('normalizeUsPhone returns null for junk input', () => {
  assert.equal(normalizeUsPhone(''), null);
  assert.equal(normalizeUsPhone('abc'), null);
  assert.equal(normalizeUsPhone('123'), null);
  assert.equal(normalizeUsPhone('25551234567'), null);
  assert.equal(normalizeUsPhone(undefined), null);
});

test('startLogin: happy path, POSTs compact JSON with iOS deviceType + UUID', async (t) => {
  const agent = withMock();
  t.after(() => agent.close());

  let seen;
  agent.get(BASE_URL).intercept({ path: '/api/register/account', method: 'POST' })
    .reply((opts) => {
      seen = opts;
      return {
        statusCode: 200,
        data: JSON.stringify({ id: 'u1', phone: '+15551234567', termsAccepted: true }),
        responseOptions: { headers: { 'content-type': 'application/json' } },
      };
    });

  const session = await startLogin('555-123-4567');
  assert.equal(seen.method, 'POST');
  assert.equal(seen.path, '/api/register/account');
  const body = JSON.parse(seen.body);
  assert.equal(body.deviceType, 'iOS');
  assert.match(body.deviceId, /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/);
  assert.equal(body.phone, '+15551234567');
  assert.equal(seen.body, `{"deviceType":"iOS","phone":"+15551234567","deviceId":"${body.deviceId}"}`);

  assert.equal(session.userId, 'u1');
  assert.equal(session.phone, '+15551234567');
  assert.equal(session.termsAccepted, true);
  assert.equal(session.deviceType, 'iOS');
  assert.equal(session.deviceId, body.deviceId);
});

test('startLogin: rejects invalid phone WITHOUT an HTTP call', async (t) => {
  const agent = withMock();
  t.after(() => agent.close());

  await assert.rejects(
    startLogin('abc'),
    (err) => err instanceof WotsError && err.code === 'INVALID_PHONE',
  );

  agent.assertNoPendingInterceptors();
});

test('startLogin: SMS_THRESHOLD is mapped from server { type }', async (t) => {
  const agent = withMock();
  t.after(() => agent.close());
  agent.get(BASE_URL).intercept({ path: '/api/register/account', method: 'POST' })
    .reply(403, { type: 'SMS_THRESHOLD' }, { headers: { 'content-type': 'application/json' } });

  await assert.rejects(
    startLogin('5551234567'),
    (err) => err.code === 'SMS_THRESHOLD' && err.status === 403,
  );
});

test('startLogin: unknown server error becomes REGISTER_FAILED with body attached', async (t) => {
  const agent = withMock();
  t.after(() => agent.close());
  agent.get(BASE_URL).intercept({ path: '/api/register/account', method: 'POST' })
    .reply(500, { type: 'MYSTERY' }, { headers: { 'content-type': 'application/json' } });

  await assert.rejects(
    startLogin('5551234567'),
    (err) => err.code === 'REGISTER_FAILED' && err.status === 500 && err.body.type === 'MYSTERY',
  );
});

test('startLogin: response missing id becomes REGISTER_FAILED', async (t) => {
  const agent = withMock();
  t.after(() => agent.close());
  agent.get(BASE_URL).intercept({ path: '/api/register/account', method: 'POST' })
    .reply(200, { phone: '15551234567' }, { headers: { 'content-type': 'application/json' } });

  await assert.rejects(
    startLogin('5551234567'),
    (err) => err.code === 'REGISTER_FAILED',
  );
});

test('completeLogin: GETs activate, calls accept/terms, returns decoded token', async (t) => {
  const agent = withMock();
  t.after(() => agent.close());

  const token = makeJwt({ sub: 'u1', auth: 'USER', exp: 1_800_000_000 });

  let activateOpts, termsOpts;
  agent.get(BASE_URL).intercept({ path: /^\/api\/register\/activate\?.*$/, method: 'GET' })
    .reply((opts) => {
      activateOpts = opts;
      return {
        statusCode: 200,
        data: JSON.stringify({ token }),
        responseOptions: { headers: { 'content-type': 'application/json' } },
      };
    });
  agent.get(BASE_URL).intercept({ path: '/api/register/accept/terms', method: 'POST' })
    .reply((opts) => {
      termsOpts = opts;
      return { statusCode: 200, data: '{}', responseOptions: { headers: { 'content-type': 'application/json' } } };
    });

  const session = { userId: 'u1', phone: '+15551234567', termsAccepted: false, deviceType: 'iOS', deviceId: 'x' };
  const result = await completeLogin(session, '1234');

  const params = new URL('http://x' + activateOpts.path).searchParams;
  assert.equal(params.get('id'), 'u1');
  assert.equal(params.get('key'), '1234');
  assert.equal(termsOpts.body, '{"userId":"u1"}');
  const termsAuth = Object.entries(termsOpts.headers)
    .find(([k]) => k.toLowerCase() === 'authorization')?.[1];
  assert.equal(termsAuth, `Bearer ${token}`);

  assert.equal(result.token, token);
  assert.equal(result.sub, 'u1');
  assert.equal(result.auth, 'USER');
  assert.equal(result.exp, 1_800_000_000);
});

test('completeLogin: rejects 3-digit code WITHOUT an HTTP call', async (t) => {
  const agent = withMock();
  t.after(() => agent.close());

  await assert.rejects(
    completeLogin({ userId: 'u1' }, '123'),
    (err) => err.code === 'INVALID_CODE_FORMAT',
  );
  agent.assertNoPendingInterceptors();
});

test('completeLogin: rejects non-digit code WITHOUT an HTTP call', async (t) => {
  const agent = withMock();
  t.after(() => agent.close());

  await assert.rejects(
    completeLogin({ userId: 'u1' }, 'abcd'),
    (err) => err.code === 'INVALID_CODE_FORMAT',
  );
  agent.assertNoPendingInterceptors();
});

test('completeLogin: CODE_NOT_VALID mapped, terms NOT called', async (t) => {
  const agent = withMock();
  t.after(() => agent.close());

  agent.get(BASE_URL).intercept({ path: /^\/api\/register\/activate\?.*$/, method: 'GET' })
    .reply(400, { type: 'CODE_NOT_VALID' }, { headers: { 'content-type': 'application/json' } });

  await assert.rejects(
    completeLogin({ userId: 'u1' }, '0000'),
    (err) => err.code === 'CODE_NOT_VALID' && err.status === 400,
  );

  agent.assertNoPendingInterceptors();
});

test('completeLogin: still resolves the token even when accept/terms fails', async (t) => {
  const agent = withMock();
  t.after(() => agent.close());

  const token = makeJwt({ sub: 'u1', auth: 'USER', exp: 1_800_000_000 });
  agent.get(BASE_URL).intercept({ path: /^\/api\/register\/activate\?.*$/, method: 'GET' })
    .reply(200, { token }, { headers: { 'content-type': 'application/json' } });
  agent.get(BASE_URL).intercept({ path: '/api/register/accept/terms', method: 'POST' })
    .reply(500, { type: 'MYSTERY' }, { headers: { 'content-type': 'application/json' } });

  const result = await completeLogin({ userId: 'u1' }, '1234');
  assert.equal(result.token, token);
  assert.equal(result.sub, 'u1');
});

test('completeLogin: missing token in success body is ACTIVATE_FAILED', async (t) => {
  const agent = withMock();
  t.after(() => agent.close());

  agent.get(BASE_URL).intercept({ path: /^\/api\/register\/activate\?.*$/, method: 'GET' })
    .reply(200, { nope: true }, { headers: { 'content-type': 'application/json' } });

  await assert.rejects(
    completeLogin({ userId: 'u1' }, '1234'),
    (err) => err.code === 'ACTIVATE_FAILED',
  );
});

test('resendCode: POSTs send/again with { userId }', async (t) => {
  const agent = withMock();
  t.after(() => agent.close());
  let seen;
  agent.get(BASE_URL).intercept({ path: '/api/register/send/again', method: 'POST' })
    .reply((opts) => {
      seen = opts;
      return { statusCode: 200, data: '{}', responseOptions: { headers: { 'content-type': 'application/json' } } };
    });

  await resendCode({ userId: 'u1' });
  assert.equal(seen.body, '{"userId":"u1"}');
});

test('resendCode: non-2xx becomes RESEND_FAILED (unless server names a known type)', async (t) => {
  const agent = withMock();
  t.after(() => agent.close());
  agent.get(BASE_URL).intercept({ path: '/api/register/send/again', method: 'POST' })
    .reply(500, { type: 'MYSTERY' }, { headers: { 'content-type': 'application/json' } });

  await assert.rejects(
    resendCode({ userId: 'u1' }),
    (err) => err.code === 'RESEND_FAILED' && err.status === 500,
  );
});

test('resendCode: rejects invalid session synchronously', async (t) => {
  const agent = withMock();
  t.after(() => agent.close());

  await assert.rejects(resendCode({}), (err) => err.code === 'RESEND_FAILED');
  await assert.rejects(resendCode(null), (err) => err.code === 'RESEND_FAILED');
  agent.assertNoPendingInterceptors();
});
