FROM node:20

WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json server/package-lock.json ./server/
COPY server/ ./server/

RUN npm install --prefix server --production --no-audit --no-fund

EXPOSE 4000

CMD ["npm", "start", "--prefix", "server"]
