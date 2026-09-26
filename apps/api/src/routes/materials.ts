import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { allowRoles, projectScope, requireAuth } from "../middleware/auth.js";

export const materialsRouter = Router();
const materialSchema = z.object({ name: z.string().min(2).max(160), sku: z.string().min(2).max(40).toUpperCase(), unit: z.string().min(1).max(24), minimumStock: z.coerce.number().nonnegative().default(0) });
const movementSchema = z.object({ type: z.enum(["RECEIPT", "ISSUE", "ADJUSTMENT"]), quantity: z.coerce.number().positive(), unitCost: z.coerce.number().nonnegative().optional(), projectSiteId: z.string().min(1), reference: z.string().max(80).optional(), notes: z.string().max(300).optional() });
const requirementSchema = z.object({ materialId: z.string().min(1), projectId: z.string().min(1), plannedQuantity: z.coerce.number().positive() });

const stockFor = (transactions: { type: string; quantity: unknown }[]) => transactions.reduce((total, transaction) => total + (transaction.type === "ISSUE" ? -Number(transaction.quantity) : Number(transaction.quantity)), 0);

materialsRouter.use(requireAuth);

materialsRouter.get("/", async (request, response) => {
  const materials = await db.material.findMany({ where: { organizationId: request.auth!.organizationId }, include: { inventoryTransactions: { where: { projectSite: { project: projectScope(request, "id") } } }, requirements: { where: projectScope(request) } }, orderBy: { name: "asc" } });
  response.json({ materials: materials.map(material => ({ ...material, availableQuantity: stockFor(material.inventoryTransactions), plannedQuantity: material.requirements.reduce((sum, requirement) => sum + Number(requirement.plannedQuantity), 0) })) });
});

materialsRouter.get("/transactions", async (request, response) => {
  const transactions = await db.inventoryTransaction.findMany({ where: { organizationId: request.auth!.organizationId, projectSite: { project: projectScope(request, "id") } }, include: { material: { select: { name: true, unit: true } }, projectSite: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 100 });
  response.json({ transactions });
});

materialsRouter.post("/", allowRoles("SUPER_ADMIN", "COMPANY_OWNER", "PROJECT_MANAGER", "PURCHASE_MANAGER", "STORE_MANAGER"), async (request, response) => {
  const input = materialSchema.parse(request.body);
  const material = await db.material.create({ data: { ...input, organizationId: request.auth!.organizationId } });
  response.status(201).json({ material });
});

materialsRouter.post("/requirements", allowRoles("SUPER_ADMIN", "COMPANY_OWNER", "PROJECT_MANAGER"), async (request, response) => {
  const input = requirementSchema.parse(request.body);
  const [material, project] = await Promise.all([db.material.findFirst({ where: { id: input.materialId, organizationId: request.auth!.organizationId } }), db.project.findFirst({ where: { id: input.projectId, organizationId: request.auth!.organizationId, ...projectScope(request, "id") } })]);
  if (!material || !project) return response.status(404).json({ error: "Material or project not found" });
  const requirement = await db.materialRequirement.upsert({ where: { projectId_materialId: { projectId: project.id, materialId: material.id } }, update: { plannedQuantity: input.plannedQuantity }, create: { ...input, organizationId: request.auth!.organizationId } });
  response.status(201).json({ requirement });
});

materialsRouter.post("/:materialId/transactions", allowRoles("SUPER_ADMIN", "COMPANY_OWNER", "PROJECT_MANAGER", "PURCHASE_MANAGER", "STORE_MANAGER", "SITE_ENGINEER"), async (request, response) => {
  const input = movementSchema.parse(request.body);
  const materialId = Array.isArray(request.params.materialId) ? request.params.materialId[0] : request.params.materialId;
  const [material, projectSite] = await Promise.all([db.material.findFirst({ where: { id: materialId, organizationId: request.auth!.organizationId }, include: { inventoryTransactions: { where: { projectSite: { project: projectScope(request, "id") } } } } }), db.projectSite.findFirst({ where: { id: input.projectSiteId, organizationId: request.auth!.organizationId, project: projectScope(request, "id") } })]);
  if (!material || !projectSite) return response.status(404).json({ error: "Material or project site not found" });
  if (input.type === "ISSUE" && stockFor(material.inventoryTransactions) < input.quantity) return response.status(422).json({ error: "Cannot issue more material than the available stock" });
  const transaction = await db.inventoryTransaction.create({ data: { ...input, materialId: material.id, projectSiteId: projectSite.id, organizationId: request.auth!.organizationId } });
  response.status(201).json({ transaction });
});
