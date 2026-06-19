FROM node:22-alpine

WORKDIR /app

# Instala dependências de produção primeiro para aproveitar o cache de camadas
COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src

# Usuário não-root (a imagem alpine já provê 'node')
USER node

ENV NODE_ENV=production
EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/api/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "src/server.js"]
