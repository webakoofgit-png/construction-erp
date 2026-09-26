import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { allowRoles, projectScope, requireAuth } from "../middleware/auth.js";

export const progressRouter = Router();
const reportSchema = z.object({ projectId: z.string().min(1), projectSiteId: z.string().min(1), reportDate: z.coerce.date(), summary: z.string().min(5).max(1000) });
const entrySchema = z.object({ description: z.string().min(2).max(300), completedQuantity: z.coerce.number().positive(), boqItemId: z.string().min(1).optional() });
const issueSchema = z.object({ title: z.string().min(3).max(180), description: z.string().max(500).optional(), severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]), ownerName: z.string().max(100).optional() });
const mediaSchema = z.object({ fileName: z.string().min(1).max(180), contentType: z.string().regex(/^image\//), mediaUrl: z.string().min(1).max(7_000_000) });
const routeId = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

progressRouter.use(requireAuth);

progressRouter.get("/", async (request, response) => {
  const organizationId = request.auth!.organizationId;
  const [reports, issues] = await Promise.all([
    db.dailyProgressReport.findMany({ where: { organizationId, ...projectScope(request) }, include: { project: { select: { name: true, code: true } }, projectSite: { select: { name: true } }, progressEntries: true, siteIssues: true, media: true }, orderBy: [{ reportDate: "desc" }, { createdAt: "desc" }], take: 50 }),
    db.siteIssue.findMany({ where: { organizationId, status: { not: "RESOLVED" }, ...projectScope(request) }, include: { project: { select: { name: true } }, projectSite: { select: { name: true } } }, orderBy: { updatedAt: "desc" }, take: 50 })
  ]);
  response.json({ reports, issues });
});

progressRouter.get("/summary", async (request, response) => {
  const organizationId = request.auth!.organizationId;
  const [reportCount, openIssues, criticalIssues] = await Promise.all([db.dailyProgressReport.count({ where: { organizationId, ...projectScope(request) } }), db.siteIssue.count({ where: { organizationId, status: { not: "RESOLVED" }, ...projectScope(request) } }), db.siteIssue.count({ where: { organizationId, severity: "CRITICAL", status: { not: "RESOLVED" }, ...projectScope(request) } })]);
  response.json({ reportCount, openIssues, criticalIssues });
});

progressRouter.post("/reports", allowRoles("SUPER_ADMIN", "COMPANY_OWNER", "PROJECT_MANAGER", "SITE_ENGINEER", "SITE_SUPERVISOR"), async (request, response) => {
  const input = reportSchema.parse(request.body);
  const [project, projectSite] = await Promise.all([db.project.findFirst({ where: { id: input.projectId, organizationId: request.auth!.organizationId, ...projectScope(request, "id") } }), db.projectSite.findFirst({ where: { id: input.projectSiteId, organizationId: request.auth!.organizationId } })]);
  if (!project || !projectSite || projectSite.projectId !== project.id) return response.status(404).json({ error: "Project or project site not found" });
  const report = await db.dailyProgressReport.create({ data: { reportNumber: `DPR-${Date.now()}`, ...input, projectId: project.id, projectSiteId: projectSite.id, organizationId: request.auth!.organizationId }, include: { progressEntries: true, siteIssues: true } });
  response.status(201).json({ report });
});

progressRouter.post("/reports/:reportId/entries", allowRoles("SUPER_ADMIN", "COMPANY_OWNER", "PROJECT_MANAGER", "SITE_ENGINEER", "SITE_SUPERVISOR"), async (request, response) => {
  const input = entrySchema.parse(request.body); const reportId = routeId(request.params.reportId);
  const report = await db.dailyProgressReport.findFirst({ where: { id: reportId, organizationId: request.auth!.organizationId, ...projectScope(request) } });
  if (!report) return response.status(404).json({ error: "Daily report not found" });
  if (input.boqItemId) { const item = await db.boqItem.findFirst({ where: { id: input.boqItemId, organizationId: request.auth!.organizationId } }); if (!item) return response.status(404).json({ error: "BOQ item not found" }); }
  const entry = await db.progressEntry.create({ data: { ...input, dailyProgressReportId: report.id, organizationId: request.auth!.organizationId } });
  response.status(201).json({ entry });
});

progressRouter.post("/reports/:reportId/issues", allowRoles("SUPER_ADMIN", "COMPANY_OWNER", "PROJECT_MANAGER", "SITE_ENGINEER", "SITE_SUPERVISOR"), async (request, response) => {
  const input = issueSchema.parse(request.body); const reportId = routeId(request.params.reportId);
  const report = await db.dailyProgressReport.findFirst({ where: { id: reportId, organizationId: request.auth!.organizationId, ...projectScope(request) } });
  if (!report) return response.status(404).json({ error: "Daily report not found" });
  const issue = await db.siteIssue.create({ data: { ...input, dailyProgressReportId: report.id, projectId: report.projectId, projectSiteId: report.projectSiteId, organizationId: request.auth!.organizationId } });
  response.status(201).json({ issue });
});

progressRouter.post("/reports/:reportId/media", allowRoles("SUPER_ADMIN", "COMPANY_OWNER", "PROJECT_MANAGER", "SITE_ENGINEER", "SITE_SUPERVISOR"), async (request, response) => {
  const input = mediaSchema.parse(request.body); const reportId = routeId(request.params.reportId); const report = await db.dailyProgressReport.findFirst({ where: { id: reportId, organizationId: request.auth!.organizationId, ...projectScope(request) } });
  if (!report) return response.status(404).json({ error: "Daily report not found" }); const media = await db.siteMedia.create({ data: { ...input, dailyProgressReportId: report.id, organizationId: request.auth!.organizationId } }); response.status(201).json({ media });
});
