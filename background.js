// Background service worker for AutoBrowse extension

// Track iframe origins and permissions
const iframeOrigins = new Map(); // tabId -> Set of origins
const pendingPermissions = new Map(); // origin -> Promise

// Listen for extension installation
chrome.runtime.onInstalled.addListener((details) => {
  console.log('AutoBrowse extension installed', details);
  
  // Set default settings
  chrome.storage.sync.set({
    enabledUrls: [], // URLs where the bubble should appear
    autoPrintEnabled: false
  });
  
  // Initialize local storage for authorized origins
  chrome.storage.local.get(['authorizedOrigins'], (data) => {
    if (!data.authorizedOrigins) {
      chrome.storage.local.set({ authorizedOrigins: [] });
    }
  });
});

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'print') {
    console.log('Print action requested from tab:', sender.tab?.id);
    sendResponse({ status: 'success' });
    return true;
  }
  
  if (request.action === 'crossOriginIframeDetected') {
    // A cross-origin iframe was detected
    const tabId = sender.tab?.id;
    const origin = request.origin;
    
    if (tabId) {
      if (!iframeOrigins.has(tabId)) {
        iframeOrigins.set(tabId, new Set());
      }
      iframeOrigins.get(tabId).add(origin);
      console.log(`Cross-origin iframe detected in tab ${tabId}:`, origin);
    }
    
    sendResponse({ received: true });
    return true;
  }
  
  if (request.action === 'requestOriginPermission') {
    // Request permission for a specific origin
    handleOriginPermissionRequest(request.origin, sendResponse);
    return true; // Keep channel open for async response
  }
  
  if (request.action === 'executeInIframe') {
    // Execute code in an iframe
    handleIframeExecution(request, sender, sendResponse);
    return true;
  }
  
  if (request.action === 'getIframeOrigins') {
    // Get detected iframe origins for a tab
    const tabId = sender.tab?.id || request.tabId;
    const origins = tabId ? Array.from(iframeOrigins.get(tabId) || []) : [];
    sendResponse({ origins });
    return true;
  }
  
  return true;
});

/**
 * Handle origin permission request
 */
async function handleOriginPermissionRequest(origin, sendResponse) {
  try {
    // Check if we already have permission
    const hasPermission = await chrome.permissions.contains({
      origins: [origin + '/*']
    });
    
    if (hasPermission) {
      sendResponse({ granted: true, origin });
      return;
    }
    
    // Check for pending request
    if (pendingPermissions.has(origin)) {
      const result = await pendingPermissions.get(origin);
      sendResponse(result);
      return;
    }
    
    // Request new permission
    const permissionPromise = new Promise((resolve) => {
      chrome.permissions.request(
        {
          origins: [origin + '/*']
        },
        (granted) => {
          if (granted) {
            console.log('Permission granted for:', origin);
            
            // Inject content script into existing iframe pages with this origin
            injectContentScriptInOrigin(origin);
            
            resolve({ granted: true, origin });
          } else {
            console.log('Permission denied for:', origin);
            resolve({ granted: false, origin });
          }
          
          pendingPermissions.delete(origin);
        }
      );
    });
    
    pendingPermissions.set(origin, permissionPromise);
    const result = await permissionPromise;
    sendResponse(result);
    
  } catch (error) {
    console.error('Permission request error:', error);
    sendResponse({ granted: false, error: error.message });
  }
}

/**
 * Inject content script into all tabs with specific origin
 */
async function injectContentScriptInOrigin(origin) {
  try {
    const tabs = await chrome.tabs.query({});
    
    for (const tab of tabs) {
      if (tab.url && tab.url.startsWith(origin)) {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id, allFrames: true },
            files: ['iframe-bridge.js']
          });
          console.log('Injected iframe bridge into tab:', tab.id);
        } catch (err) {
          console.warn('Could not inject into tab:', tab.id, err);
        }
      }
    }
  } catch (error) {
    console.error('Error injecting scripts:', error);
  }
}

/**
 * Handle iframe execution request
 */
async function handleIframeExecution(request, sender, sendResponse) {
  try {
    const { origin, fnString, args, messageId } = request;
    const tabId = sender.tab?.id;
    
    if (!tabId) {
      sendResponse({ success: false, error: 'No tab ID' });
      return;
    }
    
    // Check permission
    const hasPermission = await chrome.permissions.contains({
      origins: [origin + '/*']
    });
    
    if (!hasPermission) {
      sendResponse({ success: false, error: 'No permission for origin' });
      return;
    }
    
    // Execute script in iframe
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tabId, allFrames: true },
        func: executeInFrameContext,
        args: [origin, fnString, args, messageId]
      });
      
      // Find the result from the matching frame
      const result = results.find(r => r.result?.executed);
      
      if (result) {
        sendResponse({ success: true, result: result.result.value });
      } else {
        sendResponse({ success: false, error: 'No matching frame found' });
      }
    } catch (execError) {
      console.error('Execution error:', execError);
      sendResponse({ success: false, error: execError.message });
    }
    
  } catch (error) {
    console.error('Iframe execution error:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Function injected into frames to execute code
 */
function executeInFrameContext(targetOrigin, fnString, args, messageId) {
  // Check if this frame matches the target origin
  if (window.location.origin !== targetOrigin) {
    return { executed: false };
  }
  
  try {
    // Execute the function
    const fn = new Function('return ' + fnString)();
    const result = fn.apply(null, args);
    
    // Send result back to parent
    window.parent.postMessage({
      type: 'iframeExecutionResponse',
      messageId: messageId,
      success: true,
      result: result
    }, '*');
    
    return { executed: true, value: result };
  } catch (error) {
    window.parent.postMessage({
      type: 'iframeExecutionResponse',
      messageId: messageId,
      success: false,
      error: error.message
    }, '*');
    
    return { executed: true, error: error.message };
  }
}

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

// Clean up iframe origins when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  iframeOrigins.delete(tabId);
});
