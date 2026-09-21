'use strict';

const http = require('node:http');
const { HttpError, ConflictError } = require('./errors');
const { validateStudent, parseListQuery, parseId } = require('./validation');

const MAX_BODY_BYTES = 100 * 1024;

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const type = String(req.headers['content-type'] || '');
    if (!type.toLowerCase().startsWith('application/json')) {
      reject(new HttpError(415, 'unsupported_media_type', 'Le corps de la requête doit être au format application/json.'));
      req.resume();
      return;
    }
    const chunks = [];
    let size = 0;
    let tooLarge = false;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        tooLarge = true;
        return; // on continue à consommer le flux sans le stocker
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (tooLarge) {
        reject(new HttpError(413, 'payload_too_large', 'Le corps de la requête est trop volumineux.'));
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null'));
      } catch {
        reject(new HttpError(400, 'invalid_json', 'Le corps de la requête n\'est pas un JSON valide.'));
      }
    });
    req.on('error', reject);
  });
}

function send(res, status, body, extraHeaders = {}) {
  const headers = {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders,
  };
  if (body === undefined) {
    res.writeHead(status, headers);
    res.end();
    return;
  }
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    ...headers,
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

/**
 * Construit le serveur HTTP.
 *  - repo   : couche de données (voir students-repo.js)
 *  - state  : { ready, shuttingDown } partagé avec server.js pour la sonde de readiness
 */
function createServer({ repo, logger, state = { ready: true, shuttingDown: false } }) {
  const routes = [];

  const add = (method, pattern, handler) => {
    const keys = [];
    const source = pattern.replace(/:([a-z]+)/g, (_, key) => {
      keys.push(key);
      return '([^/]+)';
    });
    routes.push({ method, keys, regex: new RegExp(`^${source}/?$`), handler });
  };

  // --- Sondes Kubernetes -------------------------------------------------------------
  add('GET', '/healthz', async () => ({ status: 200, body: { status: 'ok' } }));

  add('GET', '/readyz', async () => {
    if (state.shuttingDown || !state.ready) {
      return { status: 503, body: { status: 'unavailable' } };
    }
    try {
      await repo.ping();
      return { status: 200, body: { status: 'ready' } };
    } catch {
      return { status: 503, body: { status: 'database_unavailable' } };
    }
  });

  // --- API étudiants -----------------------------------------------------------------
  add('GET', '/api/stats', async () => ({ status: 200, body: await repo.stats() }));

  add('GET', '/api/students', async ({ url }) => {
    const query = parseListQuery(url.searchParams);
    if (!query.ok) {
      throw new HttpError(400, 'invalid_query', 'Les paramètres de recherche sont invalides.', query.errors);
    }
    const { rows, total } = await repo.list(query.value);
    const { page, limit } = query.value;
    return {
      status: 200,
      body: { data: rows, meta: { total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) } },
    };
  });

  add('POST', '/api/students', async ({ req }) => {
    const result = validateStudent(await readJsonBody(req));
    if (!result.ok) {
      throw new HttpError(422, 'validation_error', 'Certaines informations sont invalides.', result.errors);
    }
    const created = await repo.create(result.value);
    return { status: 201, body: created, headers: { Location: `/api/students/${created.id}` } };
  });

  add('GET', '/api/students/:id', async ({ params }) => {
    const student = await repo.get(requireId(params.id));
    if (!student) throw notFound();
    return { status: 200, body: student };
  });

  add('PUT', '/api/students/:id', async ({ req, params }) => {
    const id = requireId(params.id);
    const result = validateStudent(await readJsonBody(req));
    if (!result.ok) {
      throw new HttpError(422, 'validation_error', 'Certaines informations sont invalides.', result.errors);
    }
    const updated = await repo.update(id, result.value);
    if (!updated) throw notFound();
    return { status: 200, body: updated };
  });

  add('DELETE', '/api/students/:id', async ({ params }) => {
    const removed = await repo.remove(requireId(params.id));
    if (!removed) throw notFound();
    return { status: 204 };
  });

  // --- Dispatch ----------------------------------------------------------------------
  const handle = async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const pathMatches = routes.filter((r) => r.regex.test(url.pathname));

    if (pathMatches.length === 0) throw notFound();
    const route = pathMatches.find((r) => r.method === req.method);
    if (!route) {
      const allow = [...new Set(pathMatches.map((r) => r.method))].join(', ');
      throw Object.assign(new HttpError(405, 'method_not_allowed', 'Méthode non autorisée.'), { allow });
    }

    const match = route.regex.exec(url.pathname);
    const params = Object.fromEntries(route.keys.map((key, i) => [key, decodeURIComponent(match[i + 1])]));
    const { status, body, headers } = await route.handler({ req, url, params });
    send(res, status, body, headers);
  };

  const server = http.createServer(async (req, res) => {
    const startedAt = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - startedAt) / 1e6;
      const path = req.url.split('?')[0];
      if (path === '/healthz' || path === '/readyz') return; // pas de bruit dans les logs
      logger.info('request', { method: req.method, path, status: res.statusCode, ms: Math.round(ms * 10) / 10 });
    });

    try {
      await handle(req, res);
    } catch (err) {
      if (res.headersSent) {
        res.end();
        return;
      }
      if (err instanceof HttpError) {
        const headers = err.allow ? { Allow: err.allow } : {};
        send(res, err.status, { error: { code: err.code, message: err.message, details: err.details } }, headers);
      } else if (err instanceof ConflictError) {
        send(res, 409, {
          error: { code: 'conflict', message: err.message, details: { [err.field]: err.message } },
        });
      } else {
        logger.error('unhandled_error', { path: req.url, reason: err.message, stack: err.stack });
        send(res, 500, { error: { code: 'internal_error', message: 'Une erreur interne est survenue.' } });
      }
    }
  });

  server.keepAliveTimeout = 65000; // > timeout keep-alive de nginx / des ingress
  return server;
}

function requireId(raw) {
  const id = parseId(raw);
  if (id === null) throw new HttpError(400, 'invalid_id', "L'identifiant doit être un entier positif.");
  return id;
}

function notFound() {
  return new HttpError(404, 'not_found', 'Ressource introuvable.');
}

module.exports = { createServer };
