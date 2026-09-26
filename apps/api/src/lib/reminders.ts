import { db } from "../db.js";
import { sendEmail } from "./email.js";

export async function sendDailyReminders() {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const [overdueApprovals, overdueQueries] = await Promise.all([
    db.approvalAssignment.findMany({ where: { dueDate: { not: null, lt: today } }, include: { assignee: { select: { email: true, name: true } } } }),
    db.clientQuery.findMany({ where: { dueDate: { not: null, lt: today }, status: { not: "RESOLVED" } } })
  ]);
  await Promise.all(overdueApprovals.filter(item => item.assignee).map(item => sendEmail({ to: item.assignee!.email, subject: "Overdue approval reminder", text: `Your ${item.entityType.replaceAll("_", " ")} approval is overdue. Please open Kravient Build and complete the review.` })));
  for (const organizationId of [...new Set(overdueQueries.map(query => query.organizationId))]) { const count = overdueQueries.filter(query => query.organizationId === organizationId).length; const managers = await db.membership.findMany({ where: { organizationId, role: { in: ["SUPER_ADMIN", "COMPANY_OWNER", "PROJECT_MANAGER"] } }, include: { user: { select: { email: true } } } }); await Promise.all(managers.map(manager => sendEmail({ to: manager.user.email, subject: "Overdue client query escalation", text: `${count} client quer${count === 1 ? "y is" : "ies are"} overdue and need management attention.` }))); }
  return { overdueApprovals: overdueApprovals.length, overdueQueries: overdueQueries.length };
}
