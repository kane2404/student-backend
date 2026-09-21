'use strict';

const DEMO_STUDENTS = [
  ['Camille', 'Martin', 'camille.martin@univ-exemple.fr', '2004-03-14', 'Informatique', 'L3', 'inscrit'],
  ['Yanis', 'Benali', 'yanis.benali@univ-exemple.fr', '2003-11-02', 'Informatique', 'M1', 'inscrit'],
  ['Inès', 'Lefebvre', 'ines.lefebvre@univ-exemple.fr', '2005-07-21', 'Mathématiques', 'L2', 'inscrit'],
  ['Hugo', 'Moreau', 'hugo.moreau@univ-exemple.fr', '2002-01-30', 'Mathématiques', 'M2', 'diplome'],
  ['Aïcha', 'Diallo', 'aicha.diallo@univ-exemple.fr', '2004-09-09', 'Droit', 'L3', 'inscrit'],
  ['Lucas', 'Petit', 'lucas.petit@univ-exemple.fr', '2003-05-17', 'Droit', 'M1', 'suspendu'],
  ['Sarah', 'Cohen', 'sarah.cohen@univ-exemple.fr', '2005-12-04', 'Biologie', 'L1', 'inscrit'],
  ['Mamadou', 'Traoré', 'mamadou.traore@univ-exemple.fr', '2004-02-25', 'Biologie', 'L3', 'inscrit'],
  ['Léa', 'Roux', 'lea.roux@univ-exemple.fr', '2002-08-11', 'Économie', 'M2', 'diplome'],
  ['Noah', 'Garnier', 'noah.garnier@univ-exemple.fr', '2005-04-06', 'Économie', 'L1', 'inscrit'],
  ['Manon', 'Fontaine', 'manon.fontaine@univ-exemple.fr', '2004-10-19', 'Lettres modernes', 'L2', 'inscrit'],
  ['Théo', 'Nguyen', 'theo.nguyen@univ-exemple.fr', '2003-06-28', 'Physique', 'M1', 'inscrit'],
  ['Chloé', 'Bernard', 'chloe.bernard@univ-exemple.fr', '2005-01-15', 'Physique', 'L2', 'suspendu'],
  ['Adam', 'Kaya', 'adam.kaya@univ-exemple.fr', '2004-11-23', 'Informatique', 'L2', 'inscrit'],
];

/** Insère des étudiants fictifs uniquement si la table est vide (SEED_DEMO_DATA=true). */
async function seedDemoData(pool, logger) {
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM students');
  if (rows[0].n > 0) return 0;

  for (const s of DEMO_STUDENTS) {
    await pool.query(
      `INSERT INTO students (prenom, nom, email, date_naissance, filiere, niveau, statut)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT DO NOTHING`,
      s,
    );
  }
  logger.info('demo_data_seeded', { count: DEMO_STUDENTS.length });
  return DEMO_STUDENTS.length;
}

module.exports = { seedDemoData, DEMO_STUDENTS };
