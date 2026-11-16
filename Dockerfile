# Servidor de partidas (Socket.IO) do Pixel Party. O site (Next.js) fica na Vercel.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
# devDependencies incluídas de propósito: o servidor roda com tsx
RUN npm ci --include=dev
COPY tsconfig.json ./
COPY shared ./shared
COPY server ./server
ENV PORT=8080
EXPOSE 8080
CMD ["npx", "tsx", "server/index.ts"]
