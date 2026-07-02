FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
# Toolchain + bundled Node headers let bcrypt fall back to a fully offline
# source build when its prebuilt binary can't be downloaded from GitHub
RUN apk add --no-cache --virtual .build-deps python3 make g++ \
    && npm_config_nodedir=/usr/local npm install \
    && apk del .build-deps
COPY . .
EXPOSE 5000
CMD ["npm", "run", "dev"]
