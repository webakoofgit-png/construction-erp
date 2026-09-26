import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { allowRoles, requireAuth } from "../middleware/auth.js";

export const projectTemplatesRouter = Router();
const templateSchema = z.object({
  name: z.string().min(2).max(120), description: z.string().max(300).optional(),
  boqItems: z.array(z.object({ description: z.string().min(2).max(300), unit: z.string().min(1).max(20), quantity: z.coerce.number().positive(), rate: z.coerce.number().nonnegative() })).max(100).default([]),
  scheduleTasks: z.array(z.object({ title: z.string().min(2).max(160), durationDays: z.coerce.number().int().min(1).max(3650) })).max(100).default([]),
  qualityChecklist: z.array(z.string().min(2).max(160)).max(50).default([]), teamRoles: z.array(z.string().min(2).max(80)).max(30).default([])
});

projectTemplatesRouter.use(requireAuth);
projectTemplatesRouter.get("/", async (request, response) => {
  const templates = await db.projectTemplate.findMany({ where: { organizationId: request.auth!.organizationId }, orderBy: { updatedAt: "desc" } });
  response.json({ templates });
});
projectTemplatesRouter.post("/", allowRoles("SUPER_ADMIN", "COMPANY_OWNER", "PROJECT_MANAGER"), async (request, response) => {
  const input = templateSchema.parse(request.body);
  const template = await db.projectTemplate.create({ data: { ...input, organizationId: request.auth!.organizationId } });
  response.status(201).json({ template });
});
