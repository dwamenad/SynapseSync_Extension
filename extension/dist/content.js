// extension/src/content.ts
function compactText(input) {
  return (input || "").replace(/\s+/g, " ").trim();
}
function extractAbstractText() {
  const abstractContainer = document.querySelector(".abstract-content");
  if (!abstractContainer) {
    return "";
  }
  const paragraphs = Array.from(
    abstractContainer.querySelectorAll("p, .abstract-content.selected")
  ).map((el) => compactText(el.textContent)).filter(Boolean);
  if (paragraphs.length > 0) {
    return paragraphs.join("\n\n");
  }
  return compactText(abstractContainer.textContent);
}
function extractAuthors() {
  return Array.from(document.querySelectorAll(".authors-list .full-name")).map((el) => compactText(el.textContent)).filter(Boolean);
}
function extractDoi() {
  const doiAnchor = document.querySelector("a[href*='doi.org']") || document.querySelector("#full-view-identifiers a.link-item");
  const href = doiAnchor?.href;
  if (!href) {
    return void 0;
  }
  const match = href.match(/doi\.org\/(.+)$/i);
  return match?.[1] || compactText(doiAnchor.textContent) || void 0;
}
function scrapePubMedPage() {
  const title = compactText(
    document.querySelector("h1.heading-title")?.textContent
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
  (message, _sender, sendResponse) => {
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
//# sourceMappingURL=content.js.map
