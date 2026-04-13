# Naseer Chicken Backend

Express and Prisma backend for the Naseer Chicken shop application.

## Requirements

- Node.js 20+
- PostgreSQL

## Setup

1. Copy `.env.example` to `.env`
2. Update `DATABASE_URL` and `JWT_SECRET`
3. Install dependencies with `npm install`
4. Generate Prisma client with `npm run build`
5. Start the server with `npm start`

## Available scripts

- `npm run build` - generate Prisma client
- `npm run dev` - run with nodemon
- `npm start` - start the API server
- `npm run prisma:migrate` - run Prisma migrations in development
- `npm run prisma:studio` - open Prisma Studio

## Health check

`GET /api/health`
