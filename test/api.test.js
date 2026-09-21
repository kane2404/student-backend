'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('../src/app');
const { createLogger } = require('../src/logger');
const { createMemoryRepo } = require('./helpers/memory-repo');

const silent = createLogger('error', { write() {} });

const student = (over = {}) => ({
  prenom: 'Camille',
  nom: 'Martin',
  email: 'camille.martin@univ-exemple.fr',
  date_naissance: '2004-03-14',
  filiere: 'Informatique',
  niveau: 'L3',
  ...over,
});

async function withServer(fn, { repo = createMemoryRepo(), state } = {}) {
  const server = createServer({ repo, logger: silent, state });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, body, headers = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: body === undefined ? headers : { 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, headers: res.headers, json: text ? JSON.parse(text) : null };
  };
  try {
    await fn(call, repo);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

test('sondes : /healthz toujours 200, /readyz suit l\'état du serveur', async () => {
  const state = { ready: false, shuttingDown: false };
  await withServer(
    async (call) => {
      assert.equal((await call('GET', '/healthz')).status, 200);
      assert.equal((await call('GET', '/readyz')).status, 503); // base pas encore prête
      state.ready = true;
      assert.equal((await call('GET', '/readyz')).status, 200);
      state.shuttingDown = true;
      assert.equal((await call('GET', '/readyz')).status, 503); // arrêt en cours
    },
    { state },
  );
});

test('/readyz renvoie 503 quand la base ne répond plus', async () => {
  const repo = createMemoryRepo();
  repo.ping = async () => {
    throw new Error('connexion refusée');
  };
  await withServer(async (call) => assert.equal((await call('GET', '/readyz')).status, 503), { repo });
});

test('cycle de vie complet : créer, lire, modifier, supprimer', async () => {
  await withServer(async (call) => {
    const created = await call('POST', '/api/students', student());
    assert.equal(created.status, 201);
    assert.match(created.json.numero, /^ETU-\d{4}-\d{5}$/);
    assert.equal(created.json.statut, 'inscrit');
    assert.equal(created.headers.get('location'), `/api/students/${created.json.id}`);

    const id = created.json.id;
    assert.equal((await call('GET', `/api/students/${id}`)).json.nom, 'Martin');

    const updated = await call('PUT', `/api/students/${id}`, student({ niveau: 'M1', statut: 'diplome' }));
    assert.equal(updated.status, 200);
    assert.equal(updated.json.niveau, 'M1');
    assert.equal(updated.json.statut, 'diplome');

    assert.equal((await call('DELETE', `/api/students/${id}`)).status, 204);
    assert.equal((await call('GET', `/api/students/${id}`)).status, 404);
    assert.equal((await call('DELETE', `/api/students/${id}`)).status, 404);
  });
});

test('validation : 422 avec le détail par champ', async () => {
  await withServer(async (call) => {
    const res = await call('POST', '/api/students', student({ email: 'oups', niveau: 'X1', nom: '' }));
    assert.equal(res.status, 422);
    assert.equal(res.json.error.code, 'validation_error');
    assert.deepEqual(Object.keys(res.json.error.details).sort(), ['email', 'niveau', 'nom']);
  });
});

test('unicité : e-mail déjà utilisé (insensible à la casse) → 409', async () => {
  await withServer(async (call) => {
    await call('POST', '/api/students', student());
    const dup = await call('POST', '/api/students', student({ prenom: 'Autre', email: 'CAMILLE.MARTIN@univ-exemple.fr' }));
    assert.equal(dup.status, 409);
    assert.ok(dup.json.error.details.email);

    const other = await call('POST', '/api/students', student({ email: 'autre@univ-exemple.fr' }));
    const clash = await call('PUT', `/api/students/${other.json.id}`, student({ email: 'camille.martin@univ-exemple.fr' }));
    assert.equal(clash.status, 409);
  });
});

test('liste : recherche, filtres, tri par nom et pagination', async () => {
  const repo = createMemoryRepo([
    student({ nom: 'Zola', prenom: 'Emile', email: 'z@x.fr', statut: 'inscrit' }),
    student({ nom: 'Albert', prenom: 'Inès', email: 'a@x.fr', filiere: 'Droit', statut: 'suspendu' }),
    student({ nom: 'Martin', prenom: 'Léa', email: 'm@x.fr', statut: 'inscrit' }),
  ]);
  await withServer(
    async (call) => {
      const all = await call('GET', '/api/students');
      assert.deepEqual(all.json.data.map((s) => s.nom), ['Albert', 'Martin', 'Zola']);
      assert.deepEqual(all.json.meta, { total: 3, page: 1, limit: 20, pages: 1 });

      assert.equal((await call('GET', '/api/students?search=l%C3%A9a%20martin')).json.meta.total, 1);
      assert.equal((await call('GET', '/api/students?filiere=Droit')).json.data[0].nom, 'Albert');
      assert.equal((await call('GET', '/api/students?statut=inscrit')).json.meta.total, 2);

      const p2 = await call('GET', '/api/students?limit=2&page=2');
      assert.deepEqual(p2.json.data.map((s) => s.nom), ['Zola']);
      assert.equal(p2.json.meta.pages, 2);

      assert.equal((await call('GET', '/api/students?limit=0')).status, 400);
      assert.equal((await call('GET', '/api/students?statut=nimporte')).status, 400);
    },
    { repo },
  );
});

test('stats : totaux par statut et par filière', async () => {
  const repo = createMemoryRepo([
    student({ email: 'a@x.fr', statut: 'inscrit' }),
    student({ email: 'b@x.fr', statut: 'diplome', filiere: 'Droit' }),
    student({ email: 'c@x.fr', statut: 'inscrit' }),
  ]);
  await withServer(
    async (call) => {
      const { json } = await call('GET', '/api/stats');
      assert.equal(json.total, 3);
      assert.deepEqual(json.par_statut, { inscrit: 2, diplome: 1, suspendu: 0 });
      assert.deepEqual(json.par_filiere, [
        { filiere: 'Droit', total: 1 },
        { filiere: 'Informatique', total: 2 },
      ]);
    },
    { repo },
  );
});

test('requêtes invalides : id, JSON, content-type, taille, route, méthode', async () => {
  await withServer(async (call) => {
    assert.equal((await call('GET', '/api/students/abc')).status, 400);
    assert.equal((await call('GET', '/api/students/0')).status, 400);
    assert.equal((await call('POST', '/api/students', '{pas du json')).status, 400);
    assert.equal((await call('POST', '/api/students', '{}', { 'Content-Type': 'text/plain' })).status, 415);
    assert.equal((await call('POST', '/api/students', { prenom: 'x'.repeat(200 * 1024) })).status, 413);
    assert.equal((await call('GET', '/api/inconnu')).status, 404);

    const wrongMethod = await call('PATCH', '/api/students');
    assert.equal(wrongMethod.status, 405);
    assert.match(wrongMethod.headers.get('allow'), /GET/);
    assert.match(wrongMethod.headers.get('allow'), /POST/);
  });
});

test('les réponses ne sont pas mises en cache et sont en JSON', async () => {
  await withServer(async (call) => {
    const res = await call('GET', '/api/students');
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.match(res.headers.get('content-type'), /application\/json/);
  });
});

test('erreur inattendue : 500 sans fuite de détails internes', async () => {
  const repo = createMemoryRepo();
  repo.list = async () => {
    throw new Error('secret interne : mot de passe = hunter2');
  };
  await withServer(
    async (call) => {
      const res = await call('GET', '/api/students');
      assert.equal(res.status, 500);
      assert.equal(res.json.error.code, 'internal_error');
      assert.ok(!JSON.stringify(res.json).includes('hunter2'));
    },
    { repo },
  );
});
