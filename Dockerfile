#
# Base & Dependencies
#
FROM node:24.22.1-bookworm-slim AS base

WORKDIR /usr/src/cens

COPY package*.json ./


#
# Development Environment
#
FROM base AS development

LABEL org.opencontainers.image.source=https://github.com/ServiceCanada/cens
LABEL org.opencontainers.image.description="DEVELOPMENT/QA build for CENS application"
LABEL org.opencontainers.image.licenses=MIT

# Default to local dev, but CID image can be built with: docker build --target development --build-arg INSTALL_COMMAND=ci .
ARG INSTALL_COMMAND=install

RUN if [ "$INSTALL_COMMAND" = "ci" ]; then \
        npm ci; \
    else \
        npm install; \
    fi

RUN npm install -g nodemon

COPY . ./
COPY ./.env-example ./.env

EXPOSE 8080

CMD [ "npm", "run", "start" ]


#
# Production Runtime
#
FROM base AS production

LABEL org.opencontainers.image.source=https://github.com/ServiceCanada/cens
LABEL org.opencontainers.image.description="Production build for CENS application"
LABEL org.opencontainers.image.licenses=MIT

ENV NODE_ENV=production

RUN npm ci --only=production

COPY . ./

USER node

EXPOSE 8080

CMD [ "node", "server.js" ]

