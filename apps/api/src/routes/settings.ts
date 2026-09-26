import { Router } from "express";
import { Role } from "@prisma/client";
import { z } from "zod";
import { db } from "../db.js";
import { hashPassword } from "../lib/passwords.js";
import { allowRoles, requireAuth } from "../middleware/auth.js";

export const settingsRouter = Router();
const roles = Object.values(Role) as [Role, ...Role[]];
const organizationSchema = z.object({ name: z.string().min(2).max(120) });
const memberSchema = z.object({ name: z.string().min(2).max(100), email: z.string().email(), password: z.string().min(10).max(128), role: z.enum(roles) });
const roleSchema = z.object({ role: z.enum(roles) });
const projectAccessSchema = z.object({ projectIds: z.array(z.string().min(1)).max(100) });
const routeId = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

async function recordAudit(organizationId: string, actorId: string, action: string, entityType: string, entityId: string, description: string) {
  await db.auditEvent.create({ data: { organizationId, actorId, action, entityType, entityId, description } });
}

settingsRouter.use(requireAuth);

settingsRouter.get("/", allowRoles("SUPER_ADMIN", "COMPANY_OWNER"), async (request, response) => {
  const organization = await db.organization.findUnique({ where: { id: request.auth!.organizationId }, include: { memberships: { include: { user: { select: { id: true, name: true, email: true, createdAt: true } } }, orderBy: { user: { name: "asc" } } } } });
  if (!organization) return response.status(404).json({ error: "Workspace not found" });
  response.json({ organization: { id: organization.id, name: organization.name, createdAt: organization.createdAt }, members: organization.memberships.map(member => ({ id: member.id, role: member.role, user: member.user })) });
});

settingsRouter.patch("/organization", allowRoles("SUPER_ADMIN", "COMPANY_OWNER"), async (request, response) => {
  const input = organizationSchema.parse(request.body); const organization = await db.organization.update({ where: { id: request.auth!.organizationId }, data: input });
  await recordAudit(organization.id, request.auth!.userId, "UPDATED", "WORKSPACE", organization.id, `Updated workspace name to ${organization.name}`);
  response.json({ organization });
});

settingsRouter.post("/members", allowRoles("SUPER_ADMIN", "COMPANY_OWNER"), async (request, response) => {
  const input = memberSchema.parse(request.body); const organizationId = request.auth!.organizationId; const existingUser = await db.user.findUnique({ where: { email: input.email } });
  if (existingUser) {
    const existingMembership = await db.membership.findUnique({ where: { organizationId_userId: { organizationId, userId: existingUser.id } } });
    if (existingMembership) return response.status(409).json({ error: "This user already belongs to the workspace" });
    const membership = await db.membership.create({ data: { organizationId, userId: existingUser.id, role: input.role }, include: { user: { select: { id: true, name: true, email: true } } } });
    await recordAudit(organizationId, request.auth!.userId, "ADDED", "MEMBER", membership.id, `Added ${membership.user.name} as ${input.role.replaceAll("_", " ")}`);
    return response.status(201).json({ member: membership, existingAccount: true });
  }
  const user = await db.user.create({ data: { name: input.name, email: input.email, passwordHash: await hashPassword(input.password), memberships: { create: { organizationId, role: input.role } } }, include: { memberships: { include: { user: { select: { id: true, name: true, email: true } } } } } });
  const membership = user.memberships[0];
  await recordAudit(organizationId, request.auth!.userId, "ADDED", "MEMBER", membership.id, `Added ${user.name} as ${input.role.replaceAll("_", " ")}`);
  response.status(201).json({ member: membership, existingAccount: false });
});

settingsRouter.patch("/members/:membershipId", allowRoles("SUPER_ADMIN", "COMPANY_OWNER"), async (request, response) => {
  const input = roleSchema.parse(request.body); const membershipId = routeId(request.params.membershipId); const membership = await db.membership.findFirst({ where: { id: membershipId, organizationId: request.auth!.organizationId }, include: { user: true } });
  if (!membership) return response.status(404).json({ error: "Team member not found" }); if (membership.userId === request.auth!.userId) return response.status(422).json({ error: "You cannot change your own role" });
  const updated = await db.membership.update({ where: { id: membership.id }, data: input }); await recordAudit(request.auth!.organizationId, request.auth!.userId, "ROLE_CHANGED", "MEMBER", membership.id, `Changed ${membership.user.name}'s role to ${input.role.replaceAll("_", " ")}`); response.json({ member: updated });
});

settingsRouter.get("/project-access", allowRoles("SUPER_ADMIN", "COMPANY_OWNER"), async (request, response) => {
  const organizationId = request.auth!.organizationId; const [projects, memberships, access] = await Promise.all([db.project.findMany({ where: { organizationId }, select: { id: true, name: true, code: true, status: true }, orderBy: { name: "asc" } }), db.membership.findMany({ where: { organizationId }, include: { user: { select: { id: true, name: true, email: true } } }, orderBy: { user: { name: "asc" } } }), db.projectAccess.findMany({ where: { organizationId }, select: { userId: true, projectId: true } })]);
  response.json({ projects, members: memberships.map(member => ({ user: member.user, role: member.role, projectIds: access.filter(item => item.userId === member.userId).map(item => item.projectId) })) });
});

settingsRouter.put("/members/:userId/project-access", allowRoles("SUPER_ADMIN", "COMPANY_OWNER"), async (request, response) => {
  const userId = routeId(request.params.userId);
  if (!userId) return response.status(400).json({ error: "Team member is required" });
  const input = projectAccessSchema.parse(request.body); const organizationId = request.auth!.organizationId;
  const membership = await db.membership.findUnique({ where: { organizationId_userId: { organizationId, userId } }, include: { user: { select: { name: true } } } });
  if (!membership) return response.status(404).json({ error: "Team member not found" });
  const projectIds = [...new Set(input.projectIds)]; const foundProjects = await db.project.count({ where: { organizationId, id: { in: projectIds } } }); if (foundProjects !== projectIds.length) return response.status(422).json({ error: "One or more projects are not in this workspace" });
  await db.$transaction([db.projectAccess.deleteMany({ where: { organizationId, userId } }), ...projectIds.map(projectId => db.projectAccess.create({ data: { organizationId, userId, projectId } }))]); await recordAudit(organizationId, request.auth!.userId, "PROJECT_ACCESS_CHANGED", "MEMBER", membership.id, `Updated project access for ${membership.user.name}: ${projectIds.length} project${projectIds.length === 1 ? "" : "s"}`); response.json({ projectIds });
});

settingsRouter.get("/activity", allowRoles("SUPER_ADMIN", "COMPANY_OWNER"), async (request, response) => {
  const organizationId = request.auth!.organizationId; const [events, approvals] = await Promise.all([db.auditEvent.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" }, take: 40 }), db.approvalLog.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" }, take: 40 })]); const actorIds = [...new Set([...events.map(item => item.actorId), ...approvals.map(item => item.actorId)])]; const actors = await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } }); const actorName = new Map(actors.map(actor => [actor.id, actor.name]));
  const activity = [...events.map(item => ({ id: `event-${item.id}`, action: item.action, description: item.description, actorName: actorName.get(item.actorId) ?? "Former user", createdAt: item.createdAt })), ...approvals.map(item => ({ id: `approval-${item.id}`, action: item.decision, description: `${item.decision === "APPROVE" ? "Approved" : "Rejected"} ${item.entityType.replaceAll("_", " ")}${item.note ? ` — ${item.note}` : ""}`, actorName: actorName.get(item.actorId) ?? "Former user", createdAt: item.createdAt }))].sort((first, second) => second.createdAt.getTime() - first.createdAt.getTime()).slice(0, 50); response.json({ activity });
});
