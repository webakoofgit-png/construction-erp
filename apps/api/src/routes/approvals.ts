import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { sendEmail } from "../lib/email.js";
import { allowRoles, requireAuth } from "../middleware/auth.js";

export const approvalsRouter = Router();
const approverRoles = ["SUPER_ADMIN", "COMPANY_OWNER", "PROJECT_MANAGER", "ACCOUNTS_MANAGER", "PURCHASE_MANAGER"] as const;
const decisionSchema = z.object({ entityType: z.enum(["PURCHASE_REQUEST", "EXPENSE", "CONTRACTOR_BILL", "DAILY_REPORT"]), entityId: z.string().min(1), decision: z.enum(["APPROVE", "REJECT"]), note: z.string().trim().max(300).optional() });
const assignmentSchema = z.object({ entityType: z.enum(["PURCHASE_REQUEST", "EXPENSE", "CONTRACTOR_BILL", "DAILY_REPORT"]), entityId: z.string().min(1), assigneeId: z.string().min(1).nullable(), dueDate: z.string().date().nullable() });
approvalsRouter.use(requireAuth);

approvalsRouter.get("/", allowRoles(...approverRoles), async (request, response) => {
  const organizationId = request.auth!.organizationId;
  const [requests, expenses, bills, reports, history, assignments, approvers] = await Promise.all([
    db.purchaseRequest.findMany({ where: { organizationId, status: "SUBMITTED" }, include: { project: { select: { name: true } } } }),
    db.expense.findMany({ where: { organizationId, status: "SUBMITTED" }, include: { project: { select: { name: true } } } }),
    db.contractorBill.findMany({ where: { organizationId, status: "SUBMITTED" }, include: { project: { select: { name: true } }, contractor: { select: { name: true } } } }),
    db.dailyProgressReport.findMany({ where: { organizationId, status: "SUBMITTED" }, include: { project: { select: { name: true } }, projectSite: { select: { name: true } }, media: true } }),
    db.approvalLog.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" }, take: 20 }),
    db.approvalAssignment.findMany({ where: { organizationId }, include: { assignee: { select: { id: true, name: true, email: true } } } }),
    db.membership.findMany({ where: { organizationId, role: { in: [...approverRoles] } }, include: { user: { select: { id: true, name: true, email: true } } } })
  ]);
  const actors = await db.user.findMany({ where: { id: { in: [...new Set(history.map(item => item.actorId))] } }, select: { id: true, name: true } }); const actorNames = new Map(actors.map(actor => [actor.id, actor.name]));
  const assignmentByEntity = new Map(assignments.map(item => [`${item.entityType}:${item.entityId}`, item]));
  const items = [...requests.map(item => ({ id: item.id, type: "PURCHASE_REQUEST", title: item.requestNumber, detail: `${item.project.name} · Purchase request`, createdAt: item.createdAt })), ...expenses.map(item => ({ id: item.id, type: "EXPENSE", title: item.expenseNumber, detail: `${item.project.name} · ₹${Number(item.amount).toLocaleString("en-IN")} · ${item.category}`, createdAt: item.createdAt })), ...bills.map(item => ({ id: item.id, type: "CONTRACTOR_BILL", title: item.billNumber, detail: `${item.project.name} · ${item.contractor.name} · ₹${Number(item.amount).toLocaleString("en-IN")}`, createdAt: item.createdAt })), ...reports.map(item => ({ id: item.id, type: "DAILY_REPORT", title: item.reportNumber, detail: `${item.project.name} · ${item.projectSite.name} · DPR review · ${item.media.length} photo${item.media.length === 1 ? "" : "s"}`, media: item.media, createdAt: item.createdAt }))].map(item => {
    const assignment = assignmentByEntity.get(`${item.type}:${item.id}`); const overdue = Boolean(assignment?.dueDate && assignment.dueDate < new Date());
    return { ...item, dueDate: assignment?.dueDate ?? null, assignee: assignment?.assignee ?? null, overdue };
  }).sort((first, second) => second.createdAt.getTime() - first.createdAt.getTime());
  const uniqueApprovers = [...new Map(approvers.map(item => [item.user.id, { ...item.user, role: item.role }])).values()];
  response.json({ items, approvers: uniqueApprovers, history: history.map(item => ({ id: item.id, entityType: item.entityType, decision: item.decision, note: item.note, actorName: actorNames.get(item.actorId) ?? "Former user", createdAt: item.createdAt })) });
});

approvalsRouter.post("/assignment", allowRoles(...approverRoles), async (request, response) => {
  const input = assignmentSchema.parse(request.body); const organizationId = request.auth!.organizationId;
  if (input.assigneeId) {
    const member = await db.membership.findFirst({ where: { organizationId, userId: input.assigneeId, role: { in: [...approverRoles] } } });
    if (!member) return response.status(400).json({ error: "Select an eligible approver in this workspace" });
  }
  const assignment = await db.approvalAssignment.upsert({ where: { organizationId_entityType_entityId: { organizationId, entityType: input.entityType, entityId: input.entityId } }, update: { assigneeId: input.assigneeId, dueDate: input.dueDate ? new Date(input.dueDate) : null }, create: { organizationId, entityType: input.entityType, entityId: input.entityId, assigneeId: input.assigneeId, dueDate: input.dueDate ? new Date(input.dueDate) : null }, include: { assignee: { select: { id: true, name: true, email: true } } } });
  if (assignment.assignee) await sendEmail({ to: assignment.assignee.email, subject: `Approval assigned · ${input.entityType.replaceAll("_", " ")}`, text: `You have been assigned an approval review.${assignment.dueDate ? `\n\nDue date: ${assignment.dueDate.toLocaleDateString("en-IN")}` : ""}\n\nOpen Kravient Build to review the item.` });
  const assignmentDueDate = assignment.dueDate;
  if (assignmentDueDate && assignmentDueDate < new Date()) {
    const escalationRecipients = await db.membership.findMany({ where: { organizationId, role: { in: ["SUPER_ADMIN", "COMPANY_OWNER", "PROJECT_MANAGER"] }, userId: { not: assignment.assigneeId ?? "" } }, include: { user: { select: { email: true } } } });
    await Promise.all(escalationRecipients.map(recipient => sendEmail({ to: recipient.user.email, subject: `Overdue approval escalation · ${input.entityType.replaceAll("_", " ")}`, text: `An approval is overdue.${assignment.assignee ? `\n\nAssigned reviewer: ${assignment.assignee.name}` : ""}\nDue date: ${assignmentDueDate.toLocaleDateString("en-IN")}\n\nOpen Kravient Build to review the item.` })));
  }
  response.json({ assignment });
});

approvalsRouter.post("/decision", allowRoles(...approverRoles), async (request, response) => {
  const input = decisionSchema.parse(request.body); const organizationId = request.auth!.organizationId; const approved = input.decision === "APPROVE"; let found = false;
  if (input.entityType === "PURCHASE_REQUEST") { const result = await db.purchaseRequest.updateMany({ where: { id: input.entityId, organizationId, status: "SUBMITTED" }, data: { status: approved ? "APPROVED" : "REJECTED" } }); found = result.count > 0; }
  else if (input.entityType === "EXPENSE") { const result = await db.expense.updateMany({ where: { id: input.entityId, organizationId, status: "SUBMITTED" }, data: { status: approved ? "APPROVED" : "REJECTED" } }); found = result.count > 0; }
  else if (input.entityType === "CONTRACTOR_BILL") { const result = await db.contractorBill.updateMany({ where: { id: input.entityId, organizationId, status: "SUBMITTED" }, data: { status: approved ? "VERIFIED" : "REJECTED" } }); found = result.count > 0; }
  else { const result = await db.dailyProgressReport.updateMany({ where: { id: input.entityId, organizationId, status: "SUBMITTED" }, data: { status: approved ? "APPROVED" : "REJECTED" } }); found = result.count > 0; }
  if (!found) return response.status(404).json({ error: "Approval item not found or already actioned" });
  await db.approvalAssignment.deleteMany({ where: { organizationId, entityType: input.entityType, entityId: input.entityId } });
  const log = await db.approvalLog.create({ data: { ...input, actorId: request.auth!.userId, organizationId } });
  const recipients = await db.membership.findMany({ where: { organizationId, role: { in: ["SUPER_ADMIN", "COMPANY_OWNER", "PROJECT_MANAGER"] }, userId: { not: request.auth!.userId } }, include: { user: { select: { email: true } } } });
  await Promise.all(recipients.map(recipient => sendEmail({ to: recipient.user.email, subject: `Approval ${approved ? "approved" : "rejected"} · ${input.entityType.replaceAll("_", " ")}`, text: `${input.entityType.replaceAll("_", " ")} was ${approved ? "approved" : "rejected"}.${input.note ? `\n\nDecision note: ${input.note}` : ""}` })));
  response.json({ ok: true, log });
});
