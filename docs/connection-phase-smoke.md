# Connection Phase Smoke Test

Run this after deploy or before tagging a release.

## Prerequisites

1. API server running and reachable at `API_BASE_URL` (default `http://localhost:4000`).
2. For local smoke, backend should run with:
   - `MOCK_AUTH=true`
   - `MOCK_GOOGLE_APIS=true`
3. Latest migrations applied.

## Command

```bash
npm run smoke:connection
```

Optionally set a different API URL:

```bash
API_BASE_URL=https://your-api.example.com npm run smoke:connection
```

## What this validates

1. Auth bootstrap and CSRF retrieval
2. Baseline doc creation
3. Five extension-style paper appends
4. Evidence Matrix generation
5. Saved paper listing
6. Synthesis generation and append

## Expected output

- Matrix URL printed
- Synthesis doc URL printed
- Final success message:
  - `Connection Phase smoke test completed successfully.`

