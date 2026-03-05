import { SynapseSyncApi } from "./api";
import type { PaperData, RecentDoc } from "./types";

const STORAGE_KEY_API_BASE = "synapsesync_api_base";
const DEFAULT_API_BASE = "http://localhost:4000";

const apiBaseInput = document.querySelector<HTMLInputElement>("#apiBaseUrl");
const saveApiBaseButton = document.querySelector<HTMLButtonElement>("#saveApiBase");
const refreshDocsButton = document.querySelector<HTMLButtonElement>("#refreshDocs");
const openLoginButton = document.querySelector<HTMLButtonElement>("#openLogin");
const docSelect = document.querySelector<HTMLSelectElement>("#docSelect");
const summarizeAppendButton = document.querySelector<HTMLButtonElement>("#summarizeAppend");
const neuroModeToggle = document.querySelector<HTMLInputElement>("#neuroMode");
const statusEl = document.querySelector<HTMLElement>("#status");

if (
  !apiBaseInput ||
  !saveApiBaseButton ||
  !refreshDocsButton ||
  !openLoginButton ||
  !docSelect ||
  !summarizeAppendButton ||
  !neuroModeToggle ||
  !statusEl
) {
  throw new Error("Sidepanel UI failed to initialize.");
}

const api = new SynapseSyncApi(DEFAULT_API_BASE);

function setStatus(message: string) {
  statusEl.textContent = message;
}

function setWorking(isWorking: boolean) {
  summarizeAppendButton.disabled = isWorking;
  refreshDocsButton.disabled = isWorking;
}

function renderDocOptions(docs: RecentDoc[]) {
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
      `Failed to load docs. Sign in first: ${api.getWebAppUrl()}/auth/google\n${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

async function scrapeFromActivePubMedTab(): Promise<PaperData> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error("No active browser tab found.");
  }

  const response = (await chrome.tabs.sendMessage(tab.id, {
    type: "SYNAPSE_SYNC_GET_PAPER_DATA"
  })) as { ok: boolean; paperData?: PaperData; error?: string };

  if (!response?.ok || !response.paperData) {
    throw new Error(response?.error || "Could not scrape PubMed data from current tab.");
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
    setStatus("Scraping PubMed page...");
    const paperData = await scrapeFromActivePubMedTab();

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
