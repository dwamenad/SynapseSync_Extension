const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:4000";

function getCookieHeader(cookies) {
  return Array.from(cookies.entries())
    .map(([key, value]) => `${key}=${value}`)
    .join("; ");
}

function setCookiesFromResponse(response, cookies) {
  const setCookieHeader = response.headers.get("set-cookie");
  if (!setCookieHeader) {
    return;
  }

  const cookieParts = setCookieHeader.split(/,(?=[^;]+=[^;]+)/g);
  for (const part of cookieParts) {
    const [cookiePair] = part.split(";");
    const [name, value] = cookiePair.split("=");
    if (name && value) {
      cookies.set(name.trim(), value.trim());
    }
  }
}

async function requestWithCookies(path, options, cookies) {
  const headers = new Headers(options?.headers || {});
  const cookieHeader = getCookieHeader(cookies);
  if (cookieHeader) {
    headers.set("cookie", cookieHeader);
  }
  const response = await fetch(`${API_BASE_URL}${path}`, {
    redirect: "manual",
    ...options,
    headers
  });
  setCookiesFromResponse(response, cookies);
  return response;
}

async function main() {
  const cookies = new Map();
  const log = (...args) => console.log("[smoke]", ...args);

  log(`API base: ${API_BASE_URL}`);
  log("Authenticating (requires MOCK_AUTH=true for local smoke)...");
  const authRes = await requestWithCookies("/auth/google", { method: "GET" }, cookies);
  if (![200, 302].includes(authRes.status)) {
    throw new Error(`Auth bootstrap failed with status ${authRes.status}`);
  }

  const csrfRes = await requestWithCookies("/api/csrf", { method: "GET" }, cookies);
  if (!csrfRes.ok) {
    throw new Error(`Failed to get CSRF token: ${csrfRes.status}`);
  }
  const csrfData = await csrfRes.json();
  const csrfToken = csrfData.csrfToken;
  if (!csrfToken) {
    throw new Error("Missing csrfToken in /api/csrf response.");
  }

  log("Creating baseline doc...");
  const createRes = await requestWithCookies(
    "/api/chat",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({
        message: `Create a doc titled Smoke Connection ${Date.now()} with this content: Seed`
      })
    },
    cookies
  );
  const createData = await createRes.json();
  if (!createRes.ok || !createData.createdDoc?.documentId) {
    throw new Error(`Failed to create doc: ${JSON.stringify(createData)}`);
  }
  const targetDocId = createData.createdDoc.documentId;
  log(`Created doc: ${targetDocId}`);

  log("Appending 5 paper summaries...");
  for (let i = 0; i < 5; i += 1) {
    const appendRes = await requestWithCookies(
      "/api/chat",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrfToken
        },
        body: JSON.stringify({
          targetDocId,
          disciplineMode: true,
          paperData: {
            title: `Smoke Paper ${i + 1}`,
            abstract: "Participants completed repeated decision trials under uncertainty.",
            methods:
              "Twenty participants completed a probabilistic reversal-learning task with fMRI.",
            discussion: "Findings suggest value-sensitive dynamics in prefrontal circuits.",
            conclusions: "Gain-loss asymmetry was observed in key contrasts.",
            url: `https://example.org/smoke-paper-${i + 1}`
          }
        })
      },
      cookies
    );
    if (!appendRes.ok) {
      const appendData = await appendRes.text();
      throw new Error(`Append failed on iteration ${i + 1}: ${appendData}`);
    }
  }

  log("Generating Evidence Matrix...");
  const matrixRes = await requestWithCookies(
    "/api/research/evidence-matrix",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({ targetDocId })
    },
    cookies
  );
  const matrixData = await matrixRes.json();
  if (!matrixRes.ok || !matrixData.sheetUrl) {
    throw new Error(`Evidence matrix failed: ${JSON.stringify(matrixData)}`);
  }
  log(`Matrix URL: ${matrixData.sheetUrl}`);

  log("Fetching saved papers...");
  const papersRes = await requestWithCookies(
    `/api/research/papers?targetDocId=${encodeURIComponent(targetDocId)}`,
    { method: "GET" },
    cookies
  );
  const papersData = await papersRes.json();
  if (!papersRes.ok || !Array.isArray(papersData.papers) || papersData.papers.length < 5) {
    throw new Error(`Expected >=5 saved papers: ${JSON.stringify(papersData)}`);
  }

  const selectedIds = papersData.papers.slice(0, 5).map((paper) => paper.id);
  log("Generating synthesis...");
  const synthRes = await requestWithCookies(
    "/api/research/synthesize",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify({
        targetDocId,
        mode: "thematic",
        paperEntryIds: selectedIds
      })
    },
    cookies
  );
  const synthData = await synthRes.json();
  if (!synthRes.ok || !synthData.appendedDoc?.documentUrl) {
    throw new Error(`Synthesis failed: ${JSON.stringify(synthData)}`);
  }
  log(`Synthesis appended: ${synthData.appendedDoc.documentUrl}`);

  log("Connection Phase smoke test completed successfully.");
}

main().catch((error) => {
  console.error("[smoke] FAILED:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
