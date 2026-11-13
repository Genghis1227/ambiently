# syntax=docker/dockerfile:1

# ==============================================================================
# Stage 1: Build PWA Static Assets + Bundled API/Static Production Server
# Supports multi-arch builds natively: linux/amd64 & linux/arm64 (Raspberry Pi)
# ==============================================================================
FROM node:22-alpine AS builder

WORKDIR /app

# Optional build-time Supabase variables (can also be supplied at runtime via SUPABASE_URL / SUPABASE_ANON_KEY)
ARG VITE_SUPABASE_URL=""
ARG VITE_SUPABASE_ANON_KEY=""
ENV VITE_SUPABASE_URL=${VITE_SUPABASE_URL}
ENV VITE_SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY}

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build && npm run build:server

# ==============================================================================
# Stage 2: Minimal Zero-Dependency Runtime Image (~55 MB, Non-Root)
# ==============================================================================
FROM node:22-alpine AS runner

LABEL org.opencontainers.image.title="Ambiently Smart Display" \
      org.opencontainers.image.description="Self-hosted, offline-first ambient smart display, family calendar, chore engine & meal planner PWA" \
      org.opencontainers.image.source="https://github.com/Genghis1227/ambiently" \
      org.opencontainers.image.licenses="AGPL-3.0-only"

WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080

COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/dist-server ./dist-server

USER node

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 8080) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "dist-server/index.mjs"]
