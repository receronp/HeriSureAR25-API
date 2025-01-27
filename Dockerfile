FROM node:18-alpine

WORKDIR /src

COPY package*.json ./

RUN npm install --production

COPY . .

EXPOSE 3001

CMD ["node", "index.js"]
