// MySQL connection (mysql2). The rest of the backend only uses query() / run() / init().
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const cfg = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME || 'smart_traffic',
};
if (!/^[A-Za-z0-9_]+$/.test(cfg.database)) throw new Error('DB_NAME may only contain letters, digits and underscores');

const common = {
  // DATETIME columns come back as plain 'YYYY-MM-DD HH:MM:SS.mmm' strings (always UTC), never as local-time Dates.
  dateStrings: true,
  timezone: 'Z',
  decimalNumbers: true,
  charset: 'utf8mb4',
};

let pool;

/** Create the database and tables if they do not exist yet (runs schema.sql), then open the pool. */
async function init() {
  const boot = await mysql.createConnection({ host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password, ...common });
  await boot.query(`CREATE DATABASE IF NOT EXISTS \`${cfg.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await boot.end();

  pool = mysql.createPool({ ...cfg, ...common, connectionLimit: 10, waitForConnections: true });

  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8')
    .split('\n').filter((line) => !line.trim().startsWith('--')).join('\n');
  for (const stmt of sql.split(';').map((s) => s.trim()).filter(Boolean)) {
    if (/^(CREATE DATABASE|USE)\b/i.test(stmt)) continue; // handled above
    try {
      await pool.query(stmt);
    } catch (e) {
      if (e.code === 'ER_DUP_KEYNAME') continue; // index already exists: the schema was applied before
      throw e;
    }
  }
}

/** SELECT: resolves to an array of row objects. */
async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

/** INSERT / UPDATE / DELETE: resolves to { insertId, affectedRows }. */
async function run(sql, params = []) {
  const [res] = await pool.query(sql, params);
  return { insertId: res.insertId, affectedRows: res.affectedRows };
}

const close = () => pool?.end();
const config = () => ({ ...cfg, password: undefined });

module.exports = { init, query, run, close, config };
