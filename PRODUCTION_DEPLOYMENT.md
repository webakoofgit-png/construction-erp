# Kravient Build production checklist

1. Use a managed PostgreSQL database and set `DATABASE_URL` to its private connection string.
2. Generate a long random `JWT_SECRET`; never use the sample value.
3. Set `NODE_ENV=production`, `WEB_ORIGIN` to the deployed web address, and configure `RESEND_API_KEY` and `EMAIL_FROM` for live notifications.
4. Store uploaded documents in durable object storage before production use; local disk is only suitable for local development.
5. Build the web application with `VITE_API_URL` set to the deployed API address, then serve the generated `apps/web/dist` files through HTTPS.
6. Run the API behind HTTPS, restrict database access, and monitor `GET /api/health`.
7. Schedule daily database backups and test restoration before go-live.
8. Before launch, test Super Admin, Project Manager, Site Engineer, Accounts Manager, and Client workflows with non-demo data.
