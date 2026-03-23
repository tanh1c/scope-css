// background.js
// Registers keyboard shortcut → sends message to content script to toggle pick mode.
// Also handles sidePanel.open() on icon click (via action).

// Toggle pick mode when keyboard shortcut is pressed
chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-pick") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: "TOGGLE_PICK" });
        // Open side panel on activation
        chrome.sidePanel.open({ tabId: tabs[0].id });
      }
    });
  }
});

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});
