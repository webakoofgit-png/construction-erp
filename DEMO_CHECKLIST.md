# Kravient Build Manager Demo

## Before the demo

1. Open the refreshed local app at `http://localhost:4174`.
2. Sign in as the demo Super Admin: `sameer.joshi@kravient.demo` with password `DemoPass2026!`.
3. Keep the Site Supervisor account ready for the role-access demonstration: `ravi.mehta@kravient.demo` with password `DemoPass2026!`.
4. Use the seeded **Orchid Residency** project for the walkthrough.

## Suggested 7-minute walkthrough

1. **Dashboard** — show portfolio health, budget, low stock, overdue action, and safety alert.
2. **Projects** — open Orchid Residency and show project-level budget, progress, materials, and Quality & Safety.
3. **BOQ & Budget** — show the active execution BOQ and planned value.
4. **Procurement and Inventory** — show the conduit replenishment request and available stock.
5. **Tasks & Actions** — show the overdue electrical-stock action and its owner/status workflow.
6. **Daily Work Plan** — show today’s foundation activity, planned labour, linked action, and progress slider.
7. **Quality & Safety** — show the reinforcement safety check and its corrective-action path.
8. **Role access** — sign in as Site Supervisor and show the operations-only dashboard with Finance, settings, and restricted modules removed.

## Final preflight

- Dashboard, Projects, BOQ, Procurement, Inventory, Tasks, Daily Work Plan, Quality & Safety all open.
- The API health endpoint returns `{"status":"ok","service":"kravient-api"}`.
- Super Admin and Site Supervisor login are successful.
- Finance is visible to Super Admin but unavailable to Site Supervisor, Purchase, Store, Contractor, Client, and Viewer accounts.
- Keep one browser window open at the Dashboard before sharing the screen.
