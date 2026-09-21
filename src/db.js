'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

// Identifiant arbitraire du verrou advisory : garantit qu'un seul réplica migre à la fois.
const MIGRATION_LOCK_ID = 727001;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Attend que PostgreSQL accepte les connexions (démarrage concurrent des pods). */
async function waitForDatabase(pool, { retries, delayMs }, logger) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (err) {
      if (attempt >= retries) throw err;
      logger.warn('db_unavailable', { attempt, retries, reason: err.message });
      await sleep(delayMs);
    }
  }
}

/** Applique, dans l'ordre alphabétique, les fichiers .sql pas encore enregistrés. */
async function migrate(pool, dir, logger) {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name       TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);
    const { rows } = await client.query('SELECT name FROM schema_migrations');
    const applied = new Set(rows.map((r) => r.name));

    const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = await fs.readFile(path.join(dir, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        logger.info('migration_applied', { file });
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} en échec : ${err.message}`);
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]).catch(() => {});
    client.release();
  }
}

module.exports = { waitForDatabase, migrate, sleep };
