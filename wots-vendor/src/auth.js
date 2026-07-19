'use strict';

const { randomUUID } = require('node:crypto');

const { request } = require('./http');
const { WotsError } = require('./errors');
const { decodeJwtPayload } = require('./jwt');

const REGISTER_TIMEOUT_MS = 30_000;
const ACTIVATE_TIMEOUT_MS = 20_000;
const TERMS_TIMEOUT_MS = 20_000;
const RESEND_TIMEOUT_MS = 20_000;

function normalizeUsPhone(tel) {
  if (typeof tel !== 'string') return null;
  const digits = tel.replace(/\D+/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

async function startLogin(tel, opts = {}) {
  const phone = normalizeUsPhone(tel);
  if (!phone) {
    throw new WotsError('INVALID_PHONE', {
      message: 'phone must be a 10- or 11-digit US number',
    });
  }
  const deviceType = 'iOS';
  const deviceId = opts.deviceId || randomUUID().toUpperCase();

  const body = { deviceType, phone, deviceId };

  const data = await request('/api/register/account', {
    method: 'POST',
    body,
    timeoutMs: opts.timeoutMs ?? REGISTER_TIMEOUT_MS,
    baseUrl: opts.baseUrl,
    fetchImpl: opts.fetchImpl,
    failureCode: 'REGISTER_FAILED',
  });

  if (!data || typeof data.id !== 'string') {
    throw new WotsError('REGISTER_FAILED', {
      message: "missing 'id' in register/account response",
      body: data,
    });
  }

  return {
    userId: data.id,
    phone: typeof data.phone === 'string' ? data.phone : phone,
    termsAccepted: data.termsAccepted === true,
    deviceType,
    deviceId,
  };
}

function isFourDigitCode(code) {
  return typeof code === 'string' && /^\d{4}$/.test(code);
}

async function completeLogin(session, code, opts = {}) {
  if (!session || typeof session.userId !== 'string') {
    throw new WotsError('ACTIVATE_FAILED', { message: 'invalid session' });
  }
  if (!isFourDigitCode(code)) {
    throw new WotsError('INVALID_CODE_FORMAT', {
      message: 'code must be exactly 4 digits',
    });
  }

  const data = await request('/api/register/activate', {
    method: 'GET',
    query: { id: session.userId, key: code },
    timeoutMs: opts.timeoutMs ?? ACTIVATE_TIMEOUT_MS,
    baseUrl: opts.baseUrl,
    fetchImpl: opts.fetchImpl,
    failureCode: 'ACTIVATE_FAILED',
  });

  if (!data || typeof data.token !== 'string') {
    throw new WotsError('ACTIVATE_FAILED', {
      message: "missing 'token' in activate response",
      body: data,
    });
  }
  const token = data.token;

  try {
    await request('/api/register/accept/terms', {
      method: 'POST',
      body: { userId: session.userId },
      authToken: token,
      timeoutMs: opts.termsTimeoutMs ?? TERMS_TIMEOUT_MS,
      baseUrl: opts.baseUrl,
      fetchImpl: opts.fetchImpl,
      failureCode: 'REGISTER_FAILED',
    });
  } catch {
    // Idempotent per doc/wots-reference.md:286-289 — do not fail login here.
  }

  const payload = decodeJwtPayload(token);
  return {
    token,
    sub: payload.sub,
    auth: payload.auth,
    exp: payload.exp,
  };
}

async function resendCode(session, opts = {}) {
  if (!session || typeof session.userId !== 'string') {
    throw new WotsError('RESEND_FAILED', { message: 'invalid session' });
  }
  await request('/api/register/send/again', {
    method: 'POST',
    body: { userId: session.userId },
    timeoutMs: opts.timeoutMs ?? RESEND_TIMEOUT_MS,
    baseUrl: opts.baseUrl,
    fetchImpl: opts.fetchImpl,
    failureCode: 'RESEND_FAILED',
  });
}

module.exports = {
  startLogin,
  completeLogin,
  resendCode,
  normalizeUsPhone,
};
