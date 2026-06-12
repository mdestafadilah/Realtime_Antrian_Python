# ---- Build stage ----
FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---- Production stage (nginx) ----
FROM nginx:alpine

# Install shadow untuk chown/chmod (diperlukan di alpine minimal)
RUN apk add --no-cache shadow

# Copy nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy build artifacts — chown agar nginx user bisa akses
COPY --from=build --chown=nginx:nginx /app/dist/client /usr/share/nginx/html

# Pastikan semua parent path bisa di-traverse oleh nginx user
RUN chmod 755 /usr/share/nginx && \
    chmod 755 /usr/share/nginx/html && \
    find /usr/share/nginx/html -type d -exec chmod 755 {} \; && \
    find /usr/share/nginx/html -type f -exec chmod 644 {} \;

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]