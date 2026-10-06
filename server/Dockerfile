FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
      libreoffice-writer libreoffice-calc fonts-liberation fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production HOME=/tmp
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
USER node
EXPOSE 4000
CMD ["node", "src/server.js"]
