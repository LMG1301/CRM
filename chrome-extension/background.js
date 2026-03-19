// Boost CRM — Background Service Worker

// Open side panel when clicking the extension icon
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Listen for messages from LinkedIn content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'LINKEDIN_PROFILE') {
    chrome.storage.session.set({ linkedinProfile: message.data });
  }
});
