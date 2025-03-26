FROM node:20.9-bookworm-slim

ARG NODE_ENV=development
ENV NODE_ENV=${NODE_ENV}

WORKDIR ./cens

COPY package*.json .

RUN npm install -g nodemon
RUN npm install

COPY . .

COPY ./.env-example ./.env

CMD [ "npm", "start" ]
