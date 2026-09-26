import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { allowRoles, canAccessProject, projectScope, requireAuth } from "../middleware/auth.js";

export const projectsRouter = Router();
const projectSchema = z.object({ name: z.string().min(2).max(160), code: z.string().min(2).max(32).toUpperCase(), contractValue: z.coerce.number().nonnegative().default(0), status: z.enum(["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED", "ARCHIVED"]).default("PLANNING"), templateId: z.string().min(1).optional() });
const siteSchema = z.object({ name: z.string().min(2).max(160), address: z.string().max(300).optional() });
const clientAssignmentSchema = z.object({ clientUserId: z.string().min(1).nullable() });

projectsRouter.use(requireAuth);

projectsRouter.get("/", async (request, response) => {
  const projects = await db.project.findMany({ where: { organizationId: request.auth!.organizationId, ...projectScope(request, "id") }, include: { sites: true }, orderBy: { updatedAt: "desc" } });
  response.json({ projects });
});

projectsRouter.get("/:projectId/overview", async (request, response) => {
  const projectId = Array.isArray(request.params.projectId) ? request.params.projectId[0] : request.params.projectId;
  const organizationId = request.auth!.organizationId;
  const project = await db.project.findFirst({ where: { id: projectId, organizationId, ...projectScope(request, "id") }, include: { sites: true, boqs: { include: { items: { include: { progressEntries: true } } } }, expenses: true, contractorBills: true, clientBills: { include: { payments: true } }, workOrders: { include: { contractor: { select: { name: true } } } }, dailyReports: { orderBy: { reportDate: "desc" }, take: 3 }, siteIssues: { where: { status: { not: "RESOLVED" } }, orderBy: { updatedAt: "desc" }, take: 6 }, materialRequirements: { include: { material: { include: { inventoryTransactions: true } } } } } });
  if (!project) return response.status(404).json({ error: "Project not found" });
  const assignments = await db.equipmentAssignment.findMany({ where: { organizationId, projectId, releasedAt: null }, include: { equipment: true, projectSite: { select: { name: true } } } });
  const activeBoqs = project.boqs.filter(boq => boq.status === "ACTIVE"); const items = (activeBoqs.length ? activeBoqs : project.boqs).flatMap(boq => boq.items); const budget = items.reduce((total, item) => total + Number(item.quantity) * Number(item.rate), 0); const cost = project.expenses.filter(expense => expense.status === "APPROVED" || expense.status === "PAID").reduce((total, expense) => total + Number(expense.amount), 0) + project.contractorBills.filter(bill => bill.status === "VERIFIED" || bill.status === "PAID").reduce((total, bill) => total + Number(bill.amount), 0); const billed = project.clientBills.reduce((total, bill) => total + Number(bill.amount), 0); const paid = project.clientBills.reduce((total, bill) => total + bill.payments.reduce((sum, payment) => sum + Number(payment.amount), 0), 0); const progressItems = items.filter(item => item.progressEntries.length && Number(item.quantity) > 0); const progress = progressItems.length ? progressItems.reduce((total, item) => total + Math.min(1, item.progressEntries.reduce((sum, entry) => sum + Number(entry.completedQuantity), 0) / Number(item.quantity)), 0) / progressItems.length * 100 : 0;
  const materialStock = project.materialRequirements.map(requirement => ({ name: requirement.material.name, unit: requirement.material.unit, planned: Number(requirement.plannedQuantity), available: requirement.material.inventoryTransactions.reduce((total, transaction) => total + (transaction.type === "ISSUE" ? -Number(transaction.quantity) : Number(transaction.quantity)), 0), minimum: Number(requirement.material.minimumStock) }));
  response.json({ project, summary: { budget, cost, billed, paid, progress: Math.round(progress), outstanding: Math.max(billed - paid, 0) }, equipment: assignments, materialStock });
});

projectsRouter.post("/", allowRoles("SUPER_ADMIN", "COMPANY_OWNER", "PROJECT_MANAGER"), async (request, response) => {
  const input = projectSchema.parse(request.body);
  const { templateId, ...projectInput } = input; const organizationId = request.auth!.organizationId;
  const template = templateId ? await db.projectTemplate.findFirst({ where: { id: templateId, organizationId } }) : null;
  if (templateId && !template) return response.status(404).json({ error: "Project template not found" });
  const boqItems = (template?.boqItems ?? []) as unknown as { description: string; unit: string; quantity: number; rate: number }[];
  const scheduleTasks = (template?.scheduleTasks ?? []) as unknown as { title: string; durationDays: number }[];
  const project = await db.project.create({ data: { ...projectInput, organizationId, ...(boqItems.length ? { boqs: { create: { name: `${projectInput.name} starter BOQ`, organizationId, items: { create: boqItems.map((item, index) => ({ ...item, sortOrder: index, organizationId })) } } } } : {}), ...(scheduleTasks.length ? { scheduleTasks: { create: scheduleTasks.map((task, index) => { const plannedStart = new Date(); plannedStart.setDate(plannedStart.getDate() + index * task.durationDays); const plannedEnd = new Date(plannedStart); plannedEnd.setDate(plannedEnd.getDate() + task.durationDays); return { title: task.title, plannedStart, plannedEnd, organizationId }; }) } } : {}) }, include: { sites: true } });
  response.status(201).json({ project });
});

projectsRouter.post("/:projectId/sites", allowRoles("SUPER_ADMIN", "COMPANY_OWNER", "PROJECT_MANAGER", "SITE_ENGINEER", "SITE_SUPERVISOR"), async (request, response) => {
  const input = siteSchema.parse(request.body);
  const projectId = Array.isArray(request.params.projectId) ? request.params.projectId[0] : request.params.projectId;
  const project = await db.project.findFirst({ where: { id: projectId, organizationId: request.auth!.organizationId, ...projectScope(request, "id") }, select: { id: true } });
  if (!project) return response.status(404).json({ error: "Project not found" });
  const site = await db.projectSite.create({ data: { ...input, projectId: project.id, organizationId: request.auth!.organizationId } });
  response.status(201).json({ site });
});

projectsRouter.patch("/:projectId/client", allowRoles("SUPER_ADMIN", "COMPANY_OWNER", "PROJECT_MANAGER"), async (request, response) => {
  const projectId = Array.isArray(request.params.projectId) ? request.params.projectId[0] : request.params.projectId; const input = clientAssignmentSchema.parse(request.body); const project = await db.project.findFirst({ where: { id: projectId, organizationId: request.auth!.organizationId, ...projectScope(request, "id") } }); if (!project) return response.status(404).json({ error: "Project not found" }); if (input.clientUserId) { const membership = await db.membership.findFirst({ where: { userId: input.clientUserId, organizationId: request.auth!.organizationId, role: "CLIENT" } }); if (!membership) return response.status(422).json({ error: "Select a client account in this workspace" }); } const updated = await db.project.update({ where: { id: project.id }, data: { clientUserId: input.clientUserId } }); response.json({ project: updated });
});
