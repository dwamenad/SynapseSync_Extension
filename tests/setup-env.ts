process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "test-client-id";
process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "test-client-secret";
process.env.GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/auth/google/callback";
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || "test-openai-key";
process.env.TOKEN_ENCRYPTION_KEY =
  process.env.TOKEN_ENCRYPTION_KEY || "0123456789abcdef0123456789abcdef";
process.env.DATABASE_URL = process.env.DATABASE_URL || "file:./test.db";
process.env.SESSION_COOKIE_SECRET = process.env.SESSION_COOKIE_SECRET || "test-session-secret";
process.env.APP_BASE_URL = process.env.APP_BASE_URL || "http://localhost:3000";
