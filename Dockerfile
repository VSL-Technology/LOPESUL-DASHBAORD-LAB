FROM node:20-alpine

WORKDIR /app

# Required for container-level health validation in deploy workflow.
RUN apk add --no-cache curl

COPY package*.json ./
RUN npm ci

COPY . .

RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
