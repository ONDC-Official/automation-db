# Use the official Node.js image with a version that matches your local environment
FROM node:18-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json first (for better caching)
COPY package.json package-lock.json ./

# Install dependencies
RUN npm install

# Copy the entire project (excluding files in .dockerignore)
COPY . .

# Compile the TypeScript project (assumes build script is defined in package.json)
RUN npm run build

# Optionally specify the default command (if you want to run the app later)
CMD ["npm", "run", "start"]