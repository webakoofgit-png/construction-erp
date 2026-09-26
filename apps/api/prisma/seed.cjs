const { PrismaClient } = require("@prisma/client");
const { randomBytes, scrypt: scryptCallback } = require("node:crypto");
const { promisify } = require("node:util");

const db = new PrismaClient();
const scrypt = promisify(scryptCallback);

async function passwordHash(password) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = await scrypt(password, salt, 64);
  return `${salt}:${derivedKey.toString("hex")}`;
}

async function main() {
  const organization = await db.organization.findFirst({ orderBy: { createdAt: "asc" } });
  if (!organization) throw new Error("No organization found. Create your workspace first.");

  const project = await db.project.upsert({
    where: { organizationId_code: { organizationId: organization.id, code: "ORC-001" } },
    update: { name: "Orchid Residency", contractValue: 6350000, status: "ACTIVE" },
    create: { organizationId: organization.id, name: "Orchid Residency", code: "ORC-001", contractValue: 6350000, status: "ACTIVE" }
  });

  await db.projectSite.upsert({
    where: { id: "orchid-residency-main-site" },
    update: { name: "Orchid Residency Main Site", address: "Bengaluru, Karnataka" },
    create: { id: "orchid-residency-main-site", organizationId: organization.id, projectId: project.id, name: "Orchid Residency Main Site", address: "Bengaluru, Karnataka" }
  });

  let boq = await db.boq.findFirst({ where: { organizationId: organization.id, projectId: project.id, name: "Execution BOQ v1" } });
  if (!boq) boq = await db.boq.create({ data: { organizationId: organization.id, projectId: project.id, name: "Execution BOQ v1", status: "ACTIVE" } });

  const itemCount = await db.boqItem.count({ where: { boqId: boq.id } });
  if (itemCount === 0) {
    await db.boqItem.createMany({ data: [
      { organizationId: organization.id, boqId: boq.id, sortOrder: 0, code: "CIV-001", category: "Civil Works", description: "Earth excavation in foundation", unit: "m3", quantity: 500, rate: 420 },
      { organizationId: organization.id, boqId: boq.id, sortOrder: 1, code: "CIV-002", category: "Concrete", description: "RCC work in foundation and plinth", unit: "m3", quantity: 180, rate: 7800 },
      { organizationId: organization.id, boqId: boq.id, sortOrder: 2, code: "CIV-003", category: "Masonry", description: "AAC block masonry work", unit: "m2", quantity: 2400, rate: 680 },
      { organizationId: organization.id, boqId: boq.id, sortOrder: 3, code: "FIN-001", category: "Finishes", description: "Internal wall plaster", unit: "m2", quantity: 5100, rate: 245 },
      { organizationId: organization.id, boqId: boq.id, sortOrder: 4, code: "ELE-001", category: "Electrical", description: "Electrical conduit and wiring provision", unit: "Point", quantity: 325, rate: 1850 }
    ] });
  }

  const materialSeed = [
    { name: "Cement OPC 53 Grade", sku: "CEM-OPC-53", unit: "Bag", minimumStock: 250, plannedQuantity: 1600, availableQuantity: 520, unitCost: 420 },
    { name: "TMT Steel Fe 500D", sku: "STL-FE500D", unit: "MT", minimumStock: 12, plannedQuantity: 95, availableQuantity: 18, unitCost: 62500 },
    { name: "AAC Block", sku: "AAC-600", unit: "Nos", minimumStock: 5000, plannedQuantity: 42000, availableQuantity: 8000, unitCost: 62 },
    { name: "Electrical Conduit", sku: "ELE-CON-25", unit: "m", minimumStock: 800, plannedQuantity: 6000, availableQuantity: 650, unitCost: 34 }
  ];

  for (const materialData of materialSeed) {
    const material = await db.material.upsert({
      where: { organizationId_sku: { organizationId: organization.id, sku: materialData.sku } },
      update: { name: materialData.name, unit: materialData.unit, minimumStock: materialData.minimumStock },
      create: { organizationId: organization.id, name: materialData.name, sku: materialData.sku, unit: materialData.unit, minimumStock: materialData.minimumStock }
    });
    await db.materialRequirement.upsert({
      where: { projectId_materialId: { projectId: project.id, materialId: material.id } },
      update: { plannedQuantity: materialData.plannedQuantity },
      create: { organizationId: organization.id, projectId: project.id, materialId: material.id, plannedQuantity: materialData.plannedQuantity }
    });
    const transactionCount = await db.inventoryTransaction.count({ where: { materialId: material.id } });
    if (transactionCount === 0) await db.inventoryTransaction.create({ data: { organizationId: organization.id, materialId: material.id, projectSiteId: "orchid-residency-main-site", type: "RECEIPT", quantity: materialData.availableQuantity, unitCost: materialData.unitCost, reference: "GRN-DEMO-001" } });
  }

  let supplier = await db.supplier.findFirst({ where: { organizationId: organization.id, name: "BuildMart Supplies" } });
  if (!supplier) supplier = await db.supplier.create({ data: { organizationId: organization.id, name: "BuildMart Supplies", phone: "+91 98765 43210", gstin: "29ABCDE1234F1Z5" } });
  const conduit = await db.material.findFirstOrThrow({ where: { organizationId: organization.id, sku: "ELE-CON-25" } });
  const existingRequest = await db.purchaseRequest.findFirst({ where: { organizationId: organization.id, requestNumber: "PR-DEMO-001" } });
  if (!existingRequest) await db.purchaseRequest.create({ data: { organizationId: organization.id, requestNumber: "PR-DEMO-001", status: "APPROVED", notes: "Replenish conduit stock before electrical rough-in work.", projectId: project.id, projectSiteId: "orchid-residency-main-site", items: { create: { organizationId: organization.id, materialId: conduit.id, requestedQuantity: 800 } } } });

  let contractor = await db.contractor.findFirst({ where: { organizationId: organization.id, name: "Apex Civil Works" } });
  if (!contractor) contractor = await db.contractor.create({ data: { organizationId: organization.id, name: "Apex Civil Works", specialty: "Civil and RCC works", phone: "+91 99887 76655" } });
  const approvedRequest = await db.purchaseRequest.findFirstOrThrow({ where: { organizationId: organization.id, requestNumber: "PR-DEMO-001" }, include: { items: true } });
  const existingOrder = await db.purchaseOrder.findFirst({ where: { organizationId: organization.id, orderNumber: "PO-DEMO-001" } });
  if (!existingOrder) await db.purchaseOrder.create({ data: { organizationId: organization.id, orderNumber: "PO-DEMO-001", status: "ISSUED", purchaseRequestId: approvedRequest.id, supplierId: supplier.id, projectId: project.id, projectSiteId: "orchid-residency-main-site", items: { create: { organizationId: organization.id, materialId: conduit.id, orderedQuantity: 800, unitPrice: 34 } } } });
  const existingWorkOrder = await db.workOrder.findFirst({ where: { organizationId: organization.id, workOrderNumber: "WO-DEMO-001" } });
  if (!existingWorkOrder) await db.workOrder.create({ data: { organizationId: organization.id, workOrderNumber: "WO-DEMO-001", title: "Foundation and RCC works", contractValue: 1850000, status: "ACTIVE", contractorId: contractor.id, projectId: project.id } });
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const scheduleCount = await db.scheduleTask.count({ where: { organizationId: organization.id, projectId: project.id } });
  if (scheduleCount === 0) await db.scheduleTask.createMany({ data: [
    { organizationId: organization.id, projectId: project.id, title: "Foundation and plinth", plannedStart: new Date(today.getTime() - 35 * 86400000), plannedEnd: new Date(today.getTime() + 10 * 86400000), progress: 68, status: "IN_PROGRESS" },
    { organizationId: organization.id, projectId: project.id, title: "RCC frame", plannedStart: new Date(today.getTime() + 11 * 86400000), plannedEnd: new Date(today.getTime() + 85 * 86400000), progress: 0, status: "NOT_STARTED" },
    { organizationId: organization.id, projectId: project.id, title: "Masonry and services", plannedStart: new Date(today.getTime() + 86 * 86400000), plannedEnd: new Date(today.getTime() + 145 * 86400000), progress: 0, status: "NOT_STARTED" }
  ] });

  const equipmentSeed = [
    { name: "JCB 3DX Backhoe Loader", assetCode: "EQ-JCB-001", category: "Earthmoving", makeModel: "JCB 3DX", status: "ASSIGNED", hourlyCost: 1850 },
    { name: "Concrete Mixer", assetCode: "EQ-MIX-001", category: "Concrete Equipment", makeModel: "Ajax 10/7", status: "AVAILABLE", hourlyCost: 620 },
    { name: "Tower Hoist", assetCode: "EQ-HOI-001", category: "Lifting Equipment", makeModel: "Builder Hoist 1T", status: "MAINTENANCE", hourlyCost: 780 }
  ];
  for (const equipmentData of equipmentSeed) {
    const equipment = await db.equipment.upsert({ where: { organizationId_assetCode: { organizationId: organization.id, assetCode: equipmentData.assetCode } }, update: equipmentData, create: { organizationId: organization.id, ...equipmentData } });
    const usageCount = await db.equipmentUsage.count({ where: { equipmentId: equipment.id } });
    if (usageCount === 0) await db.equipmentUsage.create({ data: { organizationId: organization.id, equipmentId: equipment.id, usageDate: today, operatingHours: equipment.assetCode === "EQ-JCB-001" ? 6.5 : 2, fuelCost: equipment.assetCode === "EQ-JCB-001" ? 4200 : 450, notes: "Demo daily utilisation entry" } });
    if (equipment.assetCode === "EQ-JCB-001") { const assignment = await db.equipmentAssignment.count({ where: { equipmentId: equipment.id, releasedAt: null } }); if (assignment === 0) await db.equipmentAssignment.create({ data: { organizationId: organization.id, equipmentId: equipment.id, projectId: project.id, projectSiteId: "orchid-residency-main-site", assignedAt: today } }); }
    if (equipment.assetCode === "EQ-HOI-001") { const maintenance = await db.equipmentMaintenance.count({ where: { equipmentId: equipment.id, status: { not: "COMPLETED" } } }); if (maintenance === 0) await db.equipmentMaintenance.create({ data: { organizationId: organization.id, equipmentId: equipment.id, title: "Brake and cable inspection", scheduledDate: today, cost: 6500, status: "SCHEDULED" } }); }
  }

  const workerSeed = [
    { name: "Ramesh Kumar", trade: "Mason", dailyWage: 900 },
    { name: "Suresh Patel", trade: "Bar Bender", dailyWage: 950 },
    { name: "Imran Khan", trade: "Electrician", dailyWage: 1100 }
  ];
  for (const workerData of workerSeed) {
    let worker = await db.worker.findFirst({ where: { organizationId: organization.id, name: workerData.name } });
    if (!worker) worker = await db.worker.create({ data: { organizationId: organization.id, ...workerData } });
    await db.attendance.upsert({ where: { workerId_projectSiteId_date: { workerId: worker.id, projectSiteId: "orchid-residency-main-site", date: today } }, update: { status: "PRESENT", overtimeHours: 0 }, create: { organizationId: organization.id, workerId: worker.id, projectSiteId: "orchid-residency-main-site", date: today, status: "PRESENT", overtimeHours: 0 } });
  }

  const existingReport = await db.dailyProgressReport.findFirst({ where: { organizationId: organization.id, reportNumber: "DPR-DEMO-001" } });
  if (!existingReport) await db.dailyProgressReport.create({ data: { organizationId: organization.id, reportNumber: "DPR-DEMO-001", reportDate: today, summary: "Foundation shuttering completed for Block A. Reinforcement work started for the next footing cycle.", status: "SUBMITTED", projectId: project.id, projectSiteId: "orchid-residency-main-site", progressEntries: { create: { organizationId: organization.id, description: "Foundation shuttering completed", completedQuantity: 18 } }, siteIssues: { create: { organizationId: organization.id, title: "Electrical conduit stock below minimum", description: "Site stock is below the planned minimum for upcoming electrical rough-in work.", severity: "HIGH", status: "OPEN", ownerName: "Purchase Manager", projectId: project.id, projectSiteId: "orchid-residency-main-site" } } } });

  const existingExpense = await db.expense.findFirst({ where: { organizationId: organization.id, expenseNumber: "EXP-DEMO-001" } });
  if (!existingExpense) await db.expense.create({ data: { organizationId: organization.id, expenseNumber: "EXP-DEMO-001", expenseDate: today, category: "Site logistics", description: "Concrete pump and transport charges", amount: 45500, status: "APPROVED", projectId: project.id, projectSiteId: "orchid-residency-main-site" } });
  let milestone = await db.clientBillingMilestone.findFirst({ where: { organizationId: organization.id, projectId: project.id, title: "Foundation completion milestone" } });
  if (!milestone) milestone = await db.clientBillingMilestone.create({ data: { organizationId: organization.id, projectId: project.id, title: "Foundation completion milestone", amount: 1840000, dueDate: today } });
  const existingBill = await db.clientBill.findFirst({ where: { organizationId: organization.id, billNumber: "CB-DEMO-001" } });
  if (!existingBill) await db.clientBill.create({ data: { organizationId: organization.id, billNumber: "CB-DEMO-001", amount: 1840000, dueDate: today, status: "ISSUED", projectId: project.id, billingMilestoneId: milestone.id } });

  let task = await db.projectTask.findFirst({ where: { organizationId: organization.id, projectId: project.id, title: "Close electrical conduit stock gap" } });
  if (!task) { const dueDate = new Date(today); dueDate.setDate(dueDate.getDate() - 1); task = await db.projectTask.create({ data: { organizationId: organization.id, projectId: project.id, title: "Close electrical conduit stock gap", description: "Confirm the approved purchase request and delivery timing before electrical rough-in.", priority: "HIGH", dueDate, status: "IN_PROGRESS" } }); }
  const existingPlan = await db.dailyWorkPlan.findFirst({ where: { organizationId: organization.id, projectId: project.id, projectSiteId: "orchid-residency-main-site", title: "Foundation reinforcement and shuttering", planDate: today } });
  if (!existingPlan) await db.dailyWorkPlan.create({ data: { organizationId: organization.id, projectId: project.id, projectSiteId: "orchid-residency-main-site", projectTaskId: task.id, title: "Foundation reinforcement and shuttering", workType: "Civil", planDate: today, labourPlanned: 18, completionPercent: 60, status: "IN_PROGRESS", notes: "Complete reinforcement checks before concrete pour." } });
  const existingInspection = await db.siteInspection.findFirst({ where: { organizationId: organization.id, projectId: project.id, title: "Foundation reinforcement safety check" } });
  if (!existingInspection) await db.siteInspection.create({ data: { organizationId: organization.id, projectId: project.id, projectSiteId: "orchid-residency-main-site", title: "Foundation reinforcement safety check", type: "Safety", finding: "Barricading is incomplete near the excavation edge.", severity: "HIGH", status: "OPEN", correctiveAction: "Install rigid barricading and safety signage before the next shift.", dueDate: today } });

  const items = await db.boqItem.findMany({ where: { boqId: boq.id } });
  const budget = items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.rate), 0);

  const demoPassword = "DemoPass2026!";
  const teamSeed = [
    { name: "Sameer Joshi", email: "sameer.joshi@kravient.demo", role: "SUPER_ADMIN" },
    { name: "Meera Kapoor", email: "meera.kapoor@kravient.demo", role: "COMPANY_OWNER" },
    { name: "Priya Sharma", email: "priya.sharma@kravient.demo", role: "PROJECT_MANAGER" },
    { name: "Arjun Rao", email: "arjun.rao@kravient.demo", role: "SITE_ENGINEER" },
    { name: "Kavita Nair", email: "kavita.nair@kravient.demo", role: "PURCHASE_MANAGER" },
    { name: "Manoj Singh", email: "manoj.singh@kravient.demo", role: "STORE_MANAGER" },
    { name: "Neha Gupta", email: "neha.gupta@kravient.demo", role: "ACCOUNTS_MANAGER" },
    { name: "Ravi Mehta", email: "ravi.mehta@kravient.demo", role: "SITE_SUPERVISOR" },
    { name: "Dev Malhotra", email: "dev.malhotra@kravient.demo", role: "CONTRACTOR" },
    { name: "Ananya Iyer", email: "ananya.iyer@kravient.demo", role: "CLIENT" },
    { name: "Vijay Shah", email: "vijay.shah@kravient.demo", role: "VIEWER" }
  ];
  const team = {};
  for (const memberData of teamSeed) {
    const user = await db.user.upsert({
      where: { email: memberData.email },
      update: { name: memberData.name, passwordHash: await passwordHash(demoPassword) },
      create: { name: memberData.name, email: memberData.email, passwordHash: await passwordHash(demoPassword) }
    });
    await db.membership.upsert({
      where: { organizationId_userId: { organizationId: organization.id, userId: user.id } },
      update: { role: memberData.role },
      create: { organizationId: organization.id, userId: user.id, role: memberData.role }
    });
    await db.projectAccess.upsert({
      where: { userId_projectId: { userId: user.id, projectId: project.id } },
      update: {},
      create: { organizationId: organization.id, userId: user.id, projectId: project.id }
    });
    team[memberData.role] = user;
  }
  await db.project.update({ where: { id: project.id }, data: { clientUserId: team.CLIENT.id } });

  const template = await db.projectTemplate.upsert({
    where: { organizationId_name: { organizationId: organization.id, name: "Residential Mid-rise Standard" } },
    update: { description: "Repeatable delivery template for residential construction projects." },
    create: {
      organizationId: organization.id,
      name: "Residential Mid-rise Standard",
      description: "Repeatable delivery template for residential construction projects.",
      boqItems: [{ description: "Foundation RCC", unit: "m3", quantity: 180, rate: 7800 }],
      scheduleTasks: [{ title: "Mobilisation", durationDays: 7 }, { title: "Foundation", durationDays: 45 }],
      qualityChecklist: ["PPE verification", "Reinforcement inspection", "Concrete cube test"],
      teamRoles: ["Project Manager", "Site Engineer", "Purchase Manager", "Accounts Manager"]
    }
  });

  const purchaseOrder = await db.purchaseOrder.findFirstOrThrow({ where: { organizationId: organization.id, orderNumber: "PO-DEMO-001" }, include: { items: true } });
  const receipt = await db.goodsReceipt.findFirst({ where: { organizationId: organization.id, receiptNumber: "GRN-DEMO-001" } });
  if (!receipt) {
    await db.goodsReceipt.create({
      data: { organizationId: organization.id, receiptNumber: "GRN-DEMO-001", purchaseOrderId: purchaseOrder.id, projectSiteId: "orchid-residency-main-site", items: { create: purchaseOrder.items.map(item => ({ organizationId: organization.id, purchaseOrderItemId: item.id, materialId: item.materialId, receivedQuantity: 400, unitCost: item.unitPrice })) } }
    });
    await db.purchaseOrder.update({ where: { id: purchaseOrder.id }, data: { status: "PARTIALLY_RECEIVED" } });
  }

  const workOrder = await db.workOrder.findFirstOrThrow({ where: { organizationId: organization.id, workOrderNumber: "WO-DEMO-001" } });
  await db.contractorBill.upsert({
    where: { organizationId_billNumber: { organizationId: organization.id, billNumber: "CON-BILL-001" } },
    update: { status: "VERIFIED", amount: 325000 },
    create: { organizationId: organization.id, billNumber: "CON-BILL-001", amount: 325000, status: "VERIFIED", contractorId: contractor.id, projectId: project.id, workOrderId: workOrder.id }
  });

  const expenseTwo = await db.expense.upsert({
    where: { organizationId_expenseNumber: { organizationId: organization.id, expenseNumber: "EXP-DEMO-002" } },
    update: { status: "SUBMITTED", amount: 12600 },
    create: { organizationId: organization.id, expenseNumber: "EXP-DEMO-002", expenseDate: today, category: "Safety equipment", description: "Safety barricading, caution tape and warning signage", amount: 12600, status: "SUBMITTED", projectId: project.id, projectSiteId: "orchid-residency-main-site" }
  });

  const structureMilestone = await db.clientBillingMilestone.upsert({
    where: { id: "orchid-structure-milestone" },
    update: { title: "RCC frame milestone", amount: 2200000 },
    create: { id: "orchid-structure-milestone", organizationId: organization.id, projectId: project.id, title: "RCC frame milestone", amount: 2200000, dueDate: new Date(today.getTime() + 45 * 86400000) }
  });
  const bill = await db.clientBill.upsert({
    where: { organizationId_billNumber: { organizationId: organization.id, billNumber: "CB-DEMO-001" } },
    update: { status: "PARTIALLY_PAID" },
    create: { organizationId: organization.id, billNumber: "CB-DEMO-001", amount: 1840000, dueDate: today, status: "PARTIALLY_PAID", projectId: project.id, billingMilestoneId: milestone.id }
  });
  const payment = await db.clientPayment.findFirst({ where: { organizationId: organization.id, clientBillId: bill.id, reference: "UTR-ORC-2026-001" } });
  if (!payment) await db.clientPayment.create({ data: { organizationId: organization.id, clientBillId: bill.id, amount: 920000, paidAt: today, reference: "UTR-ORC-2026-001" } });
  await db.collectionFollowUp.upsert({
    where: { id: "orchid-collection-followup" },
    update: { status: "OPEN" },
    create: { id: "orchid-collection-followup", organizationId: organization.id, clientBillId: bill.id, ownerName: "Neha Gupta", nextFollowUpAt: new Date(today.getTime() + 3 * 86400000), note: "Confirm remaining foundation milestone payment with the client accounts team." }
  });
  await db.clientBill.upsert({
    where: { organizationId_billNumber: { organizationId: organization.id, billNumber: "CB-DEMO-002" } },
    update: { status: "DRAFT" },
    create: { organizationId: organization.id, billNumber: "CB-DEMO-002", amount: 2200000, dueDate: structureMilestone.dueDate, status: "DRAFT", projectId: project.id, billingMilestoneId: structureMilestone.id }
  });

  await db.changeOrder.upsert({
    where: { organizationId_number: { organizationId: organization.id, number: "CO-DEMO-001" } },
    update: { status: "SUBMITTED", amount: 185000 },
    create: { organizationId: organization.id, projectId: project.id, number: "CO-DEMO-001", title: "Additional waterproofing to basement walls", description: "Client-requested enhancement following site water-table review.", amount: 185000, status: "SUBMITTED" }
  });

  await db.projectMilestone.upsert({
    where: { id: "orchid-foundation-milestone" },
    update: { completedDate: today },
    create: { id: "orchid-foundation-milestone", organizationId: organization.id, projectId: project.id, title: "Foundation completion", plannedDate: today, completedDate: today }
  });
  await db.projectMilestone.upsert({
    where: { id: "orchid-rcc-milestone" },
    update: {},
    create: { id: "orchid-rcc-milestone", organizationId: organization.id, projectId: project.id, title: "RCC frame completion", plannedDate: new Date(today.getTime() + 85 * 86400000) }
  });

  const assignedTask = await db.projectTask.upsert({
    where: { id: "orchid-task-rebar" },
    update: { status: "OPEN", assignedToId: team.SITE_ENGINEER.id },
    create: { id: "orchid-task-rebar", organizationId: organization.id, projectId: project.id, title: "Approve reinforcement before concrete pour", description: "Verify bar bending schedule and cover blocks before the pour is released.", priority: "CRITICAL", status: "OPEN", dueDate: new Date(today.getTime() + 1 * 86400000), assignedToId: team.SITE_ENGINEER.id }
  });
  await db.dailyWorkPlan.upsert({
    where: { id: "orchid-daily-plan-concrete" },
    update: { completionPercent: 0, status: "PLANNED" },
    create: { id: "orchid-daily-plan-concrete", organizationId: organization.id, projectId: project.id, projectSiteId: "orchid-residency-main-site", projectTaskId: assignedTask.id, title: "Footing concrete pour preparation", workType: "Civil", planDate: new Date(today.getTime() + 1 * 86400000), labourPlanned: 14, completionPercent: 0, status: "PLANNED", notes: "Complete reinforcement and shuttering sign-off before starting concrete work." }
  });

  await db.siteInspection.upsert({
    where: { id: "orchid-quality-concrete" },
    update: { status: "RESOLVED" },
    create: { id: "orchid-quality-concrete", organizationId: organization.id, projectId: project.id, projectSiteId: "orchid-residency-main-site", title: "Concrete material quality verification", type: "Quality", finding: "Cement batch and aggregate grading records verified before foundation pour.", severity: "MEDIUM", status: "RESOLVED", correctiveAction: "File test certificates with the pour checklist.", correctiveOwner: "Arjun Rao", dueDate: today }
  });

  const approvedDpr = await db.dailyProgressReport.upsert({
    where: { organizationId_reportNumber: { organizationId: organization.id, reportNumber: "DPR-DEMO-002" } },
    update: { status: "APPROVED" },
    create: { organizationId: organization.id, reportNumber: "DPR-DEMO-002", reportDate: new Date(today.getTime() - 86400000), summary: "Excavation levels verified and lean concrete completed for the next footing sequence.", status: "APPROVED", projectId: project.id, projectSiteId: "orchid-residency-main-site", progressEntries: { create: { organizationId: organization.id, description: "Lean concrete completed", completedQuantity: 45 } } }
  });
  await db.clientUpdateRead.upsert({
    where: { userId_dailyProgressReportId: { userId: team.CLIENT.id, dailyProgressReportId: approvedDpr.id } },
    update: {},
    create: { organizationId: organization.id, userId: team.CLIENT.id, dailyProgressReportId: approvedDpr.id }
  });

  const documentSeed = [
    { id: "orchid-doc-contract", title: "Orchid Residency signed contract", fileName: "orchid-signed-contract.txt", category: "CONTRACT", content: "Signed contract reference for the Orchid Residency demo project." },
    { id: "orchid-doc-drawing", title: "Foundation reinforcement drawing", fileName: "foundation-reinforcement-drawing.txt", category: "DRAWING", content: "Foundation reinforcement drawing reference for the Orchid Residency demo project." },
    { id: "orchid-doc-po", title: "Electrical conduit purchase order", fileName: "po-demo-001.txt", category: "PURCHASE_DOCUMENT", content: "Purchase order PO-DEMO-001 for electrical conduit." }
  ];
  for (const documentData of documentSeed) {
    const storageKey = `${documentData.id}.txt`;
    await db.document.upsert({
      where: { id: documentData.id },
      update: { title: documentData.title, category: documentData.category, storageKey },
      create: { id: documentData.id, organizationId: organization.id, projectId: project.id, projectSiteId: "orchid-residency-main-site", title: documentData.title, fileName: documentData.fileName, storageKey, contentType: "text/plain", size: Buffer.byteLength(documentData.content), category: documentData.category }
    });
  }

  const superAdmin = await db.membership.findFirstOrThrow({ where: { organizationId: organization.id, role: "SUPER_ADMIN" } });
  const auditSeed = [
    ["CREATED", "PROJECT", project.id, "Created Orchid Residency project using the residential template."],
    ["ASSIGNED", "PROJECT_ACCESS", team.SITE_ENGINEER.id, "Assigned the site engineering team to Orchid Residency."],
    ["APPROVED", "PURCHASE_ORDER", purchaseOrder.id, "Approved partial receipt plan for electrical conduit purchase order."],
    ["RECORDED", "CLIENT_PAYMENT", bill.id, "Recorded a partial client payment against the foundation milestone."]
  ];
  for (const [action, entityType, entityId, description] of auditSeed) {
    const exists = await db.auditEvent.findFirst({ where: { organizationId: organization.id, action, entityType, entityId } });
    if (!exists) await db.auditEvent.create({ data: { organizationId: organization.id, actorId: superAdmin.userId, action, entityType, entityId, description } });
  }

  console.log(JSON.stringify({ project: project.name, boq: boq.name, itemCount: items.length, budget, teamMembers: teamSeed.length, template: template.name, demoPassword }));
}

main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.$disconnect());
