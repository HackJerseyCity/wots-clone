FROM node:20-slim

WORKDIR /app

# Submodule at wots-vendor/ pins the wots library version we build against.
COPY package.json package-lock.json ./
COPY wots-vendor ./wots-vendor
RUN npm install --omit=dev --no-audit --no-fund

COPY server.js ./
COPY public ./public

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["node", "server.js"]
