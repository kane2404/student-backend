'use strict';

const NIVEAUX = ['L1', 'L2', 'L3', 'M1', 'M2'];
const STATUTS = ['inscrit', 'diplome', 'suspendu'];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const MAX_ID = 2147483647; // colonne INTEGER

function isRealDate(value) {
  if (!DATE_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/**
 * Valide et normalise le corps d'une requête POST/PUT.
 * Retourne { ok, value, errors } ; `errors` est un objet { champ: message }.
 */
function validateStudent(input, { now = new Date() } = {}) {
  const src = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const text = (key) => (typeof src[key] === 'string' ? src[key].trim() : '');
  const errors = {};

  const prenom = text('prenom');
  if (!prenom) errors.prenom = 'Le prénom est obligatoire.';
  else if (prenom.length > 80) errors.prenom = 'Le prénom ne peut pas dépasser 80 caractères.';

  const nom = text('nom');
  if (!nom) errors.nom = 'Le nom est obligatoire.';
  else if (nom.length > 80) errors.nom = 'Le nom ne peut pas dépasser 80 caractères.';

  const email = text('email').toLowerCase();
  if (!email) errors.email = "L'adresse e-mail est obligatoire.";
  else if (email.length > 254 || !EMAIL_RE.test(email)) {
    errors.email = "Cette adresse e-mail n'est pas valide.";
  }

  const dateNaissance = text('date_naissance');
  if (!dateNaissance) {
    errors.date_naissance = 'La date de naissance est obligatoire.';
  } else if (!isRealDate(dateNaissance)) {
    errors.date_naissance = 'La date doit être valide, au format AAAA-MM-JJ.';
  } else if (dateNaissance < '1900-01-01') {
    errors.date_naissance = 'La date de naissance doit être postérieure à 1900.';
  } else if (dateNaissance > now.toISOString().slice(0, 10)) {
    errors.date_naissance = 'La date de naissance ne peut pas être dans le futur.';
  }

  const filiere = text('filiere');
  if (!filiere) errors.filiere = 'La filière est obligatoire.';
  else if (filiere.length > 80) errors.filiere = 'La filière ne peut pas dépasser 80 caractères.';

  const niveau = text('niveau');
  if (!NIVEAUX.includes(niveau)) errors.niveau = `Le niveau doit être l'un de : ${NIVEAUX.join(', ')}.`;

  const statut = text('statut') || 'inscrit';
  if (!STATUTS.includes(statut)) errors.statut = `Le statut doit être l'un de : ${STATUTS.join(', ')}.`;

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    value: { prenom, nom, email, date_naissance: dateNaissance, filiere, niveau, statut },
  };
}

/** Lit et valide les paramètres de GET /api/students. */
function parseListQuery(searchParams) {
  const errors = {};

  const page = Number.parseInt(searchParams.get('page') ?? '1', 10);
  if (!Number.isInteger(page) || page < 1) errors.page = 'La page doit être un entier supérieur ou égal à 1.';

  const limit = Number.parseInt(searchParams.get('limit') ?? '20', 10);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    errors.limit = 'La taille de page doit être comprise entre 1 et 100.';
  }

  const statut = (searchParams.get('statut') ?? '').trim();
  if (statut && !STATUTS.includes(statut)) errors.statut = `Le statut doit être l'un de : ${STATUTS.join(', ')}.`;

  const search = (searchParams.get('search') ?? '').trim().slice(0, 100);
  const filiere = (searchParams.get('filiere') ?? '').trim().slice(0, 80);

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    value: { page, limit, offset: (page - 1) * limit, search, filiere, statut },
  };
}

/** Retourne un identifiant entier valide, ou null. */
function parseId(raw) {
  if (!/^\d+$/.test(raw)) return null;
  const id = Number.parseInt(raw, 10);
  return id >= 1 && id <= MAX_ID ? id : null;
}

module.exports = { NIVEAUX, STATUTS, validateStudent, parseListQuery, parseId };
