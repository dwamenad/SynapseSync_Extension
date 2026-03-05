# Google Docs Chat App

Full-stack TypeScript app where a user signs in with Google, chats with an AI assistant, and creates Google Docs in their Drive (optionally in a chosen folder) with formatted content.

## Stack

- Frontend: Next.js (TypeScript)
- Backend: Express + Node.js (TypeScript)
- Auth: Google OAuth 2.0 Authorization Code + PKCE
- Google APIs: Drive API v3 + Docs API v1
- AI: OpenAI Responses API + strict function-calling schema
- Data: Prisma (SQLite local, Postgres-ready schema included)

## What this app now supports

- Google OAuth login with offline access and token refresh
- Encrypted OAuth token storage at rest (AES-256-GCM)
- CSRF protection for mutating endpoints (`/api/chat`, `/api/google/createDoc`, `/auth/logout`)
- Rolling session refresh + expired session cleanup
- Chat -> tool-calling flow to create docs
- Fallback intent parser when model tool call is missing
- Create Google Docs + write content + optional sharing
- Richer markdown conversion (headings, bold/italic, links, inline code, lists, fenced code blocks, table rows)
- Recent docs panel with selection and quick actions
- Folder selection options:
  - manual folder ID
  - in-app searchable folder modal
  - optional Google Drive Picker integration
- Integration status indicator (mock vs real)
- Unit, integration, and E2E test coverage
- CI pipeline via GitHub Actions
- Dockerfiles and docker-compose setup

## Required environment variables

Copy `.env.example` to `.env`.

Required for real mode:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `OPENAI_API_KEY`
- `TOKEN_ENCRYPTION_KEY` (must decode to 32 bytes; hex/base64/raw 32-byte supported)
- `DATABASE_URL`
- `SESSION_COOKIE_SECRET`
- `APP_BASE_URL`

Optional:

- `MOCK_AUTH` (`true`/`false`)
- `MOCK_GOOGLE_APIS` (`true`/`false`)
- `NEXT_PUBLIC_GOOGLE_API_KEY` (required only for Google Drive Picker button)

## Google Cloud setup

1. Create a Google Cloud project:
   - [Create/manage projects](https://cloud.google.com/resource-manager/docs/creating-managing-projects)
2. Enable APIs:
   - [Google Drive API](https://console.cloud.google.com/apis/library/drive.googleapis.com)
   - [Google Docs API](https://console.cloud.google.com/apis/library/docs.googleapis.com)
3. Configure OAuth consent:
   - [OAuth consent setup](https://developers.google.com/workspace/guides/configure-oauth-consent)
4. Create OAuth client (Web):
   - [Create OAuth credentials](https://developers.google.com/identity/protocols/oauth2/web-server#creatingcred)
5. Add redirect URI:
   - `http://localhost:3000/auth/google/callback`

### Scopes used

- `openid`, `email`, `profile` (identify user)
- `https://www.googleapis.com/auth/drive.file` (least-privilege file access for app-created/opened files)
- `https://www.googleapis.com/auth/documents` (write Docs content)

Scope references:

- [OAuth scope registry](https://developers.google.com/identity/protocols/oauth2/scopes)
- [Drive auth guide](https://developers.google.com/drive/api/guides/api-specific-auth)
- [Docs API auth](https://developers.google.com/docs/api/auth)

## Local development

```bash
npm install
cp .env.example .env
npx prisma migrate dev --name init
npm run prisma:generate
npm run dev
```

- Web: `http://localhost:3000`
- API: `http://localhost:4000`

## Mock mode quick start

Use mock mode to test UI and flow without real credentials:

```env
MOCK_AUTH=true
MOCK_GOOGLE_APIS=true
OPENAI_API_KEY=test
GOOGLE_CLIENT_ID=test
GOOGLE_CLIENT_SECRET=test
SESSION_COOKIE_SECRET=dev-secret
TOKEN_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef
DATABASE_URL=file:./dev.db
```

## Real mode checklist

1. Set `MOCK_AUTH=false` and `MOCK_GOOGLE_APIS=false`
2. Add real Google + OpenAI credentials in `.env`
3. Restart `npm run dev`
4. Open dashboard and confirm integration status shows `Mode: real connected`

## API endpoints

Auth:
- `GET /auth/google`
- `GET /auth/google/callback`
- `POST /auth/logout`

Core:
- `GET /api/me`
- `GET /api/csrf`
- `POST /api/chat`

Google:
- `POST /api/google/createDoc`
- `GET /api/google/recentDocs`
- `GET /api/google/folders`
- `GET /api/google/pickerToken`
- `GET /api/google/status`

## OpenAI tool contract

Tool: `create_google_doc`

Arguments:
- `title` (required)
- `folderId` (optional)
- `content` (required)
- `contentFormat` (`plain | markdown | html`, default `plain`)
- `shareWith` (optional email array)
- `shareRole` (`reader | commenter | writer`, optional)

## Testing

```bash
npm run test:unit
npm run test:integration
npm test
npm run test:e2e
```

CI workflow is in `.github/workflows/ci.yml` and runs tests in mock mode.

## Production and containers

- API image: `Dockerfile.api`
- Web image: `Dockerfile.web`
- Compose stack: `docker-compose.yml`

Run with compose:

```bash
docker compose up --build
```

Postgres-ready Prisma schema is provided at `prisma/schema.postgres.prisma`.
Use `.env.production.example` as a deployment template.

## Current markdown conversion limits

- Nested markdown structures are still simplified.
- Tables are rendered as readable row text (not true Docs table elements).
- Fenced code blocks are preserved as monospaced text, not syntax-highlighted.
