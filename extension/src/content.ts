import type { PaperData } from "./types";

type ScrapeRequestMessage = {
  type: "SYNAPSE_SYNC_GET_PAPER_DATA";
};

type ScrapeResponseMessage = {
  ok: boolean;
  paperData?: PaperData;
  error?: string;
};

function compactText(input: string | null | undefined) {
  return (input || "").replace(/\s+/g, " ").trim();
}

function extractAbstractText() {
  const abstractContainer = document.querySelector<HTMLElement>(".abstract-content");
  if (!abstractContainer) {
    return "";
  }

  const paragraphs = Array.from(
    abstractContainer.querySelectorAll<HTMLElement>("p, .abstract-content.selected")
  )
    .map((el) => compactText(el.textContent))
    .filter(Boolean);

  if (paragraphs.length > 0) {
    return paragraphs.join("\n\n");
  }

  return compactText(abstractContainer.textContent);
}

function extractAuthors() {
  return Array.from(document.querySelectorAll<HTMLElement>(".authors-list .full-name"))
    .map((el) => compactText(el.textContent))
    .filter(Boolean);
}

function extractDoi() {
  const doiAnchor =
    document.querySelector<HTMLAnchorElement>("a[href*='doi.org']") ||
    document.querySelector<HTMLAnchorElement>("#full-view-identifiers a.link-item");

  const href = doiAnchor?.href;
  if (!href) {
    return undefined;
  }

  const match = href.match(/doi\.org\/(.+)$/i);
  return match?.[1] || compactText(doiAnchor.textContent) || undefined;
}

function scrapePubMedPage(): PaperData {
  const title = compactText(
    document.querySelector<HTMLElement>("h1.heading-title")?.textContent
  );
  const abstract = extractAbstractText();
  const authors = extractAuthors();
  const doi = extractDoi();

  if (!title) {
    throw new Error("Could not find PubMed article title.");
  }
  if (!abstract) {
    throw new Error("Could not find PubMed abstract content.");
  }

  return {
    title,
    abstract,
    authors,
    doi,
    url: window.location.href
  };
}

chrome.runtime.onMessage.addListener(
  (
    message: ScrapeRequestMessage,
    _sender,
    sendResponse: (response: ScrapeResponseMessage) => void
  ) => {
    if (message.type !== "SYNAPSE_SYNC_GET_PAPER_DATA") {
      return false;
    }

    try {
      sendResponse({ ok: true, paperData: scrapePubMedPage() });
    } catch (error) {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "PubMed scrape failed"
      });
    }

    return false;
  }
);
