'use strict';

const path = require('node:path');
const fs = require('node:fs');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'wots.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS incident_details (
    id                TEXT    NOT NULL,
    user_id           TEXT    NOT NULL,
    data              TEXT    NOT NULL,        -- full PublicIncident JSON
    primary_text      TEXT,
    type_name         TEXT,
    address           TEXT,
    received_at       INTEGER,
    resolved_at       INTEGER,
    canceled_at       INTEGER,
    public_resolution TEXT,
    cached_at         INTEGER NOT NULL,
    PRIMARY KEY (id, user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_incident_user      ON incident_details(user_id);
  CREATE INDEX IF NOT EXISTS idx_incident_type      ON incident_details(type_name);
  CREATE INDEX IF NOT EXISTS idx_incident_resolved  ON incident_details(resolved_at);
`);

const _get = db.prepare('SELECT data FROM incident_details WHERE id = ? AND user_id = ?');
const _put = db.prepare(`
  INSERT OR REPLACE INTO incident_details
    (id, user_id, data, primary_text, type_name, address,
     received_at, resolved_at, canceled_at, public_resolution, cached_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const _del = db.prepare('DELETE FROM incident_details WHERE id = ? AND user_id = ?');

function num(v) {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function isTerminal(incident) {
  if (!incident || typeof incident !== 'object') return false;
  return num(incident.resolvedAt) !== null || num(incident.canceledAt) !== null;
}

function get(id, userId) {
  if (!id || !userId) return null;
  const row = _get.get(id, userId);
  if (!row) return null;
  try { return JSON.parse(row.data); } catch (_) { return null; }
}

function getMany(userId, ids) {
  if (!userId || !Array.isArray(ids) || ids.length === 0) return {};
  // Chunk to avoid SQLite's SQLITE_MAX_VARIABLE_NUMBER (default 32766, but be conservative).
  const out = {};
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const placeholders = chunk.map(() => '?').join(',');
    const stmt = db.prepare(
      `SELECT id, data FROM incident_details WHERE user_id = ? AND id IN (${placeholders})`
    );
    for (const row of stmt.all(userId, ...chunk)) {
      try { out[row.id] = JSON.parse(row.data); } catch (_) { /* skip */ }
    }
  }
  return out;
}

// Fields we deliberately drop before persisting. userContent.phone and
// userContent.avatarText (which mirrors the phone) are PII the app never
// uses — see /about for the rationale. Applied via JSON.stringify replacer
// so nested occurrences are caught regardless of depth.
const SANITIZE_KEYS = new Set(['phone', 'avatarText']);
function sanitizeReplacer(key, value) {
  return SANITIZE_KEYS.has(key) ? undefined : value;
}

// Insert only when the incident is terminal (immutable). No-op otherwise.
function put(id, userId, incident) {
  if (!id || !userId || !isTerminal(incident)) return false;
  _put.run(
    id,
    userId,
    JSON.stringify(incident, sanitizeReplacer),
    incident.primaryText || null,
    incident.typeName || null,
    incident.address || null,
    num(incident.receivedAt),
    num(incident.resolvedAt),
    num(incident.canceledAt),
    incident.publicResolution || null,
    Date.now()
  );
  return true;
}

// Returns a copy with the same PII fields stripped. Cheap deep-clone via
// stringify+parse; incident payloads are small (a few KB).
function sanitizeIncident(incident) {
  if (!incident || typeof incident !== 'object') return incident;
  return JSON.parse(JSON.stringify(incident, sanitizeReplacer));
}

// One-time backfill: strip PII from any rows that predate the sanitize
// step. Idempotent — a second boot has nothing to touch and does no writes.
(function backfillSanitize() {
  const rows = db.prepare('SELECT id, user_id, data FROM incident_details').all();
  const upd = db.prepare('UPDATE incident_details SET data = ? WHERE id = ? AND user_id = ?');
  const tx = db.transaction((toWrite) => {
    for (const w of toWrite) upd.run(w.data, w.id, w.user_id);
  });
  const dirty = [];
  for (const r of rows) {
    try {
      const parsed = JSON.parse(r.data);
      const uc = parsed && parsed.userContent;
      if (uc && (uc.phone != null || uc.avatarText != null)) {
        dirty.push({ id: r.id, user_id: r.user_id, data: JSON.stringify(parsed, sanitizeReplacer) });
      }
    } catch (_) { /* leave malformed rows alone */ }
  }
  if (dirty.length) {
    tx(dirty);
    console.log(`db: sanitized ${dirty.length} pre-existing rows`);
  }
})();

function del(id, userId) {
  if (!id || !userId) return;
  _del.run(id, userId);
}

// ---------- Aggregates ------------------------------------------------------
// Site-wide, anonymized. Never returns id, user_id, address, phone, comments,
// or image URLs — only the aggregable dimensions (type, resolution phrase,
// timestamps, officer role label).

const _statsRowsStmt = db.prepare(`
  SELECT
    type_name,
    primary_text,
    public_resolution,
    received_at,
    resolved_at,
    canceled_at,
    json_extract(data, '$.props.OFFICER_LABEL') AS officer
  FROM incident_details
`);

function durationStats(arr) {
  if (!arr.length) return null;
  const sorted = arr.slice().sort((a, b) => a - b);
  const at = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
  const sum = arr.reduce((a, b) => a + b, 0);
  return {
    count: arr.length,
    meanSecs: Math.round(sum / arr.length),
    medianSecs: Math.round(at(0.5)),
    p95Secs: Math.round(at(0.95)),
    minSecs: Math.round(sorted[0]),
    maxSecs: Math.round(sorted[sorted.length - 1]),
  };
}

function monthKey(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function stats() {
  const rows = _statsRowsStmt.all();

  let total = 0, resolved = 0, canceled = 0;
  const byType = new Map();
  const byResolution = new Map();
  const byOfficer = new Map();
  const byMonth = new Map();
  const buckets = { under1hr: 0, under1day: 0, under1week: 0, under1month: 0, over1month: 0 };
  const allDurations = [];

  const bumpMonth = (m, key) => {
    if (!m.has(key)) m.set(key, { month: key, reported: 0, resolved: 0, canceled: 0 });
    return m.get(key);
  };

  for (const r of rows) {
    total++;
    const isCanceled = r.canceled_at != null && r.canceled_at > 0;
    const isResolved = !isCanceled && r.resolved_at != null && r.resolved_at > 0;
    if (isCanceled) canceled++;
    if (isResolved) resolved++;

    const dur = (isResolved && r.received_at) ? (r.resolved_at - r.received_at) / 1000 : null;
    if (dur !== null && dur > 0) allDurations.push(dur);

    if (r.type_name) {
      if (!byType.has(r.type_name)) {
        byType.set(r.type_name, { typeName: r.type_name, count: 0, resolved: 0, canceled: 0, durations: [] });
      }
      const t = byType.get(r.type_name);
      t.count++;
      if (isCanceled) t.canceled++;
      if (isResolved) t.resolved++;
      if (dur !== null && dur > 0) t.durations.push(dur);
    }

    if (r.public_resolution) {
      if (!byResolution.has(r.public_resolution)) {
        byResolution.set(r.public_resolution, { resolution: r.public_resolution, count: 0, types: new Map(), durations: [] });
      }
      const b = byResolution.get(r.public_resolution);
      b.count++;
      if (r.type_name) b.types.set(r.type_name, (b.types.get(r.type_name) || 0) + 1);
      if (dur !== null && dur > 0) b.durations.push(dur);
    }

    if (r.officer) {
      if (!byOfficer.has(r.officer)) {
        byOfficer.set(r.officer, { officer: r.officer, count: 0, resolved: 0, canceled: 0, durations: [] });
      }
      const o = byOfficer.get(r.officer);
      o.count++;
      if (isCanceled) o.canceled++;
      if (isResolved) o.resolved++;
      if (dur !== null && dur > 0) o.durations.push(dur);
    }

    if (r.received_at) bumpMonth(byMonth, monthKey(r.received_at)).reported++;
    if (isResolved && r.resolved_at) bumpMonth(byMonth, monthKey(r.resolved_at)).resolved++;
    if (isCanceled && r.canceled_at) bumpMonth(byMonth, monthKey(r.canceled_at)).canceled++;

    if (dur !== null && dur > 0) {
      if (dur < 3600) buckets.under1hr++;
      else if (dur < 86400) buckets.under1day++;
      else if (dur < 604800) buckets.under1week++;
      else if (dur < 2592000) buckets.under1month++;
      else buckets.over1month++;
    }
  }

  const roundRate = (n, d) => d ? Math.round((n / d) * 1000) / 1000 : 0;

  return {
    generatedAt: Date.now(),
    totals: {
      total, resolved, canceled,
      resolutionRate: roundRate(resolved, total),
      cancelRate: roundRate(canceled, total),
    },
    resolutionTimeOverall: durationStats(allDurations),
    resolutionTimeBuckets: buckets,
    byType: [...byType.values()]
      .map((t) => ({
        typeName: t.typeName,
        count: t.count,
        resolvedCount: t.resolved,
        canceledCount: t.canceled,
        resolutionRate: roundRate(t.resolved, t.count),
        resolutionTime: durationStats(t.durations),
      }))
      .sort((a, b) => b.count - a.count),
    byResolution: [...byResolution.values()]
      .map((b) => ({
        resolution: b.resolution,
        count: b.count,
        topTypes: [...b.types.entries()]
          .map(([typeName, count]) => ({ typeName, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5),
        resolutionTime: durationStats(b.durations),
      }))
      .sort((a, b) => b.count - a.count),
    byOfficer: [...byOfficer.values()]
      .map((o) => ({
        officer: o.officer,
        count: o.count,
        resolvedCount: o.resolved,
        canceledCount: o.canceled,
        resolutionRate: roundRate(o.resolved, o.count),
        resolutionTime: durationStats(o.durations),
      }))
      .sort((a, b) => b.count - a.count),
    byMonth: [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)),
  };
}

module.exports = { get, getMany, put, del, isTerminal, sanitizeIncident, stats, db, DB_PATH };
