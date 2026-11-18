FROM node:20-slim AS deps

# better-sqlite3 usually installs a prebuilt binary for linux-x64, but keep
# a compiler toolchain here in case the prebuild is unavailable.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
COPY wots-vendor ./wots-vendor
# Full install (incl. devDeps) so the next stage can run `vite build`.
RUN npm install --no-audit --no-fund --install-links


FROM node:20-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/wots-vendor ./wots-vendor
COPY package.json package-lock.json tsconfig.json vite.config.ts index.html ./
COPY src ./src
RUN npm run build


FROM node:20-slim AS runtime
WORKDIR /app

COPY package.json package-lock.json ./
COPY wots-vendor ./wots-vendor
# Runtime only needs production deps; a fresh install here drops devDeps
# (vite, tailwind, typescript, react types, etc.) from the runtime image.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/* \
 && npm install --omit=dev --no-audit --no-fund --install-links \
 && apt-get purge -y python3 make g++ && apt-get autoremove -y

COPY db.js server.js ./
COPY public ./public
COPY views ./views
COPY --from=build /app/dist ./dist

ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/data/wots.db
EXPOSE 3000
CMD ["node", "server.js"]
