// Boost CRM — Background service worker
// Activates side panel on Gmail tabs and relays messages

// Enable side panel only on Gmail tabs
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    const isGmail = tab.url.includes('mail.google.com')
    chrome.sidePanel.setOptions({
      tabId,
      path: 'sidepanel.html',
      enabled: isGmail,
    })
  }
})

// Relay messages from content script to side panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GMAIL_CONTACT_DETECTED') {
    // Store the latest contact data so side panel can retrieve it
    chrome.storage.session.set({ gmail_contact: message.data })
    // Do NOT auto-open side panel — user opens it via the extension button
  }
})

// Allow side panel to request the latest contact data
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_GMAIL_CONTACT') {
    chrome.storage.session.get(['gmail_contact'], (result) => {
      sendResponse(result.gmail_contact || null)
    })
    return true // Keep the message channel open for async response
  }
})
