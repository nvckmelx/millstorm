FROM node:22-alpine
WORKDIR /app
COPY . .
RUN npm ci && npm run build && npm prune --omit=dev
ENV NODE_ENV=production PORT=2567
EXPOSE 2567
CMD ["node", "server/dist/index.js"]
