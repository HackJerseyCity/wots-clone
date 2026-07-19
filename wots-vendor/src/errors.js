'use strict';

const CODES = Object.freeze({
  INVALID_PHONE: 'INVALID_PHONE',
  INVALID_CODE_FORMAT: 'INVALID_CODE_FORMAT',
  INVALID_JWT: 'INVALID_JWT',
  SMS_THRESHOLD: 'SMS_THRESHOLD',
  CODE_NOT_VALID: 'CODE_NOT_VALID',
  ATTEMPTS_LIMIT_REACHED: 'ATTEMPTS_LIMIT_REACHED',
  REGISTER_FAILED: 'REGISTER_FAILED',
  ACTIVATE_FAILED: 'ACTIVATE_FAILED',
  RESEND_FAILED: 'RESEND_FAILED',
  LIST_FAILED: 'LIST_FAILED',
  DETAIL_FAILED: 'DETAIL_FAILED',
  INVALID_INCIDENT_ID: 'INVALID_INCIDENT_ID',
  TIMEOUT: 'TIMEOUT',
  NETWORK_ERROR: 'NETWORK_ERROR',
});

class WotsError extends Error {
  constructor(code, details = {}) {
    const { message, status, body, cause } = details;
    super(message || code);
    this.name = 'WotsError';
    this.code = code;
    if (status !== undefined) this.status = status;
    if (body !== undefined) this.body = body;
    if (cause !== undefined) this.cause = cause;
  }
}

WotsError.codes = CODES;

module.exports = { WotsError };
