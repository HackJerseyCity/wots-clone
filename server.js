'use strict';

const path = require('node:path');
const Fastify = require('fastify');
const fastifyView = require('@fastify/view');
const fastifyStatic = require('@fastify/static');
const { Eta } = require('eta');
const WOTS = require('wots');
const db = require('./db');

const PORT = process.env.PORT || 3000;
const MAX_BODY_BYTES = 15 * 1024 * 1024;

const CLIENT_ERRORS = new Set([
  'INVALID_PHONE', 'INVALID_CODE_FORMAT', 'INVALID_JWT',
  'INVALID_INCIDENT_ID', 'INVALID_REPORT', 'UNKNOWN_TYPE',
  'REDIRECT_911', 'INVALID_CANCEL_INFO',
]);

function userIdFromToken(token) {
  try { return WOTS.decodeJwtPayload(token).sub || ''; }
  catch (_) { return ''; }
}

function bearerToken(req) {
  const auth = req.headers.authorization || '';
  return auth.startsWith('Bearer ') ? auth.slice(7) : '';
}

function requireToken(req, reply) {
  const token = bearerToken(req);
  if (!token) {
    reply.status(401).send({ error: 'missing token' });
    return null;
  }
  return token;
}

const app = Fastify({ bodyLimit: MAX_BODY_BYTES });

app.register(fastifyView, {
  engine: { eta: new Eta() },
  root: path.join(__dirname, 'views'),
  viewExt: 'html',
});

app.register(fastifyStatic, {
  root: path.join(__dirname, 'public', 'img'),
  prefix: '/img/',
  cacheControl: true,
  maxAge: 604800000,
  immutable: true,
});

app.setErrorHandler((err, req, reply) => {
  const status = err.statusCode
    || (CLIENT_ERRORS.has(err.code) ? 400 : 500);
  reply.status(status).send({
    error: err.code || 'INTERNAL',
    message: err.message || String(err),
  });
});

for (const [route, template] of [
  ['/', 'index'],
  ['/new', 'index'],
  ['/stats', 'stats'],
  ['/about', 'about'],
  ['/terms', 'terms'],
]) {
  app.get(route, (req, reply) => reply.view(template));
}

app.get('/report/:id', (req, reply) => reply.view('index'));

app.post('/api/start-login', async (req) => {
  const { phone } = req.body || {};
  const session = await WOTS.startLogin(phone);
  return { session };
});

app.post('/api/complete-login', async (req) => {
  const { session, code } = req.body || {};
  return WOTS.completeLogin(session, code);
});

app.post('/api/resend-code', async (req) => {
  const { session } = req.body || {};
  await WOTS.resendCode(session);
  return { ok: true };
});

app.get('/api/incidents', async (req, reply) => {
  const token = requireToken(req, reply);
  if (!token) return reply;
  const items = await WOTS.all(token);
  const userId = userIdFromToken(token);
  const cached = userId
    ? db.getMany(userId, items.map((it) => it && it.id).filter(Boolean))
    : {};
  return { items, cached };
});

app.get('/api/incidents/:id', async (req, reply) => {
  const token = requireToken(req, reply);
  if (!token) return reply;
  const { id } = req.params;
  const userId = userIdFromToken(token);
  if (userId) {
    const hit = db.get(id, userId);
    if (hit) return { incident: hit, cached: true };
  }
  const incident = await WOTS.detail(token, id);
  if (userId) db.put(id, userId, incident);
  return { incident: db.sanitizeIncident(incident) };
});

app.get('/api/types', async () => ({ types: WOTS.TYPES }));

app.get('/api/stats', async () => db.stats());

app.post('/api/submit', async (req, reply) => {
  const token = requireToken(req, reply);
  if (!token) return reply;
  const { type, lat, lon, phone, address, comment, imageBase64 } = req.body || {};
  const image = imageBase64 ? Buffer.from(imageBase64, 'base64') : undefined;
  return WOTS.submit(token, { type, lat, lon, phone, address, comment, image });
});

app.post('/api/cancel', async (req, reply) => {
  const token = requireToken(req, reply);
  if (!token) return reply;
  const { cancelInfo } = req.body || {};
  const incident = await WOTS.cancel(token, cancelInfo);
  const userId = userIdFromToken(token);
  if (userId && incident && cancelInfo && cancelInfo.incidentId) {
    db.put(cancelInfo.incidentId, userId, incident);
  }
  return { incident: db.sanitizeIncident(incident) };
});

app.listen({ port: PORT, host: '0.0.0.0' })
  .then(() => console.log(`wots-clone listening on http://localhost:${PORT}`))
  .catch((err) => { console.error(err); process.exit(1); });
