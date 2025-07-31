FROM --platform=linux/amd64 node:20-bookworm-slim AS base

FROM base AS deps
WORKDIR /app

COPY package.json package-lock.json* ./
COPY prisma ./prisma/
RUN npm ci && npm install --no-save --platform=linux --arch=x64 lightningcss @tailwindcss/oxide-linux-x64-gnu

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma/
COPY . .

# Set required environment variables for build
ENV DATABASE_URL="postgresql://postgres:password@localhost:5432/socium-code"
ENV MINIO_ENDPOINT="localhost"
ENV MINIO_PORT="9000"
ENV MINIO_USE_SSL="false"
ENV MINIO_ROOT_USER="minioadmin"
ENV MINIO_ROOT_PASSWORD="minioadmin"
ENV OPENAI_API_KEY="placeholder-key"
ENV TRIGGER_PROJECT_ID="placeholder-id"
ENV TRIGGER_SECRET_KEY="placeholder-key"
ENV TRIGGER_API_URL="https://api.trigger.dev"
ENV SKIP_ENV_VALIDATION="1"

RUN npm run build



FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV DATABASE_URL="postgresql://postgres:password@localhost:5432/socium-code"
ENV MINIO_ENDPOINT="localhost"
ENV MINIO_PORT="9000"
ENV MINIO_USE_SSL="false"
ENV MINIO_ROOT_USER="minioadmin"
ENV MINIO_ROOT_PASSWORD="minioadmin"
ENV OPENAI_API_KEY="placeholder-key"
ENV TRIGGER_PROJECT_ID="placeholder-id"
ENV TRIGGER_SECRET_KEY="placeholder-key"
ENV TRIGGER_API_URL="https://api.trigger.dev"

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

RUN mkdir .next
RUN chown nextjs:nodejs .next

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
