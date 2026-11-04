FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Must be a real public API URL for Cloud Run. Empty ARG would fall back to localhost in the bundle.
ARG NEXT_PUBLIC_API_URL=https://lead-voice-api-692907822510.europe-west1.run.app
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_TELEMETRY_DISABLED=1
RUN echo "Building with NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}" \
  && test -n "$NEXT_PUBLIC_API_URL" \
  && echo "NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}" > .env.production \
  && npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/next.config.ts ./next.config.ts
EXPOSE 8080
CMD ["sh", "-c", "npx next start -H 0.0.0.0 -p ${PORT:-8080}"]
