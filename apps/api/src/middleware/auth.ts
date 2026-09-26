import type { NextFunction, Request, Response } from "express";
import type { Role } from "@prisma/client";
import { db } from "../db.js";
import { verifyAccessToken } from "../lib/tokens.js";

const organizationWideRoles: Role[] = ["SUPER_ADMIN", "COMPANY_OWNER"];

export async function requireAuth(request: Request, response: Response, next: NextFunction) {
  const authorization = request.header("authorization");
  if (!authorization?.startsWith("Bearer ")) return response.status(401).json({ error: "Authentication required" });
  try {
    const identity = verifyAccessToken(authorization.slice(7));
    const projectIds = organizationWideRoles.includes(identity.role) ? null : (await db.projectAccess.findMany({ where: { organizationId: identity.organizationId, userId: identity.userId }, select: { projectId: true } })).map(access => access.projectId);
    request.auth = { ...identity, projectIds };
    next();
  } catch {
    return response.status(401).json({ error: "Your session is invalid or has expired" });
  }
}

export function projectScope(request: Request, field = "projectId") {
  return request.auth!.projectIds === null ? {} : { [field]: { in: request.auth!.projectIds ?? [] } };
}

export function canAccessProject(request: Request, projectId: string | undefined) {
  if (!projectId) return false;
  return request.auth!.projectIds === null || (request.auth!.projectIds ?? []).includes(projectId);
}

export function allowRoles(...roles: Role[]) {
  return (request: Request, response: Response, next: NextFunction) => {
    if (!request.auth || !roles.includes(request.auth.role)) return response.status(403).json({ error: "Insufficient permission" });
    next();
  };
}
