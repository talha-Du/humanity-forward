# Multi-stage Build für Community Resource Mapper

# ─── Stage 1: Backend ───
FROM node:20-alpine AS backend

WORKDIR /app

# Kopiere Backend-Dateien
COPY src/community-mapper/package*.json ./
RUN npm ci --only=production

COPY src/community-mapper/server.js ./
COPY src/community-mapper/database.js ./
COPY src/community-mapper/.env.example ./.env

EXPOSE 3000

CMD ["node", "server.js"]

# ─── Stage 2: Frontend (statische Dateien) ───
FROM nginx:alpine AS frontend

WORKDIR /usr/share/nginx/html

# Kopiere Frontend-Dateien
COPY src/community-mapper/index.html ./
COPY src/community-mapper/style.css ./
COPY src/community-mapper/app.js ./
COPY src/community-mapper/api-client.js ./
COPY src/community-mapper/manifest.json ./
COPY src/community-mapper/sw-register.js ./
COPY src/community-mapper/service-worker.js ./
COPY src/community-mapper/icons/ ./icons/

# Kopiere nginx config
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

# ─── Stage 3: Fullstack (Backend + Frontend) ───
FROM node:20-alpine AS fullstack

WORKDIR /app

# Installiere nginx für Frontend
RUN apk add --no-cache nginx

# Backend
COPY src/community-mapper/package*.json ./
RUN npm ci --only=production

COPY src/community-mapper/server.js ./
COPY src/community-mapper/database.js ./
COPY src/community-mapper/.env.example ./.env

# Frontend
RUN mkdir -p /usr/share/nginx/html
COPY src/community-mapper/index.html /usr/share/nginx/html/
COPY src/community-mapper/style.css /usr/share/nginx/html/
COPY src/community-mapper/app.js /usr/share/nginx/html/
COPY src/community-mapper/api-client.js /usr/share/nginx/html/
COPY src/community-mapper/manifest.json /usr/share/nginx/html/
COPY src/community-mapper/sw-register.js /usr/share/nginx/html/
COPY src/community-mapper/service-worker.js /usr/share/nginx/html/
COPY src/community-mapper/icons/ /usr/share/nginx/html/icons/

# Nginx Config
COPY docker/nginx-fullstack.conf /etc/nginx/http.d/default.conf

# Start Script
COPY docker/start.sh ./start.sh
RUN chmod +x ./start.sh

EXPOSE 80 3000

CMD ["./start.sh"]
