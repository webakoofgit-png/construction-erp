import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { projectScope, requireAuth } from "../middleware/auth.js";

export const copilotRouter = Router();
const questionSchema = z.object({ question: z.string().trim().min(3).max(500) });
const money = (value: number) => `₹${Math.round(value).toLocaleString("en-IN")}`;
const numeric = (value: unknown) => Number(value ?? 0);
const stockFor = (transactions: { type: string; quantity: unknown }[]) => transactions.reduce((total, transaction) => total + (transaction.type === "ISSUE" ? -numeric(transaction.quantity) : numeric(transaction.quantity)), 0);
const financialKeywords = /budget|cost|profit|margin|payment|bill|due|receivable|cash|expense/;

copilotRouter.use(requireAuth);

copilotRouter.post("/ask", async (request, response) => {
  const { question } = questionSchema.parse(request.body);
  const text = question.toLowerCase();
  const organizationId = request.auth!.organizationId;
  const financialAccess = !["CONTRACTOR", "CLIENT", "VIEWER"].includes(request.auth!.role);

  if (!financialAccess && financialKeywords.test(text)) return response.json({ answer: "Your current role does not have access to company financial data. Ask a workspace owner or Accounts Manager for the relevant financial summary.", insights: [], sources: [] });

  const [projects, materials, bills, reports, issues] = await Promise.all([
    db.project.findMany({ where: { organizationId, ...projectScope(request, "id") }, include: { boqs: { include: { items: true } }, expenses: true, contractorBills: true } }),
    db.material.findMany({ where: { organizationId }, include: { inventoryTransactions: { where: { projectSite: { project: projectScope(request, "id") } } } }, orderBy: { name: "asc" } }),
    db.clientBill.findMany({ where: { organizationId, ...projectScope(request) }, include: { project: { select: { name: true } }, payments: true }, orderBy: { dueDate: "asc" } }),
    db.dailyProgressReport.findMany({ where: { organizationId, ...projectScope(request) }, include: { project: { select: { name: true } }, projectSite: { select: { name: true } } }, orderBy: [{ reportDate: "desc" }, { createdAt: "desc" }], take: 3 }),
    db.siteIssue.findMany({ where: { organizationId, status: { not: "RESOLVED" }, ...projectScope(request) }, include: { project: { select: { name: true } }, projectSite: { select: { name: true } } }, orderBy: { updatedAt: "desc" }, take: 8 })
  ]);

  const lowStock = materials.map(material => ({ name: material.name, unit: material.unit, available: stockFor(material.inventoryTransactions), minimum: numeric(material.minimumStock) })).filter(material => material.available < material.minimum);
  const outstandingBills = bills.map(bill => ({ project: bill.project.name, number: bill.billNumber, outstanding: numeric(bill.amount) - bill.payments.reduce((total, payment) => total + numeric(payment.amount), 0) })).filter(bill => bill.outstanding > 0);

  if (/material|stock|inventory|order|purchase/.test(text)) {
    const insights = lowStock.map(material => `${material.name}: ${material.available.toLocaleString("en-IN")} ${material.unit} available, below its ${material.minimum.toLocaleString("en-IN")} ${material.unit} minimum.`);
    return response.json({ answer: insights.length ? `I found ${insights.length} material${insights.length === 1 ? "" : "s"} below the configured minimum stock level. Create or review a purchase request before the next site requirement.` : "All tracked materials are at or above their configured minimum stock levels.", insights, sources: ["Materials & Inventory"] });
  }

  if (/progress|dpr|site|work|delay|issue|risk/.test(text)) {
    const report = reports[0];
    const insights = [
      ...(report ? [`Latest DPR · ${report.project.name}, ${report.projectSite.name}: ${report.summary}`] : ["No daily progress report has been submitted yet."]),
      ...issues.slice(0, 4).map(issue => `${issue.severity} · ${issue.project.name}: ${issue.title}`)
    ];
    return response.json({ answer: issues.length ? `There are ${issues.length} open site issue${issues.length === 1 ? "" : "s"}. The most recent progress and highest-priority risks are listed below.` : "No open site issues are recorded. Here is the latest daily progress update.", insights, sources: ["Daily Progress Reports", "Site Issues"] });
  }

  if (/payment|bill|due|receivable|cash|collection/.test(text)) {
    const totalOutstanding = outstandingBills.reduce((total, bill) => total + bill.outstanding, 0);
    return response.json({ answer: outstandingBills.length ? `${money(totalOutstanding)} remains outstanding across ${outstandingBills.length} client bill${outstandingBills.length === 1 ? "" : "s"}. Prioritise follow-up on the largest amounts first.` : "There are no outstanding amounts on the recorded client bills.", insights: outstandingBills.sort((left, right) => right.outstanding - left.outstanding).slice(0, 5).map(bill => `${bill.project} · ${bill.number}: ${money(bill.outstanding)} outstanding`), sources: ["Client Billing", "Payments"] });
  }

  if (/budget|cost|profit|margin|expense/.test(text)) {
    const insights = projects.map(project => {
      const activeBoqs = project.boqs.filter(boq => boq.status === "ACTIVE");
      const items = (activeBoqs.length ? activeBoqs : project.boqs).flatMap(boq => boq.items);
      const budget = items.reduce((total, item) => total + numeric(item.quantity) * numeric(item.rate), 0);
      const expenses = project.expenses.filter(expense => expense.status === "APPROVED" || expense.status === "PAID").reduce((total, expense) => total + numeric(expense.amount), 0);
      const contractorCost = project.contractorBills.filter(bill => bill.status === "VERIFIED" || bill.status === "PAID").reduce((total, bill) => total + numeric(bill.amount), 0);
      return `${project.name}: BOQ budget ${money(budget)}; recorded approved expense and contractor cost ${money(expenses + contractorCost)}.`;
    });
    return response.json({ answer: insights.length ? "Here is the current cost position from approved financial records. Open Analytics for the complete profitability forecast and cash-flow view." : "Create a project and an active BOQ before cost analytics can be calculated.", insights, sources: ["BOQ & Budget", "Expenses", "Contractor Bills", "Analytics"] });
  }

  return response.json({ answer: "I can help you understand construction operations using the records in this workspace. Try one of the suggested questions below.", insights: ["Which materials need ordering this week?", "Show overdue client payments.", "Summarise site progress and risks.", "What is the budget and cost position?"], sources: ["Kravient Build workspace"] });
});
