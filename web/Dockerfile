FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build 2>&1 || true
ENV PORT=3001
EXPOSE 3001
CMD ["npm", "run", "dev"]

