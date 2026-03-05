# SynapseSync

**Research-to-Doc pipeline for Neuroscience PhDs**  
Scrape PubMed abstracts from Chrome, generate a structured neuroscience literature summary, and append it into a selected Google Doc.

---

SynapseSync combines:

- **Next.js dashboard** for chat and document management
- **Express/TypeScript backend** for OAuth, AI orchestration, and Google Docs updates
- **Chrome Extension (Manifest V3)** side panel for PubMed scraping + one-click append
- **Prisma data layer** (SQLite local, Postgres-ready schema included)

Core capabilities:

- Google OAuth 2.0 login (Authorization Code + PKCE)
- Secure token encryption at rest (AES-256-GCM)
- OpenAI Responses API integration
- Google Docs creation and append workflows
- PubMed-to-Doc extension flow with neuroscience-specific summarization mode
- CSRF protection and session handling

---

## Quick Start

### Prerequisites

- Node.js 20+
- npm
- Google Cloud project with Drive + Docs APIs enabled
- OpenAI API key
- Chrome (for extension testing)

### Step 1: Install

```bash
npm install
```

### Step 2: Configure environment

```bash
cp .env.example .env
```

Set required values in `.env`:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI` (usually `http://localhost:3000/auth/google/callback`)
- `OPENAI_API_KEY`
- `TOKEN_ENCRYPTION_KEY`
- `DATABASE_URL`
- `SESSION_COOKIE_SECRET`
- `APP_BASE_URL`

For extension CORS in production, set:

- `CHROME_EXTENSION_ORIGINS=chrome-extension://<YOUR_EXTENSION_ID>`

### Step 3: Prepare DB and run app

```bash
npx prisma migrate dev --name init
npm run prisma:generate
npm run dev
```

- Web app: `http://localhost:3000`
- API: `http://localhost:4000`

### Step 4: Build and load Chrome extension

```bash
npm run build:extension
```

Then in Chrome:

1. Open `chrome://extensions`
2. Enable Developer mode
3. Click **Load unpacked**
4. Select `extension/`

### Step 5: Use SynapseSync flow

1. Sign in to Google from web app (`/auth/google`) or from extension “Open Login”
2. Open a PubMed abstract page (`https://pubmed.ncbi.nlm.nih.gov/...`)
3. Open SynapseSync side panel
4. Select target doc from Recent Docs
5. Click **Summarize & Append**

---

## How It Works

### Web App Flow

1. User authenticates via Google OAuth
2. Backend stores encrypted token payload in Prisma
3. Chat endpoint handles:
   - normal doc-creation instructions
   - extension payload mode for paper append
4. Google Docs API updates document content through `documents.batchUpdate`

### Extension Flow (PubMed -> Google Doc)

1. `content.ts` scrapes current PubMed page:
   - `h1.heading-title`
   - `.abstract-content`
   - authors, DOI, page URL
2. `sidepanel.ts` loads recent docs from backend
3. On **Summarize & Append**:
   - requests scraped payload from content script
   - calls `POST /api/chat` with:
     - `paperData`
     - `targetDocId`
     - `neuroMode`
4. Backend generates structured summary and appends to the selected doc via `PATCH /api/google/appendDoc`

### Append Logic

`PATCH /api/google/appendDoc` performs:

1. Insert horizontal rule at document end
2. Insert paper title and style as **Heading 2**
3. Insert AI-generated summary body
4. Insert linked PubMed URL

---

## API Reference

### Auth

- `GET /auth/google`
- `GET /auth/google/callback`
- `POST /auth/logout`

### Core

- `GET /api/me`
- `GET /api/csrf`
- `POST /api/chat`

### Google

- `POST /api/google/createDoc`
- `PATCH /api/google/appendDoc`
- `GET /api/google/recentDocs`
- `GET /api/google/folders`
- `GET /api/google/pickerToken`
- `GET /api/google/status`

### `POST /api/chat` payload modes

#### 1) Normal chat mode

```json
{
  "message": "Create a doc titled X with this content: ...",
  "folderId": "optional-folder-id"
}
```

#### 2) Extension append mode

```json
{
  "paperData": {
    "title": "Paper title",
    "abstract": "Abstract text",
    "url": "https://pubmed.ncbi.nlm.nih.gov/...",
    "authors": ["Author A", "Author B"],
    "doi": "10.xxxx/..."
  },
  "targetDocId": "google-doc-id",
  "neuroMode": true
}
```

---

## Chrome Extension

Files:

- `extension/manifest.json`
- `extension/sidepanel.html`
- `extension/src/background.ts`
- `extension/src/content.ts`
- `extension/src/sidepanel.ts`
- `extension/src/api.ts`

Manifest highlights:

- `manifest_version: 3`
- permissions: `activeTab`, `storage`, `scripting`, `sidePanel`, `tabs`
- host permissions:
  - `https://pubmed.ncbi.nlm.nih.gov/*`
  - `http://localhost:4000/*`
- side panel default path: `sidepanel.html`

---

## Configuration

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth client secret |
| `GOOGLE_REDIRECT_URI` | Yes | OAuth callback URI |
| `OPENAI_API_KEY` | Yes | OpenAI Responses API |
| `TOKEN_ENCRYPTION_KEY` | Yes | Encrypt OAuth tokens at rest |
| `DATABASE_URL` | Yes | Prisma DB connection |
| `SESSION_COOKIE_SECRET` | Yes | Cookie signing secret |
| `APP_BASE_URL` | Yes | Web app base URL |
| `CHROME_EXTENSION_ORIGINS` | Prod recommended | Allowed extension origins for CORS |
| `MOCK_AUTH` | Optional | Mock auth mode |
| `MOCK_GOOGLE_APIS` | Optional | Mock Google operations |
| `NEXT_PUBLIC_GOOGLE_API_KEY` | Optional | Google Picker in web dashboard |

---

## Project Structure

```text
apps/
  api/
    src/
      routes/
      services/
      middleware/
  web/
    app/
    components/
extension/
  manifest.json
  sidepanel.html
  src/
prisma/
tests/
scripts/
```

---

## Development

```bash
# Type checks
npm run typecheck

# Unit + integration tests
npm test

# E2E tests
npm run test:e2e

# Build extension bundle
npm run build:extension
```

---

## Security & CORS Notes

- Mutating routes require CSRF token validation
- Access/refresh tokens are encrypted before storage
- Avoid logging tokens
- Extension requests use `credentials: "include"`; backend must return:
  - `Access-Control-Allow-Origin` with exact origin
  - `Access-Control-Allow-Credentials: true`
- In production, explicitly set `CHROME_EXTENSION_ORIGINS`

---

## Troubleshooting

### Extension shows no docs

- Ensure you are signed in via backend OAuth
- Verify side panel API base URL (`http://localhost:4000`)
- Confirm cookies/session are valid

### Append fails

- Check `targetDocId` exists and belongs to accessible scope
- Ensure required scopes include Docs + Drive file access
- Verify CSRF endpoint is reachable (`/api/csrf`)

### CORS or auth issues from extension

- Confirm extension origin is allowed (`CHROME_EXTENSION_ORIGINS`)
- Ensure requests include `credentials: "include"`

---

## Disclaimer

SynapseSync is a developer project scaffold and not medical advice software. Always validate literature summaries against full-text papers and primary data before academic or clinical use.

---

## Acknowledgements

- Chrome extension implementation patterns were informed by [GoogleChrome/chrome-extensions-samples](https://github.com/GoogleChrome/chrome-extensions-samples) (Manifest V3 side panel and messaging recipes).
- README organization style was adapted to match the high-signal structure used in [llmsresearch/paperbanana](https://github.com/llmsresearch/paperbanana).

---

## License

MIT (or your preferred license).
