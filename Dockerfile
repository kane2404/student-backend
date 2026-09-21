# syntax=docker/dockerfile:1

# L'image de base est paramétrable (ex. miroir de registre interne) :
#   docker build --build-arg NODE_IMAGE=registry.interne/library/node:22-alpine .
ARG NODE_IMAGE=node:22-alpine

# ---- 1. Dépendances de production ------------------------------------------------------
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
# `npm ci` si un package-lock.json est commité (recommandé), sinon `npm install`.
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi \
 && npm cache clean --force

# ---- 2. Image finale ---------------------------------------------------------------------
FROM ${NODE_IMAGE}
ENV NODE_ENV=production
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY db ./db

RUN chgrp -R 0 /app && chmod -R g=u /app

# UID numérique : permet à Kubernetes de vérifier runAsNonRoot.
USER 10001
EXPOSE 3000

CMD ["node", "src/server.js"]
