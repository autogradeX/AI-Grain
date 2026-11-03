# Builds the API and web app into one image. The API serves the web app.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci
COPY . .
# The local model's pretrained image model (checked against its checksum).
RUN npm run fetch-model -w @ai-grain/api
RUN npm run build && npm prune --omit=dev
# ONNX Runtime ships every platform and its GPU libraries: keep this
# machine's CPU build only (stations and Cloud Run run on the CPU).
RUN cd node_modules/onnxruntime-node/bin/napi-v6 \
  && rm -rf win32 darwin linux/*/libonnxruntime_providers_cuda.so linux/*/libonnxruntime_providers_tensorrt.so \
  && find linux -mindepth 1 -maxdepth 1 ! -name "$(node -p process.arch)" -exec rm -rf {} +

FROM node:22-bookworm-slim
# Fonts for the kernel numbers drawn on the sheets sent to Claude.
RUN apt-get update \
  && apt-get install -y --no-install-recommends fonts-dejavu-core \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data \
    WEB_DIST_DIR=/app/apps/web/dist
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/core/package.json ./packages/core/
COPY --from=build /app/packages/core/dist ./packages/core/dist
COPY --from=build /app/apps/api/package.json ./apps/api/
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/drizzle ./apps/api/drizzle
COPY --from=build /app/apps/api/models ./apps/api/models
COPY --from=build /app/apps/web/dist ./apps/web/dist
# Server rendering of the public pages (self-contained bundle).
COPY --from=build /app/apps/web/dist-ssr ./apps/web/dist-ssr
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/api/dist/src/server.js"]
