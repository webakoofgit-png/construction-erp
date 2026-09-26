export type AppRole = "SUPER_ADMIN" | "COMPANY_OWNER" | "PROJECT_MANAGER" | "SITE_ENGINEER" | "SITE_SUPERVISOR" | "PURCHASE_MANAGER" | "STORE_MANAGER" | "ACCOUNTS_MANAGER" | "CONTRACTOR" | "CLIENT" | "VIEWER";

export type Permission = "project:read" | "project:manage" | "financials:read" | "procurement:manage" | "site-report:create" | "settings:manage";

const grants: Record<AppRole, Permission[]> = {
  SUPER_ADMIN: ["project:read", "project:manage", "financials:read", "procurement:manage", "site-report:create", "settings:manage"],
  COMPANY_OWNER: ["project:read", "project:manage", "financials:read", "procurement:manage", "site-report:create", "settings:manage"],
  PROJECT_MANAGER: ["project:read", "project:manage", "financials:read", "procurement:manage", "site-report:create"],
  SITE_ENGINEER: ["project:read", "site-report:create"],
  SITE_SUPERVISOR: ["project:read", "site-report:create"],
  PURCHASE_MANAGER: ["project:read", "procurement:manage"],
  STORE_MANAGER: ["project:read"],
  ACCOUNTS_MANAGER: ["project:read", "financials:read"],
  CONTRACTOR: ["project:read"],
  CLIENT: ["project:read"],
  VIEWER: ["project:read"]
};

const allPaths = ["/dashboard", "/projects", "/project-templates", "/tasks", "/daily-work-plan", "/documents", "/schedule", "/approvals", "/reports", "/quality", "/quality-evidence", "/quality-review", "/corrective-actions", "/verify-closures", "/boq", "/change-orders", "/cash-flow", "/collections", "/dpr-photos", "/photo-gallery", "/engagement", "/materials", "/inventory", "/procurement", "/contractors", "/labour", "/machinery", "/progress", "/expenses", "/client-billing", "/payments", "/analytics", "/notifications", "/team", "/settings", "/copilot", "/client-portal", "/site-mobile"];

const access: Record<AppRole, string[]> = {
  SUPER_ADMIN: allPaths,
  COMPANY_OWNER: allPaths,
  PROJECT_MANAGER: allPaths.filter(path => !["/team", "/settings"].includes(path)),
  SITE_ENGINEER: ["/dashboard", "/projects", "/tasks", "/notifications", "/boq", "/schedule", "/daily-work-plan", "/progress", "/dpr-photos", "/photo-gallery", "/quality", "/quality-evidence", "/quality-review", "/corrective-actions", "/verify-closures", "/materials", "/inventory", "/labour", "/machinery", "/documents", "/site-mobile"],
  SITE_SUPERVISOR: ["/dashboard", "/projects", "/tasks", "/notifications", "/schedule", "/daily-work-plan", "/progress", "/dpr-photos", "/photo-gallery", "/quality", "/quality-evidence", "/corrective-actions", "/materials", "/inventory", "/labour", "/machinery", "/documents", "/site-mobile"],
  PURCHASE_MANAGER: ["/dashboard", "/projects", "/tasks", "/notifications", "/materials", "/inventory", "/procurement", "/contractors", "/documents", "/approvals"],
  STORE_MANAGER: ["/dashboard", "/projects", "/tasks", "/notifications", "/materials", "/inventory", "/documents"],
  ACCOUNTS_MANAGER: ["/dashboard", "/projects", "/tasks", "/notifications", "/expenses", "/client-billing", "/payments", "/cash-flow", "/collections", "/analytics", "/reports", "/documents", "/approvals"],
  CONTRACTOR: ["/projects", "/tasks", "/daily-work-plan", "/progress", "/documents"],
  CLIENT: ["/client-portal"],
  VIEWER: ["/dashboard", "/projects", "/documents"]
};

export const can = (role: AppRole, permission: Permission) => grants[role].includes(permission);
export const canAccessFinancials = (role: AppRole) => can(role, "financials:read");
export const canAccessPath = (role: AppRole, path: string) => {
  if (path === "/") return role !== "CLIENT";
  if (path.startsWith("/projects/")) return role !== "CLIENT" && access[role].includes("/projects");
  return access[role].includes(path);
};
