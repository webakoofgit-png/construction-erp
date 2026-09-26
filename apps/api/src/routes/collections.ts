import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { allowRoles, projectScope, requireAuth } from "../middleware/auth.js";

export const collectionsRouter = Router();
const financialRoles = ["SUPER_ADMIN", "COMPANY_OWNER", "PROJECT_MANAGER", "ACCOUNTS_MANAGER"] as const;
const schema = z.object({ clientBillId: z.string(), ownerName: z.string().min(2), nextFollowUpAt: z.coerce.date().optional(), note: z.string().max(500).optional(), status: z.string().optional() });

collectionsRouter.use(requireAuth);
collectionsRouter.get("/", allowRoles(...financialRoles), async (request, response) => {
  const items = await db.clientBill.findMany({ where: { organizationId: request.auth!.organizationId, ...projectScope(request) }, include: { project: { select: { name: true } }, payments: true, followUps: { orderBy: { updatedAt: "desc" }, take: 1 } }, orderBy: { dueDate: "asc" } });
  response.json({ items: items.map(item => ({ ...item, outstanding: Number(item.amount) - item.payments.reduce((sum, payment) => sum + Number(payment.amount), 0) })) });
});
collectionsRouter.post("/follow-ups", allowRoles(...financialRoles), async (request, response) => {
  const input = schema.parse(request.body);
  const bill = await db.clientBill.findFirst({ where: { id: input.clientBillId, organizationId: request.auth!.organizationId, ...projectScope(request) } });
  if (!bill) return response.status(404).json({ error: "Client bill not found" });
  response.status(201).json({ followUp: await db.collectionFollowUp.create({ data: { ...input, organizationId: request.auth!.organizationId } }) });
});
