import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { allowRoles, projectScope, requireAuth } from "../middleware/auth.js";

export const procurementRouter = Router();
const supplierSchema = z.object({ name: z.string().min(2).max(160), email: z.string().email().optional(), phone: z.string().max(24).optional(), gstin: z.string().max(24).optional() });
const requestSchema = z.object({ projectId: z.string().min(1), projectSiteId: z.string().min(1), materialId: z.string().min(1), quantity: z.coerce.number().positive(), notes: z.string().max(300).optional() });
const statusSchema = z.object({ status: z.enum(["DRAFT", "SUBMITTED", "APPROVED", "REJECTED"]) });
const orderSchema = z.object({ purchaseRequestId: z.string().min(1), supplierId: z.string().min(1), unitPrice: z.coerce.number().nonnegative() });
const receiptSchema = z.object({ purchaseOrderItemId: z.string().min(1), receivedQuantity: z.coerce.number().positive() });
const quotationSchema = z.object({ purchaseRequestId: z.string().min(1), supplierId: z.string().min(1), totalAmount: z.coerce.number().positive(), leadDays: z.coerce.number().int().min(0).max(365), notes: z.string().max(300).optional() });
const routeId = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

procurementRouter.use(requireAuth);

procurementRouter.get("/", async (request, response) => {
  const organizationId = request.auth!.organizationId;
  const [suppliers, purchaseRequests, purchaseOrders, quotations] = await Promise.all([
    db.supplier.findMany({ where: { organizationId }, orderBy: { name: "asc" } }),
    db.purchaseRequest.findMany({ where: { organizationId, ...projectScope(request) }, include: { project: { select: { name: true } }, projectSite: { select: { name: true } }, items: { include: { material: { select: { name: true, unit: true } } } } }, orderBy: { updatedAt: "desc" } }),
    db.purchaseOrder.findMany({ where: { organizationId, ...projectScope(request) }, include: { supplier: { select: { name: true } }, projectSite: { select: { name: true } }, items: { include: { material: { select: { name: true, unit: true } }, goodsReceiptItems: true } } }, orderBy: { updatedAt: "desc" } }),
    db.supplierQuotation.findMany({ where: { organizationId }, include: { supplier: { select: { name: true } } }, orderBy: { totalAmount: "asc" } })
  ]);
  const supplierInsights = suppliers.map(supplier => {
    const orders = purchaseOrders.filter(order => order.supplier.name === supplier.name);
    const orderedQuantity = orders.reduce((total, order) => total + order.items.reduce((sum, item) => sum + Number(item.orderedQuantity), 0), 0);
    const receivedQuantity = orders.reduce((total, order) => total + order.items.reduce((sum, item) => sum + item.goodsReceiptItems.reduce((received, receipt) => received + Number(receipt.receivedQuantity), 0), 0), 0);
    const averageUnitPrice = orders.length ? orders.reduce((total, order) => total + order.items.reduce((sum, item) => sum + Number(item.unitPrice), 0), 0) / orders.reduce((total, order) => total + order.items.length, 0) : null;
    const deliveryRate = orderedQuantity ? Math.min(100, Math.round(receivedQuantity / orderedQuantity * 100)) : 0;
    const score = orders.length ? Math.round(deliveryRate * 0.7 + Math.min(100, orders.filter(order => order.status === "RECEIVED" || order.status === "PARTIALLY_RECEIVED").length / orders.length * 100) * 0.3) : null;
    return { id: supplier.id, name: supplier.name, orders: orders.length, deliveryRate, averageUnitPrice, score };
  }).sort((left, right) => (right.score ?? -1) - (left.score ?? -1));
  response.json({ suppliers, supplierInsights, purchaseRequests, purchaseOrders, quotations });
});

procurementRouter.post("/quotations", allowRoles("SUPER_ADMIN", "COMPANY_OWNER", "PROJECT_MANAGER", "PURCHASE_MANAGER"), async (request, response) => {
  const input = quotationSchema.parse(request.body); const organizationId = request.auth!.organizationId;
  const purchaseRequest = await db.purchaseRequest.findFirst({ where: { id: input.purchaseRequestId, organizationId, ...projectScope(request) } });
  const supplier = await db.supplier.findFirst({ where: { id: input.supplierId, organizationId } });
  if (!purchaseRequest || !supplier) return response.status(404).json({ error: "Purchase request or supplier not found" });
  const quotation = await db.supplierQuotation.upsert({ where: { purchaseRequestId_supplierId: { purchaseRequestId: input.purchaseRequestId, supplierId: input.supplierId } }, update: { totalAmount: input.totalAmount, leadDays: input.leadDays, notes: input.notes }, create: { ...input, organizationId } });
  response.status(201).json({ quotation });
});

procurementRouter.patch("/quotations/:quotationId/select", allowRoles("SUPER_ADMIN", "COMPANY_OWNER", "PROJECT_MANAGER", "PURCHASE_MANAGER"), async (request, response) => {
  const quotationId = routeId(request.params.quotationId); const organizationId = request.auth!.organizationId;
  const quotation = await db.supplierQuotation.findFirst({ where: { id: quotationId, organizationId } });
  if (!quotation) return response.status(404).json({ error: "Quotation not found" });
  await db.$transaction([db.supplierQuotation.updateMany({ where: { organizationId, purchaseRequestId: quotation.purchaseRequestId }, data: { selected: false } }), db.supplierQuotation.update({ where: { id: quotation.id }, data: { selected: true } })]);
  response.json({ ok: true });
});

procurementRouter.post("/suppliers", allowRoles("SUPER_ADMIN", "COMPANY_OWNER", "PURCHASE_MANAGER"), async (request, response) => {
  const input = supplierSchema.parse(request.body);
  const supplier = await db.supplier.create({ data: { ...input, organizationId: request.auth!.organizationId } });
  response.status(201).json({ supplier });
});

procurementRouter.post("/requests", allowRoles("SUPER_ADMIN", "COMPANY_OWNER", "PROJECT_MANAGER", "SITE_ENGINEER", "SITE_SUPERVISOR", "PURCHASE_MANAGER"), async (request, response) => {
  const input = requestSchema.parse(request.body);
  const [project, projectSite, material] = await Promise.all([db.project.findFirst({ where: { id: input.projectId, organizationId: request.auth!.organizationId, ...projectScope(request, "id") } }), db.projectSite.findFirst({ where: { id: input.projectSiteId, organizationId: request.auth!.organizationId } }), db.material.findFirst({ where: { id: input.materialId, organizationId: request.auth!.organizationId } })]);
  if (!project || !projectSite || !material || projectSite.projectId !== project.id) return response.status(404).json({ error: "Project, site, or material not found" });
  const purchaseRequest = await db.purchaseRequest.create({ data: { requestNumber: `PR-${Date.now()}`, status: "SUBMITTED", notes: input.notes, projectId: project.id, projectSiteId: projectSite.id, organizationId: request.auth!.organizationId, items: { create: { materialId: material.id, requestedQuantity: input.quantity, organizationId: request.auth!.organizationId } } }, include: { items: { include: { material: true } } } });
  response.status(201).json({ purchaseRequest });
});

procurementRouter.patch("/requests/:requestId", allowRoles("SUPER_ADMIN", "COMPANY_OWNER", "PROJECT_MANAGER", "PURCHASE_MANAGER"), async (request, response) => {
  const input = statusSchema.parse(request.body);
  const requestId = routeId(request.params.requestId);
  const purchaseRequest = await db.purchaseRequest.updateMany({ where: { id: requestId, organizationId: request.auth!.organizationId, ...projectScope(request) }, data: { status: input.status } });
  if (purchaseRequest.count === 0) return response.status(404).json({ error: "Purchase request not found" });
  response.json({ success: true });
});

procurementRouter.post("/orders", allowRoles("SUPER_ADMIN", "COMPANY_OWNER", "PURCHASE_MANAGER"), async (request, response) => {
  const input = orderSchema.parse(request.body);
  const [purchaseRequest, supplier] = await Promise.all([db.purchaseRequest.findFirst({ where: { id: input.purchaseRequestId, organizationId: request.auth!.organizationId, ...projectScope(request) }, include: { items: true } }), db.supplier.findFirst({ where: { id: input.supplierId, organizationId: request.auth!.organizationId } })]);
  if (!purchaseRequest || !supplier) return response.status(404).json({ error: "Purchase request or supplier not found" });
  if (purchaseRequest.status !== "APPROVED") return response.status(422).json({ error: "Approve the purchase request before creating an order" });
  const purchaseOrder = await db.$transaction(async transaction => {
    const order = await transaction.purchaseOrder.create({ data: { orderNumber: `PO-${Date.now()}`, status: "ISSUED", purchaseRequestId: purchaseRequest.id, supplierId: supplier.id, projectId: purchaseRequest.projectId, projectSiteId: purchaseRequest.projectSiteId, organizationId: request.auth!.organizationId, items: { create: purchaseRequest.items.map(item => ({ materialId: item.materialId, orderedQuantity: item.requestedQuantity, unitPrice: input.unitPrice, organizationId: request.auth!.organizationId })) } }, include: { supplier: true, items: { include: { material: true } } } });
    await transaction.purchaseRequest.update({ where: { id: purchaseRequest.id }, data: { status: "ORDERED" } });
    return order;
  });
  response.status(201).json({ purchaseOrder });
});

procurementRouter.post("/orders/:orderId/receipts", allowRoles("SUPER_ADMIN", "COMPANY_OWNER", "PURCHASE_MANAGER", "STORE_MANAGER", "SITE_ENGINEER"), async (request, response) => {
  const input = receiptSchema.parse(request.body);
  const orderId = routeId(request.params.orderId);
  const purchaseOrder = await db.purchaseOrder.findFirst({ where: { id: orderId, organizationId: request.auth!.organizationId, ...projectScope(request) }, include: { items: true } });
  if (!purchaseOrder) return response.status(404).json({ error: "Purchase order not found" });
  const orderItem = purchaseOrder.items.find(item => item.id === input.purchaseOrderItemId);
  if (!orderItem) return response.status(404).json({ error: "Purchase order item not found" });
  const received = await db.goodsReceiptItem.aggregate({ where: { purchaseOrderItemId: orderItem.id }, _sum: { receivedQuantity: true } });
  if (Number(received._sum.receivedQuantity ?? 0) + input.receivedQuantity > Number(orderItem.orderedQuantity)) return response.status(422).json({ error: "Received quantity cannot exceed the ordered quantity" });
  const goodsReceipt = await db.$transaction(async transaction => {
    const receipt = await transaction.goodsReceipt.create({ data: { receiptNumber: `GRN-${Date.now()}`, purchaseOrderId: purchaseOrder.id, projectSiteId: purchaseOrder.projectSiteId, organizationId: request.auth!.organizationId, items: { create: { purchaseOrderItemId: orderItem.id, materialId: orderItem.materialId, receivedQuantity: input.receivedQuantity, unitCost: orderItem.unitPrice, organizationId: request.auth!.organizationId } } } });
    await transaction.inventoryTransaction.create({ data: { type: "RECEIPT", quantity: input.receivedQuantity, unitCost: orderItem.unitPrice, reference: receipt.receiptNumber, materialId: orderItem.materialId, projectSiteId: purchaseOrder.projectSiteId, organizationId: request.auth!.organizationId } });
    await transaction.purchaseOrder.update({ where: { id: purchaseOrder.id }, data: { status: "PARTIALLY_RECEIVED" } });
    return receipt;
  });
  response.status(201).json({ goodsReceipt });
});
