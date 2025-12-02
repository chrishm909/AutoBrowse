// Background service worker for AutoBrowse extension

// Listen for extension installation
chrome.runtime.onInstalled.addListener((details) => {
  console.log('AutoBrowse extension installed', details);
  
  // Set default settings
  chrome.storage.sync.set({
    enabledUrls: [], // URLs where the bubble should appear
    autoPrintEnabled: false
  });
});

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'print') {
    console.log('Print action requested from tab:', sender.tab?.id);
    sendResponse({ status: 'success' });
  }
  
  return true; // Keep message channel open for async response
});

// Optional: Listen for keyboard shortcuts
chrome.commands?.onCommand.addListener((command) => {
  if (command === 'print-current-page') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'print' });
      }
    });
  }
});
