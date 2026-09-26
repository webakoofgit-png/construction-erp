import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { allowRoles, projectScope, requireAuth } from "../middleware/auth.js";

export const projectTasksRouter = Router();
const permittedRoles = ["SUPER_ADMIN", "COMPANY_OWNER", "PROJECT_MANAGER", "SITE_ENGINEER", "SITE_SUPERVISOR"] as const;
const taskSchema = z.object({ title: z.string().min(2).max(180), description: z.string().max(800).optional(), priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"), dueDate: z.string().date().optional(), projectId: z.string().min(1), assignedToId: z.string().min(1).nullable().optional() });
const updateSchema = taskSchema.pick({ title: true, description: true, priority: true, dueDate: true, assignedToId: true }).partial().extend({ status: z.enum(["OPEN", "IN_PROGRESS", "COMPLETED"]).optional() });
const routeId = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

projectTasksRouter.use(requireAuth);
projectTasksRouter.get("/", async (request, response) => {
  const tasks = await db.projectTask.findMany({ where: { organizationId: request.auth!.organizationId, project: projectScope(request, "id") }, include: { project: { select: { id: true, name: true, code: true } }, assignedTo: { select: { id: true, name: true } } }, orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }] });
  response.json({ tasks });
});
projectTasksRouter.get("/options", async (request, response) => {
  const organizationId = request.auth!.organizationId;
  const [projects, memberships] = await Promise.all([db.project.findMany({ where: { organizationId, ...projectScope(request, "id") }, select: { id: true, name: true, code: true }, orderBy: { name: "asc" } }), db.membership.findMany({ where: { organizationId }, include: { user: { select: { id: true, name: true } } }, orderBy: { user: { name: "asc" } } })]);
  response.json({ projects, members: memberships.map((membership) => ({ id: membership.user.id, name: membership.user.name, role: membership.role })) });
});
projectTasksRouter.post("/", allowRoles(...permittedRoles), async (request, response) => {
  const input = taskSchema.parse(request.body); const organizationId = request.auth!.organizationId; const project = await db.project.findFirst({ where: { id: input.projectId, organizationId, ...projectScope(request, "id") }, select: { id: true } });
  if (!project) return response.status(404).json({ error: "Project not found" });
  if (input.assignedToId) { const member = await db.membership.findUnique({ where: { organizationId_userId: { organizationId, userId: input.assignedToId } } }); if (!member) return response.status(422).json({ error: "Assignee must belong to this workspace" }); }
  const task = await db.projectTask.create({ data: { ...input, dueDate: input.dueDate ? new Date(input.dueDate) : undefined, organizationId }, include: { project: { select: { id: true, name: true, code: true } }, assignedTo: { select: { id: true, name: true } } } }); response.status(201).json({ task });
});
projectTasksRouter.patch("/:taskId", allowRoles(...permittedRoles), async (request, response) => {
  const taskId = routeId(request.params.taskId); const input = updateSchema.parse(request.body); const organizationId = request.auth!.organizationId; const task = await db.projectTask.findFirst({ where: { id: taskId, organizationId, project: projectScope(request, "id") } });
  if (!task) return response.status(404).json({ error: "Task not found" });
  const updated = await db.projectTask.update({ where: { id: task.id }, data: { ...input, dueDate: input.dueDate ? new Date(input.dueDate) : undefined }, include: { project: { select: { id: true, name: true, code: true } }, assignedTo: { select: { id: true, name: true } } } }); response.json({ task: updated });
});
