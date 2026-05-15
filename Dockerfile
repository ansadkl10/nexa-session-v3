FROM node:18-alpine

RUN apk add --no-cache git python3 make g++

WORKDIR /app

COPY package*.json ./

RUN npm install --legacy-peer-deps

COPY . .

RUN npm run build

EXPOSE 3000

CMD ["node", "server.js"]
