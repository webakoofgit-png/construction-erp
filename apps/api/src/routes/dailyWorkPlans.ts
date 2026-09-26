import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { allowRoles, projectScope, requireAuth } from "../middleware/auth.js";

export const dailyWorkPlansRouter = Router();
const permittedRoles = ["SUPER_ADMIN", "COMPANY_OWNER", "PROJECT_MANAGER", "SITE_ENGINEER", "SITE_SUPERVISOR"] as const;
const planSchema = z.object({ title: z.string().min(2).max(180), workType: z.string().max(80).optional(), planDate: z.string().date(), labourPlanned: z.coerce.number().int().min(0).max(10000).default(0), projectId: z.string().min(1), projectSiteId: z.string().min(1), projectTaskId: z.string().min(1).nullable().optional(), notes: z.string().max(800).optional() });
const updateSchema = planSchema.pick({ title: true, workType: true, planDate: true, labourPlanned: true, projectTaskId: true, notes: true }).partial().extend({ completionPercent: z.coerce.number().int().min(0).max(100).optional(), status: z.enum(["PLANNED", "IN_PROGRESS", "COMPLETED", "BLOCKED"]).optional() });
const routeId = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

dailyWorkPlansRouter.use(requireAuth);
dailyWorkPlansRouter.get("/", async (request, response) => {
  const date = typeof request.query.date === "string" ? request.query.date : undefined;
  const plans = await db.dailyWorkPlan.findMany({ where: { organizationId: request.auth!.organizationId, project: projectScope(request, "id"), ...(date ? { planDate: new Date(date) } : {}) }, include: { project: { select: { name: true, code: true } }, projectSite: { select: { name: true } }, projectTask: { select: { id: true, title: true } } }, orderBy: [{ status: "asc" }, { createdAt: "desc" }] }); response.json({ plans });
});
dailyWorkPlansRouter.get("/options", async (request, response) => {
  const organizationId = request.auth!.organizationId; const [projects, tasks] = await Promise.all([db.project.findMany({ where: { organizationId, ...projectScope(request, "id") }, include: { sites: { select: { id: true, name: true } } }, orderBy: { name: "asc" } }), db.projectTask.findMany({ where: { organizationId, status: { not: "COMPLETED" }, project: projectScope(request, "id") }, select: { id: true, title: true, projectId: true }, orderBy: { dueDate: "asc" } })]); response.json({ projects, tasks });
});
dailyWorkPlansRouter.post("/", allowRoles(...permittedRoles), async (request, response) => {
  const input = planSchema.parse(request.body); const organizationId = request.auth!.organizationId; const site = await db.projectSite.findFirst({ where: { id: input.projectSiteId, projectId: input.projectId, organizationId, project: projectScope(request, "id") }, select: { id: true } }); if (!site) return response.status(422).json({ error: "Choose a valid site for this project" });
  if (input.projectTaskId) { const task = await db.projectTask.findFirst({ where: { id: input.projectTaskId, projectId: input.projectId, organizationId } }); if (!task) return response.status(422).json({ error: "Choose an action from the selected project" }); }
  const plan = await db.dailyWorkPlan.create({ data: { ...input, planDate: new Date(input.planDate), organizationId }, include: { project: { select: { name: true, code: true } }, projectSite: { select: { name: true } }, projectTask: { select: { id: true, title: true } } } }); response.status(201).json({ plan });
});
dailyWorkPlansRouter.patch("/:planId", allowRoles(...permittedRoles), async (request, response) => {
  const planId = routeId(request.params.planId); const input = updateSchema.parse(request.body); const plan = await db.dailyWorkPlan.findFirst({ where: { id: planId, organizationId: request.auth!.organizationId, project: projectScope(request, "id") } }); if (!plan) return response.status(404).json({ error: "Work plan not found" });
  const updated = await db.dailyWorkPlan.update({ where: { id: plan.id }, data: { ...input, planDate: input.planDate ? new Date(input.planDate) : undefined }, include: { project: { select: { name: true, code: true } }, projectSite: { select: { name: true } }, projectTask: { select: { id: true, title: true } } } }); response.json({ plan: updated });
});
