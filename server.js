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
const IS_DEV = process.env.NODE_ENV !== 'production';

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

// Dev-only in-memory sim store: userId -> Map<incidentId, incident>.
// Lives for the life of the process and is wiped on restart. Kept out of the
// real SQLite cache so nothing sim ever leaks to a prod DB file.
const SIM = new Map();
function simFor(userId) {
  if (!SIM.has(userId)) SIM.set(userId, new Map());
  return SIM.get(userId);
}
// Sim keys need a stable owner even when the JWT sub can't be decoded, so we
// fall back to 'anon'. Kept separate from the real userId used for DB caching.
function simUserId(token) { return userIdFromToken(token) || 'anon'; }
function isSimId(id) { return typeof id === 'string' && id.startsWith('sim-'); }
function makeSimIncident(body) {
  const nowSec = Math.floor(Date.now() / 1000);
  const rand = Math.random().toString(36).slice(2, 8);
  const type = body.type || 'UNKNOWN';
  const typeMeta = (WOTS.TYPES && WOTS.TYPES[type]) || {};
  const comments = body.comment
    ? [{ text: String(body.comment), createdAt: nowSec }]
    : [];
  const imageUrls = body.imageBase64
    ? [`data:image/jpeg;base64,${body.imageBase64}`]
    : [];
  const lat = Number(body.lat), lon = Number(body.lon);
  const fallbackAddr = Number.isFinite(lat) && Number.isFinite(lon)
    ? `Simulated near ${lat.toFixed(4)}, ${lon.toFixed(4)}`
    : 'Simulated location';
  return {
    id: `sim-${nowSec.toString(36)}-${rand}`,
    typeName: typeMeta.typeName || type,
    address: body.address ? String(body.address) : fallbackAddr,
    primaryText: 'Open',
    receivedAt: nowSec,
    props: {},
    userContent: { comments, imageUrls },
  };
}
function simSummary(inc) {
  return {
    id: inc.id,
    typeName: inc.typeName,
    address: inc.address,
    primaryText: inc.primaryText,
  };
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

app.register(fastifyStatic, {
  root: path.join(__dirname, 'public', 'data'),
  prefix: '/data/',
  cacheControl: true,
  maxAge: 86400000,
  decorateReply: false,
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
  app.get(route, (req, reply) => reply.view(template, { isDev: IS_DEV }));
}

app.get('/report/:id', (req, reply) => reply.view('index', { isDev: IS_DEV }));

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
  let items;
  try {
    items = await WOTS.all(token);
  } catch (err) {
    // In dev, keep the list usable when WOTS is unreachable so sim items
    // still render. In prod, surface the real error.
    if (!IS_DEV) throw err;
    req.log.warn({ err: err && (err.code || err.message) }, 'WOTS.all failed; returning sim-only list');
    items = [];
  }
  const userId = userIdFromToken(token);
  const cached = userId
    ? db.getMany(userId, items.map((it) => it && it.id).filter(Boolean))
    : {};
  if (IS_DEV) {
    const sims = [...simFor(simUserId(token)).values()];
    if (sims.length) {
      // Prepend so newest sim shows on top; seed detailsCache so the client
      // doesn't hit /api/incidents/:id for them.
      const summaries = sims.map(simSummary);
      for (const inc of sims) cached[inc.id] = inc;
      return { items: [...summaries, ...items], cached };
    }
  }
  return { items, cached };
});

app.get('/api/incidents/:id', async (req, reply) => {
  const token = requireToken(req, reply);
  if (!token) return reply;
  const { id } = req.params;
  const userId = userIdFromToken(token);
  if (IS_DEV && isSimId(id)) {
    const inc = simFor(simUserId(token)).get(id);
    if (inc) return { incident: inc, cached: true };
    reply.status(404);
    return { error: 'INVALID_INCIDENT_ID', message: 'sim incident not found' };
  }
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

if (IS_DEV) {
  app.post('/api/simulate/submit', async (req, reply) => {
    const token = requireToken(req, reply);
    if (!token) return reply;
    const incident = makeSimIncident(req.body || {});
    simFor(simUserId(token)).set(incident.id, incident);
    return {
      incidentId: incident.id,
      cancelInfo: { sim: true, incidentId: incident.id },
    };
  });
}

app.post('/api/cancel', async (req, reply) => {
  const token = requireToken(req, reply);
  if (!token) return reply;
  const { cancelInfo } = req.body || {};
  const userId = userIdFromToken(token);
  if (IS_DEV && cancelInfo && cancelInfo.sim && cancelInfo.incidentId) {
    const inc = simFor(simUserId(token)).get(cancelInfo.incidentId);
    if (!inc) {
      reply.status(404);
      return { error: 'INVALID_CANCEL_INFO', message: 'sim incident not found' };
    }
    inc.canceledAt = Math.floor(Date.now() / 1000);
    inc.primaryText = 'Canceled';
    return { incident: inc };
  }
  const incident = await WOTS.cancel(token, cancelInfo);
  if (userId && incident && cancelInfo && cancelInfo.incidentId) {
    db.put(cancelInfo.incidentId, userId, incident);
  }
  return { incident: db.sanitizeIncident(incident) };
});

app.listen({ port: PORT, host: '0.0.0.0' })
  .then(() => console.log(`wots-clone listening on http://localhost:${PORT}`))
  .catch((err) => { console.error(err); process.exit(1); });
