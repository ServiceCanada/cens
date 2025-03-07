FROM node:20.9-bookworm-slim

ARG NODE_ENV=development
ENV NODE_ENV=${NODE_ENV}

WORKDIR ./cens

COPY package*.json .

RUN npm install -g nodemon
RUN npm install
RUN export NODE_OPTIONS=--max_old_space_size=4096 #4GB

COPY . .

COPY ./.env-example ./.env

CMD [ "npm", "start" ]
