-- Schéma initial : table des étudiants.
-- Les migrations sont appliquées au démarrage par src/db.js (verrou advisory, une seule fois).

CREATE SEQUENCE IF NOT EXISTS student_number_seq;

CREATE TABLE IF NOT EXISTS students (
  id             INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  numero         TEXT        NOT NULL UNIQUE
                 DEFAULT ('ETU-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('student_number_seq')::text, 5, '0')),
  prenom         TEXT        NOT NULL CHECK (char_length(prenom) BETWEEN 1 AND 80),
  nom            TEXT        NOT NULL CHECK (char_length(nom) BETWEEN 1 AND 80),
  email          TEXT        NOT NULL CHECK (char_length(email) <= 254),
  date_naissance DATE        NOT NULL,
  filiere        TEXT        NOT NULL CHECK (char_length(filiere) BETWEEN 1 AND 80),
  niveau         TEXT        NOT NULL CHECK (niveau IN ('L1', 'L2', 'L3', 'M1', 'M2')),
  statut         TEXT        NOT NULL DEFAULT 'inscrit' CHECK (statut IN ('inscrit', 'diplome', 'suspendu')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS students_email_lower_idx ON students (lower(email));
CREATE INDEX IF NOT EXISTS students_filiere_idx ON students (filiere);
CREATE INDEX IF NOT EXISTS students_statut_idx ON students (statut);
CREATE INDEX IF NOT EXISTS students_nom_idx ON students (lower(nom), lower(prenom));
