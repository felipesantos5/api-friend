FROM node:20-alpine AS build-backend

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci

# Copy source code and build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy built files from build stage
COPY --from=build-backend /app/dist ./dist

# The backend expects the frontend to be in ../web/dist
# If you want to serve the frontend, you should deploy it separately
# or adjust the build context to include the frontend folder.

EXPOSE 3000

CMD ["node", "dist/index.js"]

