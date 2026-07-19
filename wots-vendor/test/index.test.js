'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const WOTS = require('..');

test('exports the auth surface', () => {
  assert.equal(typeof WOTS.startLogin, 'function');
  assert.equal(typeof WOTS.completeLogin, 'function');
  assert.equal(typeof WOTS.resendCode, 'function');
});

test('exports incidents surface', () => {
  assert.equal(typeof WOTS.all, 'function');
  assert.equal(typeof WOTS.detail, 'function');
});

test('exports WotsError with codes registry', () => {
  assert.equal(typeof WOTS.WotsError, 'function');
  assert.equal(WOTS.WotsError.codes.SMS_THRESHOLD, 'SMS_THRESHOLD');
});

test('exports jwt helper and constants', () => {
  assert.equal(typeof WOTS.decodeJwtPayload, 'function');
  assert.equal(WOTS.constants.BASE_URL, 'https://dey3fr5ho9vla.cloudfront.net');
});
