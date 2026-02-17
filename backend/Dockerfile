FROM node:20-alpine AS build-frontend

WORKDIR /app/web

COPY web/package*.json ./
RUN npm ci

COPY web/ ./
RUN npm run build

FROM node:20-alpine AS build-backend

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=build-backend /app/dist ./dist
COPY --from=build-frontend /app/web/dist ./web/dist

EXPOSE 3000

CMD ["node", "dist/index.js"]
