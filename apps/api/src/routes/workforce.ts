import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { allowRoles, projectScope, requireAuth } from "../middleware/auth.js";

export const workforceRouter = Router();
const contractorSchema = z.object({ name: z.string().min(2).max(160), specialty: z.string().max(100).optional(), phone: z.string().max(24).optional(), gstin: z.string().max(24).optional() });
const workOrderSchema = z.object({ contractorId: z.string().min(1), projectId: z.string().min(1), title: z.string().min(2).max(180), contractValue: z.coerce.number().nonnegative() });
const workerSchema = z.object({ name: z.string().min(2).max(120), phone: z.string().max(24).optional(), trade: z.string().min(2).max(80), dailyWage: z.coerce.number().nonnegative() });
const attendanceSchema = z.object({ workerId: z.string().min(1), projectSiteId: z.string().min(1), date: z.coerce.date(), status: z.enum(["PRESENT", "ABSENT", "HALF_DAY"]), overtimeHours: z.coerce.number().nonnegative().default(0) });

workforceRouter.use(requireAuth);

workforceRouter.get("/", async (request, response) => {
  const organizationId = request.auth!.organizationId;
  const [contractors, workers, workOrders, attendance] = await Promise.all([
    db.contractor.findMany({ where: { organizationId, ...(request.auth!.projectIds === null ? {} : { workOrders: { some: projectScope(request) } }) }, include: { workOrders: { where: projectScope(request) }, bills: { where: projectScope(request) } }, orderBy: { name: "asc" } }),
    db.worker.findMany({ where: { organizationId }, orderBy: { name: "asc" } }),
    db.workOrder.findMany({ where: { organizationId, ...projectScope(request) }, include: { contractor: { select: { name: true } }, project: { select: { name: true } } }, orderBy: { updatedAt: "desc" } }),
    db.attendance.findMany({ where: { organizationId, projectSite: { project: projectScope(request, "id") } }, include: { worker: { select: { name: true, trade: true, dailyWage: true } }, projectSite: { select: { name: true } } }, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 100 })
  ]);
  const contractorInsights = contractors.map(contractor => {
    const totalOrders = contractor.workOrders.length;
    const completedOrders = contractor.workOrders.filter(order => order.status === "COMPLETED").length;
    const deliveryRate = totalOrders ? Math.round(completedOrders / totalOrders * 100) : 0;
    const verifiedBills = contractor.bills.filter(bill => bill.status === "VERIFIED" || bill.status === "PAID").length;
    const billCompliance = contractor.bills.length ? Math.round(verifiedBills / contractor.bills.length * 100) : 100;
    const score = totalOrders ? Math.round(deliveryRate * 0.65 + billCompliance * 0.35) : null;
    return { id: contractor.id, deliveryRate, billCompliance, score };
  });
  response.json({ contractors, contractorInsights, workers, workOrders, attendance });
});

workforceRouter.post("/contractors", allowRoles("SUPER_ADMIN", "COMPANY_OWNER", "PROJECT_MANAGER"), async (request, response) => {
  const contractor = await db.contractor.create({ data: { ...contractorSchema.parse(request.body), organizationId: request.auth!.organizationId } });
  response.status(201).json({ contractor });
});

workforceRouter.post("/work-orders", allowRoles("SUPER_ADMIN", "COMPANY_OWNER", "PROJECT_MANAGER"), async (request, response) => {
  const input = workOrderSchema.parse(request.body);
  const [contractor, project] = await Promise.all([db.contractor.findFirst({ where: { id: input.contractorId, organizationId: request.auth!.organizationId } }), db.project.findFirst({ where: { id: input.projectId, organizationId: request.auth!.organizationId, ...projectScope(request, "id") } })]);
  if (!contractor || !project) return response.status(404).json({ error: "Contractor or project not found" });
  const workOrder = await db.workOrder.create({ data: { ...input, workOrderNumber: `WO-${Date.now()}`, status: "ACTIVE", organizationId: request.auth!.organizationId } });
  response.status(201).json({ workOrder });
});

workforceRouter.post("/workers", allowRoles("SUPER_ADMIN", "COMPANY_OWNER", "PROJECT_MANAGER", "SITE_ENGINEER", "SITE_SUPERVISOR"), async (request, response) => {
  const worker = await db.worker.create({ data: { ...workerSchema.parse(request.body), organizationId: request.auth!.organizationId } });
  response.status(201).json({ worker });
});

workforceRouter.post("/attendance", allowRoles("SUPER_ADMIN", "COMPANY_OWNER", "PROJECT_MANAGER", "SITE_ENGINEER", "SITE_SUPERVISOR"), async (request, response) => {
  const input = attendanceSchema.parse(request.body);
  const [worker, projectSite] = await Promise.all([db.worker.findFirst({ where: { id: input.workerId, organizationId: request.auth!.organizationId } }), db.projectSite.findFirst({ where: { id: input.projectSiteId, organizationId: request.auth!.organizationId, project: projectScope(request, "id") } })]);
  if (!worker || !projectSite) return response.status(404).json({ error: "Worker or project site not found" });
  const attendance = await db.attendance.upsert({ where: { workerId_projectSiteId_date: { workerId: worker.id, projectSiteId: projectSite.id, date: input.date } }, update: { status: input.status, overtimeHours: input.overtimeHours }, create: { ...input, workerId: worker.id, projectSiteId: projectSite.id, organizationId: request.auth!.organizationId } });
  response.status(201).json({ attendance });
});

workforceRouter.get("/payroll", allowRoles("SUPER_ADMIN", "COMPANY_OWNER", "PROJECT_MANAGER", "ACCOUNTS_MANAGER"), async (request, response) => {
  const organizationId = request.auth!.organizationId;
  const attendance = await db.attendance.findMany({ where: { organizationId, projectSite: { project: projectScope(request, "id") } }, include: { worker: { select: { id: true, name: true, trade: true, dailyWage: true } }, projectSite: { select: { name: true } } } });
  const rows = new Map<string, { workerId: string; name: string; trade: string; days: number; overtimeHours: number; grossWages: number; sites: Set<string> }>();
  for (const record of attendance) { const row = rows.get(record.workerId) ?? { workerId: record.workerId, name: record.worker.name, trade: record.worker.trade, days: 0, overtimeHours: 0, grossWages: 0, sites: new Set<string>() }; const factor = record.status === "PRESENT" ? 1 : record.status === "HALF_DAY" ? 0.5 : 0; const wage = Number(record.worker.dailyWage); row.days += factor; row.overtimeHours += Number(record.overtimeHours); row.grossWages += wage * factor + wage / 8 * Number(record.overtimeHours); row.sites.add(record.projectSite.name); rows.set(record.workerId, row); }
  const payroll = [...rows.values()].map(row => ({ ...row, days: Number(row.days.toFixed(1)), overtimeHours: Number(row.overtimeHours.toFixed(1)), grossWages: Math.round(row.grossWages), sites: [...row.sites] }));
  response.json({ payroll, totalGrossWages: payroll.reduce((total, row) => total + row.grossWages, 0) });
});
