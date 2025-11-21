# Use Node.js LTS
FROM node:20

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm install --production

# Copy source code
COPY . .

# Build application
RUN npm run build

# Expose port
EXPOSE 3001

# Start application
CMD ["npm", "run", "start:prod"]