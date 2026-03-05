// extension/src/api.ts
async function parseJsonResponse(res) {
  const data = await res.json();
  if (!res.ok) {
    const errorMessage = typeof data.error === "string" ? data.error : `Request failed (${res.status})`;
    throw new Error(errorMessage);
  }
  return data;
}
var SynapseSyncApi = class {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
  }
  setBaseUrl(baseUrl) {
    this.baseUrl = baseUrl;
  }
  getBaseUrl() {
    return this.baseUrl;
  }
  getWebAppUrl() {
    return this.baseUrl.replace(":4000", ":3000");
  }
  async getRecentDocs() {
    const res = await fetch(`${this.baseUrl}/api/google/recentDocs`, {
      credentials: "include"
    });
    const data = await parseJsonResponse(res);
    return data.docs;
  }
  async getCsrfToken() {
    const res = await fetch(`${this.baseUrl}/api/csrf`, {
      credentials: "include"
    });
    const data = await parseJsonResponse(res);
    return data.csrfToken;
  }
  async summarizeAndAppend(payload) {
    const csrfToken = await this.getCsrfToken();
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfToken
      },
      body: JSON.stringify(payload)
    });
    return parseJsonResponse(res);
  }
};

// extension/src/sidepanel.ts
var STORAGE_KEY_API_BASE = "synapsesync_api_base";
var DEFAULT_API_BASE = "http://localhost:4000";
function requireElement(selector) {
  const element = document.querySelector(selector);
  if (!element) {
    throw new Error(`Sidepanel UI failed to initialize. Missing ${selector}`);
  }
  return element;
}
var apiBaseInput = requireElement("#apiBaseUrl");
var saveApiBaseButton = requireElement("#saveApiBase");
var refreshDocsButton = requireElement("#refreshDocs");
var openLoginButton = requireElement("#openLogin");
var docSelect = requireElement("#docSelect");
var summarizeAppendButton = requireElement("#summarizeAppend");
var neuroModeToggle = requireElement("#neuroMode");
var statusEl = requireElement("#status");
var api = new SynapseSyncApi(DEFAULT_API_BASE);
function setStatus(message) {
  statusEl.textContent = message;
}
function setWorking(isWorking) {
  summarizeAppendButton.disabled = isWorking;
  refreshDocsButton.disabled = isWorking;
}
function renderDocOptions(docs) {
  docSelect.innerHTML = "";
  if (docs.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No docs found. Sign in and create one first.";
    docSelect.appendChild(opt);
    return;
  }
  for (const doc of docs) {
    const opt = document.createElement("option");
    opt.value = doc.documentId;
    opt.textContent = doc.title;
    docSelect.appendChild(opt);
  }
}
async function getStoredApiBaseUrl() {
  const result = await chrome.storage.local.get(STORAGE_KEY_API_BASE);
  const value = result[STORAGE_KEY_API_BASE];
  return typeof value === "string" && value.length > 0 ? value : DEFAULT_API_BASE;
}
async function loadDocList() {
  setStatus("Loading recent docs...");
  try {
    const docs = await api.getRecentDocs();
    renderDocOptions(docs);
    setStatus(`Loaded ${docs.length} recent docs.`);
  } catch (error) {
    setStatus(
      `Failed to load docs. Sign in first: ${api.getWebAppUrl()}/auth/google
${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}
function isSupportedResearchUrl(url) {
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
async function requestScrape(tabId) {
  return await chrome.tabs.sendMessage(tabId, {
    type: "SYNAPSE_SYNC_GET_PAPER_DATA"
  });
}
async function ensureContentScript(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["dist/content.js"]
  });
}
async function scrapeFromActiveResearchTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error("No active browser tab found.");
  }
  const tabUrl = tab.url || "";
  if (!isSupportedResearchUrl(tabUrl)) {
    throw new Error(
      "Open a PubMed, arXiv, bioRxiv, or journal article page before running Summarize & Append."
    );
  }
  let response;
  try {
    response = await requestScrape(tab.id);
  } catch {
    try {
      await ensureContentScript(tab.id);
      response = await requestScrape(tab.id);
    } catch {
      throw new Error(
        "Could not reach the scraper on this page. Reload the tab and try again."
      );
    }
  }
  if (!response?.ok || !response.paperData) {
    throw new Error(response?.error || "Could not scrape paper data from current tab.");
  }
  return response.paperData;
}
async function onSummarizeAppend() {
  const targetDocId = docSelect.value;
  if (!targetDocId) {
    setStatus("Pick a target Google Doc first.");
    return;
  }
  setWorking(true);
  try {
    setStatus("Scraping research page...");
    const paperData = await scrapeFromActiveResearchTab();
    setStatus("Generating neuroscience summary and appending to doc...");
    const result = await api.summarizeAndAppend({
      paperData,
      targetDocId,
      neuroMode: neuroModeToggle.checked
    });
    const lines = [result.message];
    if (result.appendedDoc?.documentUrl) {
      lines.push(`Doc: ${result.appendedDoc.documentUrl}`);
    }
    if (result.summary) {
      lines.push("\nSummary preview:\n" + result.summary.slice(0, 900));
    }
    setStatus(lines.join("\n"));
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Summarize & append failed.");
  } finally {
    setWorking(false);
  }
}
async function init() {
  const storedApi = await getStoredApiBaseUrl();
  api.setBaseUrl(storedApi);
  apiBaseInput.value = storedApi;
  await loadDocList();
  saveApiBaseButton.addEventListener("click", async () => {
    const nextBase = apiBaseInput.value.trim();
    if (!nextBase) {
      setStatus("Enter a valid backend API base URL.");
      return;
    }
    await chrome.storage.local.set({ [STORAGE_KEY_API_BASE]: nextBase });
    api.setBaseUrl(nextBase);
    setStatus(`Saved backend URL: ${nextBase}`);
    await loadDocList();
  });
  refreshDocsButton.addEventListener("click", () => {
    void loadDocList();
  });
  openLoginButton.addEventListener("click", () => {
    chrome.tabs.create({ url: `${api.getWebAppUrl()}/auth/google` });
  });
  summarizeAppendButton.addEventListener("click", () => {
    void onSummarizeAppend();
  });
}
void init();
//# sourceMappingURL=sidepanel.js.map
