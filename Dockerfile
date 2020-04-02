FROM node:12-slim

ARG NODE_ENV=development
ENV NODE_ENV=${NODE_ENV}

WORKDIR ./

COPY package*.json .

RUN npm install -g nodemon
RUN npm install

COPY . .

CMD [ "npm", "start" ]
