import { Router } from "express";
import OpenAI from "openai";
import { z } from "zod";
import { env } from "../config/env";
import { requireCsrf } from "../middleware/csrf";
import { createGoogleDocForUser } from "../services/googleDocService";

const router = Router();

const ChatBodySchema = z.object({
  message: z.string().min(1),
  folderId: z.string().optional()
});

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

const toolSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    folderId: { type: "string" },
    content: { type: "string" },
    contentFormat: {
      type: "string",
      enum: ["plain", "markdown", "html"],
      default: "plain"
    },
    shareWith: {
      type: "array",
      items: { type: "string" }
    },
    shareRole: {
      type: "string",
      enum: ["reader", "commenter", "writer"]
    }
  },
  required: ["title", "content"]
} as const;

router.post("/chat", requireCsrf, async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const parsed = ChatBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request body" });
  }

  const folderHint = parsed.data.folderId
    ? `If a folder is requested and missing in the message, use folderId ${parsed.data.folderId}.`
    : "";

  try {
    if (env.MOCK_GOOGLE_APIS) {
      const maybeTitle = parsed.data.message.match(/titled\\s+(.+?)\\s+with\\s+this\\s+content:/i);
      const maybeContent = parsed.data.message.match(/with\\s+this\\s+content:\\s*([\\s\\S]+)/i);
      const args = {
        title: maybeTitle?.[1]?.trim() || "Untitled Doc",
        folderId: parsed.data.folderId || undefined,
        content: maybeContent?.[1]?.trim() || parsed.data.message,
        contentFormat: "plain" as const
      };
      const createdDoc = await createGoogleDocForUser(userId, args);
      return res.status(200).json({
        message: `Created \\\"${createdDoc.title}\\\" successfully.`,
        createdDoc
      });
    }

    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content:
            "You create Google Docs via tools. When user asks to create/edit a doc, call create_google_doc. Return concise confirmations for non-tool cases. " +
            folderHint
        },
        {
          role: "user",
          content: parsed.data.message
        }
      ],
      tools: [
        {
          type: "function",
          name: "create_google_doc",
          strict: true,
          description: "Create and populate a Google Doc in the user's Drive.",
          parameters: toolSchema
        }
      ]
    });

    const functionCall = response.output.find(
      (item) => item.type === "function_call" && item.name === "create_google_doc"
    );

    if (!functionCall || functionCall.type !== "function_call") {
      return res.status(200).json({
        message:
          response.output_text ||
          "I can create a doc if you provide a title and content.",
        createdDoc: null
      });
    }

    const rawArgs = JSON.parse(functionCall.arguments || "{}");
    const createdDoc = await createGoogleDocForUser(userId, rawArgs);

    return res.status(200).json({
      message: `Created \"${createdDoc.title}\" successfully.`,
      createdDoc
    });
  } catch {
    return res.status(500).json({ error: "Chat processing failed" });
  }
});

export default router;
