# Kravient Build

Step 1 foundation for a modular construction operating system. It includes a React dashboard shell, Express API, PostgreSQL/Prisma data model, and authentication/RBAC boundaries.

## Run locally

1. Copy `apps/api/.env.example` to `apps/api/.env` and set `DATABASE_URL` when PostgreSQL is available.
2. Run `npm install`.
3. Run `npm run db:generate`.
4. Run `npm run dev`.

The web app is served at `http://localhost:5173` and the API health endpoint is `http://localhost:4000/api/health`.

## Structure

- `apps/web` — React + TypeScript SaaS application shell and dashboard mock.
- `apps/api` — Express + TypeScript API with auth/RBAC middleware boundaries.
- `apps/api/prisma` — PostgreSQL schema and migrations location.

Business modules intentionally remain navigation placeholders only in this foundation.
