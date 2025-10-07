FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY packages/document-service/package*.json ./
COPY packages/shared/package*.json ../shared/

# Install dependencies
RUN npm ci --only=production

# Copy shared package
COPY packages/shared ../shared
RUN cd ../shared && npm run build

# Copy source code
COPY packages/document-service/src ./src
COPY packages/document-service/tsconfig.json ./

# Build the application
RUN npm run build

# Create uploads directory for local storage
RUN mkdir -p uploads

# Expose port
EXPOSE 3003

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3003/documents/health || exit 1

# Start the application
CMD ["npm", "start"]