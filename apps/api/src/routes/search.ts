import { Router } from "express";
import { db } from "../db.js";
import { projectScope, requireAuth } from "../middleware/auth.js";

export const searchRouter = Router();
searchRouter.use(requireAuth);

searchRouter.get("/", async (request, response) => {
  const query = typeof request.query.q === "string" ? request.query.q.trim() : "";
  if (query.length < 2) return response.json({ results: [] });
  const organizationId = request.auth!.organizationId; const contains = { contains: query, mode: "insensitive" as const }; const scopedProject = projectScope(request, "id"); const canReadFinancials = ["SUPER_ADMIN", "COMPANY_OWNER", "PROJECT_MANAGER", "ACCOUNTS_MANAGER"].includes(request.auth!.role);
  const [projects, sites, materials, tasks, boqs, requests, reports, expenses, bills, contractors, workers, equipment, documents, schedules, inspections] = await Promise.all([
    db.project.findMany({ where: { organizationId, ...scopedProject, OR: [{ name: contains }, { code: contains }] }, select: { id: true, name: true, code: true }, take: 5 }),
    db.projectSite.findMany({ where: { organizationId, project: scopedProject, OR: [{ name: contains }, { address: contains }] }, include: { project: { select: { id: true, name: true, code: true } } }, take: 5 }),
    db.material.findMany({ where: { organizationId, OR: [{ name: contains }, { sku: contains }] }, select: { id: true, name: true, sku: true }, take: 5 }),
    db.projectTask.findMany({ where: { organizationId, project: scopedProject, title: contains }, include: { project: { select: { name: true } } }, take: 5 }),
    db.boq.findMany({ where: { organizationId, project: scopedProject, name: contains }, include: { project: { select: { name: true } } }, take: 5 }),
    db.purchaseRequest.findMany({ where: { organizationId, project: scopedProject, OR: [{ requestNumber: contains }, { notes: contains }] }, include: { project: { select: { name: true } } }, take: 5 }),
    db.dailyProgressReport.findMany({ where: { organizationId, project: scopedProject, OR: [{ reportNumber: contains }, { summary: contains }] }, include: { project: { select: { name: true } } }, take: 5 }),
    db.expense.findMany({ where: { organizationId, project: scopedProject, OR: [{ expenseNumber: contains }, { description: contains }, { category: contains }] }, include: { project: { select: { name: true } } }, take: 5 }),
    db.clientBill.findMany({ where: { organizationId, project: scopedProject, billNumber: contains }, include: { project: { select: { name: true } } }, take: 5 }),
    db.contractor.findMany({ where: { organizationId, OR: [{ name: contains }, { specialty: contains }] }, select: { id: true, name: true, specialty: true }, take: 5 }),
    db.worker.findMany({ where: { organizationId, OR: [{ name: contains }, { trade: contains }] }, select: { id: true, name: true, trade: true }, take: 5 }),
    db.equipment.findMany({ where: { organizationId, OR: [{ name: contains }, { assetCode: contains }, { category: contains }] }, select: { id: true, name: true, assetCode: true }, take: 5 }),
    db.document.findMany({ where: { organizationId, OR: [{ title: contains }, { fileName: contains }] }, select: { id: true, title: true, category: true }, take: 5 }),
    db.scheduleTask.findMany({ where: { organizationId, project: scopedProject, title: contains }, include: { project: { select: { name: true } } }, take: 5 }),
    db.siteInspection.findMany({ where: { organizationId, project: scopedProject, OR: [{ title: contains }, { finding: contains }, { type: contains }] }, include: { project: { select: { name: true } } }, take: 5 })
  ]);
  const result = (id: string, title: string, subtitle: string, type: string, to: string) => ({ id, title, subtitle, type, to });
  response.json({ results: [
    ...projects.map(item => result(`project-${item.id}`, item.name, `${item.code} · Project`, "Project", `/projects/${item.id}`)), ...sites.map(item => result(`site-${item.id}`, item.name, `${item.project.code} · ${item.project.name}`, "Site", `/projects/${item.project.id}`)), ...materials.map(item => result(`material-${item.id}`, item.name, `${item.sku} · Material`, "Material", "/materials")), ...tasks.map(item => result(`task-${item.id}`, item.title, `${item.project.name} · Task`, "Task", "/tasks")), ...boqs.map(item => result(`boq-${item.id}`, item.name, `${item.project.name} · BOQ`, "BOQ", "/boq")), ...requests.map(item => result(`request-${item.id}`, item.requestNumber, `${item.project.name} · Purchase request`, "Procurement", "/procurement")), ...reports.map(item => result(`report-${item.id}`, item.reportNumber, `${item.project.name} · Daily report`, "Progress", "/progress")), ...(canReadFinancials ? [...expenses.map(item => result(`expense-${item.id}`, item.expenseNumber, `${item.project.name} · ${item.category}`, "Expense", "/expenses")), ...bills.map(item => result(`bill-${item.id}`, item.billNumber, `${item.project.name} · Client bill`, "Billing", "/client-billing"))] : []), ...contractors.map(item => result(`contractor-${item.id}`, item.name, item.specialty ?? "Contractor", "Contractor", "/contractors")), ...workers.map(item => result(`worker-${item.id}`, item.name, item.trade, "Labour", "/labour")), ...equipment.map(item => result(`equipment-${item.id}`, item.name, item.assetCode, "Machinery", "/machinery")), ...documents.map(item => result(`document-${item.id}`, item.title, item.category.replaceAll("_", " "), "Document", "/documents")), ...schedules.map(item => result(`schedule-${item.id}`, item.title, `${item.project.name} · Schedule task`, "Schedule", "/schedule")), ...inspections.map(item => result(`inspection-${item.id}`, item.title, `${item.project.name} · ${item.type}`, "Quality", "/quality"))
  ].slice(0, 40) });
});
