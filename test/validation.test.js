'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateStudent, parseListQuery, parseId } = require('../src/validation');

const valid = {
  prenom: '  Camille ',
  nom: 'Martin',
  email: 'Camille.Martin@Univ-Exemple.fr',
  date_naissance: '2004-03-14',
  filiere: 'Informatique',
  niveau: 'L3',
};

test('validateStudent normalise les champs valides', () => {
  const r = validateStudent(valid, { now: new Date('2026-09-21T10:00:00Z') });
  assert.equal(r.ok, true);
  assert.equal(r.value.prenom, 'Camille');
  assert.equal(r.value.email, 'camille.martin@univ-exemple.fr');
  assert.equal(r.value.statut, 'inscrit'); // valeur par défaut
});

test('validateStudent signale tous les champs manquants', () => {
  const r = validateStudent({});
  assert.equal(r.ok, false);
  assert.deepEqual(Object.keys(r.errors).sort(), ['date_naissance', 'email', 'filiere', 'niveau', 'nom', 'prenom']);
});

test('validateStudent refuse les valeurs non textuelles et les corps invalides', () => {
  assert.equal(validateStudent(null).ok, false);
  assert.equal(validateStudent([]).ok, false);
  assert.ok(validateStudent({ ...valid, nom: 42 }).errors.nom);
});

test('validateStudent contrôle e-mail, niveau et statut', () => {
  assert.ok(validateStudent({ ...valid, email: 'pas-un-email' }).errors.email);
  assert.ok(validateStudent({ ...valid, niveau: 'L9' }).errors.niveau);
  assert.ok(validateStudent({ ...valid, statut: 'inconnu' }).errors.statut);
});

test('validateStudent contrôle la date de naissance', () => {
  const now = new Date('2026-09-21T10:00:00Z');
  assert.ok(validateStudent({ ...valid, date_naissance: '2004-02-30' }, { now }).errors.date_naissance);
  assert.ok(validateStudent({ ...valid, date_naissance: '14/03/2004' }, { now }).errors.date_naissance);
  assert.ok(validateStudent({ ...valid, date_naissance: '2027-01-01' }, { now }).errors.date_naissance);
  assert.ok(validateStudent({ ...valid, date_naissance: '1850-01-01' }, { now }).errors.date_naissance);
  assert.equal(validateStudent({ ...valid, date_naissance: '2004-02-29' }, { now }).ok, true);
});

test('validateStudent limite la longueur des textes', () => {
  assert.ok(validateStudent({ ...valid, prenom: 'a'.repeat(81) }).errors.prenom);
  assert.ok(validateStudent({ ...valid, filiere: 'a'.repeat(81) }).errors.filiere);
});

test('parseListQuery applique les valeurs par défaut et valide les bornes', () => {
  const ok = parseListQuery(new URLSearchParams(''));
  assert.deepEqual(ok.value, { page: 1, limit: 20, offset: 0, search: '', filiere: '', statut: '' });

  const page3 = parseListQuery(new URLSearchParams('page=3&limit=10&search=  ines '));
  assert.equal(page3.value.offset, 20);
  assert.equal(page3.value.search, 'ines');

  assert.ok(parseListQuery(new URLSearchParams('page=0')).errors.page);
  assert.ok(parseListQuery(new URLSearchParams('limit=1000')).errors.limit);
  assert.ok(parseListQuery(new URLSearchParams('statut=zzz')).errors.statut);
});

test('parseId accepte uniquement des entiers positifs raisonnables', () => {
  assert.equal(parseId('12'), 12);
  for (const bad of ['0', '-1', 'abc', '1.5', '99999999999', '1;DROP TABLE students']) {
    assert.equal(parseId(bad), null, bad);
  }
});
