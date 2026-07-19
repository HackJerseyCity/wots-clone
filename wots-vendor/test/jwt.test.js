'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { decodeJwtPayload } = require('../src/jwt');
const { WotsError } = require('../src/errors');

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64')
    .replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function makeJwt(payload) {
  const header = b64url({ alg: 'HS512' });
  const body = b64url(payload);
  const sig = 'AAAA';
  return `${header}.${body}.${sig}`;
}

test('decodes a WOTS-shaped payload (sub, auth, exp)', () => {
  const token = makeJwt({ sub: 'u1', auth: 'USER', exp: 1_800_000_000 });
  const p = decodeJwtPayload(token);
  assert.equal(p.sub, 'u1');
  assert.equal(p.auth, 'USER');
  assert.equal(p.exp, 1_800_000_000);
});

test('handles base64url with - and _ characters (no padding)', () => {
  const payload = { sub: 'a?b>c<d', auth: 'USER', exp: 1 };
  const token = makeJwt(payload);
  assert.doesNotThrow(() => decodeJwtPayload(token));
});

test('rejects non-string input', () => {
  assert.throws(() => decodeJwtPayload(undefined), (e) => e instanceof WotsError && e.code === 'INVALID_JWT');
  assert.throws(() => decodeJwtPayload(null), (e) => e instanceof WotsError && e.code === 'INVALID_JWT');
  assert.throws(() => decodeJwtPayload(123), (e) => e instanceof WotsError && e.code === 'INVALID_JWT');
});

test('rejects tokens without exactly 3 segments', () => {
  assert.throws(() => decodeJwtPayload('a.b'), (e) => e.code === 'INVALID_JWT');
  assert.throws(() => decodeJwtPayload('a.b.c.d'), (e) => e.code === 'INVALID_JWT');
});

test('rejects tokens whose payload is not JSON', () => {
  const bad = `AAAA.${Buffer.from('not-json').toString('base64url')}.SIG`;
  assert.throws(() => decodeJwtPayload(bad), (e) => e.code === 'INVALID_JWT');
});

test('rejects tokens whose payload is JSON but not an object', () => {
  const arr = `AAAA.${Buffer.from(JSON.stringify([1, 2])).toString('base64url')}.SIG`;
  assert.throws(() => decodeJwtPayload(arr), (e) => e.code === 'INVALID_JWT');

  const num = `AAAA.${Buffer.from('42').toString('base64url')}.SIG`;
  assert.throws(() => decodeJwtPayload(num), (e) => e.code === 'INVALID_JWT');
});
