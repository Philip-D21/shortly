# Build Stage: Node 20 LTS
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json tsconfig.json ./

RUN npm ci

COPY . .

RUN npm run build

# Production Stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./

RUN npm ci --only=production

COPY --from=builder /app/build ./build
COPY --from=builder /app/src/views ./build/views
COPY --from=builder /app/src/public ./build/public

EXPOSE 4400

CMD ["npm", "start"]