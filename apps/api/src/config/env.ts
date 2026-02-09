import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_REDIRECT_URI: z.string().url(),
  OPENAI_API_KEY: z.string().min(1),
  TOKEN_ENCRYPTION_KEY: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  SESSION_COOKIE_SECRET: z.string().min(1),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  MOCK_AUTH: z
    .string()
    .optional()
    .transform((v) => v === "true"),
  MOCK_GOOGLE_APIS: z
    .string()
    .optional()
    .transform((v) => v === "true")
});

export type Env = z.infer<typeof EnvSchema>;

export const env: Env = EnvSchema.parse(process.env);
