'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { WotsError } = require('../src/errors');

test('is an Error subclass with name = WotsError', () => {
  const e = new WotsError('SMS_THRESHOLD');
  assert.ok(e instanceof Error);
  assert.equal(e.name, 'WotsError');
});

test('exposes the code and optional status/body/cause', () => {
  const cause = new Error('boom');
  const e = new WotsError('REGISTER_FAILED', { status: 500, body: { type: 'x' }, cause });
  assert.equal(e.code, 'REGISTER_FAILED');
  assert.equal(e.status, 500);
  assert.deepEqual(e.body, { type: 'x' });
  assert.equal(e.cause, cause);
});

test('defaults message to code when message not supplied', () => {
  const e = new WotsError('SMS_THRESHOLD');
  assert.equal(e.message, 'SMS_THRESHOLD');
});

test('exposes codes registry with the expected keys', () => {
  for (const key of [
    'INVALID_PHONE', 'INVALID_CODE_FORMAT', 'INVALID_JWT',
    'SMS_THRESHOLD', 'CODE_NOT_VALID', 'ATTEMPTS_LIMIT_REACHED',
    'REGISTER_FAILED', 'ACTIVATE_FAILED', 'RESEND_FAILED',
    'TIMEOUT', 'NETWORK_ERROR',
  ]) {
    assert.equal(WotsError.codes[key], key, `missing code ${key}`);
  }
});
