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
RUN pnpm --filter @fyzon/motor-agente build

# --- runner: solo runtime mínimo ---
FROM base AS runner
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app

COPY --from=builder /app/pnpm-workspace.yaml /app/pnpm-lock.yaml /app/package.json ./
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/motor-agente/dist ./apps/motor-agente/dist
COPY --from=builder /app/apps/motor-agente/package.json ./apps/motor-agente/

# Install production deps only (sin devDependencies como tsx/tsc)
RUN pnpm install --frozen-lockfile --filter @fyzon/motor-agente... --prod

RUN chown -R app:app /app
USER app
WORKDIR /app/apps/motor-agente
EXPOSE 3001
CMD ["node", "dist/index.js"]
