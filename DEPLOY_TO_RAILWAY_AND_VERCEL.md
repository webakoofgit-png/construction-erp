# Share Kravient Build for senior testing

This guide creates a temporary online testing environment. Do not use the demo environment for real company data.

## 1. Create a private GitHub repository

1. Create a new private repository named `kravient-build` in GitHub.
2. Upload the contents of this project folder. Do not upload `.env`, `node_modules`, `dist`, or `apps/api/uploads`.
3. Keep the repository private and share access only with the required team members.

## 2. Deploy the API and database on Railway

1. Create a Railway account and select **New Project**.
2. Add a **PostgreSQL** database service.
3. Add a service from the GitHub repository.
4. In the service settings, set the configuration file to `apps/api/railway.toml` and keep the repository root as the project root.
5. Add these Railway variables:

```text
DATABASE_URL=${{Postgres.DATABASE_URL}}
NODE_ENV=production
JWT_SECRET=use-a-long-random-secret-of-at-least-32-characters
WEB_ORIGIN=https://replace-after-vercel-deployment.vercel.app
EMAIL_FROM=Kravient Build <notifications@your-company-domain.com>
RESEND_API_KEY=optional-for-demo
```

6. Deploy the service, then copy its public domain. It will look similar to `https://kravient-api-production.up.railway.app`.
7. Run migrations once from the Railway service shell: `npx prisma migrate deploy`.
8. Confirm `https://your-railway-domain/api/health` responds successfully.

## 3. Deploy the website on Vercel

1. Create a Vercel account and import the same private GitHub repository.
2. Set the **Root Directory** to `apps/web`.
3. Set the build command to `npm run build` and output directory to `dist`.
4. Add this environment variable before deploying:

```text
VITE_API_URL=https://your-railway-domain/api
```

5. Deploy and copy the generated Vercel URL.

## 4. Connect both services

1. Return to Railway and change `WEB_ORIGIN` to the exact Vercel URL, without a trailing slash.
2. Redeploy the Railway service.
3. Open the Vercel link in a private browser window and sign in with a demo account.

## 5. Share safely

Share only the Vercel website link and a limited test account with your senior. Do not share the database address, JWT secret, email keys, deployment dashboard access, or Super Admin password.

## Before real go live

- Move documents and photos to cloud object storage.
- Configure a verified company email sender.
- Enable managed database backups and monitoring.
- Change all demo passwords and remove unused demo users.
- Complete role-based acceptance testing with business users.
