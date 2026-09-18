# Multi-stage: build Vite dashboard, compile Express, run one Node process.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
COPY server/package.json ./server/
COPY dashboard/package.json ./dashboard/
RUN npm install

FROM deps AS build
COPY server ./server
COPY dashboard ./dashboard
RUN npm run build -w dashboard && npm run build -w server

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV DATA_DIR=/app/data
ENV STATIC_DIR=/app/dashboard/dist
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
COPY server/package.json ./server/
COPY dashboard/package.json ./dashboard/
RUN npm install --omit=dev
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/dashboard/dist ./dashboard/dist
RUN mkdir -p /app/data
EXPOSE 8080
CMD ["node", "server/dist/index.js"]
