'use strict';

const { ConflictError } = require('./errors');

const COLUMNS =
  'id, numero, prenom, nom, email, date_naissance, filiere, niveau, statut, created_at, updated_at';

const EMPTY_STATS = () => ({ inscrit: 0, diplome: 0, suspendu: 0 });

/** Échappe les caractères spéciaux de LIKE pour que la recherche soit littérale. */
const escapeLike = (value) => value.replace(/[\\%_]/g, '\\$&');

function translateError(err) {
  if (err && err.code === '23505' && String(err.constraint || '').includes('email')) {
    return new ConflictError('email', 'Cette adresse e-mail est déjà utilisée par un autre étudiant.');
  }
  return err;
}

/**
 * Couche d'accès aux données (PostgreSQL). Toutes les requêtes sont paramétrées.
 * L'interface (list/get/create/update/remove/stats/ping) est aussi implémentée
 * en mémoire dans test/helpers/memory-repo.js pour les tests de l'API.
 */
function createStudentsRepo(pool) {
  const FILTER = `
    WHERE ($1::text IS NULL
           OR nom ILIKE $1 OR prenom ILIKE $1 OR email ILIKE $1 OR numero ILIKE $1
           OR (prenom || ' ' || nom) ILIKE $1 OR (nom || ' ' || prenom) ILIKE $1)
      AND ($2::text IS NULL OR filiere = $2)
      AND ($3::text IS NULL OR statut = $3)`;

  return {
    async list({ search, filiere, statut, limit, offset }) {
      const filters = [search ? `%${escapeLike(search)}%` : null, filiere || null, statut || null];
      const [count, page] = await Promise.all([
        pool.query(`SELECT count(*)::int AS total FROM students ${FILTER}`, filters),
        pool.query(
          `SELECT ${COLUMNS} FROM students ${FILTER}
           ORDER BY lower(nom), lower(prenom), id
           LIMIT $4 OFFSET $5`,
          [...filters, limit, offset],
        ),
      ]);
      return { rows: page.rows, total: count.rows[0].total };
    },

    async get(id) {
      const { rows } = await pool.query(`SELECT ${COLUMNS} FROM students WHERE id = $1`, [id]);
      return rows[0] || null;
    },

    async create(s) {
      try {
        const { rows } = await pool.query(
          `INSERT INTO students (prenom, nom, email, date_naissance, filiere, niveau, statut)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING ${COLUMNS}`,
          [s.prenom, s.nom, s.email, s.date_naissance, s.filiere, s.niveau, s.statut],
        );
        return rows[0];
      } catch (err) {
        throw translateError(err);
      }
    },

    async update(id, s) {
      try {
        const { rows } = await pool.query(
          `UPDATE students
              SET prenom = $2, nom = $3, email = $4, date_naissance = $5,
                  filiere = $6, niveau = $7, statut = $8, updated_at = now()
            WHERE id = $1
        RETURNING ${COLUMNS}`,
          [id, s.prenom, s.nom, s.email, s.date_naissance, s.filiere, s.niveau, s.statut],
        );
        return rows[0] || null;
      } catch (err) {
        throw translateError(err);
      }
    },

    async remove(id) {
      const { rowCount } = await pool.query('DELETE FROM students WHERE id = $1', [id]);
      return rowCount > 0;
    },

    async stats() {
      const [byStatut, byFiliere] = await Promise.all([
        pool.query('SELECT statut, count(*)::int AS n FROM students GROUP BY statut'),
        pool.query('SELECT filiere, count(*)::int AS n FROM students GROUP BY filiere ORDER BY filiere'),
      ]);
      const parStatut = EMPTY_STATS();
      for (const row of byStatut.rows) parStatut[row.statut] = row.n;
      return {
        total: Object.values(parStatut).reduce((a, b) => a + b, 0),
        par_statut: parStatut,
        par_filiere: byFiliere.rows.map((r) => ({ filiere: r.filiere, total: r.n })),
      };
    },

    async ping() {
      await pool.query('SELECT 1');
    },
  };
}

module.exports = { createStudentsRepo, escapeLike, EMPTY_STATS };
