import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { allowRoles, projectScope, requireAuth } from "../middleware/auth.js";

export const machineryRouter = Router();
const equipmentSchema = z.object({ name: z.string().min(2).max(120), assetCode: z.string().min(2).max(40).toUpperCase(), category: z.string().min(2).max(80), makeModel: z.string().max(120).optional(), hourlyCost: z.coerce.number().nonnegative().optional() });
const assignmentSchema = z.object({ projectId: z.string().min(1), projectSiteId: z.string().min(1).optional(), assignedAt: z.coerce.date() });
const usageSchema = z.object({ usageDate: z.coerce.date(), operatingHours: z.coerce.number().positive(), fuelCost: z.coerce.number().nonnegative().default(0), notes: z.string().max(300).optional() });
const maintenanceSchema = z.object({ title: z.string().min(2).max(160), scheduledDate: z.coerce.date(), cost: z.coerce.number().nonnegative().default(0) });
const routeId = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

machineryRouter.use(requireAuth);

machineryRouter.get("/", async (request, response) => {
  const equipment = await db.equipment.findMany({ where: { organizationId: request.auth!.organizationId, ...(request.auth!.projectIds === null ? {} : { assignments: { some: { ...projectScope(request) } } }) }, include: { assignments: { where: { releasedAt: null, ...projectScope(request) }, include: { project: { select: { name: true } }, projectSite: { select: { name: true } } }, orderBy: { assignedAt: "desc" }, take: 1 }, usages: { orderBy: { usageDate: "desc" }, take: 30 }, maintenances: { where: { status: { not: "COMPLETED" } }, orderBy: { scheduledDate: "asc" } } }, orderBy: { name: "asc" } });
  response.json({ equipment: equipment.map(item => ({ ...item, totalHours: item.usages.reduce((total, usage) => total + Number(usage.operatingHours), 0), fuelCost: item.usages.reduce((total, usage) => total + Number(usage.fuelCost), 0) })) });
});

machineryRouter.post("/", allowRoles("SUPER_ADMIN", "COMPANY_OWNER", "PROJECT_MANAGER", "SITE_ENGINEER"), async (request, response) => {
  const input = equipmentSchema.parse(request.body);
  const equipment = await db.equipment.create({ data: { ...input, organizationId: request.auth!.organizationId } });
  response.status(201).json({ equipment });
});

machineryRouter.post("/:equipmentId/assignments", allowRoles("SUPER_ADMIN", "COMPANY_OWNER", "PROJECT_MANAGER", "SITE_ENGINEER", "SITE_SUPERVISOR"), async (request, response) => {
  const input = assignmentSchema.parse(request.body); const equipmentId = routeId(request.params.equipmentId); const organizationId = request.auth!.organizationId;
  const [equipment, project, site] = await Promise.all([db.equipment.findFirst({ where: { id: equipmentId, organizationId } }), db.project.findFirst({ where: { id: input.projectId, organizationId, ...projectScope(request, "id") } }), input.projectSiteId ? db.projectSite.findFirst({ where: { id: input.projectSiteId, organizationId } }) : null]);
  if (!equipment || !project || (site && site.projectId !== project.id)) return response.status(404).json({ error: "Equipment, project, or site not found" });
  const assignment = await db.$transaction(async transaction => { await transaction.equipmentAssignment.updateMany({ where: { equipmentId: equipment.id, releasedAt: null }, data: { releasedAt: input.assignedAt } }); const record = await transaction.equipmentAssignment.create({ data: { ...input, equipmentId: equipment.id, organizationId } }); await transaction.equipment.update({ where: { id: equipment.id }, data: { status: "ASSIGNED" } }); return record; });
  response.status(201).json({ assignment });
});

machineryRouter.post("/:equipmentId/usage", allowRoles("SUPER_ADMIN", "COMPANY_OWNER", "PROJECT_MANAGER", "SITE_ENGINEER", "SITE_SUPERVISOR"), async (request, response) => {
  const input = usageSchema.parse(request.body); const equipmentId = routeId(request.params.equipmentId); const equipment = await db.equipment.findFirst({ where: { id: equipmentId, organizationId: request.auth!.organizationId, ...(request.auth!.projectIds === null ? {} : { assignments: { some: { releasedAt: null, ...projectScope(request) } } }) } });
  if (!equipment) return response.status(404).json({ error: "Equipment not found" }); const usage = await db.equipmentUsage.create({ data: { ...input, equipmentId: equipment.id, organizationId: request.auth!.organizationId } }); response.status(201).json({ usage });
});

machineryRouter.post("/:equipmentId/maintenance", allowRoles("SUPER_ADMIN", "COMPANY_OWNER", "PROJECT_MANAGER", "SITE_ENGINEER"), async (request, response) => {
  const input = maintenanceSchema.parse(request.body); const equipmentId = routeId(request.params.equipmentId); const equipment = await db.equipment.findFirst({ where: { id: equipmentId, organizationId: request.auth!.organizationId, ...(request.auth!.projectIds === null ? {} : { assignments: { some: { releasedAt: null, ...projectScope(request) } } }) } });
  if (!equipment) return response.status(404).json({ error: "Equipment not found" }); const maintenance = await db.$transaction(async transaction => { const record = await transaction.equipmentMaintenance.create({ data: { ...input, equipmentId: equipment.id, organizationId: request.auth!.organizationId } }); await transaction.equipment.update({ where: { id: equipment.id }, data: { status: "MAINTENANCE" } }); return record; }); response.status(201).json({ maintenance });
});
