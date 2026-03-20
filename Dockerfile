FROM node:20-alpine

WORKDIR /app

# Required for container-level health validation and build scripts.
RUN apk add --no-cache curl bash

COPY package*.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci

COPY . .

RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
