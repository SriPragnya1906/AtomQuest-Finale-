FROM node:20-alpine AS builder

WORKDIR /app

# Install native dependencies required by Prisma
RUN apk add --no-cache openssl libc6-compat

# Copy package info
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci

# Copy Prisma schema and generate client
COPY prisma ./prisma
RUN npx prisma generate

# Copy source code
COPY . .

# Compile TypeScript to JavaScript
RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app

# Install native dependencies required by Prisma in the runner
RUN apk add --no-cache openssl libc6-compat

# Copy from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/dist ./dist

ENV NODE_ENV production

EXPOSE 3001

CMD ["npm", "start"]
