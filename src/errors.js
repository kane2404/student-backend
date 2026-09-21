'use strict';

/** Erreur destinée à être renvoyée telle quelle au client. */
class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** Violation d'unicité (ex. e-mail déjà utilisé), levée par la couche de données. */
class ConflictError extends Error {
  constructor(field, message) {
    super(message);
    this.name = 'ConflictError';
    this.field = field;
  }
}

module.exports = { HttpError, ConflictError };
