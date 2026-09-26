import { Router } from "express";
import { db } from "../db.js";
import { projectScope, requireAuth } from "../middleware/auth.js";

export const reportsRouter = Router();
const number = (value: unknown) => Number(value ?? 0);
reportsRouter.use(requireAuth);

reportsRouter.get("/", async (request, response) => {
  if (!["SUPER_ADMIN", "COMPANY_OWNER", "PROJECT_MANAGER", "ACCOUNTS_MANAGER"].includes(request.auth!.role)) return response.status(403).json({ error: "Management reports are not available for your role" });
  const organizationId = request.auth!.organizationId;
  const [projects, materials] = await Promise.all([
    db.project.findMany({ where: { organizationId, ...projectScope(request, "id") }, include: { boqs: { include: { items: { include: { progressEntries: true } } } }, expenses: true, clientBills: { include: { payments: true } }, siteIssues: { where: { status: { not: "RESOLVED" } } }, scheduleTasks: true, inspections: { where: { status: { not: "VERIFIED" } } } } }),
    db.material.findMany({ where: { organizationId }, include: { inventoryTransactions: { where: { projectSite: { project: projectScope(request, "id") } } } } })
  ]);
  const projectReports = projects.map(project => {
    const items = project.boqs.flatMap(boq => boq.items);
    const budget = items.reduce((total, item) => total + number(item.quantity) * number(item.rate), 0);
    const expense = project.expenses.filter(item => item.status === "APPROVED" || item.status === "PAID").reduce((total, item) => total + number(item.amount), 0);
    const billed = project.clientBills.reduce((total, bill) => total + number(bill.amount), 0);
    const paid = project.clientBills.reduce((total, bill) => total + bill.payments.reduce((sum, payment) => sum + number(payment.amount), 0), 0);
    const progressItems = items.filter(item => number(item.quantity) > 0 && item.progressEntries.length > 0);
    const progress = progressItems.length ? progressItems.reduce((total, item) => total + Math.min(1, number(item.progressEntries.reduce((sum, entry) => sum + number(entry.completedQuantity), 0)) / number(item.quantity)), 0) / progressItems.length * 100 : 0;
    const delayedTasks = project.scheduleTasks.filter(task => task.status === "DELAYED").length;
    const highRisks = project.siteIssues.filter(issue => issue.severity === "HIGH" || issue.severity === "CRITICAL").length + project.inspections.filter(inspection => inspection.severity === "HIGH" || inspection.severity === "CRITICAL").length;
    const status = highRisks > 0 || delayedTasks > 0 || (budget > 0 && expense > budget) ? "AT_RISK" : progress >= 70 ? "ON_TRACK" : "WATCH";
    return { name: project.name, code: project.code, budget, expense, billed, paid, outstanding: Math.max(billed - paid, 0), progress: Math.round(progress), delayedTasks, highRisks, status };
  });
  const materialReports = materials.map(material => ({ name: material.name, sku: material.sku, unit: material.unit, available: material.inventoryTransactions.reduce((total, transaction) => total + (transaction.type === "ISSUE" ? -number(transaction.quantity) : number(transaction.quantity)), 0), minimum: number(material.minimumStock) }));
  const totalBudget = projectReports.reduce((total, project) => total + project.budget, 0);
  const totalExpense = projectReports.reduce((total, project) => total + project.expense, 0);
  const totalOutstanding = projectReports.reduce((total, project) => total + project.outstanding, 0);
  response.json({ generatedAt: new Date(), summary: { activeProjects: projects.filter(project => project.status === "ACTIVE").length, totalBudget, totalExpense, totalOutstanding, delayedTasks: projectReports.reduce((total, project) => total + project.delayedTasks, 0), highRisks: projectReports.reduce((total, project) => total + project.highRisks, 0), atRiskProjects: projectReports.filter(project => project.status === "AT_RISK").length }, projects: projectReports, materials: materialReports });
});
