FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache openssl libc6-compat postgresql-client
COPY package*.json ./
RUN npm install
COPY . .
RUN npx prisma@5.19.0 generate
EXPOSE 5050
CMD ["sh", "-c", "npx prisma db push --skip-generate && npm start"]
