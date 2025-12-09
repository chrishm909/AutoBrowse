// Automation Executor for AutoBrowse extension
// Handles the execution of automation steps

class AutomationExecutor {
  constructor() {
    this.isRunning = false;
    this.currentAutomation = null;
    this.onProgress = null;
    this.onComplete = null;
    this.onError = null;
    this.testMode = false;
    this.highlightBox = null;
    this.stepControlUI = null;
    this.continueExecution = null;
    this.activeRequests = 0;
    this.runningIndicator = null;
    this.shouldStop = false;
    this.escapeHandler = null;
    this.setupNetworkMonitoring();
  }

  /**
   * Setup network activity monitoring
   */
  setupNetworkMonitoring() {
    // Monitor fetch requests
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      this.activeRequests++;
      try {
        const response = await originalFetch.apply(window, args);
        return response;
      } finally {
        this.activeRequests--;
      }
    };

    // Monitor XMLHttpRequest
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;
    
    XMLHttpRequest.prototype.open = function(...args) {
      this._url = args[1];
      return originalOpen.apply(this, args);
    };
    
    XMLHttpRequest.prototype.send = function(...args) {
      const executor = window.automationExecutor;
      if (executor) executor.activeRequests++;
      
      this.addEventListener('loadend', () => {
        if (executor) executor.activeRequests--;
      });
      
      return originalSend.apply(this, args);
    };
  }

  /**
   * Wait for network to become idle (no active requests)
   * @param {number} timeout - Maximum time to wait in ms (default 30000)
   * @param {number} idleTime - Time with no requests to consider idle in ms (default 500)
   */
  async waitForNetworkIdle(timeout = 30000, idleTime = 500) {
    const startTime = Date.now();
    
    return new Promise((resolve, reject) => {
      const checkIdle = () => {
        // Check timeout
        if (Date.now() - startTime > timeout) {
          console.warn('Network idle timeout reached, continuing anyway');
          resolve();
          return;
        }
        
        // If no active requests, wait for idleTime to confirm stability
        if (this.activeRequests === 0) {
          setTimeout(() => {
            // Double check after idle period
            if (this.activeRequests === 0) {
              console.log('Network is idle, continuing');
              resolve();
            } else {
              // New requests started, keep waiting
              setTimeout(checkIdle, 100);
            }
          }, idleTime);
        } else {
          // Still have active requests, check again soon
          setTimeout(checkIdle, 100);
        }
      };
      
      checkIdle();
    });
  }

  /**
   * Execute an automation
   * @param {Object} automation - The automation object with steps
   * @param {Function} onProgress - Callback for progress updates (stepIndex, totalSteps, message)
   * @param {Function} onComplete - Callback when automation completes successfully
   * @param {Function} onError - Callback when automation fails (error)
   * @param {Function} onStepComplete - Callback after each step (stepIndex, step, success, errorMessage)
   * @param {boolean} testMode - If true, pause before each step and highlight target element
   */
  async run(automation, onProgress, onComplete, onError, onStepComplete, testMode = false) {
    // Safety check - only run automations in top window
    if (window !== window.top) {
      console.warn('[AutoBrowse Executor] Automation execution blocked in iframe');
      return;
    }
    
    if (this.isRunning) {
      if (onError) {
        try {
          onError(new Error('Another automation is already running'));
        } catch (e) {
          console.error('Error in onError callback:', e);
        }
      }
      return;
    }

    this.isRunning = true;
    this.currentAutomation = automation;
    this.onProgress = onProgress;
    this.onComplete = onComplete;
    this.onError = onError;
    this.onStepComplete = onStepComplete;
    this.testMode = testMode;
    this.shouldStop = false;
    
    // Show running indicator
    this.showRunningIndicator(automation.name);
    
    // Add ESC key listener to stop automation
    this.escapeHandler = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.shouldStop = true;
        console.log('ESC pressed - stopping automation...');
      }
    };
    document.addEventListener('keydown', this.escapeHandler, true);

    try {
      if (!automation.steps || automation.steps.length === 0) {
        throw new Error('No steps to execute');
      }

      if (this.onProgress) {
        try {
          this.onProgress(0, automation.steps.length, `Starting automation: ${automation.name}`);
        } catch (e) {
          console.error('Error in onProgress callback:', e);
        }
      }

      // Execute each step sequentially
      for (let i = 0; i < automation.steps.length; i++) {
        // Check if user requested stop
        if (this.shouldStop) {
          throw new Error('Automation stopped by user (ESC pressed)');
        }
        
        const step = automation.steps[i];
        
        if (this.onProgress) {
          try {
            this.onProgress(i + 1, automation.steps.length, `Executing step ${i + 1}: ${step.action} on ${step.target || 'page'}`);
          } catch (e) {
            console.error('Error in onProgress callback:', e);
          }
        }

        // In test mode, highlight element and wait for user confirmation
        if (this.testMode && step.target) {
          try {
            await this.showStepControl(step, i + 1, automation.steps.length);
          } catch (cancelError) {
            // User cancelled
            throw new Error('Automation cancelled by user');
          }
        }

        try {
          await this.executeStep(step, i + 1);
          
          // Report step success
          if (this.onStepComplete) {
            try {
              this.onStepComplete(i + 1, step, true, null);
            } catch (e) {
              console.error('Error in onStepComplete callback:', e);
            }
          }
        } catch (stepError) {
          console.log(`Step ${i + 1} failed:`, stepError.message);
          
          // Report step failure
          if (this.onStepComplete) {
            try {
              this.onStepComplete(i + 1, step, false, stepError.message);
            } catch (e) {
              console.error('Error in onStepComplete callback:', e);
            }
          }
          // Re-throw to stop execution
          throw stepError;
        } finally {
          // Clean up highlight after step execution
          if (this.testMode) {
            this.removeHighlight();
          }
        }
      }

      // All steps completed successfully
      if (this.onComplete) {
        try {
          this.onComplete();
        } catch (e) {
          console.error('Error in onComplete callback:', e);
        }
      }

    } catch (error) {
      console.log('Automation execution error:', error.message);
      if (this.onError) {
        try {
          this.onError(error);
        } catch (e) {
          console.error('Error in onError callback:', e);
        }
      }
    } finally {
      this.isRunning = false;
      this.currentAutomation = null;
      this.testMode = false;
      this.removeHighlight();
      this.removeStepControl();
      this.removeRunningIndicator();
      this.removeEscapeHandler();
    }
  }

  /**
   * Show running indicator
   */
  showRunningIndicator(automationName) {
    // Safety check - never run in iframes
    if (window !== window.top) {
      return;
    }
    
    this.removeRunningIndicator();
    
    this.runningIndicator = document.createElement('div');
    this.runningIndicator.id = 'autobrowse-running-indicator';
    this.runningIndicator.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 14px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 10px;
      animation: slideIn 0.3s ease-out;
    `;
    
    this.runningIndicator.innerHTML = `
      <div style="width: 8px; height: 8px; background: #4ade80; border-radius: 50%; animation: pulse 1.5s ease-in-out infinite;"></div>
      <div>
        <div style="font-size: 12px; opacity: 0.9;">Running Automation</div>
        <div style="font-size: 11px; opacity: 0.7; margin-top: 2px;">Press ESC to stop</div>
      </div>
    `;
    
    // Add animations
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideIn {
        from { transform: translateX(100px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      @keyframes pulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.5; transform: scale(1.2); }
      }
    `;
    document.head.appendChild(style);
    
    document.body.appendChild(this.runningIndicator);
  }
  
  /**
   * Remove running indicator
   */
  removeRunningIndicator() {
    if (this.runningIndicator) {
      this.runningIndicator.remove();
      this.runningIndicator = null;
    }
  }
  
  /**
   * Remove escape key handler
   */
  removeEscapeHandler() {
    if (this.escapeHandler) {
      document.removeEventListener('keydown', this.escapeHandler, true);
      this.escapeHandler = null;
    }
    this.shouldStop = false;
  }

  /**
   * Show step control UI with element highlighting
   * @param {Object} step - The step to preview
   * @param {number} stepNumber - Current step number
   * @param {number} totalSteps - Total number of steps
   */
  async showStepControl(step, stepNumber, totalSteps) {
    // Safety check - never run in iframes
    if (window !== window.top) {
      return Promise.resolve('continue');
    }
    
    return new Promise(async (resolve, reject) => {
      // Find and highlight the target element
      try {
        const element = await this.findElement(step.target, stepNumber, step.selectorMethod || 'auto');
        this.highlightElement(element);
        
        // Scroll element into view
        await this.scrollElementIntoView(element);
      } catch (error) {
        console.warn(`Could not find element to highlight: ${error.message}`);
      }

      // Create step control UI
      this.removeStepControl(); // Remove any existing control UI
      
      this.stepControlUI = document.createElement('div');
      this.stepControlUI.id = 'autobrowse-step-control';
      this.stepControlUI.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: white;
        padding: 20px;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        z-index: 2147483646;
        min-width: 320px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      `;
      
      const actionText = step.action === 'input' 
        ? `${step.action} "${step.value || ''}"` 
        : step.action;
      
      this.stepControlUI.innerHTML = `
        <div style="margin-bottom: 16px;">
          <div style="font-size: 11px; color: #666; margin-bottom: 4px;">Step ${stepNumber} of ${totalSteps}</div>
          <div style="font-size: 14px; font-weight: 600; color: #333; margin-bottom: 8px;">
            ${actionText}
          </div>
          <div style="font-size: 12px; color: #666; padding: 8px; background: #f5f5f5; border-radius: 6px; word-break: break-all;">
            Target: ${step.target || 'page'}
          </div>
          <div style="font-size: 11px; color: #999; margin-top: 8px; text-align: center;">
            Press <strong>Space</strong> or <strong>Enter</strong> to execute
          </div>
        </div>
        <div style="display: flex; gap: 8px;">
          <button id="step-cancel" style="flex: 1; padding: 8px 16px; border: 1px solid #dc3545; background: white; color: #dc3545; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500;">
            Cancel
          </button>
          <button id="step-execute" style="flex: 1; padding: 8px 16px; border: none; background: #007bff; color: white; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500;">
            Execute Step
          </button>
        </div>
      `;
      
      document.body.appendChild(this.stepControlUI);
      
      // Add event listeners
      const executeBtn = this.stepControlUI.querySelector('#step-execute');
      const cancelBtn = this.stepControlUI.querySelector('#step-cancel');
      
      const executeStep = () => {
        this.removeStepControl();
        document.removeEventListener('keydown', keydownHandler);
        resolve();
      };
      
      const cancelStep = () => {
        this.removeStepControl();
        this.removeHighlight();
        document.removeEventListener('keydown', keydownHandler);
        reject(new Error('Cancelled by user'));
      };
      
      // Keyboard handler for Space and Enter
      const keydownHandler = (e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          executeStep();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          cancelStep();
        }
      };
      
      executeBtn.addEventListener('click', executeStep);
      cancelBtn.addEventListener('click', cancelStep);
      document.addEventListener('keydown', keydownHandler, true);
      
      // Focus the execute button
      executeBtn.focus();
    });
  }

  /**
   * Highlight an element on the page
   * @param {HTMLElement} element - The element to highlight
   */
  highlightElement(element) {
    // Safety check - never run in iframes
    if (window !== window.top) {
      return;
    }
    
    this.removeHighlight();
    
    if (!element) return;
    
    // Helper to check if element is in an iframe
    const getIframeOffset = (el) => {
      // Check if element's document is different from main document
      const elementDoc = el.ownerDocument;
      if (elementDoc === document) {
        return { x: 0, y: 0, iframe: null };
      }
      
      // Find the iframe containing this element
      const iframes = document.querySelectorAll('iframe');
      for (const iframe of iframes) {
        try {
          if (iframe.contentDocument === elementDoc || iframe.contentWindow.document === elementDoc) {
            const iframeRect = iframe.getBoundingClientRect();
            return { 
              x: iframeRect.left, 
              y: iframeRect.top,
              iframe: iframe
            };
          }
        } catch (e) {
          // Cross-origin iframe, skip
        }
      }
      return { x: 0, y: 0, iframe: null };
    };
    
    // Create highlight box
    this.highlightBox = document.createElement('div');
    this.highlightBox.id = 'autobrowse-highlight';
    this.highlightBox.style.cssText = `
      position: absolute;
      pointer-events: none;
      z-index: 2147483645;
      border: 3px solid #007bff;
      background: rgba(0, 123, 255, 0.1);
      border-radius: 4px;
      transition: all 0.2s ease;
      box-shadow: 0 0 0 4px rgba(0, 123, 255, 0.2);
    `;
    
    document.body.appendChild(this.highlightBox);
    
    // Position highlight
    const updatePosition = () => {
      if (!this.highlightBox || !element) return;
      
      const rect = element.getBoundingClientRect();
      const iframeOffset = getIframeOffset(element);
      
      // Adjust coordinates if element is in iframe
      this.highlightBox.style.left = (rect.left + iframeOffset.x + window.scrollX) + 'px';
      this.highlightBox.style.top = (rect.top + iframeOffset.y + window.scrollY) + 'px';
      this.highlightBox.style.width = rect.width + 'px';
      this.highlightBox.style.height = rect.height + 'px';
    };
    
    updatePosition();
    
    // Update position on scroll/resize (both main window and iframe)
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    
    // Also listen to iframe scroll if element is in iframe
    const iframeOffset = getIframeOffset(element);
    if (iframeOffset.iframe) {
      try {
        const iframeWindow = iframeOffset.iframe.contentWindow;
        iframeWindow.addEventListener('scroll', updatePosition, true);
        iframeWindow.addEventListener('resize', updatePosition);
      } catch (e) {
        // Can't access iframe events
      }
    }
    
    // Store cleanup function
    this.highlightBox._cleanup = () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
      
      if (iframeOffset.iframe) {
        try {
          const iframeWindow = iframeOffset.iframe.contentWindow;
          iframeWindow.removeEventListener('scroll', updatePosition, true);
          iframeWindow.removeEventListener('resize', updatePosition);
        } catch (e) {
          // Can't access iframe events
        }
      }
    };
  }

  /**
   * Remove element highlight
   */
  removeHighlight() {
    if (this.highlightBox) {
      if (this.highlightBox._cleanup) {
        this.highlightBox._cleanup();
      }
      this.highlightBox.remove();
      this.highlightBox = null;
    }
  }

  /**
   * Remove step control UI
   */
  removeStepControl() {
    if (this.stepControlUI) {
      this.stepControlUI.remove();
      this.stepControlUI = null;
    }
  }

  /**
   * Execute a single step with retry logic
   * @param {Object} step - The step to execute
   * @param {number} stepNumber - The step number (for error messages)
   */
  async executeStep(step, stepNumber) {
    const retryCount = step.retryCount || 0;
    const retryDelay = step.retryDelay || 1000;
    
    let lastError = null;
    
    for (let attempt = 0; attempt <= retryCount; attempt++) {
      try {
        // Wait for network to be idle if requested
        if (step.waitForNetwork) {
          console.log(`Step ${stepNumber}: Waiting for network to be idle...`);
          await this.waitForNetworkIdle();
        }
        
        // Wait before execution
        if (step.waitBefore > 0) {
          await this.wait(step.waitBefore);
        }

        // Execute the action
        const method = step.selectorMethod || 'auto';
        switch (step.action) {
          case 'click':
            await this.clickElement(step.target, stepNumber, method);
            break;
          
          case 'mousedown':
            await this.mousedownElement(step.target, stepNumber, method);
            break;
          
          case 'mouseup':
            await this.mouseupElement(step.target, stepNumber, method);
            break;
          
          case 'hover':
            await this.hoverElement(step.target, stepNumber, method);
            break;
          
          case 'focus':
            await this.focusElement(step.target, stepNumber, method);
            break;
          
          case 'input':
            await this.inputText(step.target, step.value || '', stepNumber, method);
            break;
          
          case 'scroll':
            await this.scrollToElement(step.target, stepNumber, method);
            break;
          
          case 'wait':
            // Just wait - no action needed
            break;
          
          default:
            throw new Error(`Unknown action: ${step.action} in step ${stepNumber}`);
        }

        // Wait after execution
        if (step.waitAfter > 0) {
          await this.wait(step.waitAfter);
        }
        
        // Success - break out of retry loop
        if (attempt > 0) {
          console.log(`Step ${stepNumber} succeeded on attempt ${attempt + 1}`);
        }
        return;
        
      } catch (error) {
        lastError = error;
        
        // If we have retries left, wait and try again
        if (attempt < retryCount) {
          console.log(`Step ${stepNumber} failed on attempt ${attempt + 1}, retrying in ${retryDelay}ms... (${retryCount - attempt} retries left)`);
          await this.wait(retryDelay);
        }
      }
    }
    
    // All retries exhausted, throw the last error
    const wrappedError = new Error(`Step ${stepNumber} failed after ${retryCount + 1} attempt(s): ${lastError.message}`);
    wrappedError.originalError = lastError;
    wrappedError.step = step;
    throw wrappedError;
  }

  /**
   * Find element by CSS selector with multiple fallback strategies
   * Supports cross-origin iframes
   * @param {string} selector - CSS selector
   * @param {number} stepNumber - Step number for error messages
   * @param {string} method - Optional specific method to use ('auto', 'querySelector', 'xpath', 'text', 'id', 'class', 'attribute')
   * @returns {HTMLElement|Object} The found element or cross-origin element reference
   */
  async findElement(selector, stepNumber, method = 'auto') {
    if (!selector) {
      throw new Error(`Step ${stepNumber}: No target selector specified`);
    }

    let element = null;
    let usedMethod = '';
    
    // Helper to get all accessible documents (main + same-origin iframes)
    const getAllDocuments = () => {
      const docs = [{ doc: document, iframe: null }];
      const iframes = document.querySelectorAll('iframe');
      iframes.forEach(iframe => {
        try {
          const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
          if (iframeDoc) {
            docs.push({ doc: iframeDoc, iframe: iframe });
          }
        } catch (err) {
          // Cross-origin iframe, will handle separately
        }
      });
      return docs;
    };

    // Helper to wrap element with iframe info if in iframe
    const wrapElement = (el, iframe) => {
      if (iframe && el) {
        el._autobrowse_iframe = iframe;
      }
      return el;
    };

    // If specific method is requested, try only that method
    if (method && method !== 'auto') {
      switch (method) {
        case 'querySelector':
          try {
            const docs = getAllDocuments();
            for (const { doc, iframe } of docs) {
              element = doc.querySelector(selector);
              if (element) {
                usedMethod = 'querySelector';
                console.log(`Found element using ${usedMethod}:`, selector, iframe ? '(in iframe)' : '');
                return wrapElement(element, iframe);
              }
            }
          } catch (e) {
            console.warn(`querySelector failed for "${selector}":`, e.message);
          }
          break;

        case 'xpath':
          try {
            const docs = getAllDocuments();
            for (const { doc, iframe } of docs) {
              const result = doc.evaluate(
                selector,
                doc,
                null,
                XPathResult.FIRST_ORDERED_NODE_TYPE,
                null
              );
              element = result.singleNodeValue;
              if (element) {
                usedMethod = 'XPath';
                console.log(`Found element using ${usedMethod}:`, selector, iframe ? '(in iframe)' : '');
                return wrapElement(element, iframe);
              }
            }
          } catch (e) {
            console.warn(`XPath failed for "${selector}":`, e.message);
          }
          break;

        case 'text':
          const docs = getAllDocuments();
          for (const { doc, iframe } of docs) {
            element = this.findByTextContentInDoc(selector, doc);
            if (element) {
              usedMethod = 'text content';
              console.log(`Found element using ${usedMethod}:`, selector, iframe ? '(in iframe)' : '');
              return wrapElement(element, iframe);
            }
          }
          break;

        case 'position':
          try {
            const docs = getAllDocuments();
            for (const { doc } of docs) {
              element = doc.querySelector(selector);
              if (element) {
                usedMethod = 'position selector';
                console.log(`Found element using ${usedMethod}:`, selector);
                return element;
              }
            }
          } catch (e) {
            console.warn(`Position selector failed for "${selector}":`, e.message);
          }
          break;

        case 'coordinates':
          // Selector format: "x,y"
          const coords = selector.split(',').map(n => parseInt(n.trim()));
          if (coords.length === 2 && !isNaN(coords[0]) && !isNaN(coords[1])) {
            // Return a special object indicating coordinate-based clicking
            return { isCoordinateClick: true, x: coords[0], y: coords[1] };
          }
          throw new Error(`Invalid coordinates format: ${selector}`);

        case 'id':
          element = this.findByPartialId(selector);
          if (element) {
            usedMethod = 'partial ID';
            console.log(`Found element using ${usedMethod}:`, selector);
            return element;
          }
          break;

        case 'class':
          element = this.findByPartialClass(selector);
          if (element) {
            usedMethod = 'partial class';
            console.log(`Found element using ${usedMethod}:`, selector);
            return element;
          }
          break;

        case 'attribute':
          const attrMatch = selector.match(/\[([^=\]]+)=["']([^"']+)["']\]/) || selector.match(/([^=]+)=(.+)/);
          if (attrMatch) {
            const [, attrName, attrValue] = attrMatch;
            element = this.findByAttribute(attrName.trim(), attrValue.trim().replace(/['"]/g, ''));
            if (element) {
              usedMethod = 'attribute match';
              console.log(`Found element using ${usedMethod}:`, attrName, attrValue);
              return element;
            }
          }
          break;
      }
      
      // If specific method was requested but failed in same-origin contexts,
      // try cross-origin iframes before giving up
      if (window.iframeManager) {
        try {
          console.log(`Trying cross-origin iframes for method '${method}':`, selector);
          const crossOriginResults = await this.findElementInCrossOriginIframes(selector, method);
          if (crossOriginResults) {
            console.log('Found element in cross-origin iframe:', crossOriginResults);
            return crossOriginResults;
          }
        } catch (crossOriginError) {
          console.warn('Cross-origin search failed:', crossOriginError.message);
        }
      }
      
      // If specific method was requested but failed, throw error
      throw new Error(`Step ${stepNumber}: Element not found using method '${method}': ${selector}`);
    }

    // Auto mode: try all strategies with fallbacks
    // Strategy 1: Direct querySelector in all documents
    try {
      const docs = getAllDocuments();
      for (const { doc, iframe } of docs) {
        element = doc.querySelector(selector);
        if (element) {
          usedMethod = 'querySelector';
          console.log(`Found element using ${usedMethod}:`, selector, iframe ? '(in iframe)' : '');
          return wrapElement(element, iframe);
        }
      }
    } catch (e) {
      console.warn(`querySelector failed for "${selector}":`, e.message);
    }

    // Strategy 2: Try as XPath if it looks like one
    if (selector.startsWith('/') || selector.startsWith('(')) {
      const docs = getAllDocuments();
      for (const { doc, iframe } of docs) {
        try {
          const result = doc.evaluate(
            selector,
            doc,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null
          );
          element = result.singleNodeValue;
          if (element) {
            usedMethod = 'XPath';
            console.log(`Found element using ${usedMethod}:`, selector, iframe ? '(in iframe)' : '');
            return wrapElement(element, iframe);
          }
        } catch (e) {
          console.warn(`XPath failed for "${selector}":`, e.message);
        }
      }
    }

    // Strategy 3: Try finding by text content (if selector looks like text)
    if (!selector.includes('.') && !selector.includes('#') && !selector.includes('[') && !selector.startsWith('/')) {
      const docs = getAllDocuments();
      for (const { doc, iframe } of docs) {
        element = this.findByTextContentInDoc(selector, doc);
        if (element) {
          usedMethod = 'text content';
          console.log(`Found element using ${usedMethod}:`, selector, iframe ? '(in iframe)' : '');
          return wrapElement(element, iframe);
        }
      }
    }

    // Strategy 4: Try relaxed CSS selector (remove :nth-child)
    if (selector.includes(':nth-child')) {
      const relaxedSelector = selector.replace(/:nth-child\(\d+\)/g, '');
      const docs = getAllDocuments();
      for (const { doc, iframe } of docs) {
        try {
          element = doc.querySelector(relaxedSelector);
          if (element) {
            usedMethod = 'relaxed selector';
            console.log(`Found element using ${usedMethod}:`, relaxedSelector, iframe ? '(in iframe)' : '');
            return wrapElement(element, iframe);
          }
        } catch (e) {
          console.warn(`Relaxed selector failed for "${relaxedSelector}":`, e.message);
        }
      }
    }

    // Strategy 5: Try finding by partial class match
    if (selector.startsWith('.')) {
      const className = selector.substring(1).split('.')[0];
      const docs = getAllDocuments();
      for (const { doc, iframe } of docs) {
        element = this.findByPartialClassInDoc(className, doc);
        if (element) {
          usedMethod = 'partial class';
          console.log(`Found element using ${usedMethod}:`, className, iframe ? '(in iframe)' : '');
          return wrapElement(element, iframe);
        }
      }
    }

    // Strategy 6: Try finding by ID without exact match
    if (selector.startsWith('#')) {
      const idPart = selector.substring(1).split(/[.\s\[>]/)[0];
      const docs = getAllDocuments();
      for (const { doc, iframe } of docs) {
        element = this.findByPartialIdInDoc(idPart, doc);
        if (element) {
          usedMethod = 'partial ID';
          console.log(`Found element using ${usedMethod}:`, idPart, iframe ? '(in iframe)' : '');
          return wrapElement(element, iframe);
        }
      }
    }

    // Strategy 7: Try finding by attribute values
    const attrMatch = selector.match(/\[([^=\]]+)=["']([^"']+)["']\]/);
    if (attrMatch) {
      const [, attrName, attrValue] = attrMatch;
      const docs = getAllDocuments();
      for (const { doc, iframe } of docs) {
        element = this.findByAttributeInDoc(attrName, attrValue, doc);
        if (element) {
          usedMethod = 'attribute match';
          console.log(`Found element using ${usedMethod}:`, attrName, attrValue, iframe ? '(in iframe)' : '');
          return wrapElement(element, iframe);
        }
      }
    }

    // All strategies failed in same-origin contexts
    // Try cross-origin iframes if iframe manager is available
    if (window.iframeManager) {
      try {
        const crossOriginResults = await this.findElementInCrossOriginIframes(selector, method);
        if (crossOriginResults) {
          console.log('Found element in cross-origin iframe:', crossOriginResults);
          return crossOriginResults;
        }
      } catch (crossOriginError) {
        console.warn('Cross-origin search failed:', crossOriginError.message);
      }
    }
    
    throw new Error(`Step ${stepNumber}: Element not found using any strategy: ${selector}`);
  }

  /**
   * Find element in cross-origin iframes
   */
  async findElementInCrossOriginIframes(selector, method = 'auto') {
    if (!window.iframeManager) {
      return null;
    }

    const detectedOrigins = window.iframeManager.getDetectedOrigins();
    
    for (const origin of detectedOrigins) {
      // Check if we have permission for this origin
      if (!window.iframeManager.isOriginAuthorized(origin)) {
        console.log('Requesting permission for origin:', origin);
        try {
          await window.iframeManager.requestOriginPermission(origin);
        } catch (permError) {
          console.warn('Permission denied for origin:', origin);
          continue;
        }
      }

      // Get all iframes for this origin
      const iframes = window.iframeManager.getIframesByOrigin(origin);
      
      for (const iframe of iframes) {
        try {
          // Send find command to iframe
          const result = await this.sendIframeCommand(iframe, {
            action: 'findElement',
            selector: selector,
            method: method
          });
          
          if (result && result.success) {
            // Return a special object indicating cross-origin element
            return {
              isCrossOrigin: true,
              iframe: iframe,
              origin: origin,
              elementInfo: result.result,
              selector: selector,
              method: method
            };
          }
        } catch (iframeError) {
          console.warn('Search failed in iframe:', iframe, iframeError);
        }
      }
    }
    
    return null;
  }

  /**
   * Send command to cross-origin iframe
   */
  async sendIframeCommand(iframe, command) {
    return new Promise((resolve, reject) => {
      const commandId = 'cmd_' + Date.now() + '_' + Math.random();
      command.commandId = commandId;
      command.type = 'autobrowse-command';
      
      // Listen for response
      const responseHandler = (event) => {
        if (event.data && 
            event.data.type === 'autobrowse-response' && 
            event.data.commandId === commandId) {
          window.removeEventListener('message', responseHandler);
          clearTimeout(timeout);
          
          if (event.data.success) {
            resolve(event.data);
          } else {
            reject(new Error(event.data.error || 'Command failed'));
          }
        }
      };
      
      window.addEventListener('message', responseHandler);
      
      // Timeout after 10 seconds
      const timeout = setTimeout(() => {
        window.removeEventListener('message', responseHandler);
        reject(new Error('Iframe command timeout'));
      }, 10000);
      
      // Send command
      try {
        iframe.contentWindow.postMessage(command, '*');
      } catch (e) {
        window.removeEventListener('message', responseHandler);
        clearTimeout(timeout);
        reject(e);
      }
    });
  }

  /**
   * Find element by text content
   */
  findByTextContent(text) {
    // Get all accessible documents
    const docs = [document];
    const iframes = document.querySelectorAll('iframe');
    iframes.forEach(iframe => {
      try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        if (iframeDoc) docs.push(iframeDoc);
      } catch (err) { /* Cross-origin, skip */ }
    });
    
    // Search in each document
    for (const doc of docs) {
      // Priority 1: Exact innerHTML match on highly clickable elements
      const clickableSelectors = 'button, a, input[type="submit"], input[type="button"]';
      let clickableElements = doc.querySelectorAll(clickableSelectors);
    
      for (const el of clickableElements) {
        // Check exact innerHTML match
        const innerHTML = el.innerHTML.trim();
        const textContent = el.textContent.trim();
        const innerText = el.innerText?.trim() || '';
        
        if (innerHTML === text || textContent === text || innerText === text || el.value === text) {
          return el;
        }
      }
      
      // Priority 2: Exact innerHTML match on other interactive elements
      const interactiveSelectors = 'label, span[onclick], div[onclick], span[role="button"], div[role="button"]';
      let interactiveElements = doc.querySelectorAll(interactiveSelectors);
      
      for (const el of interactiveElements) {
        const innerHTML = el.innerHTML.trim();
        const textContent = el.textContent.trim();
        const innerText = el.innerText?.trim() || '';
        
        if (innerHTML === text || textContent === text || innerText === text) {
          return el;
        }
      }
      
      // Priority 3: Broader search with exact innerHTML match
      const allElements = doc.querySelectorAll('button, a, span, div, p, h1, h2, h3, h4, h5, h6, label, input, li, td, th');
      for (const el of allElements) {
        const innerHTML = el.innerHTML.trim();
        const textContent = el.textContent.trim();
        const innerText = el.innerText?.trim() || '';
        
        if (innerHTML === text || textContent === text || innerText === text || el.value === text) {
          return el;
        }
      }
    }
    
    return null;
  }

  /**
   * Check if an element is part of the AutoBrowse extension UI
   */
  isExtensionElement(element) {
    if (!element) return false;
    
    // Check if element or any parent has an AutoBrowse ID
    let current = element;
    while (current) {
      if (current.id && (
        current.id.startsWith('autobrowse-') ||
        current.id === 'automation-editor' ||
        current.id === 'automation-list' ||
        current.id === 'parameter-popup-overlay'
      )) {
        return true;
      }
      
      // Check for AutoBrowse classes
      if (current.className && typeof current.className === 'string' && (
        current.className.includes('autobrowse') ||
        current.className.includes('picker-overlay') ||
        current.className.includes('picker-tooltip') ||
        current.className.includes('element-highlight') ||
        current.className.includes('panel-') ||
        current.className.includes('step-item')
      )) {
        return true;
      }
      
      current = current.parentElement;
    }
    
    return false;
  }

  /**
   * Find element by text content in a specific document
   */
  findByTextContentInDoc(text, doc) {
    // Helper to extract direct text content (same method used during picking)
    const getDirectText = (el) => {
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        return el.value || el.placeholder || '';
      }
      // Clone and remove children to get only direct text
      const clone = el.cloneNode(true);
      Array.from(clone.children).forEach(child => child.remove());
      return clone.textContent?.trim() || '';
    };

    // Priority 1: Exact match on highly clickable elements
    const clickableSelectors = 'button, a, input[type="submit"], input[type="button"]';
    let clickableElements = doc.querySelectorAll(clickableSelectors);
  
    for (const el of clickableElements) {
      // Skip extension UI elements
      if (this.isExtensionElement(el)) continue;
      
      const directText = getDirectText(el);
      const fullText = el.textContent?.trim() || '';
      
      if (directText === text || fullText === text) {
        return el;
      }
    }
    
    // Priority 2: Exact match on other interactive elements
    const interactiveSelectors = 'label, span[onclick], div[onclick], span[role="button"], div[role="button"]';
    let interactiveElements = doc.querySelectorAll(interactiveSelectors);
    
    for (const el of interactiveElements) {
      // Skip extension UI elements
      if (this.isExtensionElement(el)) continue;
      
      const directText = getDirectText(el);
      const fullText = el.textContent?.trim() || '';
      
      if (directText === text || fullText === text) {
        return el;
      }
    }
    
    // Priority 3: Broader search with exact match
    const allElements = doc.querySelectorAll('button, a, span, div, p, h1, h2, h3, h4, h5, h6, label, input, li, td, th');
    for (const el of allElements) {
      // Skip extension UI elements
      if (this.isExtensionElement(el)) continue;
      
      const directText = getDirectText(el);
      const fullText = el.textContent?.trim() || '';
      
      if (directText === text || fullText === text) {
        return el;
      }
    }
    
    return null;
  }

  /**
   * Find element by partial class name
   */
  findByPartialClass(className) {
    const elements = document.querySelectorAll(`[class*="${className}"]`);
    return elements.length > 0 ? elements[0] : null;
  }

  /**
   * Find element by partial class name in a specific document
   */
  findByPartialClassInDoc(className, doc) {
    const elements = doc.querySelectorAll(`[class*="${className}"]`);
    for (const el of elements) {
      if (!this.isExtensionElement(el)) {
        return el;
      }
    }
    return null;
  }

  /**
   * Find element by partial ID
   */
  findByPartialId(idPart) {
    const elements = document.querySelectorAll(`[id*="${idPart}"]`);
    return elements.length > 0 ? elements[0] : null;
  }

  /**
   * Find element by partial ID in a specific document
   */
  findByPartialIdInDoc(idPart, doc) {
    const elements = doc.querySelectorAll(`[id*="${idPart}"]`);
    for (const el of elements) {
      if (!this.isExtensionElement(el)) {
        return el;
      }
    }
    return null;
  }

  /**
   * Find element by attribute value (partial match)
   */
  findByAttribute(attrName, attrValue) {
    // Try exact match first
    let element = document.querySelector(`[${attrName}="${attrValue}"]`);
    if (element) return element;
    
    // Try partial match
    element = document.querySelector(`[${attrName}*="${attrValue}"]`);
    return element;
  }

  /**
   * Find element by attribute value in a specific document
   */
  findByAttributeInDoc(attrName, attrValue, doc) {
    // Try exact match first
    let elements = doc.querySelectorAll(`[${attrName}="${attrValue}"]`);
    for (const el of elements) {
      if (!this.isExtensionElement(el)) {
        return el;
      }
    }
    
    // Try partial match
    elements = doc.querySelectorAll(`[${attrName}*="${attrValue}"]`);
    for (const el of elements) {
      if (!this.isExtensionElement(el)) {
        return el;
      }
    }
    
    return null;
  }

  /**
   * Scroll element into view, handling iframes
   */
  async scrollElementIntoView(element) {
    if (!element) return;

    // Check if element is in an iframe
    const iframe = element._autobrowse_iframe;
    if (iframe) {
      // First scroll the iframe into view in the main page
      iframe.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await this.wait(200);
      // Then scroll the element into view within the iframe
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await this.wait(300);
    } else {
      // Element is in main document
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await this.wait(300);
    }
  }

  /**
   * Click an element (supports cross-origin iframes)
   */
  async clickElement(selector, stepNumber, method = 'auto') {
    try {
      const element = await this.findElement(selector, stepNumber, method);
      
      // Check if this is a cross-origin element
      if (element && element.isCrossOrigin) {
        console.log('Clicking cross-origin element');
        const result = await this.sendIframeCommand(element.iframe, {
          action: 'click',
          selector: selector,
          method: method
        });
        if (!result.success) {
          throw new Error(result.error || 'Click failed in iframe');
        }
        return;
      }
      
      // Check if this is a coordinate-based click
      if (element && element.isCoordinateClick) {
        console.log(`Clicking at coordinates: (${element.x}, ${element.y})`);
        const clickEvent = new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: element.x,
          clientY: element.y
        });
        // Find element at coordinates and click it
        const targetElement = document.elementFromPoint(element.x, element.y);
        if (targetElement) {
          targetElement.dispatchEvent(clickEvent);
          targetElement.click();
        } else {
          throw new Error(`No element found at coordinates (${element.x}, ${element.y})`);
        }
        return;
      }
      
      // Scroll element into view (handles iframes)
      await this.scrollElementIntoView(element);
      
      // Create and dispatch click event
      element.click();
    } catch (error) {
      throw new Error(`Click failed: ${error.message}`);
    }
  }

  /**
   * Mouse down on element (supports cross-origin iframes)
   */
  async mousedownElement(selector, stepNumber, method = 'auto') {
    try {
      const element = await this.findElement(selector, stepNumber, method);
      
      // Check if this is a cross-origin element
      if (element && element.isCrossOrigin) {
        console.log('Mousedown on cross-origin element');
        // Cross-origin mousedown not directly supported, try click instead
        const result = await this.sendIframeCommand(element.iframe, {
          action: 'click',
          selector: selector,
          method: method
        });
        if (!result.success) {
          throw new Error(result.error || 'Mousedown failed in iframe');
        }
        return;
      }
      
      await this.scrollElementIntoView(element);
      
      const event = new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        view: window
      });
      element.dispatchEvent(event);
    } catch (error) {
      throw new Error(`Mousedown failed: ${error.message}`);
    }
  }

  /**
   * Mouse up on element (supports cross-origin iframes)
   */
  async mouseupElement(selector, stepNumber, method = 'auto') {
    try {
      const element = await this.findElement(selector, stepNumber, method);
      
      // Check if this is a cross-origin element
      if (element && element.isCrossOrigin) {
        console.log('Mouseup on cross-origin element');
        // Cross-origin mouseup not directly supported, try click instead
        const result = await this.sendIframeCommand(element.iframe, {
          action: 'click',
          selector: selector,
          method: method
        });
        if (!result.success) {
          throw new Error(result.error || 'Mouseup failed in iframe');
        }
        return;
      }
      
      await this.scrollElementIntoView(element);
      
      const event = new MouseEvent('mouseup', {
        bubbles: true,
        cancelable: true,
        view: window
      });
      element.dispatchEvent(event);
    } catch (error) {
      throw new Error(`Mouseup failed: ${error.message}`);
    }
  }

  /**
   * Hover over an element (supports cross-origin iframes)
   */
  async hoverElement(selector, stepNumber, method = 'auto') {
    try {
      const element = await this.findElement(selector, stepNumber, method);
      
      // Check if this is a cross-origin element
      if (element && element.isCrossOrigin) {
        console.log('Hovering over cross-origin element');
        const result = await this.sendIframeCommand(element.iframe, {
          action: 'hover',
          selector: selector,
          method: method
        });
        if (!result.success) {
          throw new Error(result.error || 'Hover failed in iframe');
        }
        return;
      }
      
      await this.scrollElementIntoView(element);
      
      const event = new MouseEvent('mouseover', {
        bubbles: true,
        cancelable: true,
        view: window
      });
      element.dispatchEvent(event);
      
      const enterEvent = new MouseEvent('mouseenter', {
        bubbles: true,
        cancelable: true,
        view: window
      });
      element.dispatchEvent(enterEvent);
    } catch (error) {
      throw new Error(`Hover failed: ${error.message}`);
    }
  }

  /**
   * Focus an element (supports cross-origin iframes)
   */
  async focusElement(selector, stepNumber, method = 'auto') {
    try {
      const element = await this.findElement(selector, stepNumber, method);
      
      // Check if this is a cross-origin element
      if (element && element.isCrossOrigin) {
        console.log('Focusing cross-origin element');
        // Cross-origin focus is limited, but we can try clicking
        const result = await this.sendIframeCommand(element.iframe, {
          action: 'click',
          selector: selector,
          method: method
        });
        if (!result.success) {
          throw new Error(result.error || 'Focus failed in iframe');
        }
        return;
      }
      
      await this.scrollElementIntoView(element);
      
      element.focus();
    } catch (error) {
      throw new Error(`Focus failed: ${error.message}`);
    }
  }

  /**
   * Input text into an element (supports cross-origin iframes)
   */
  async inputText(selector, text, stepNumber, method = 'auto') {
    try {
      const element = await this.findElement(selector, stepNumber, method);
      
      // Check if this is a cross-origin element
      if (element && element.isCrossOrigin) {
        console.log('Inputting text in cross-origin element');
        const result = await this.sendIframeCommand(element.iframe, {
          action: 'input',
          selector: selector,
          value: text,
          method: method
        });
        if (!result.success) {
          throw new Error(result.error || 'Input failed in iframe');
        }
        return;
      }
      
      // Scroll element into view
      await this.scrollElementIntoView(element);
      
      // Focus the element
      element.focus();
      
      // Clear existing value
      if (element.value !== undefined) {
        element.value = '';
      }
      
      // Input text character by character for realistic behavior
      for (const char of text) {
        element.value += char;
        
        // Dispatch input event
        const inputEvent = new Event('input', {
          bubbles: true,
          cancelable: true
        });
        element.dispatchEvent(inputEvent);
        
        await this.wait(50); // Small delay between characters
      }
      
      // Dispatch change event
      const changeEvent = new Event('change', {
        bubbles: true,
        cancelable: true
      });
      element.dispatchEvent(changeEvent);
    } catch (error) {
      throw new Error(`Input text failed: ${error.message}`);
    }
  }

  /**
   * Scroll to an element (supports cross-origin iframes)
   */
  async scrollToElement(selector, stepNumber, method = 'auto') {
    try {
      const element = await this.findElement(selector, stepNumber, method);
      
      // Check if this is a cross-origin element
      if (element && element.isCrossOrigin) {
        console.log('Scrolling to cross-origin element');
        const result = await this.sendIframeCommand(element.iframe, {
          action: 'scroll',
          selector: selector,
          method: method
        });
        if (!result.success) {
          throw new Error(result.error || 'Scroll failed in iframe');
        }
        return;
      }
      
      await this.scrollElementIntoView(element);
      await this.wait(200); // Additional wait for scroll animation
    } catch (error) {
      throw new Error(`Scroll failed: ${error.message}`);
    }
  }

  /**
   * Wait for specified milliseconds
   * @param {number} ms - Milliseconds to wait
   */
  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Stop the currently running automation
   */
  stop() {
    this.isRunning = false;
    this.currentAutomation = null;
  }
}

// Create a global instance (only in top window)
if (window === window.top) {
  window.automationExecutor = new AutomationExecutor();
}
