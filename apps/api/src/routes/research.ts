import { Router, type Response } from "express";
import OpenAI from "openai";
import { z } from "zod";
import { env } from "../config/env";
import { createInMemoryRateLimiter } from "../middleware/rateLimit";
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
const MAX_TITLE_CHARS = 500;
const MAX_BODY_CHARS = 20_000;
const MAX_URL_CHARS = 2_000;
const MAX_CITATION_CHARS = 30_000;
const researchPostLimiter = createInMemoryRateLimiter({
  windowMs: env.RESEARCH_RATE_LIMIT_WINDOW_MS,
  max: env.RESEARCH_RATE_LIMIT_MAX,
  message: "Research request limit reached. Please retry shortly."
});

const PaperDataSchema = z.object({
  title: z.string().min(1).max(MAX_TITLE_CHARS),
  abstract: z.string().min(1).max(MAX_BODY_CHARS),
  url: z.string().url().max(MAX_URL_CHARS),
  methods: z.string().max(MAX_BODY_CHARS).optional(),
  figures: z.string().max(MAX_BODY_CHARS).optional(),
  discussion: z.string().max(MAX_BODY_CHARS).optional(),
  conclusions: z.string().max(MAX_BODY_CHARS).optional(),
  futureDirections: z.string().max(MAX_BODY_CHARS).optional(),
  citations: z.string().max(MAX_CITATION_CHARS).optional(),
  sourceType: z.enum(["pubmed", "arxiv", "biorxiv", "journal"]).optional(),
  authors: z.array(z.string().max(300)).max(120).optional(),
  doi: z.string().max(300).optional()
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

function respondWithTiming(
  res: Response,
  startedAt: number,
  status: number,
  body: unknown
) {
  res.setHeader("x-operation-ms", String(Date.now() - startedAt));
  return res.status(status).json(body);
}

router.post("/overlap-check", researchPostLimiter, requireCsrf, async (req, res) => {
  const startedAt = Date.now();
  const userId = req.user?.id;
  if (!userId) {
    return respondWithTiming(res, startedAt, 401, { error: "Unauthorized" });
  }

  const parsed = OverlapBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return respondWithTiming(res, startedAt, 400, {
      error: "Invalid overlap-check payload."
    });
  }

  try {
    const result = await checkOverlapForPaper(
      openai,
      userId,
      parsed.data.targetDocId,
      parsed.data.paperData
    );
    return respondWithTiming(res, startedAt, 200, result);
  } catch (error) {
    return respondWithTiming(res, startedAt, 500, {
      error: error instanceof Error ? error.message : "Overlap check failed"
    });
  }
});

router.get("/papers", async (req, res) => {
  const startedAt = Date.now();
  const userId = req.user?.id;
  if (!userId) {
    return respondWithTiming(res, startedAt, 401, { error: "Unauthorized" });
  }

  const parsed = TargetDocQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return respondWithTiming(res, startedAt, 400, {
      error: "Missing targetDocId query parameter."
    });
  }

  const papers = await listPaperEntriesForDoc(userId, parsed.data.targetDocId);
  return respondWithTiming(res, startedAt, 200, {
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

router.post("/evidence-matrix", researchPostLimiter, requireCsrf, async (req, res) => {
  const startedAt = Date.now();
  const userId = req.user?.id;
  if (!userId) {
    return respondWithTiming(res, startedAt, 401, { error: "Unauthorized" });
  }

  const parsed = EvidenceMatrixBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return respondWithTiming(res, startedAt, 400, {
      error: "Invalid evidence-matrix payload."
    });
  }

  try {
    const result = await generateEvidenceMatrixForUser(userId, parsed.data.targetDocId);
    return respondWithTiming(res, startedAt, 200, result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to generate evidence matrix";
    const status = /append papers first|no papers/i.test(message) ? 400 : 500;
    return respondWithTiming(res, startedAt, status, { error: message });
  }
});

router.get("/evidence-matrix", async (req, res) => {
  const startedAt = Date.now();
  const userId = req.user?.id;
  if (!userId) {
    return respondWithTiming(res, startedAt, 401, { error: "Unauthorized" });
  }

  const parsed = TargetDocQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return respondWithTiming(res, startedAt, 400, {
      error: "Missing targetDocId query parameter."
    });
  }

  const result = await getEvidenceMatrixForUser(userId, parsed.data.targetDocId);
  return respondWithTiming(res, startedAt, 200, result);
});

router.post("/synthesize", researchPostLimiter, requireCsrf, async (req, res) => {
  const startedAt = Date.now();
  const userId = req.user?.id;
  if (!userId) {
    return respondWithTiming(res, startedAt, 401, { error: "Unauthorized" });
  }

  const parsed = SynthesizeBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return respondWithTiming(res, startedAt, 400, {
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

    return respondWithTiming(res, startedAt, 200, {
      message: "Synthesis appended successfully.",
      synthesisText: result.synthesisText,
      appendedDoc: result.appendedDoc
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Synthesis failed";
    const status = /invalid for the target document/i.test(message) ? 400 : 500;
    return respondWithTiming(res, startedAt, status, { error: message });
  }
});

export default router;
