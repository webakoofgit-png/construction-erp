import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { allowRoles, projectScope, requireAuth } from "../middleware/auth.js";

export const documentsRouter = Router();
const categories = ["DRAWING", "CONTRACT", "QUOTATION", "PURCHASE_DOCUMENT", "INVOICE", "BILLING_DOCUMENT", "SITE_PHOTO", "OTHER"] as const;
const uploadSchema = z.object({ title: z.string().min(2).max(160), category: z.enum(categories), projectId: z.string().min(1).optional(), projectSiteId: z.string().min(1).optional(), parentDocumentId: z.string().min(1).optional(), fileName: z.string().min(1).max(180), contentType: z.string().min(1).max(100), contentBase64: z.string().min(1).max(7_000_000) });
const statusSchema = z.object({ status: z.enum(["DRAFT", "SUBMITTED", "APPROVED", "SUPERSEDED"]) });
const uploadsDirectory = path.resolve(process.cwd(), "uploads");
const routeId = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

documentsRouter.use(requireAuth);

documentsRouter.get("/", async (request, response) => {
  const documents = await db.document.findMany({ where: { organizationId: request.auth!.organizationId, OR: [{ projectId: null }, projectScope(request)] }, include: { project: { select: { name: true, code: true } }, projectSite: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 100 });
  response.json({ documents });
});

documentsRouter.post("/", allowRoles("SUPER_ADMIN", "COMPANY_OWNER", "PROJECT_MANAGER", "SITE_ENGINEER", "SITE_SUPERVISOR", "PURCHASE_MANAGER", "ACCOUNTS_MANAGER"), async (request, response) => {
  const input = uploadSchema.parse(request.body); const organizationId = request.auth!.organizationId;
  const [project, site] = await Promise.all([input.projectId ? db.project.findFirst({ where: { id: input.projectId, organizationId, ...projectScope(request, "id") } }) : null, input.projectSiteId ? db.projectSite.findFirst({ where: { id: input.projectSiteId, organizationId, project: projectScope(request, "id") } }) : null]);
  if ((input.projectId && !project) || (input.projectSiteId && (!site || (project && site.projectId !== project.id)))) return response.status(404).json({ error: "Project or site not found" });
  const buffer = Buffer.from(input.contentBase64, "base64"); if (!buffer.length || buffer.length > 5 * 1024 * 1024) return response.status(422).json({ error: "Files must be smaller than 5 MB" });
  const extension = path.extname(input.fileName).replace(/[^.a-zA-Z0-9]/g, "").slice(0, 12); const storageKey = `${organizationId}-${randomUUID()}${extension}`; await mkdir(uploadsDirectory, { recursive: true }); await writeFile(path.join(uploadsDirectory, storageKey), buffer);
  const parent = input.parentDocumentId ? await db.document.findFirst({ where: { id: input.parentDocumentId, organizationId } }) : null; if (input.parentDocumentId && !parent) return response.status(404).json({ error: "Original document not found" });
  const document = await db.$transaction(async transaction => { if (parent) await transaction.document.update({ where: { id: parent.id }, data: { status: "SUPERSEDED" } }); return transaction.document.create({ data: { title: input.title, category: input.category, projectId: input.projectId, projectSiteId: input.projectSiteId, parentDocumentId: parent?.id, version: parent ? parent.version + 1 : 1, fileName: path.basename(input.fileName), contentType: input.contentType, size: buffer.length, storageKey, organizationId } }); }); response.status(201).json({ document });
});

documentsRouter.patch("/:documentId/status", allowRoles("SUPER_ADMIN", "COMPANY_OWNER", "PROJECT_MANAGER"), async (request, response) => { const documentId = routeId(request.params.documentId); const input = statusSchema.parse(request.body); const result = await db.document.updateMany({ where: { id: documentId, organizationId: request.auth!.organizationId, OR: [{ projectId: null }, projectScope(request)] }, data: { status: input.status } }); if (!result.count) return response.status(404).json({ error: "Document not found" }); response.json({ ok: true }); });

documentsRouter.get("/:documentId/file", async (request, response) => {
  const documentId = routeId(request.params.documentId); const document = await db.document.findFirst({ where: { id: documentId, organizationId: request.auth!.organizationId, OR: [{ projectId: null }, projectScope(request)] } }); if (!document) return response.status(404).json({ error: "Document not found" }); response.type(document.contentType); response.sendFile(path.join(uploadsDirectory, document.storageKey));
});
