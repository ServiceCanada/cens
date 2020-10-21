FROM node:12-slim

ARG NODE_ENV=development
ENV NODE_ENV=${NODE_ENV}

WORKDIR ./

COPY package*.json ./

RUN npm install -g nodemon
RUN npm install

COPY . .

WORKDIR ./x-notify/

COPY ./.env-example ./.env

CMD [ "npm", "start" ]
