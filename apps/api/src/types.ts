import type { Role } from "@prisma/client";

export type AuthenticatedUser = { userId: string; organizationId: string; role: Role; projectIds?: string[] | null };

declare global { namespace Express { interface Request { auth?: AuthenticatedUser } } }
