# check=skip=SecretsUsedInArgOrEnv
# Ambiently in one container: the built app plus the calendar, RSS and photo-album services,
# served by server/index.ts. The base image is published for x86-64 and 64-bit ARM (for example a
# Raspberry Pi 4 or 5 running a 64-bit OS).
#
#   docker build -t ambiently .
#   docker run -d -p 8080:8080 --restart unless-stopped ambiently
#
# For cloud sync between screens and phones, pass your own Supabase project at build time:
#   docker build --build-arg VITE_SUPABASE_URL=https://xyz.supabase.co \
#                --build-arg VITE_SUPABASE_ANON_KEY=your-publishable-key -t ambiently .

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# The Supabase publishable (anon) key is public by design: it ships inside the app's JavaScript and
# row-level security protects the data. Never pass the service_role key here.
ARG VITE_SUPABASE_URL=""
ARG VITE_SUPABASE_ANON_KEY=""
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
# The icons in public/ are already built, so the icon step of `npm run build` is skipped
RUN npx tsc -b && npx vite build && npm run build:server

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- "http://127.0.0.1:${PORT}/healthz" >/dev/null || exit 1
CMD ["node", "dist-server/index.mjs"]
