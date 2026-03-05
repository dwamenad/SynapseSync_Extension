const PUBMED_ORIGIN = "https://pubmed.ncbi.nlm.nih.gov";

async function updateSidePanelForTab(tabId: number, url?: string) {
  if (!url) {
    await chrome.sidePanel.setOptions({ tabId, enabled: false });
    return;
  }

  const origin = new URL(url).origin;
  await chrome.sidePanel.setOptions({
    tabId,
    path: "sidepanel.html",
    enabled: origin === PUBMED_ORIGIN
  });
}

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.tabs.onUpdated.addListener((tabId, _changeInfo, tab) => {
  void updateSidePanelForTab(tabId, tab.url);
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await chrome.tabs.get(tabId);
  void updateSidePanelForTab(tabId, tab.url);
});
