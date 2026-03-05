import { Router } from "express";
import { z } from "zod";
import { requireCsrf } from "../middleware/csrf";
import {
  createGoogleDocForUser,
  getGoogleIntegrationStatusForUser,
  getGoogleDriveAccessTokenForUser,
  listDriveFoldersForUser
} from "../services/googleDocService";
import { prisma } from "../lib/prisma";

const router = Router();
const FolderQuerySchema = z.object({
  query: z.string().optional(),
  pageSize: z.coerce.number().min(1).max(100).optional()
});

router.post("/createDoc", requireCsrf, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const result = await createGoogleDocForUser(userId, req.body);
    return res.status(200).json(result);
  } catch (error) {
    return res.status(400).json({
      error: error instanceof Error ? error.message : "Failed to create doc"
    });
  }
});

router.get("/recentDocs", async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const docs = await prisma.recentDoc.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 20
  });

  return res.status(200).json({ docs });
});

router.get("/folders", async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const parsed = FolderQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid query params" });
  }

  try {
    const folders = await listDriveFoldersForUser(userId, parsed.data);
    return res.status(200).json({ folders });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to list folders"
    });
  }
});

router.get("/pickerToken", async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const accessToken = await getGoogleDriveAccessTokenForUser(userId);
    return res.status(200).json({ accessToken });
  } catch (error) {
    return res.status(500).json({
      error:
        error instanceof Error ? error.message : "Failed to create picker token"
    });
  }
});

router.get("/status", async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const status = await getGoogleIntegrationStatusForUser(userId);
    return res.status(200).json(status);
  } catch (error) {
    return res.status(500).json({
      connected: false,
      mode: "real",
      error:
        error instanceof Error ? error.message : "Failed to check integration status"
    });
  }
});

export default router;
