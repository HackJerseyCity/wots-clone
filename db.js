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

// Insert only when the incident is terminal (immutable). No-op otherwise.
function put(id, userId, incident) {
  if (!id || !userId || !isTerminal(incident)) return false;
  _put.run(
    id,
    userId,
    JSON.stringify(incident),
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

function del(id, userId) {
  if (!id || !userId) return;
  _del.run(id, userId);
}

module.exports = { get, getMany, put, del, isTerminal, db, DB_PATH };
