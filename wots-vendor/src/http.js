'use strict';

const { DEFAULT_HEADERS, BASE_URL } = require('./constants');
const { WotsError } = require('./errors');

async function request(path, options = {}) {
  const {
    method = 'GET',
    query,
    body,
    timeoutMs = 20_000,
    baseUrl = BASE_URL,
    fetchImpl = globalThis.fetch,
    failureCode = 'REQUEST_FAILED',
    authToken,
  } = options;

  const url = new URL(path, baseUrl);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }

  const headers = { ...DEFAULT_HEADERS };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
  let payload;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = typeof body === 'string' ? body : JSON.stringify(body);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetchImpl(url.toString(), {
      method,
      headers,
      body: payload,
      signal: controller.signal,
    });
  } catch (err) {
    if (err && err.name === 'AbortError') {
      throw new WotsError('TIMEOUT', { message: `request timed out after ${timeoutMs}ms`, cause: err });
    }
    throw new WotsError('NETWORK_ERROR', { message: err && err.message, cause: err });
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let parsed;
  if (text.length) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = undefined;
    }
  }

  if (!res.ok) {
    const type = parsed && typeof parsed === 'object' ? parsed.type : undefined;
    const code = (type && WotsError.codes[type]) || failureCode;
    throw new WotsError(code, { status: res.status, body: parsed ?? text });
  }

  return parsed;
}

module.exports = { request };
