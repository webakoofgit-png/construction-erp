import { Router } from "express";
import { db } from "../db.js";
import { projectScope, requireAuth } from "../middleware/auth.js";

export const analyticsRouter = Router();
const asNumber = (value: unknown) => Number(value ?? 0);
const sum = (values: unknown[]): number => values.reduce<number>((total, value) => total + asNumber(value), 0);

analyticsRouter.use(requireAuth);

analyticsRouter.get("/profitability", async (request, response) => {
  if (!["SUPER_ADMIN", "COMPANY_OWNER", "PROJECT_MANAGER", "ACCOUNTS_MANAGER"].includes(request.auth!.role)) return response.status(403).json({ error: "Financial analytics are not available for your role" });
  const projects = await db.project.findMany({
    where: { organizationId: request.auth!.organizationId, ...projectScope(request, "id") },
    orderBy: { updatedAt: "desc" },
    include: {
      boqs: { include: { items: true } },
      expenses: true,
      contractorBills: true,
      purchaseOrders: { include: { items: true, goodsReceipts: { include: { items: true } } } },
      billingMilestones: true,
      clientBills: { include: { payments: true } },
      sites: { include: { attendanceRecords: { include: { worker: true } }, siteIssues: { where: { status: { not: "RESOLVED" } } } } }
    }
  });

  const projectHealth = projects.map(project => {
    const activeBoqs = project.boqs.filter(boq => boq.status === "ACTIVE");
    const budgetItems = (activeBoqs.length ? activeBoqs : project.boqs).flatMap(boq => boq.items);
    const budget = sum(budgetItems.map(item => asNumber(item.quantity) * asNumber(item.rate)));
    const committedCost = sum(project.purchaseOrders.filter(order => order.status !== "CANCELLED").flatMap(order => order.items.map(item => asNumber(item.orderedQuantity) * asNumber(item.unitPrice))));
    const materialCost = sum(project.purchaseOrders.flatMap(order => order.goodsReceipts.flatMap(receipt => receipt.items.map(item => asNumber(item.receivedQuantity) * asNumber(item.unitCost)))));
    const directExpenses = sum(project.expenses.filter(expense => expense.status === "APPROVED" || expense.status === "PAID").map(expense => expense.amount));
    const contractorCost = sum(project.contractorBills.filter(bill => bill.status === "VERIFIED" || bill.status === "PAID").map(bill => bill.amount));
    const labourCost = sum(project.sites.flatMap(site => site.attendanceRecords.map(record => {
      const dayFactor = record.status === "PRESENT" ? 1 : record.status === "HALF_DAY" ? 0.5 : 0;
      return asNumber(record.worker.dailyWage) * dayFactor + (asNumber(record.worker.dailyWage) / 8) * asNumber(record.overtimeHours);
    })));
    const actualCost = materialCost + directExpenses + contractorCost + labourCost;
    const unreceivedCommitment = Math.max(committedCost - materialCost, 0);
    const forecastCost = Math.max(budget, actualCost + unreceivedCommitment);
    const plannedRevenue = Math.max(asNumber(project.contractValue), sum(project.billingMilestones.map(milestone => milestone.amount)));
    const billed = sum(project.clientBills.map(bill => bill.amount));
    const paymentsReceived = sum(project.clientBills.flatMap(bill => bill.payments.map(payment => payment.amount)));
    const outstandingReceivables = Math.max(billed - paymentsReceived, 0);
    const expectedProfit = plannedRevenue - forecastCost;
    const profitMargin = plannedRevenue > 0 ? (expectedProfit / plannedRevenue) * 100 : null;
    const budgetVariance = budget > 0 ? ((actualCost - budget) / budget) * 100 : null;
    const categoryTotals = budgetItems.reduce<Record<string, number>>((result, item) => {
      const name = item.category || "Uncategorised";
      result[name] = (result[name] ?? 0) + asNumber(item.quantity) * asNumber(item.rate);
      return result;
    }, {});
    const categories = (Object.entries(categoryTotals) as [string, number][]).map(([name, amount]) => ({ name, amount, share: budget ? (amount / budget) * 100 : 0 })).sort((left, right) => right.amount - left.amount);
    const warnings = [
      ...(budgetVariance !== null && budgetVariance > 5 ? [{ level: "warning", message: `Actual cost is ${budgetVariance.toFixed(1)}% above the BOQ budget.` }] : []),
      ...(plannedRevenue === 0 ? [{ level: "warning", message: "Add a contract value or billing milestone to forecast profit." }] : []),
      ...(profitMargin !== null && profitMargin < 10 ? [{ level: "warning", message: `Forecast margin is ${profitMargin.toFixed(1)}%, below the 10% guardrail.` }] : []),
      ...(outstandingReceivables > 0 ? [{ level: "info", message: `₹${Math.round(outstandingReceivables).toLocaleString("en-IN")} remains uncollected from client bills.` }] : []),
      ...project.sites.flatMap(site => site.siteIssues.map(issue => ({ level: issue.severity === "HIGH" || issue.severity === "CRITICAL" ? "critical" : "info", message: `${issue.severity.toLowerCase()} site issue: ${issue.title}` })))
    ];
    return { id: project.id, name: project.name, code: project.code, budget, actualCost, committedCost, forecastCost, plannedRevenue, billed, paymentsReceived, outstandingReceivables, expectedProfit, profitMargin, budgetVariance, categories, warnings };
  });

  const total = (selector: (project: (typeof projectHealth)[number]) => number) => projectHealth.reduce((runningTotal, project) => runningTotal + selector(project), 0);
  response.json({
    portfolio: {
      budget: total(project => project.budget), actualCost: total(project => project.actualCost), committedCost: total(project => project.committedCost), plannedRevenue: total(project => project.plannedRevenue), billed: total(project => project.billed), paymentsReceived: total(project => project.paymentsReceived), outstandingReceivables: total(project => project.outstandingReceivables), expectedProfit: total(project => project.expectedProfit)
    },
    projects: projectHealth
  });
});
