// extension/src/content.ts
var HEADING_SELECTOR = "h1,h2,h3,h4,h5,h6";
var DOI_REGEX = /10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i;
var MAX_SECTION_CHARS = 8e3;
var MAX_CITATIONS = 30;
function compactText(input) {
  return (input || "").replace(/\s+/g, " ").trim();
}
function trimSection(value) {
  if (!value) {
    return void 0;
  }
  const normalized = value.trim();
  if (!normalized) {
    return void 0;
  }
  if (normalized.length <= MAX_SECTION_CHARS) {
    return normalized;
  }
  return `${normalized.slice(0, MAX_SECTION_CHARS)}...`;
}
function textFromElement(element) {
  if (!element) {
    return "";
  }
  const htmlElement = element;
  return compactText(htmlElement.innerText || element.textContent);
}
function firstText(selectors) {
  for (const selector of selectors) {
    const value = textFromElement(document.querySelector(selector));
    if (value) {
      return value;
    }
  }
  return "";
}
function allText(selectors) {
  const values = [];
  for (const selector of selectors) {
    const matches = Array.from(document.querySelectorAll(selector)).map((node) => textFromElement(node)).filter(Boolean);
    if (matches.length) {
      values.push(...matches);
    }
  }
  return values.join("\n\n");
}
function uniqueStrings(values) {
  return Array.from(new Set(values.map((v) => compactText(v)).filter(Boolean)));
}
function splitDelimitedValues(value) {
  return value.split(/;|\sand\s/gi).map((item) => compactText(item)).filter(Boolean);
}
function extractMetaValues(names) {
  const values = [];
  for (const name of names) {
    const metaByName = Array.from(
      document.querySelectorAll(`meta[name="${name}"]`)
    );
    const metaByProperty = Array.from(
      document.querySelectorAll(`meta[property="${name}"]`)
    );
    for (const meta of [...metaByName, ...metaByProperty]) {
      const value = compactText(meta.content);
      if (value) {
        values.push(value);
      }
    }
  }
  return values;
}
function extractSectionFromHeading(pattern) {
  const headings = Array.from(document.querySelectorAll(HEADING_SELECTOR));
  for (const heading of headings) {
    const headingText = compactText(heading.textContent).toLowerCase();
    if (!pattern.test(headingText)) {
      continue;
    }
    const content = [];
    let cursor = heading.nextElementSibling;
    while (cursor) {
      if (cursor.matches(HEADING_SELECTOR)) {
        break;
      }
      const value = textFromElement(cursor);
      if (value) {
        content.push(value);
      }
      cursor = cursor.nextElementSibling;
    }
    if (content.length > 0) {
      return content.join("\n\n");
    }
    const sectionContainer = heading.closest("section,article,div");
    if (sectionContainer) {
      const sectionText = textFromElement(sectionContainer);
      if (sectionText) {
        return sectionText;
      }
    }
  }
  return void 0;
}
function extractSection(options) {
  const bySelector = trimSection(allText(options.selectors));
  if (bySelector) {
    return bySelector;
  }
  return trimSection(extractSectionFromHeading(options.headingPattern));
}
function detectSourceType() {
  const host = window.location.hostname.toLowerCase();
  if (host.includes("pubmed.ncbi.nlm.nih.gov")) {
    return "pubmed";
  }
  if (host.includes("arxiv.org")) {
    return "arxiv";
  }
  if (host.includes("biorxiv.org")) {
    return "biorxiv";
  }
  return "journal";
}
function extractTitle(sourceType) {
  if (sourceType === "pubmed") {
    return firstText(["h1.heading-title"]) || extractMetaValues(["citation_title", "og:title"])[0] || firstText(["h1"]);
  }
  if (sourceType === "arxiv") {
    const raw = firstText(["h1.title.mathjax", "h1.title"]) || extractMetaValues(["citation_title", "og:title"])[0] || firstText(["h1"]);
    return raw.replace(/^title:\s*/i, "").trim();
  }
  if (sourceType === "biorxiv") {
    return firstText(["h1.highwire-cite-title", "h1#page-title"]) || extractMetaValues(["citation_title", "og:title"])[0] || firstText(["h1"]);
  }
  return extractMetaValues(["citation_title", "og:title", "dc.title"])[0] || firstText(["main h1", "article h1", "h1"]);
}
function extractAbstract(sourceType) {
  if (sourceType === "pubmed") {
    const abstractContent = firstText([
      ".abstract-content.selected",
      ".abstract-content",
      "[id*='abstract']"
    ]);
    if (abstractContent) {
      return abstractContent;
    }
  }
  if (sourceType === "arxiv") {
    const raw = firstText(["blockquote.abstract.mathjax", "blockquote.abstract"]) || extractMetaValues(["description", "og:description"])[0] || "";
    const cleaned = raw.replace(/^abstract:\s*/i, "").trim();
    if (cleaned) {
      return cleaned;
    }
  }
  if (sourceType === "biorxiv") {
    const abstractContent = firstText([
      "section.abstract",
      "div.section.abstract",
      ".highwire-markup.abstract",
      "[id*='abstract']"
    ]);
    if (abstractContent) {
      return abstractContent;
    }
  }
  const genericAbstract = firstText([
    "[data-test*='abstract']",
    "[class*='abstract'] p",
    "[class*='abstract']",
    "section#abstract",
    "section.abstract",
    "article [id*='abstract']",
    "article section"
  ]) || trimSection(extractSectionFromHeading(/^(abstract|summary)$/i)) || extractMetaValues(["description", "og:description", "dc.description"])[0] || "";
  if (genericAbstract) {
    return genericAbstract.replace(/^abstract[:\s-]*/i, "").trim();
  }
  const fallbackParagraph = Array.from(document.querySelectorAll("article p, main p, p")).map((node) => textFromElement(node)).filter((value) => value.length > 70).slice(0, 3).join("\n\n");
  return fallbackParagraph;
}
function extractAuthors(sourceType) {
  const sourceSelectors = {
    pubmed: [".authors-list .full-name", "[data-author-type='author'] .full-name"],
    arxiv: [".authors a", ".authors"],
    biorxiv: [".highwire-citation-authors .nlm-given-names", ".highwire-citation-authors"],
    journal: ["[class*='author'] [class*='name']", "[rel='author']", "[class*='authors'] a"]
  };
  const fromMeta = extractMetaValues([
    "citation_author",
    "dc.creator",
    "dc.Creator",
    "author"
  ]).flatMap(splitDelimitedValues);
  const fromSelectors = allText(sourceSelectors[sourceType]).split(/\n+/).map((value) => compactText(value)).flatMap(splitDelimitedValues);
  const unique = uniqueStrings([...fromMeta, ...fromSelectors]);
  return unique.length ? unique : void 0;
}
function extractDoi() {
  const metaCandidates = extractMetaValues([
    "citation_doi",
    "dc.identifier",
    "dc.Identifier"
  ]);
  for (const candidate of metaCandidates) {
    const match = candidate.match(DOI_REGEX);
    if (match?.[0]) {
      return match[0];
    }
  }
  const doiLink = document.querySelector(
    "a[href*='doi.org'], a[href*='dx.doi.org']"
  );
  const doiText = compactText(doiLink?.href || doiLink?.textContent);
  const linkMatch = doiText.match(DOI_REGEX);
  if (linkMatch?.[0]) {
    return linkMatch[0];
  }
  const pageMatch = compactText(document.body.innerText).match(DOI_REGEX);
  return pageMatch?.[0];
}
function extractFigures() {
  const captions = Array.from(
    document.querySelectorAll(
      "figure figcaption, .fig-caption, [class*='figure'] figcaption, [class*='figcaption']"
    )
  ).map((node) => textFromElement(node)).filter(Boolean).slice(0, 12);
  if (captions.length > 0) {
    return trimSection(captions.join("\n\n"));
  }
  return trimSection(extractSectionFromHeading(/^(figures?|results and figures?)$/i));
}
function extractCitations() {
  const citations = /* @__PURE__ */ new Set();
  const metaCitations = extractMetaValues(["citation_reference"]);
  for (const citation of metaCitations) {
    if (citation) {
      citations.add(citation);
    }
  }
  const referenceNodes = Array.from(
    document.querySelectorAll(
      "[id*='reference'] li, .references li, .ref-list li, ol.citations li, .citation-list li"
    )
  );
  for (const node of referenceNodes) {
    const value = textFromElement(node);
    if (value) {
      citations.add(value);
    }
    if (citations.size >= MAX_CITATIONS) {
      break;
    }
  }
  const list = Array.from(citations).slice(0, MAX_CITATIONS);
  return list.length ? trimSection(list.join("\n")) : void 0;
}
function scrapeResearchPage() {
  const sourceType = detectSourceType();
  const title = extractTitle(sourceType);
  if (!title) {
    throw new Error("Could not find article title on this page.");
  }
  const methods = extractSection({
    selectors: [
      "[class*='method']",
      "[id*='method']",
      "section.methods",
      "section#methods",
      "section.materials-and-methods"
    ],
    headingPattern: /^(methods?|materials and methods|methodology|experimental procedures?)$/i
  });
  const discussion = extractSection({
    selectors: ["[class*='discussion']", "[id*='discussion']", "section.discussion"],
    headingPattern: /^discussion$/i
  });
  const conclusions = extractSection({
    selectors: ["[class*='conclusion']", "[id*='conclusion']", "section.conclusion"],
    headingPattern: /^(conclusions?|concluding remarks?|summary and conclusions?)$/i
  });
  const futureDirections = extractSection({
    selectors: [
      "[class*='future']",
      "[id*='future']",
      "section.future-directions",
      "section.future-work"
    ],
    headingPattern: /^(future directions?|future work|next steps|future research)$/i
  });
  const abstract = trimSection(extractAbstract(sourceType)) || trimSection([methods, discussion, conclusions].filter(Boolean).join("\n\n"));
  if (!abstract) {
    throw new Error("Could not extract abstract or summary text from this page.");
  }
  return {
    title,
    abstract,
    methods,
    figures: extractFigures(),
    discussion,
    conclusions,
    futureDirections,
    citations: extractCitations(),
    authors: extractAuthors(sourceType),
    doi: extractDoi(),
    sourceType,
    url: window.location.href
  };
}
function registerScrapeMessageHandler() {
  if (window.__synapseSyncContentListenerRegistered) {
    return;
  }
  window.__synapseSyncContentListenerRegistered = true;
  chrome.runtime.onMessage.addListener(
    (message, _sender, sendResponse) => {
      if (message.type !== "SYNAPSE_SYNC_GET_PAPER_DATA") {
        return false;
      }
      try {
        sendResponse({ ok: true, paperData: scrapeResearchPage() });
      } catch (error) {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Page scrape failed"
        });
      }
      return false;
    }
  );
}
registerScrapeMessageHandler();
//# sourceMappingURL=content.js.map
