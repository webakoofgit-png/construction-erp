import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { allowRoles, projectScope, requireAuth } from "../middleware/auth.js";

export const boqsRouter = Router();
const boqSchema = z.object({ name: z.string().min(2).max(160), projectId: z.string().min(1) });
const itemSchema = z.object({ code: z.string().max(40).optional(), category: z.string().max(80).optional(), description: z.string().min(2).max(400), unit: z.string().min(1).max(24), quantity: z.coerce.number().positive(), rate: z.coerce.number().nonnegative() });

boqsRouter.use(requireAuth);

boqsRouter.get("/", async (request, response) => {
  const boqs = await db.boq.findMany({ where: { organizationId: request.auth!.organizationId, ...projectScope(request) }, include: { project: { select: { id: true, name: true, code: true } }, items: { orderBy: { sortOrder: "asc" } } }, orderBy: { updatedAt: "desc" } });
  response.json({ boqs });
});

boqsRouter.post("/", allowRoles("SUPER_ADMIN", "COMPANY_OWNER", "PROJECT_MANAGER"), async (request, response) => {
  const input = boqSchema.parse(request.body);
  const project = await db.project.findFirst({ where: { id: input.projectId, organizationId: request.auth!.organizationId, ...projectScope(request, "id") }, select: { id: true } });
  if (!project) return response.status(404).json({ error: "Project not found" });
  const boq = await db.boq.create({ data: { name: input.name, projectId: project.id, organizationId: request.auth!.organizationId }, include: { project: { select: { id: true, name: true, code: true } }, items: true } });
  response.status(201).json({ boq });
});

boqsRouter.post("/:boqId/items", allowRoles("SUPER_ADMIN", "COMPANY_OWNER", "PROJECT_MANAGER"), async (request, response) => {
  const input = itemSchema.parse(request.body);
  const boqId = Array.isArray(request.params.boqId) ? request.params.boqId[0] : request.params.boqId;
  const boq = await db.boq.findFirst({ where: { id: boqId, organizationId: request.auth!.organizationId, ...projectScope(request) }, select: { id: true, _count: { select: { items: true } } } });
  if (!boq) return response.status(404).json({ error: "BOQ not found" });
  const item = await db.boqItem.create({ data: { ...input, sortOrder: boq._count.items, boqId: boq.id, organizationId: request.auth!.organizationId } });
  response.status(201).json({ item });
});
