# Google Docs Chat App

Full-stack TypeScript app where a user signs in with Google, chats with ChatGPT, and has the app create Google Docs in their Drive (optional folder), insert formatted content, optionally share, and track recent docs.

## Stack

- Frontend: Next.js (TypeScript)
- Backend: Node.js + Express (TypeScript)
- Auth: Google OAuth 2.0 Authorization Code + PKCE
- Google APIs: Drive API v3 + Docs API v1
- AI: OpenAI Responses API with strict function-calling schema
- DB: Prisma + SQLite (portable to Postgres)

## Features

- Google OAuth sign-in with offline access and refresh token support
- Chat endpoint that uses OpenAI tool calling (`create_google_doc`)
- Google Doc creation via `drive.files.create` with `mimeType: application/vnd.google-apps.document`
- Content insertion via `docs.documents.batchUpdate` + `InsertTextRequest` at index `1`
- Markdown MVP formatting support:
  - `#` and `##` headings
  - `**bold**` and `*italic*`
- Optional sharing via `drive.permissions.create`
- Recent docs list stored in DB and shown on dashboard
- Token encryption at rest using AES-256-GCM (`TOKEN_ENCRYPTION_KEY`)
- No token logging
- CSRF mitigation on OAuth endpoints using PKCE verifier + state cookie checks
- Secure cookie defaults (`httpOnly`, `sameSite=lax`, `secure` in production)

## Required Environment Variables

Create `.env` from `.env.example`:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `OPENAI_API_KEY`
- `TOKEN_ENCRYPTION_KEY`
- `DATABASE_URL`
- `SESSION_COOKIE_SECRET`
- `APP_BASE_URL`
- `MOCK_AUTH` (optional for local test mode)
- `MOCK_GOOGLE_APIS` (optional for local test mode)

## Google Cloud Setup

1. Create a Google Cloud project:
   - [Create and manage projects](https://cloud.google.com/resource-manager/docs/creating-managing-projects)
2. Enable APIs:
   - [Google Drive API](https://console.cloud.google.com/apis/library/drive.googleapis.com)
   - [Google Docs API](https://console.cloud.google.com/apis/library/docs.googleapis.com)
3. Configure OAuth consent screen:
   - [Set up OAuth consent screen](https://developers.google.com/workspace/guides/configure-oauth-consent)
4. Create OAuth Client ID (Web application):
   - [Create OAuth client credentials](https://developers.google.com/identity/protocols/oauth2/web-server#creatingcred)
5. Add authorized redirect URI:
   - `http://localhost:3000/auth/google/callback`

### Required Scopes (minimal)

- `openid`, `email`, `profile`
  - identify signed-in user
- `https://www.googleapis.com/auth/drive.file`
  - create/access files created or opened by this app
- `https://www.googleapis.com/auth/documents`
  - edit Google Docs content

Scope reference:
- [Google OAuth scope registry](https://developers.google.com/identity/protocols/oauth2/scopes)
- [Drive scopes](https://developers.google.com/drive/api/guides/api-specific-auth)
- [Docs API auth](https://developers.google.com/docs/api/auth)

## Run Locally

```bash
npm install
cp .env.example .env
npx prisma migrate dev --name init
npm run prisma:generate
npm run dev
```

App URLs:
- Frontend: `http://localhost:3000`
- API: `http://localhost:4000`

The web app rewrites `/auth/*` and `/api/*` to the Express API.

## Main Endpoints

- `GET /auth/google` start OAuth
- `GET /auth/google/callback` OAuth callback, token storage
- `POST /api/chat` user message -> OpenAI tool call routing
- `POST /api/google/createDoc` direct tool endpoint for doc creation + insertion
- `GET /api/google/recentDocs` list recent docs created by app
- `GET /api/me` current auth state

## OpenAI Tool Contract

Tool name: `create_google_doc`

Arguments:
- `title` (string, required)
- `folderId` (string, optional)
- `content` (string, required)
- `contentFormat` (`plain | markdown | html`, default `plain`)
- `shareWith` (optional email array)
- `shareRole` (`reader | commenter | writer`, optional)

## Testing

```bash
npm test
npm run test:e2e
```

Included tests:
- Unit: markdown converter -> Docs requests
- Integration: mocked Google API calls verify Drive create then Docs batchUpdate
- E2E happy path: sign in -> create doc -> doc appears in recent list (mock mode)

## Notes / MVP Limitations

- Markdown parser is intentionally minimal and does not support nested formatting.
- Folder picker MVP is a folder ID input; Google Drive Picker can be added later.
- SQLite is default for local development; Prisma schema is portable to Postgres.
