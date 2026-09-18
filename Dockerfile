# Reconstructed from the build history of docker.io/mantas90xxx/sport-api:v1.
# Base moved from node:20-alpine (end-of-life April 2026) to node:22-alpine.
FROM node:22-alpine

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server.js ./
COPY public ./public

ENV PORT=3000
EXPOSE 3000
USER node
CMD ["node", "server.js"]
