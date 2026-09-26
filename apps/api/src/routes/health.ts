import { Router } from "express";
import { db } from "../db.js";

export const healthRouter = Router();
healthRouter.get("/health", async (_request, response) => { try { await db.$queryRaw`SELECT 1`; response.json({ status: "ok", service: "kravient-api", database: "connected", timestamp: new Date().toISOString() }); } catch { response.status(503).json({ status: "degraded", service: "kravient-api", database: "unavailable" }); } });
