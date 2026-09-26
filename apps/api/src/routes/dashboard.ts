import { Router } from "express";
import { db } from "../db.js";
import { projectScope, requireAuth } from "../middleware/auth.js";

export const dashboardRouter = Router();
const numeric = (value: unknown) => Number(value ?? 0);
const stockFor = (transactions: { type: string; quantity: unknown }[]) => transactions.reduce((total, transaction) => total + (transaction.type === "ISSUE" ? -numeric(transaction.quantity) : numeric(transaction.quantity)), 0);

dashboardRouter.use(requireAuth);

dashboardRouter.get("/", async (request, response) => {
  const organizationId = request.auth!.organizationId;
  const canSeeFinance = ["SUPER_ADMIN", "COMPANY_OWNER", "PROJECT_MANAGER", "ACCOUNTS_MANAGER"].includes(request.auth!.role);
  const [projects, materials, issues, bills, purchaseRequests, reports, tasks, workPlans, inspections] = await Promise.all([
    db.project.findMany({ where: { organizationId, ...projectScope(request, "id") }, include: { boqs: { include: { items: { include: { progressEntries: true } } } }, expenses: true, contractorBills: true, siteIssues: { where: { status: { not: "RESOLVED" } } }, tasks: { where: { status: { not: "COMPLETED" } } }, scheduleTasks: true }, orderBy: { updatedAt: "desc" } }),
    db.material.findMany({ where: { organizationId }, include: { inventoryTransactions: { where: { projectSite: { project: projectScope(request, "id") } } } } }),
    db.siteIssue.findMany({ where: { organizationId, status: { not: "RESOLVED" }, ...projectScope(request) }, include: { project: { select: { name: true } } }, orderBy: { updatedAt: "desc" }, take: 5 }),
    canSeeFinance ? db.clientBill.findMany({ where: { organizationId, ...projectScope(request) }, include: { project: { select: { name: true } }, payments: true }, take: 100 }) : Promise.resolve([]),
    db.purchaseRequest.findMany({ where: { organizationId, status: { in: ["SUBMITTED", "APPROVED"] }, ...projectScope(request) }, take: 100 }),
    db.dailyProgressReport.findMany({ where: { organizationId, status: "SUBMITTED", ...projectScope(request) }, take: 100 }),
    db.projectTask.findMany({ where: { organizationId, status: { not: "COMPLETED" }, project: projectScope(request, "id") }, include: { project: { select: { name: true } } }, take: 100 }),
    db.dailyWorkPlan.findMany({ where: { organizationId, status: { in: ["PLANNED", "IN_PROGRESS", "BLOCKED"] }, project: projectScope(request, "id") }, take: 100 }),
    db.siteInspection.findMany({ where: { organizationId, status: { not: "VERIFIED" }, project: projectScope(request, "id") }, include: { project: { select: { name: true } } }, take: 100 })
  ]);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const lowStock = materials.filter(material => stockFor(material.inventoryTransactions) < numeric(material.minimumStock));
  const overdueTasks = tasks.filter(task => task.dueDate && task.dueDate < today);
  const overdueBills = bills.map(bill => ({ bill, outstanding: numeric(bill.amount) - bill.payments.reduce((total, payment) => total + numeric(payment.amount), 0) })).filter(item => item.outstanding > 0 && item.bill.dueDate && item.bill.dueDate < today);
  const projectCards = projects.map(project => {
    const activeBoqs = project.boqs.filter(boq => boq.status === "ACTIVE"); const items = (activeBoqs.length ? activeBoqs : project.boqs).flatMap(boq => boq.items);
    const budget = items.reduce((total, item) => total + numeric(item.quantity) * numeric(item.rate), 0);
    const recordedCost = project.expenses.filter(expense => expense.status === "APPROVED" || expense.status === "PAID").reduce((total, expense) => total + numeric(expense.amount), 0) + project.contractorBills.filter(bill => bill.status === "VERIFIED" || bill.status === "PAID").reduce((total, bill) => total + numeric(bill.amount), 0);
    const progressItems = items.filter(item => item.progressEntries.length > 0 && numeric(item.quantity) > 0); const progress = progressItems.length ? progressItems.reduce((total, item) => total + Math.min(1, numeric(item.progressEntries.reduce((sum, entry) => sum + numeric(entry.completedQuantity), 0)) / numeric(item.quantity)), 0) / progressItems.length * 100 : 0;
    const projectOverdueTasks = project.tasks.filter(task => task.dueDate && task.dueDate < today);
    const highRiskIssues = project.siteIssues.filter(issue => issue.severity === "HIGH" || issue.severity === "CRITICAL");
    const delayedScheduleTasks = project.scheduleTasks.filter(task => task.status === "DELAYED");
    const healthFactors = [
      ...(budget > 0 && recordedCost > budget ? ["Cost is above approved budget"] : []),
      ...highRiskIssues.map(issue => `${issue.severity.toLowerCase()} site risk: ${issue.title}`),
      ...projectOverdueTasks.map(task => `Overdue action: ${task.title}`),
      ...delayedScheduleTasks.map(task => `Schedule delayed: ${task.title}`)
    ];
    const health = Math.max(25, 100 - (budget > 0 && recordedCost > budget ? 20 : 0) - highRiskIssues.length * 15 - project.siteIssues.length * 4 - projectOverdueTasks.length * 10 - delayedScheduleTasks.length * 10);
    const healthStatus = health >= 80 ? "GOOD" : health >= 60 ? "WATCH" : "AT_RISK";
    return { id: project.id, name: project.name, code: project.code, status: project.status, budget, recordedCost, progress: Math.round(progress), health: Math.round(health), healthStatus, healthFactors: healthFactors.slice(0, 3) };
  });
  const totalBudget = projectCards.reduce((total, project) => total + project.budget, 0); const totalCost = projectCards.reduce((total, project) => total + project.recordedCost, 0); const healthScore = Math.max(25, Math.min(100, 100 - lowStock.length * 5 - overdueBills.length * 12 - issues.filter(issue => issue.severity === "HIGH" || issue.severity === "CRITICAL").length * 10 - overdueTasks.length * 5 - inspections.filter(item => item.severity === "CRITICAL").length * 8));
  const alerts = [
    ...overdueBills.slice(0, 3).map(item => ({ level: "critical", title: "Client payment overdue", detail: `₹${Math.round(item.outstanding).toLocaleString("en-IN")} · ${item.bill.project.name}` })),
    ...lowStock.slice(0, 3).map(item => ({ level: "warning", title: `${item.name} below minimum stock`, detail: `${stockFor(item.inventoryTransactions).toLocaleString("en-IN")} ${item.unit} available` })),
    ...overdueTasks.slice(0, 3).map(item => ({ level: "critical", title: "Project action overdue", detail: `${item.title} · ${item.project.name}` })),
    ...inspections.filter(item => item.severity === "HIGH" || item.severity === "CRITICAL").slice(0, 2).map(item => ({ level: "critical", title: "Safety verification needed", detail: `${item.title} · ${item.project.name}` })),
    ...issues.slice(0, 3).map(item => ({ level: item.severity === "HIGH" || item.severity === "CRITICAL" ? "critical" : "warning", title: item.title, detail: `${item.project.name} · ${item.severity.toLowerCase()} priority` }))
  ].slice(0, 6);
  response.json({ portfolio: { activeProjects: projects.filter(project => project.status === "ACTIVE").length, totalBudget: canSeeFinance ? totalBudget : null, totalCost: canSeeFinance ? totalCost : null, budgetUsed: canSeeFinance && totalBudget ? (totalCost / totalBudget) * 100 : null, healthScore, overdueCollections: canSeeFinance ? overdueBills.reduce((total, item) => total + item.outstanding, 0) : null, openActions: lowStock.length + issues.length + overdueBills.length + purchaseRequests.length + reports.length + tasks.length + inspections.length }, projects: projectCards.map(project => canSeeFinance ? project : { ...project, budget: null, recordedCost: null }), alerts, actions: { lowStock: lowStock.length, purchaseRequests: purchaseRequests.length, reports: reports.length, risks: issues.length, tasks: tasks.length, workPlans: workPlans.length } });
});
