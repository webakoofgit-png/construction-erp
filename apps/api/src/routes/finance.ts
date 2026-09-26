import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { allowRoles, projectScope, requireAuth } from "../middleware/auth.js";

export const financeRouter = Router();
const expenseSchema = z.object({ projectId: z.string().min(1), projectSiteId: z.string().min(1).optional(), expenseDate: z.coerce.date(), category: z.string().min(2).max(80), description: z.string().min(2).max(300), amount: z.coerce.number().positive() });
const milestoneSchema = z.object({ projectId: z.string().min(1), title: z.string().min(2).max(180), amount: z.coerce.number().positive(), dueDate: z.coerce.date().optional() });
const billSchema = z.object({ projectId: z.string().min(1), billingMilestoneId: z.string().min(1).optional(), amount: z.coerce.number().positive(), dueDate: z.coerce.date().optional() });
const paymentSchema = z.object({ amount: z.coerce.number().positive(), paidAt: z.coerce.date(), reference: z.string().max(100).optional() });
const routeId = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

financeRouter.use(requireAuth);

financeRouter.get("/", allowRoles("SUPER_ADMIN", "COMPANY_OWNER", "PROJECT_MANAGER", "ACCOUNTS_MANAGER"), async (request, response) => {
  const organizationId = request.auth!.organizationId;
  const [expenses, milestones, clientBills] = await Promise.all([
    db.expense.findMany({ where: { organizationId, ...projectScope(request) }, include: { project: { select: { name: true } }, projectSite: { select: { name: true } } }, orderBy: { expenseDate: "desc" }, take: 100 }),
    db.clientBillingMilestone.findMany({ where: { organizationId, ...projectScope(request) }, include: { project: { select: { name: true } } }, orderBy: { dueDate: "asc" } }),
    db.clientBill.findMany({ where: { organizationId, ...projectScope(request) }, include: { project: { select: { name: true } }, billingMilestone: { select: { title: true } }, payments: true }, orderBy: { dueDate: "asc" } })
  ]);
  response.json({ expenses, milestones, clientBills });
});

financeRouter.post("/expenses", allowRoles("SUPER_ADMIN", "COMPANY_OWNER", "PROJECT_MANAGER", "ACCOUNTS_MANAGER", "SITE_ENGINEER"), async (request, response) => {
  const input = expenseSchema.parse(request.body);
  const [project, site] = await Promise.all([db.project.findFirst({ where: { id: input.projectId, organizationId: request.auth!.organizationId, ...projectScope(request, "id") } }), input.projectSiteId ? db.projectSite.findFirst({ where: { id: input.projectSiteId, organizationId: request.auth!.organizationId } }) : null]);
  if (!project || (input.projectSiteId && (!site || site.projectId !== project.id))) return response.status(404).json({ error: "Project or site not found" });
  const expense = await db.expense.create({ data: { ...input, expenseNumber: `EXP-${Date.now()}`, status: "SUBMITTED", organizationId: request.auth!.organizationId } });
  response.status(201).json({ expense });
});

financeRouter.post("/milestones", allowRoles("SUPER_ADMIN", "COMPANY_OWNER", "PROJECT_MANAGER", "ACCOUNTS_MANAGER"), async (request, response) => {
  const input = milestoneSchema.parse(request.body); const project = await db.project.findFirst({ where: { id: input.projectId, organizationId: request.auth!.organizationId, ...projectScope(request, "id") } });
  if (!project) return response.status(404).json({ error: "Project not found" });
  const milestone = await db.clientBillingMilestone.create({ data: { ...input, organizationId: request.auth!.organizationId } });
  response.status(201).json({ milestone });
});

financeRouter.post("/bills", allowRoles("SUPER_ADMIN", "COMPANY_OWNER", "PROJECT_MANAGER", "ACCOUNTS_MANAGER"), async (request, response) => {
  const input = billSchema.parse(request.body); const project = await db.project.findFirst({ where: { id: input.projectId, organizationId: request.auth!.organizationId, ...projectScope(request, "id") } });
  if (!project) return response.status(404).json({ error: "Project not found" });
  if (input.billingMilestoneId) { const milestone = await db.clientBillingMilestone.findFirst({ where: { id: input.billingMilestoneId, organizationId: request.auth!.organizationId, projectId: project.id } }); if (!milestone) return response.status(404).json({ error: "Billing milestone not found" }); }
  const bill = await db.clientBill.create({ data: { ...input, billNumber: `CB-${Date.now()}`, status: "ISSUED", organizationId: request.auth!.organizationId } });
  response.status(201).json({ bill });
});

financeRouter.post("/bills/:billId/payments", allowRoles("SUPER_ADMIN", "COMPANY_OWNER", "ACCOUNTS_MANAGER"), async (request, response) => {
  const input = paymentSchema.parse(request.body); const billId = routeId(request.params.billId);
  const bill = await db.clientBill.findFirst({ where: { id: billId, organizationId: request.auth!.organizationId, ...projectScope(request) }, include: { payments: true } });
  if (!bill) return response.status(404).json({ error: "Client bill not found" });
  const alreadyPaid = bill.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  if (alreadyPaid + input.amount > Number(bill.amount)) return response.status(422).json({ error: "Payment cannot exceed the outstanding bill amount" });
  const payment = await db.$transaction(async transaction => { const nextTotal = alreadyPaid + input.amount; const record = await transaction.clientPayment.create({ data: { ...input, clientBillId: bill.id, organizationId: request.auth!.organizationId } }); await transaction.clientBill.update({ where: { id: bill.id }, data: { status: nextTotal === Number(bill.amount) ? "PAID" : "PARTIALLY_PAID" } }); return record; });
  response.status(201).json({ payment });
});
