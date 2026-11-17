FROM node:25.6.0-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg curl procps && rm -rf /var/lib/apt/lists/*
WORKDIR /home/node/app
RUN chown node:node /home/node/app
USER node
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY --chown=node:node . .
RUN npm run build
EXPOSE 3000
CMD ["node", "dist/main.js"]
