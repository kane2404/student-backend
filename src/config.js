'use strict';

const path = require('node:path');

const toBool = (value, fallback = false) => {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

const toInt = (value, fallback) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
};

/**
 * Toute la configuration vient de variables d'environnement
 * (ConfigMap + Secret côté Kubernetes, `environment:` côté docker-compose).
 */
function loadConfig(env = process.env) {
  return {
    port: toInt(env.PORT, 3000),
    logLevel: env.LOG_LEVEL || 'info',
    db: {
      host: env.DB_HOST || 'localhost',
      port: toInt(env.DB_PORT, 5432),
      database: env.DB_NAME || 'students',
      user: env.DB_USER || 'students',
      password: env.DB_PASSWORD || undefined,
      ssl: toBool(env.DB_SSL)
        ? { rejectUnauthorized: toBool(env.DB_SSL_REJECT_UNAUTHORIZED, true) }
        : false,
      max: toInt(env.DB_POOL_MAX, 10),
      connectionTimeoutMillis: toInt(env.DB_CONNECT_TIMEOUT_MS, 5000),
      idleTimeoutMillis: 30000,
    },
    // Attente de la base au démarrage (le pod Postgres peut démarrer plus lentement).
    dbStartupRetries: toInt(env.DB_STARTUP_RETRIES, 60),
    dbStartupDelayMs: toInt(env.DB_STARTUP_DELAY_MS, 2000),
    migrationsDir: env.MIGRATIONS_DIR || path.join(__dirname, '..', 'db', 'migrations'),
    seedDemoData: toBool(env.SEED_DEMO_DATA),
    // Laisse le temps aux endpoints Kubernetes de se mettre à jour avant de fermer le serveur.
    shutdownDelayMs: toInt(env.SHUTDOWN_DELAY_MS, 5000),
  };
}

module.exports = { loadConfig };
