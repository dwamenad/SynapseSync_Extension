# Google Re-Consent Runbook (Sheets Scope)

When you add `https://www.googleapis.com/auth/spreadsheets` to OAuth scopes, existing users must re-consent to grant the new permission.

## Steps

1. Confirm deployed backend includes updated scopes in `apps/api/src/lib/google.ts`.
2. Verify OAuth consent screen in Google Cloud includes Sheets scope.
3. Publish consent-screen changes if required by your environment.
4. Ask existing users to sign out and reconnect via `/auth/google`.
5. For each user account, verify:
   - `/api/google/status` returns connected user
   - `POST /api/research/evidence-matrix` succeeds

## Failure signatures

- HTTP `401/403` from `/api/research/evidence-matrix`: user lacks new scope.
- Google API auth error mentioning `insufficientPermissions`: re-consent not completed.

## User-facing guidance text

\"We added Evidence Matrix support in Google Sheets. Please reconnect your Google account once to grant spreadsheet access.\"

