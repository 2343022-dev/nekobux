FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update \
    && apt-get install -y --no-install-recommends fontconfig fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci --omit=dev
RUN mkdir -p /usr/local/share/fonts/truetype/nekobux && cp node_modules/@fontsource/fredoka/files/fredoka-latin-700-normal.woff /usr/local/share/fonts/truetype/nekobux/Fredoka-Bold.woff && fc-cache -f
COPY --from=build /app/dist ./dist
USER node
CMD ["npm", "start"]
