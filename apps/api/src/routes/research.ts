import { Router } from "express";
import OpenAI from "openai";
import { z } from "zod";
import { env } from "../config/env";
import { requireCsrf } from "../middleware/csrf";
import { listPaperEntriesForDoc } from "../services/paperEntryService";
import { checkOverlapForPaper } from "../services/overlapService";
import {
  generateEvidenceMatrixForUser,
  getEvidenceMatrixForUser
} from "../services/googleSheetService";
import { synthesizeAndAppendForUser } from "../services/synthesisService";

const router = Router();
const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

const PaperDataSchema = z.object({
  title: z.string().min(1),
  abstract: z.string().min(1),
  url: z.string().url(),
  methods: z.string().optional(),
  figures: z.string().optional(),
  discussion: z.string().optional(),
  conclusions: z.string().optional(),
  futureDirections: z.string().optional(),
  citations: z.string().optional(),
  sourceType: z.enum(["pubmed", "arxiv", "biorxiv", "journal"]).optional(),
  authors: z.array(z.string()).optional(),
  doi: z.string().optional()
});

const TargetDocQuerySchema = z.object({
  targetDocId: z.string().min(1)
});

const OverlapBodySchema = z.object({
  targetDocId: z.string().min(1),
  paperData: PaperDataSchema
});

const EvidenceMatrixBodySchema = z.object({
  targetDocId: z.string().min(1)
});

const SynthesizeBodySchema = z.object({
  targetDocId: z.string().min(1),
  paperEntryIds: z.array(z.string().min(1)).min(5).max(10),
  mode: z.enum(["thematic", "chronological"])
});

router.post("/overlap-check", requireCsrf, async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const parsed = OverlapBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid overlap-check payload." });
  }

  try {
    const result = await checkOverlapForPaper(
      openai,
      userId,
      parsed.data.targetDocId,
      parsed.data.paperData
    );
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Overlap check failed"
    });
  }
});

router.get("/papers", async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const parsed = TargetDocQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "Missing targetDocId query parameter." });
  }

  const papers = await listPaperEntriesForDoc(userId, parsed.data.targetDocId);
  return res.status(200).json({
    papers: papers.map((paper) => ({
      id: paper.id,
      title: paper.title,
      createdAt: paper.createdAt.toISOString(),
      methodology: paper.methodology,
      sampleSize: paper.sampleSize,
      modality: paper.modality,
      brainRegions: paper.brainRegions,
      gainVsLoss: paper.gainVsLoss
    }))
  });
});

router.post("/evidence-matrix", requireCsrf, async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const parsed = EvidenceMatrixBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid evidence-matrix payload." });
  }

  try {
    const result = await generateEvidenceMatrixForUser(userId, parsed.data.targetDocId);
    return res.status(200).json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to generate evidence matrix";
    const status = /append papers first|no papers/i.test(message) ? 400 : 500;
    return res.status(status).json({ error: message });
  }
});

router.get("/evidence-matrix", async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const parsed = TargetDocQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "Missing targetDocId query parameter." });
  }

  const result = await getEvidenceMatrixForUser(userId, parsed.data.targetDocId);
  return res.status(200).json(result);
});

router.post("/synthesize", requireCsrf, async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const parsed = SynthesizeBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error:
        "Invalid synthesize payload. Provide targetDocId, paperEntryIds (5-10), and mode."
    });
  }

  try {
    const result = await synthesizeAndAppendForUser({
      openai,
      userId,
      targetDocId: parsed.data.targetDocId,
      paperEntryIds: parsed.data.paperEntryIds,
      mode: parsed.data.mode
    });

    return res.status(200).json({
      message: "Synthesis appended successfully.",
      synthesisText: result.synthesisText,
      appendedDoc: result.appendedDoc
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Synthesis failed";
    const status = /invalid for the target document/i.test(message) ? 400 : 500;
    return res.status(status).json({ error: message });
  }
});

export default router;

