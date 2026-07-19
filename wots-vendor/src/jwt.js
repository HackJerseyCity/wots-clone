'use strict';

const { WotsError } = require('./errors');

function decodeJwtPayload(token) {
  if (typeof token !== 'string') {
    throw new WotsError('INVALID_JWT', { message: 'token must be a string' });
  }
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new WotsError('INVALID_JWT', { message: 'expected 3 segments' });
  }
  const [, payloadB64] = parts;
  let json;
  try {
    const b64 = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
    const buf = Buffer.from(b64 + pad, 'base64');
    json = buf.toString('utf8');
  } catch (err) {
    throw new WotsError('INVALID_JWT', { message: 'base64 decode failed', cause: err });
  }
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    throw new WotsError('INVALID_JWT', { message: 'payload is not JSON', cause: err });
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new WotsError('INVALID_JWT', { message: 'payload is not an object' });
  }
  return parsed;
}

module.exports = { decodeJwtPayload };
