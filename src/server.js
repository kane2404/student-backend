'use strict';

const { Pool, types } = require('pg');
const { loadConfig } = require('./config');
const { createLogger } = require('./logger');
const { createServer } = require('./app');
const { createStudentsRepo } = require('./students-repo');
const { waitForDatabase, migrate, sleep } = require('./db');
const { seedDemoData } = require('./seed');

// DATE (OID 1082) reste une chaîne 'YYYY-MM-DD' : évite les décalages de fuseau horaire.
types.setTypeParser(1082, (value) => value);

async function main() {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);

  const pool = new Pool(config.db);
  pool.on('error', (err) => logger.error('pg_pool_error', { reason: err.message }));

  const state = { ready: false, shuttingDown: false };
  const server = createServer({ repo: createStudentsRepo(pool), logger, state });

  // Le serveur écoute tout de suite (liveness OK) ; /readyz reste en 503 tant que la base n'est pas prête.
  server.listen(config.port, '0.0.0.0', () => logger.info('server_listening', { port: config.port }));

  (async () => {
    await waitForDatabase(pool, { retries: config.dbStartupRetries, delayMs: config.dbStartupDelayMs }, logger);
    await migrate(pool, config.migrationsDir, logger);
    if (config.seedDemoData) await seedDemoData(pool, logger);
    state.ready = true;
    logger.info('backend_ready');
  })().catch((err) => {
    logger.error('startup_failed', { reason: err.message });
    process.exit(1); // Kubernetes relancera le conteneur
  });

  let stopping = false;
  const shutdown = async (signal) => {
    if (stopping) return;
    stopping = true;
    logger.info('shutdown_started', { signal });
    state.shuttingDown = true; // /readyz passe en 503 : le pod sort des endpoints
    await sleep(config.shutdownDelayMs);
    server.close(async () => {
      await pool.end().catch(() => {});
      process.exit(0);
    });
    server.closeIdleConnections();
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main();
