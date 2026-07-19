'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const WOTS = require('wots');
const db = require('./db');

function userIdFromToken(token) {
  try { return WOTS.decodeJwtPayload(token).sub || ''; }
  catch (_) { return ''; }
}

const PORT = process.env.PORT || 3000;
const INDEX_HTML = fs.readFileSync(path.join(__dirname, 'public', 'index.html'));
const STATS_HTML = fs.readFileSync(path.join(__dirname, 'public', 'stats.html'));
const ABOUT_HTML = fs.readFileSync(path.join(__dirname, 'public', 'about.html'));

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
}

const MAX_BODY_BYTES = 15 * 1024 * 1024;

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (c) => {
      total += c.length;
      if (total > MAX_BODY_BYTES) {
        const e = new Error('payload too large');
        e.status = 413;
        req.destroy();
        reject(e);
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

async function handle(req, res) {
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(INDEX_HTML);
    return;
  }

  if (req.method === 'GET' && req.url === '/stats') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(STATS_HTML);
    return;
  }

  if (req.method === 'GET' && req.url === '/about') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(ABOUT_HTML);
    return;
  }

  try {
    if (req.method === 'POST' && req.url === '/api/start-login') {
      const { phone } = await readJson(req);
      const session = await WOTS.startLogin(phone);
      return send(res, 200, { session });
    }

    if (req.method === 'POST' && req.url === '/api/complete-login') {
      const { session, code } = await readJson(req);
      const result = await WOTS.completeLogin(session, code);
      return send(res, 200, result);
    }

    if (req.method === 'POST' && req.url === '/api/resend-code') {
      const { session } = await readJson(req);
      await WOTS.resendCode(session);
      return send(res, 200, { ok: true });
    }

    if (req.method === 'GET' && req.url === '/api/incidents') {
      const auth = req.headers.authorization || '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
      if (!token) return send(res, 401, { error: 'missing token' });
      const items = await WOTS.all(token);
      const userId = userIdFromToken(token);
      const cached = userId
        ? db.getMany(userId, items.map((it) => it && it.id).filter(Boolean))
        : {};
      return send(res, 200, { items, cached });
    }

    if (req.method === 'GET' && req.url.startsWith('/api/incidents/')) {
      const auth = req.headers.authorization || '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
      if (!token) return send(res, 401, { error: 'missing token' });
      const id = decodeURIComponent(req.url.slice('/api/incidents/'.length));
      const userId = userIdFromToken(token);
      if (userId) {
        const hit = db.get(id, userId);
        if (hit) return send(res, 200, { incident: hit, cached: true });
      }
      const incident = await WOTS.detail(token, id);
      if (userId) db.put(id, userId, incident);
      return send(res, 200, { incident });
    }

    if (req.method === 'GET' && req.url === '/api/types') {
      return send(res, 200, { types: WOTS.TYPES });
    }

    if (req.method === 'GET' && req.url === '/api/stats') {
      // Public, anonymized aggregates across every cached (terminal) incident.
      return send(res, 200, db.stats());
    }

    if (req.method === 'POST' && req.url === '/api/submit') {
      const auth = req.headers.authorization || '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
      if (!token) return send(res, 401, { error: 'missing token' });
      const body = await readJson(req);
      const { type, lat, lon, phone, address, comment, imageBase64 } = body;
      const image = imageBase64 ? Buffer.from(imageBase64, 'base64') : undefined;
      const result = await WOTS.submit(token, { type, lat, lon, phone, address, comment, image });
      return send(res, 200, result);
    }

    if (req.method === 'POST' && req.url === '/api/cancel') {
      const auth = req.headers.authorization || '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
      if (!token) return send(res, 401, { error: 'missing token' });
      const { cancelInfo } = await readJson(req);
      const incident = await WOTS.cancel(token, cancelInfo);
      const userId = userIdFromToken(token);
      if (userId && incident && cancelInfo && cancelInfo.incidentId) {
        db.put(cancelInfo.incidentId, userId, incident);
      }
      return send(res, 200, { incident });
    }

    send(res, 404, { error: 'not found' });
  } catch (err) {
    const clientErrors = new Set([
      'INVALID_PHONE', 'INVALID_CODE_FORMAT', 'INVALID_JWT',
      'INVALID_INCIDENT_ID', 'INVALID_REPORT', 'UNKNOWN_TYPE',
      'REDIRECT_911', 'INVALID_CANCEL_INFO',
    ]);
    const status = err && err.status
      ? err.status
      : (err && clientErrors.has(err.code) ? 400 : 500);
    send(res, status, {
      error: err && err.code ? err.code : 'INTERNAL',
      message: err && err.message ? err.message : String(err),
    });
  }
}

http.createServer((req, res) => {
  handle(req, res).catch((err) => {
    send(res, 500, { error: 'INTERNAL', message: String(err) });
  });
}).listen(PORT, () => {
  console.log(`wots-clone listening on http://localhost:${PORT}`);
});
