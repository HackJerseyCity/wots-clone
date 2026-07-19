FROM node:20-slim AS build

# better-sqlite3 usually installs a prebuilt binary for linux-x64, but keep
# a compiler toolchain here in case the prebuild is unavailable.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
COPY wots-vendor ./wots-vendor
RUN npm install --omit=dev --no-audit --no-fund --install-links


FROM node:20-slim
WORKDIR /app

COPY package.json ./
COPY wots-vendor ./wots-vendor
COPY --from=build /app/node_modules ./node_modules
COPY db.js server.js ./
COPY public ./public

ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/data/wots.db
EXPOSE 3000
CMD ["node", "server.js"]
