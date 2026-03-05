// extension/src/background.ts
function isSupportedTabUrl(url) {
  if (!url) {
    return false;
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}
async function updateSidePanelForTab(tabId, url) {
  await chrome.sidePanel.setOptions({
    tabId,
    path: "sidepanel.html",
    enabled: isSupportedTabUrl(url)
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
//# sourceMappingURL=background.js.map
