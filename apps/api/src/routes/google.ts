import { Router } from "express";
import { requireCsrf } from "../middleware/csrf";
import { createGoogleDocForUser } from "../services/googleDocService";
import { prisma } from "../lib/prisma";

const router = Router();

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

export default router;
