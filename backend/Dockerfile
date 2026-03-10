# Stage 1: Build
FROM node:24-slim AS build
WORKDIR /app
COPY backend/package.json backend/package-lock.json* ./backend/
RUN cd backend && npm ci
COPY backend/tsconfig.json ./backend/
COPY backend/src/ ./backend/src/
COPY shared/ ./shared/
RUN cd backend && npm run build

# Stage 2: Run
FROM node:24-slim
WORKDIR /app
COPY --from=build /app/backend/dist ./dist
COPY --from=build /app/backend/node_modules ./node_modules
COPY --from=build /app/shared ./shared
COPY backend/package.json ./

ENV NODE_ENV=production
EXPOSE 9850

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD curl -f http://localhost:9850/health || exit 1

CMD ["node", "dist/index.js"]
