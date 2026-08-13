const path = require('path');
const fs = require('fs');

let pool = null;
let poolReady = false;

if (process.env.DATABASE_URL) {
  const { Pool } = require('pg');
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  pool.on('error', (err) => {
    console.error('Error de conexión con la BD (el pool se recupera solo):', err.message);
  });
}

const FILE = path.join(__dirname, 'levels.json');

async function ensureTable() {
  if (!pool || poolReady) return;
  await pool.query(`CREATE TABLE IF NOT EXISTS levels (
    key TEXT PRIMARY KEY,
    xp BIGINT NOT NULL DEFAULT 0,
    level INT NOT NULL DEFAULT 1
  )`);
  poolReady = true;
}

async function load() {
  if (pool) {
    await ensureTable();
    const { rows } = await pool.query('SELECT key, xp, level FROM levels');
    return Object.fromEntries(
      rows.map(row => [row.key, { xp: Number(row.xp), level: Number(row.level) }])
    );
  }

  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return {};
  }
}

async function save(entries) {
  if (pool) {
    await ensureTable();
    const values = Object.entries(entries);
    for (const [key, value] of values) {
      await pool.query(
        `INSERT INTO levels (key, xp, level) VALUES ($1, $2, $3)
         ON CONFLICT (key) DO UPDATE SET xp = EXCLUDED.xp, level = EXCLUDED.level`,
        [key, value.xp, value.level]
      );
    }
    return;
  }

  fs.writeFileSync(FILE, JSON.stringify(entries));
}

let kvReady = false;

async function ensureKvTable() {
  if (!pool || kvReady) return;
  await pool.query(`CREATE TABLE IF NOT EXISTS kv (
    bucket TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    PRIMARY KEY (bucket, key)
  )`);
  kvReady = true;
}

function kvFile(bucket) {
  return path.join(__dirname, bucket + '.json');
}

async function loadJson(bucket) {
  if (pool) {
    await ensureKvTable();
    const { rows } = await pool.query('SELECT key, value FROM kv WHERE bucket = $1', [bucket]);
    const out = {};

    for (const row of rows) {
      try {
        out[row.key] = JSON.parse(row.value);
      } catch {
        // valor corrupto, se ignora
      }
    }

    return out;
  }

  try {
    return JSON.parse(fs.readFileSync(kvFile(bucket), 'utf8'));
  } catch {
    return {};
  }
}

async function saveJson(bucket, entries) {
  entries = entries || {};

  if (pool) {
    await ensureKvTable();
    const values = Object.entries(entries);

    const conn = await pool.connect();

    try {
      await conn.query('BEGIN');
      await conn.query('DELETE FROM kv WHERE bucket = $1', [bucket]);

      for (const [key, value] of values) {
        await conn.query(
          'INSERT INTO kv (bucket, key, value) VALUES ($1, $2, $3)',
          [bucket, key, JSON.stringify(value)]
        );
      }

      await conn.query('COMMIT');
    } catch (error) {
      await conn.query('ROLLBACK');
      throw error;
    } finally {
      conn.release();
    }

    return;
  }

  fs.writeFileSync(kvFile(bucket), JSON.stringify(entries));
}

module.exports = { load, save, loadJson, saveJson };
