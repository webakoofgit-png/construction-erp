import { Router } from "express";
import { db } from "../db.js";
import { projectScope, requireAuth } from "../middleware/auth.js";

export const notificationsRouter = Router();
const number = (value: unknown) => Number(value ?? 0);
const stockFor = (transactions: { type: string; quantity: unknown }[]) => transactions.reduce((total, transaction) => total + (transaction.type === "ISSUE" ? -number(transaction.quantity) : number(transaction.quantity)), 0);
const priority = (level: string) => ({ critical: 0, warning: 1, info: 2 }[level] ?? 3);
const financeRoles = ["SUPER_ADMIN", "COMPANY_OWNER", "PROJECT_MANAGER", "ACCOUNTS_MANAGER"];
const approvalRoles = ["SUPER_ADMIN", "COMPANY_OWNER", "PROJECT_MANAGER", "ACCOUNTS_MANAGER", "PURCHASE_MANAGER"];

notificationsRouter.use(requireAuth);

notificationsRouter.get("/", async (request, response) => {
  const organizationId = request.auth!.organizationId;
  const canSeeFinance = financeRoles.includes(request.auth!.role);
  const canReviewApprovals = approvalRoles.includes(request.auth!.role);
  const canManageApprovalQueue = ["SUPER_ADMIN", "COMPANY_OWNER", "PROJECT_MANAGER"].includes(request.auth!.role);
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(23, 59, 59, 999);
  const [materials, purchaseRequests, reports, issues, maintenance, bills, approvalAssignments] = await Promise.all([
    db.material.findMany({ where: { organizationId }, include: { inventoryTransactions: { where: { projectSite: { project: projectScope(request, "id") } } } } }),
    db.purchaseRequest.findMany({ where: { organizationId, status: { in: ["SUBMITTED", "APPROVED"] }, ...projectScope(request) }, include: { project: { select: { name: true } } }, orderBy: { createdAt: "asc" }, take: 20 }),
    db.dailyProgressReport.findMany({ where: { organizationId, status: "SUBMITTED", ...projectScope(request) }, include: { project: { select: { name: true } }, projectSite: { select: { name: true } } }, orderBy: { reportDate: "asc" }, take: 20 }),
    db.siteIssue.findMany({ where: { organizationId, status: { not: "RESOLVED" }, ...projectScope(request) }, include: { project: { select: { name: true } }, projectSite: { select: { name: true } } }, orderBy: { updatedAt: "desc" }, take: 30 }),
    db.equipmentMaintenance.findMany({ where: { organizationId, status: { not: "COMPLETED" }, ...(request.auth!.projectIds === null ? {} : { equipment: { assignments: { some: { ...projectScope(request) } } } }) }, include: { equipment: { select: { name: true, assetCode: true } } }, orderBy: { scheduledDate: "asc" }, take: 20 }),
    canSeeFinance ? db.clientBill.findMany({ where: { organizationId, ...projectScope(request) }, include: { project: { select: { name: true } }, payments: true, followUps: { orderBy: { updatedAt: "desc" }, take: 1 } }, orderBy: { dueDate: "asc" }, take: 50 }) : Promise.resolve([]),
    canReviewApprovals ? db.approvalAssignment.findMany({ where: { organizationId, dueDate: { not: null, lte: tomorrow }, ...(canManageApprovalQueue ? {} : { assigneeId: request.auth!.userId }) }, include: { assignee: { select: { name: true } } } }) : Promise.resolve([])
  ]);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const notifications = [
    ...materials.map(material => ({ available: stockFor(material.inventoryTransactions), minimum: number(material.minimumStock), material })).filter(item => item.available < item.minimum).map(item => ({ id: `stock-${item.material.id}`, level: "warning", category: "Inventory", title: `${item.material.name} is below minimum stock`, detail: `${item.available.toLocaleString("en-IN")} ${item.material.unit} available; minimum is ${item.minimum.toLocaleString("en-IN")} ${item.material.unit}.`, action: "Review inventory", to: "/inventory" })),
    ...purchaseRequests.map(item => ({ id: `pr-${item.id}`, level: item.status === "SUBMITTED" ? "warning" : "info", category: "Procurement", title: `${item.requestNumber} is ${item.status.toLowerCase()}`, detail: `${item.project.name} · purchase request needs the next workflow action.`, action: "Review procurement", to: "/procurement" })),
    ...reports.map(item => ({ id: `dpr-${item.id}`, level: "info", category: "Site progress", title: `${item.reportNumber} awaits review`, detail: `${item.project.name} · ${item.projectSite.name} · ${item.reportDate.toLocaleDateString("en-IN")}.`, action: "Review report", to: "/progress" })),
    ...issues.map(item => ({ id: `issue-${item.id}`, level: item.severity === "CRITICAL" || item.severity === "HIGH" ? "critical" : "warning", category: "Site risk", title: item.title, detail: `${item.project.name} · ${item.projectSite.name} · ${item.severity.toLowerCase()} priority.`, action: "Review site issue", to: "/progress" })),
    ...maintenance.map(item => ({ id: `maintenance-${item.id}`, level: item.scheduledDate <= today ? "warning" : "info", category: "Machinery", title: `${item.equipment.name} needs maintenance`, detail: `${item.title} · scheduled ${item.scheduledDate.toLocaleDateString("en-IN")}.`, action: "View machinery", to: "/machinery" })),
    ...bills.map(item => ({ outstanding: number(item.amount) - item.payments.reduce((total, payment) => total + number(payment.amount), 0), bill: item })).filter(item => item.outstanding > 0 && item.bill.dueDate && item.bill.dueDate < today).map(item => ({ id: `bill-${item.bill.id}`, level: "critical", category: "Collections", title: `${item.bill.billNumber} payment is overdue`, detail: `${item.bill.project.name} · ₹${Math.round(item.outstanding).toLocaleString("en-IN")} remains outstanding.`, action: "Open collections", to: "/collections" })),
    ...bills.filter(item => item.followUps[0]?.nextFollowUpAt && item.followUps[0].nextFollowUpAt < today && item.followUps[0].status !== "PAID").map(item => ({ id: `collection-followup-${item.id}`, level: "critical", category: "Collections", title: `${item.billNumber} follow-up was missed`, detail: `${item.project.name} · ${item.followUps[0].ownerName} · escalate the collection action.`, action: "Open collections", to: "/collections" })),
    ...approvalAssignments.map(item => ({ id: `approval-${item.id}`, level: item.dueDate! < today ? "critical" : "warning", category: "Approval workflow", title: `${item.entityType.replaceAll("_", " ")} ${item.dueDate! < today ? "is overdue" : "is due soon"}`, detail: `${item.assignee?.name ?? "Unassigned"} · due ${item.dueDate!.toLocaleDateString("en-IN")}.`, action: "Open approvals", to: "/approvals" }))
  ].sort((left, right) => priority(left.level) - priority(right.level));
  response.json({ notifications, summary: { critical: notifications.filter(item => item.level === "critical").length, warning: notifications.filter(item => item.level === "warning").length, info: notifications.filter(item => item.level === "info").length } });
});
