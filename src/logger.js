'use strict';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

/** Logger JSON minimal : une ligne par événement, facile à collecter (Loki, EFK...). */
function createLogger(level = 'info', out = process.stdout) {
  const min = LEVELS[level] ?? LEVELS.info;
  const write = (lvl, msg, extra) => {
    if (LEVELS[lvl] < min) return;
    out.write(`${JSON.stringify({ time: new Date().toISOString(), level: lvl, msg, ...extra })}\n`);
  };
  return {
    debug: (msg, extra) => write('debug', msg, extra),
    info: (msg, extra) => write('info', msg, extra),
    warn: (msg, extra) => write('warn', msg, extra),
    error: (msg, extra) => write('error', msg, extra),
  };
}

module.exports = { createLogger };
