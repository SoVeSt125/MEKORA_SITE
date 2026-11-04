FROM node:24-alpine AS build
WORKDIR /app
COPY frontend/package*.json ./
RUN --mount=type=secret,id=build_ca \
    if [ -f /run/secrets/build_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/build_ca; fi; npm ci
COPY frontend/ ./
RUN npm run build
FROM nginxinc/nginx-unprivileged:1.28-alpine
COPY --chown=101:101 --chmod=644 frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --chown=101:101 --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
