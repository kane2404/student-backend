'use strict';

const { ConflictError } = require('../../src/errors');
const { EMPTY_STATS } = require('../../src/students-repo');

/**
 * Implémentation en mémoire du même contrat que students-repo.js.
 * Sert aux tests de l'API (sans PostgreSQL) et à la maquette de l'interface.
 */
function createMemoryRepo(initial = []) {
  let nextId = 1;
  let nextNumber = 1;
  const rows = [];

  const insert = (s) => {
    const now = new Date().toISOString();
    const row = {
      id: nextId++,
      numero: `ETU-${new Date().getFullYear()}-${String(nextNumber++).padStart(5, '0')}`,
      ...s,
      created_at: now,
      updated_at: now,
    };
    rows.push(row);
    return row;
  };
  const emailTaken = (email, exceptId) =>
    rows.some((r) => r.email.toLowerCase() === email.toLowerCase() && r.id !== exceptId);
  const dupError = () => new ConflictError('email', 'Cette adresse e-mail est déjà utilisée par un autre étudiant.');

  initial.forEach(insert);

  return {
    async list({ search, filiere, statut, limit, offset }) {
      const q = (search || '').toLowerCase();
      const filtered = rows
        .filter((r) => {
          if (filiere && r.filiere !== filiere) return false;
          if (statut && r.statut !== statut) return false;
          if (!q) return true;
          return [r.nom, r.prenom, r.email, r.numero, `${r.prenom} ${r.nom}`, `${r.nom} ${r.prenom}`].some((v) =>
            v.toLowerCase().includes(q),
          );
        })
        .sort(
          (a, b) =>
            a.nom.toLowerCase().localeCompare(b.nom.toLowerCase(), 'fr') ||
            a.prenom.toLowerCase().localeCompare(b.prenom.toLowerCase(), 'fr') ||
            a.id - b.id,
        );
      return { rows: filtered.slice(offset, offset + limit), total: filtered.length };
    },
    async get(id) {
      return rows.find((r) => r.id === id) || null;
    },
    async create(s) {
      if (emailTaken(s.email)) throw dupError();
      return insert(s);
    },
    async update(id, s) {
      const row = rows.find((r) => r.id === id);
      if (!row) return null;
      if (emailTaken(s.email, id)) throw dupError();
      Object.assign(row, s, { updated_at: new Date().toISOString() });
      return row;
    },
    async remove(id) {
      const i = rows.findIndex((r) => r.id === id);
      if (i === -1) return false;
      rows.splice(i, 1);
      return true;
    },
    async stats() {
      const parStatut = EMPTY_STATS();
      const parFiliere = new Map();
      for (const r of rows) {
        parStatut[r.statut] += 1;
        parFiliere.set(r.filiere, (parFiliere.get(r.filiere) || 0) + 1);
      }
      return {
        total: rows.length,
        par_statut: parStatut,
        par_filiere: [...parFiliere].sort(([a], [b]) => a.localeCompare(b, 'fr')).map(([filiere, total]) => ({ filiere, total })),
      };
    },
    async ping() {},
  };
}

module.exports = { createMemoryRepo };
