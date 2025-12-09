// Iframe Bridge - Injected into iframe contexts for cross-origin communication
// This script runs in iframe contexts and communicates with the parent frame

(function() {
  'use strict';
  
  // Prevent multiple injections
  if (window.__autobrowse_iframe_bridge__) {
    return;
  }
  window.__autobrowse_iframe_bridge__ = true;

  console.log('[AutoBrowse IframeBridge] Initialized in:', window.location.origin);

  // Send ready message to parent
  if (window.parent !== window) {
    try {
      window.parent.postMessage({
        type: 'autobrowse-iframe',
        action: 'ready',
        origin: window.location.origin,
        url: window.location.href
      }, '*');
    } catch (e) {
      console.warn('[AutoBrowse IframeBridge] Could not send ready message:', e);
    }
  }

  // Listen for automation commands from parent
  window.addEventListener('message', async (event) => {
    const data = event.data;
    
    // Only process AutoBrowse messages
    if (!data || !data.type || !data.type.startsWith('autobrowse-command')) {
      return;
    }

    console.log('[AutoBrowse IframeBridge] Received command:', data);

    try {
      let result;
      
      switch (data.action) {
        case 'findElement':
          result = await findElement(data.selector, data.method);
          break;
          
        case 'click':
          result = await clickElement(data.selector, data.method);
          break;
          
        case 'input':
          result = await inputText(data.selector, data.value, data.method);
          break;
          
        case 'hover':
          result = await hoverElement(data.selector, data.method);
          break;
          
        case 'scroll':
          result = await scrollToElement(data.selector, data.method);
          break;
          
        case 'getAttribute':
          result = await getElementAttribute(data.selector, data.attribute, data.method);
          break;
          
        case 'getText':
          result = await getElementText(data.selector, data.method);
          break;
          
        case 'waitForElement':
          result = await waitForElement(data.selector, data.timeout, data.method);
          break;
          
        default:
          throw new Error('Unknown action: ' + data.action);
      }
      
      // Send success response
      window.parent.postMessage({
        type: 'autobrowse-response',
        commandId: data.commandId,
        success: true,
        result: result
      }, '*');
      
    } catch (error) {
      // Send error response
      window.parent.postMessage({
        type: 'autobrowse-response',
        commandId: data.commandId,
        success: false,
        error: error.message
      }, '*');
    }
  });

  /**
   * Find element using various strategies
   */
  async function findElement(selector, method = 'auto') {
    let element = null;
    
    if (method === 'css' || method === 'auto') {
      try {
        element = document.querySelector(selector);
        if (element) return serializeElement(element);
      } catch (e) {}
    }
    
    if (method === 'xpath' || (method === 'auto' && (selector.startsWith('/') || selector.startsWith('(')))) {
      try {
        const result = document.evaluate(selector, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        element = result.singleNodeValue;
        if (element) return serializeElement(element);
      } catch (e) {}
    }
    
    if (method === 'text' || method === 'auto') {
      element = findByText(selector);
      if (element) return serializeElement(element);
    }
    
    throw new Error('Element not found: ' + selector);
  }

  /**
   * Click an element
   */
  async function clickElement(selector, method = 'auto') {
    const element = await getElementFromSelector(selector, method);
    
    // Scroll into view
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await wait(300);
    
    // Click
    element.click();
    
    // Also dispatch events for better compatibility
    element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    
    return { clicked: true };
  }

  /**
   * Input text into an element
   */
  async function inputText(selector, value, method = 'auto') {
    const element = await getElementFromSelector(selector, method);
    
    // Focus the element
    element.focus();
    
    // Clear existing value
    element.value = '';
    
    // Set new value
    element.value = value;
    
    // Dispatch events
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    
    return { inputSet: true };
  }

  /**
   * Hover over an element
   */
  async function hoverElement(selector, method = 'auto') {
    const element = await getElementFromSelector(selector, method);
    
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await wait(200);
    
    element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true }));
    element.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, cancelable: true }));
    
    return { hovered: true };
  }

  /**
   * Scroll to an element
   */
  async function scrollToElement(selector, method = 'auto') {
    const element = await getElementFromSelector(selector, method);
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await wait(500);
    return { scrolled: true };
  }

  /**
   * Get element attribute
   */
  async function getElementAttribute(selector, attribute, method = 'auto') {
    const element = await getElementFromSelector(selector, method);
    return { value: element.getAttribute(attribute) };
  }

  /**
   * Get element text
   */
  async function getElementText(selector, method = 'auto') {
    const element = await getElementFromSelector(selector, method);
    return { text: element.textContent };
  }

  /**
   * Wait for element to appear
   */
  async function waitForElement(selector, timeout = 10000, method = 'auto') {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      try {
        await getElementFromSelector(selector, method);
        return { found: true };
      } catch (e) {
        await wait(100);
      }
    }
    
    throw new Error('Element not found within timeout: ' + selector);
  }

  /**
   * Get element from selector
   */
  async function getElementFromSelector(selector, method) {
    let element = null;
    
    if (method === 'css' || method === 'auto') {
      element = document.querySelector(selector);
      if (element) return element;
    }
    
    if (method === 'xpath' || (method === 'auto' && (selector.startsWith('/') || selector.startsWith('(')))) {
      const result = document.evaluate(selector, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
      element = result.singleNodeValue;
      if (element) return element;
    }
    
    if (method === 'text' || method === 'auto') {
      element = findByText(selector);
      if (element) return element;
    }
    
    throw new Error('Element not found: ' + selector);
  }

  /**
   * Find element by text content
   */
  function findByText(text) {
    const xpath = `//*[contains(text(), "${text}")]`;
    const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
    return result.singleNodeValue;
  }

  /**
   * Serialize element for cross-frame communication
   */
  function serializeElement(element) {
    return {
      tagName: element.tagName,
      id: element.id,
      className: element.className,
      text: element.textContent?.substring(0, 100),
      value: element.value,
      href: element.href,
      src: element.src,
      type: element.type,
      name: element.name,
      checked: element.checked,
      disabled: element.disabled,
      visible: isVisible(element),
      boundingRect: element.getBoundingClientRect()
    };
  }

  /**
   * Check if element is visible
   */
  function isVisible(element) {
    const style = window.getComputedStyle(element);
    return style.display !== 'none' && 
           style.visibility !== 'hidden' && 
           style.opacity !== '0' &&
           element.offsetWidth > 0 && 
           element.offsetHeight > 0;
  }

  /**
   * Wait utility
   */
  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

})();
