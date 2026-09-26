import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { allowRoles, projectScope, requireAuth } from "../middleware/auth.js";

export const changeOrdersRouter = Router();
const createSchema = z.object({ projectId: z.string().min(1), title: z.string().min(3).max(180), description: z.string().min(3).max(1000), amount: z.coerce.number() });
const decisionSchema = z.object({ status: z.enum(["APPROVED", "REJECTED"]) });

changeOrdersRouter.use(requireAuth);
changeOrdersRouter.get("/", async (request, response) => {
  const changes = await db.changeOrder.findMany({ where: { organizationId: request.auth!.organizationId, ...projectScope(request) }, include: { project: { select: { name: true, code: true } } }, orderBy: { updatedAt: "desc" } });
  const projects = await db.project.findMany({ where: { organizationId: request.auth!.organizationId, ...projectScope(request, "id") }, include: { boqs: { include: { items: true } }, expenses: true, contractorBills: true } });
  const summary = changes.reduce((result, change) => ({ ...result, approved: result.approved + (change.status === "APPROVED" ? Number(change.amount) : 0), pending: result.pending + (change.status === "SUBMITTED" ? Number(change.amount) : 0) }), { approved: 0, pending: 0 });
  const forecasts = projects.map(project => { const active = project.boqs.filter(boq => boq.status === "ACTIVE"); const originalBudget = (active.length ? active : project.boqs).flatMap(boq => boq.items).reduce((total, item) => total + Number(item.quantity) * Number(item.rate), 0); const approvedVariation = changes.filter(change => change.projectId === project.id && change.status === "APPROVED").reduce((total, change) => total + Number(change.amount), 0); const actualCost = project.expenses.filter(item => item.status === "APPROVED" || item.status === "PAID").reduce((total, item) => total + Number(item.amount), 0) + project.contractorBills.filter(item => item.status === "VERIFIED" || item.status === "PAID").reduce((total, item) => total + Number(item.amount), 0); const revisedBudget = originalBudget + approvedVariation; return { projectId: project.id, name: project.name, originalBudget, approvedVariation, revisedBudget, actualCost, forecastCost: Math.max(revisedBudget, actualCost), variance: actualCost - revisedBudget }; });
  response.json({ changes, summary, forecasts });
});
changeOrdersRouter.post("/", allowRoles("SUPER_ADMIN", "COMPANY_OWNER", "PROJECT_MANAGER", "SITE_ENGINEER"), async (request, response) => {
  const input = createSchema.parse(request.body); const project = await db.project.findFirst({ where: { id: input.projectId, organizationId: request.auth!.organizationId, ...projectScope(request, "id") } });
  if (!project) return response.status(404).json({ error: "Project not found" });
  const change = await db.changeOrder.create({ data: { ...input, number: `CO-${Date.now()}`, status: "SUBMITTED", organizationId: request.auth!.organizationId }, include: { project: { select: { name: true, code: true } } } });
  response.status(201).json({ change });
});
changeOrdersRouter.patch("/:changeId", allowRoles("SUPER_ADMIN", "COMPANY_OWNER", "PROJECT_MANAGER"), async (request, response) => {
  const input = decisionSchema.parse(request.body); const changeId = Array.isArray(request.params.changeId) ? request.params.changeId[0] : request.params.changeId;
  const change = await db.changeOrder.updateMany({ where: { id: changeId, organizationId: request.auth!.organizationId, status: "SUBMITTED", ...projectScope(request) }, data: { status: input.status } });
  if (!change.count) return response.status(404).json({ error: "Change order not found or already decided" });
  response.json({ ok: true });
});
