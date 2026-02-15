# ---- Stage 1: Build ----
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package.json package-lock.json* ./
RUN npm ci

# Copy source and build
COPY . .

# API URL is injected at build time; defaults to /api/v1 so nginx can
# reverse-proxy to the backend on the same host.
ARG VITE_API_URL=/api/v1
ARG VITE_API_USERNAME
ARG VITE_API_PASSWORD
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_API_USERNAME=$VITE_API_USERNAME
ENV VITE_API_PASSWORD=$VITE_API_PASSWORD

RUN npm run build

# ---- Stage 2: Serve with nginx ----
FROM nginx:alpine

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
