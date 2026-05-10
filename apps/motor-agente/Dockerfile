# syntax=docker/dockerfile:1.7

# --- base: pnpm + Node 22 alpine ---
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /app

# --- builder: copia todo el monorepo, instala y compila motor + deps ---
FROM base AS builder
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY apps/motor-agente ./apps/motor-agente
COPY packages ./packages
RUN pnpm install --frozen-lockfile --filter @fyzon/motor-agente...
# Build TODAS las dependencias internas del motor (prompt-composer, agent-pipeline,
# channel-adapters, ghl-client, db, shared-validator) en orden topológico.
# Sin esto, tsc del motor no encuentra los .d.ts de @fyzon/prompt-composer etc.
RUN pnpm -r --filter "@fyzon/motor-agente..." build

# --- runner: solo runtime mínimo ---
FROM base AS runner
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app

COPY --from=builder /app/pnpm-workspace.yaml /app/pnpm-lock.yaml /app/package.json /app/tsconfig.base.json ./
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/motor-agente/src ./apps/motor-agente/src
COPY --from=builder /app/apps/motor-agente/tsconfig.json ./apps/motor-agente/
COPY --from=builder /app/apps/motor-agente/package.json ./apps/motor-agente/

# Install production deps (incluye tsx — está en dependencies del motor).
# Los packages internos quedan como symlinks workspace.
RUN pnpm install --frozen-lockfile --filter @fyzon/motor-agente... --prod

RUN chown -R app:app /app
USER app
WORKDIR /app/apps/motor-agente
EXPOSE 3001
# tsx ejecuta TypeScript en runtime. Decisión consciente vs node dist/ porque
# los packages internos del workspace exponen src/index.ts (no dist/) — sin
# tsx habría que añadir build step + tsconfig.build.json a cada package.
CMD ["./node_modules/.bin/tsx", "src/index.ts"]
