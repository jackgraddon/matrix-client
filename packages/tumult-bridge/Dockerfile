FROM node:22-slim

# Install build tools for mediasoup
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy root files for workspace resolution
COPY package.json yarn.lock ./
COPY packages/tumult-bridge/package.json ./packages/tumult-bridge/

# Enable Corepack and install dependencies
RUN corepack enable && yarn install

# Copy bridge source
COPY packages/tumult-bridge/ ./packages/tumult-bridge/

# Build bridge
RUN cd packages/tumult-bridge && yarn build

EXPOSE 3000
# Mediasoup RTP ports (need to match fly.toml)
EXPOSE 10000-10002/udp

WORKDIR /app/packages/tumult-bridge
CMD ["yarn", "start"]
