import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  use: {
    baseURL: "http://localhost:3000"
  },
  webServer: {
    command:
      "MOCK_AUTH=true MOCK_GOOGLE_APIS=true GOOGLE_CLIENT_ID=test GOOGLE_CLIENT_SECRET=test GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback OPENAI_API_KEY=test TOKEN_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef DATABASE_URL=file:./e2e.db SESSION_COOKIE_SECRET=test APP_BASE_URL=http://localhost:3000 npx prisma db push --skip-generate && MOCK_AUTH=true MOCK_GOOGLE_APIS=true GOOGLE_CLIENT_ID=test GOOGLE_CLIENT_SECRET=test GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback OPENAI_API_KEY=test TOKEN_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef DATABASE_URL=file:./e2e.db SESSION_COOKIE_SECRET=test APP_BASE_URL=http://localhost:3000 npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120000
  }
});
