FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY packages/auth-service/package*.json ./
COPY packages/shared/package*.json ../shared/

# Install dependencies
RUN npm ci --only=production

# Copy shared package
COPY packages/shared ../shared
RUN cd ../shared && npm run build

# Copy source code
COPY packages/auth-service/src ./src
COPY packages/auth-service/tsconfig.json ./

# Build the application
RUN npm run build

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/auth/health || exit 1

# Start the application
CMD ["npm", "start"]