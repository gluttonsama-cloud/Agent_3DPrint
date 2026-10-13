FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
RUN mkdir -p uploads logs && chown -R node:node /app
ENV NODE_ENV=production
ENV PORT=3001
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s CMD wget -q --spider http://localhost:3001/health || exit 1
CMD ["node", "src/app.js"]
