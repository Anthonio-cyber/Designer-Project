# syntax=docker/dockerfile:1

# ----------------------------------------------------------------- build ----
FROM node:22-bookworm-slim AS build
WORKDIR /app

# better-sqlite3 compiles a native addon, so the toolchain is needed at build
# time only — it is left behind in the runtime stage.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

# Manifests first: this layer is cached until a dependency actually changes.
COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/
RUN npm ci

COPY . .
RUN npm run build

# Drop dev dependencies from the tree that ships.
RUN npm prune --omit=dev

# --------------------------------------------------------------- runtime ----
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=4000 \
    DATA_DIR=/data/db \
    UPLOAD_DIR=/data/uploads

# Run unprivileged. The node image already ships a `node` user.
RUN mkdir -p /data/db /data/uploads && chown -R node:node /data

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/server/package.json ./server/package.json
COPY --from=build --chown=node:node /app/server/dist ./server/dist
COPY --from=build --chown=node:node /app/client/dist ./client/dist

USER node
EXPOSE 4000

# The database and uploads must outlive the container.
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/dist/index.js"]
