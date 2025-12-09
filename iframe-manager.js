// Iframe Origin Manager for AutoBrowse extension
// Detects cross-origin iframes and manages permissions

class IframeManager {
  constructor() {
    this.detectedOrigins = new Set();
    this.authorizedOrigins = new Set();
    this.iframeMap = new Map(); // Maps iframe elements to their origins
    this.observers = new Map();
  }

  /**
   * Initialize iframe detection and monitoring
   */
  initialize() {
    // Load previously authorized origins
    this.loadAuthorizedOrigins();
    
    // Scan for iframes on page load
    this.scanForIframes();
    
    // Watch for dynamically added iframes
    this.observeIframes();
    
    // Listen for messages from iframes
    window.addEventListener('message', (event) => this.handleIframeMessage(event));
  }

  /**
   * Load authorized origins from storage
   */
  async loadAuthorizedOrigins() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['authorizedOrigins'], (data) => {
        if (data.authorizedOrigins) {
          this.authorizedOrigins = new Set(data.authorizedOrigins);
        }
        resolve();
      });
    });
  }

  /**
   * Save authorized origins to storage
   */
  async saveAuthorizedOrigins() {
    return new Promise((resolve) => {
      chrome.storage.local.set({
        authorizedOrigins: Array.from(this.authorizedOrigins)
      }, resolve);
    });
  }

  /**
   * Scan for all iframes on the page
   */
  scanForIframes() {
    const iframes = document.querySelectorAll('iframe');
    iframes.forEach(iframe => this.processIframe(iframe));
  }

  /**
   * Process a single iframe
   */
  processIframe(iframe) {
    try {
      // Try to access iframe content (will fail for cross-origin)
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      
      if (iframeDoc) {
        // Same-origin iframe - we can access it
        console.log('Same-origin iframe detected:', iframe.src || 'about:blank');
      }
    } catch (e) {
      // Cross-origin iframe
      const iframeSrc = iframe.src;
      if (iframeSrc && iframeSrc !== 'about:blank' && iframeSrc !== '') {
        try {
          const url = new URL(iframeSrc);
          const origin = url.origin;
          
          if (!this.detectedOrigins.has(origin)) {
            this.detectedOrigins.add(origin);
            this.iframeMap.set(iframe, origin);
            console.log('Cross-origin iframe detected:', origin);
            
            // Notify that a cross-origin iframe was found
            this.notifyCrossOriginIframe(origin, iframe);
          }
        } catch (urlError) {
          console.warn('Invalid iframe URL:', iframeSrc);
        }
      }
    }
  }

  /**
   * Observe for dynamically added iframes
   */
  observeIframes() {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeName === 'IFRAME') {
            this.processIframe(node);
          } else if (node.querySelectorAll) {
            const iframes = node.querySelectorAll('iframe');
            iframes.forEach(iframe => this.processIframe(iframe));
          }
        });
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    this.observers.set('main', observer);
  }

  /**
   * Notify that a cross-origin iframe was detected
   */
  notifyCrossOriginIframe(origin, iframe) {
    // Send message to background script
    chrome.runtime.sendMessage({
      action: 'crossOriginIframeDetected',
      origin: origin,
      pageUrl: window.location.href
    });

    // Store iframe reference
    if (!this.iframeMap.has(iframe)) {
      this.iframeMap.set(iframe, origin);
    }
  }

  /**
   * Request permission for a specific origin
   */
  async requestOriginPermission(origin) {
    return new Promise((resolve, reject) => {
      // Ask user for permission
      if (confirm(`AutoBrowse would like to access content from:\n\n${origin}\n\nThis will allow the extension to automate actions within iframes from this domain.\n\nAllow access?`)) {
        chrome.runtime.sendMessage({
          action: 'requestOriginPermission',
          origin: origin
        }, (response) => {
          if (response && response.granted) {
            this.authorizedOrigins.add(origin);
            this.saveAuthorizedOrigins();
            resolve(true);
          } else {
            reject(new Error('Permission denied by user or system'));
          }
        });
      } else {
        reject(new Error('Permission denied by user'));
      }
    });
  }

  /**
   * Check if origin is authorized
   */
  isOriginAuthorized(origin) {
    return this.authorizedOrigins.has(origin);
  }

  /**
   * Get all detected cross-origin iframes
   */
  getDetectedOrigins() {
    return Array.from(this.detectedOrigins);
  }

  /**
   * Find iframe element by origin
   */
  getIframeByOrigin(origin) {
    for (const [iframe, iframeOrigin] of this.iframeMap.entries()) {
      if (iframeOrigin === origin) {
        return iframe;
      }
    }
    return null;
  }

  /**
   * Find all iframes for a specific origin
   */
  getIframesByOrigin(origin) {
    const iframes = [];
    for (const [iframe, iframeOrigin] of this.iframeMap.entries()) {
      if (iframeOrigin === origin) {
        iframes.push(iframe);
      }
    }
    return iframes;
  }

  /**
   * Execute a function in an iframe context
   */
  async executeInIframe(iframe, fn, ...args) {
    const origin = this.iframeMap.get(iframe);
    
    if (!origin) {
      throw new Error('Iframe origin not found');
    }

    // Check if authorized
    if (!this.isOriginAuthorized(origin)) {
      // Request permission
      await this.requestOriginPermission(origin);
    }

    // Send message to iframe via background script
    return new Promise((resolve, reject) => {
      const messageId = Date.now() + Math.random();
      
      const responseHandler = (event) => {
        if (event.data && event.data.messageId === messageId && event.data.type === 'iframeExecutionResponse') {
          window.removeEventListener('message', responseHandler);
          if (event.data.success) {
            resolve(event.data.result);
          } else {
            reject(new Error(event.data.error));
          }
        }
      };

      window.addEventListener('message', responseHandler);

      // Send execution request to background
      chrome.runtime.sendMessage({
        action: 'executeInIframe',
        origin: origin,
        fnString: fn.toString(),
        args: args,
        messageId: messageId
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        window.removeEventListener('message', responseHandler);
        reject(new Error('Iframe execution timeout'));
      }, 30000);
    });
  }

  /**
   * Handle messages from iframes
   */
  handleIframeMessage(event) {
    // Verify message is from an iframe we're tracking
    if (event.data && event.data.type === 'autobrowse-iframe') {
      console.log('Received message from iframe:', event.data);
      
      // Handle different message types
      switch (event.data.action) {
        case 'ready':
          console.log('Iframe ready:', event.origin);
          break;
        case 'elementFound':
          // Iframe found an element
          break;
        case 'actionComplete':
          // Iframe completed an action
          break;
      }
    }
  }

  /**
   * Find element in any iframe
   */
  async findElementInIframes(selector, method = 'auto') {
    const results = [];
    
    for (const [iframe, origin] of this.iframeMap.entries()) {
      try {
        // Try to access directly first (same-origin)
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (iframeDoc) {
          const element = iframeDoc.querySelector(selector);
          if (element) {
            results.push({ iframe, element, origin, sameOrigin: true });
          }
        }
      } catch (e) {
        // Cross-origin - need to use message passing
        if (this.isOriginAuthorized(origin)) {
          try {
            const found = await this.executeInIframe(iframe, function(sel) {
              const el = document.querySelector(sel);
              if (el) {
                return {
                  tagName: el.tagName,
                  id: el.id,
                  className: el.className,
                  text: el.textContent?.substring(0, 100)
                };
              }
              return null;
            }, selector);
            
            if (found) {
              results.push({ iframe, element: found, origin, sameOrigin: false });
            }
          } catch (execError) {
            console.warn('Failed to search in iframe:', origin, execError);
          }
        }
      }
    }
    
    return results;
  }

  /**
   * Cleanup
   */
  destroy() {
    this.observers.forEach(observer => observer.disconnect());
    this.observers.clear();
    this.detectedOrigins.clear();
    this.iframeMap.clear();
  }
}

// Create global instance
window.iframeManager = new IframeManager();
