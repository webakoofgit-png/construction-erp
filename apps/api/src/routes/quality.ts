import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { sendEmail } from "../lib/email.js";
import { allowRoles, projectScope, requireAuth } from "../middleware/auth.js";

export const qualityRouter = Router();
const schema = z.object({ projectId: z.string().min(1), projectSiteId: z.string().min(1), title: z.string().min(3).max(160), type: z.string().min(2).max(60), finding: z.string().min(3).max(600), severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]), correctiveAction: z.string().max(400).optional(), dueDate: z.coerce.date().optional(), evidenceUrls: z.array(z.string().min(1).max(7000000)).default([]) });

qualityRouter.use(requireAuth);
qualityRouter.get("/", async (request, response) => response.json({ inspections: await db.siteInspection.findMany({ where: { organizationId: request.auth!.organizationId, ...projectScope(request) }, include: { project: { select: { name: true } }, projectSite: { select: { name: true } } }, orderBy: { createdAt: "desc" } }) }));
qualityRouter.post("/", allowRoles("SUPER_ADMIN", "COMPANY_OWNER", "PROJECT_MANAGER", "SITE_ENGINEER", "SITE_SUPERVISOR"), async (request, response) => {
  const input = schema.parse(request.body);
  if (["HIGH", "CRITICAL"].includes(input.severity) && !input.evidenceUrls.length) return response.status(422).json({ error: "Photo evidence is required for high and critical findings" });
  const site = await db.projectSite.findFirst({ where: { id: input.projectSiteId, projectId: input.projectId, organizationId: request.auth!.organizationId, project: projectScope(request, "id") }, include: { project: { select: { name: true } } } });
  if (!site) return response.status(404).json({ error: "Project site not found" });
  const inspection = await db.siteInspection.create({ data: { ...input, organizationId: request.auth!.organizationId } });
  if (["HIGH", "CRITICAL"].includes(input.severity)) {
    const recipients = await db.membership.findMany({ where: { organizationId: request.auth!.organizationId, role: { in: ["SUPER_ADMIN", "COMPANY_OWNER", "PROJECT_MANAGER"] } }, include: { user: { select: { email: true } } } });
    await Promise.all(recipients.map(recipient => sendEmail({ to: recipient.user.email, subject: `${input.severity} safety alert · ${site.project.name}`, text: `${input.title}\n\n${input.finding}\n\nSite: ${site.name}\nCorrective action: ${input.correctiveAction ?? "Not specified"}` })));
  }
  response.status(201).json({ inspection });
});
qualityRouter.patch("/:id/resolve", allowRoles("SUPER_ADMIN", "COMPANY_OWNER", "PROJECT_MANAGER", "SITE_ENGINEER", "SITE_SUPERVISOR"), async (request, response) => {
  const id = Array.isArray(request.params.id) ? request.params.id[0] : request.params.id;
  const count = await db.siteInspection.updateMany({ where: { id, organizationId: request.auth!.organizationId, ...projectScope(request) }, data: { status: "RESOLVED" } });
  if (!count.count) return response.status(404).json({ error: "Inspection not found" });
  response.json({ ok: true });
});
