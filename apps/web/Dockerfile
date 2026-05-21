FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build 2>&1 || true
EXPOSE 3000
CMD ["npm", "run", "dev"]