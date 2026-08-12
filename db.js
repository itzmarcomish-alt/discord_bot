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

module.exports = { load, save };
