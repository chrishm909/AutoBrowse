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
          
        case 'getElementAtPoint':
          result = await getElementAtPoint(data.x, data.y);
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
    
    // Click the element
    element.click();
    
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
    console.log('[IframeBridge] getElementFromSelector:', { selector, method });
    let element = null;
    
    if (method === 'css' || method === 'auto') {
      try {
        element = document.querySelector(selector);
        if (element) {
          console.log('[IframeBridge] Found via CSS:', element);
          return element;
        }
      } catch (e) {
        console.log('[IframeBridge] CSS selector failed:', e.message);
      }
    }
    
    if (method === 'xpath' || (method === 'auto' && (selector.startsWith('/') || selector.startsWith('(')))) {
      try {
        const result = document.evaluate(selector, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        element = result.singleNodeValue;
        if (element) {
          console.log('[IframeBridge] Found via XPath:', element);
          return element;
        }
      } catch (e) {
        console.log('[IframeBridge] XPath failed:', e.message);
      }
    }
    
    if (method === 'text' || method === 'auto') {
      console.log('[IframeBridge] Trying text search for:', selector);
      element = findByText(selector);
      if (element) {
        console.log('[IframeBridge] Found via text:', element);
        return element;
      } else {
        console.log('[IframeBridge] Text search found nothing');
      }
    }
    
    throw new Error('Element not found: ' + selector);
  }

  /**
   * Find element by text content (exact match with priority search)
   */
  function findByText(text) {
    console.log('[IframeBridge] findByText called with:', text);
    
    // Helper to extract direct text content (same as during picking)
    const getDirectText = (el) => {
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        return el.value || el.placeholder || '';
      }
      // Clone and remove children to get only direct text
      const clone = el.cloneNode(true);
      Array.from(clone.children).forEach(child => child.remove());
      return clone.textContent?.trim() || '';
    };

    // Priority 1: Exact match on clickable elements (buttons, links)
    const clickable = document.querySelectorAll('button, a, input[type="submit"], input[type="button"]');
    console.log('[IframeBridge] Checking', clickable.length, 'clickable elements');
    for (const el of clickable) {
      const directText = getDirectText(el);
      const fullText = el.textContent?.trim() || '';
      console.log('[IframeBridge] Clickable element texts:', { directText, fullText, searchText: text });
      if (directText === text || fullText === text) {
        console.log('[IframeBridge] MATCH found in clickable:', el);
        return el;
      }
    }

    // Priority 2: Exact match on interactive elements
    const interactive = document.querySelectorAll('label, span[onclick], div[onclick], [role="button"]');
    console.log('[IframeBridge] Checking', interactive.length, 'interactive elements');
    for (const el of interactive) {
      const directText = getDirectText(el);
      const fullText = el.textContent?.trim() || '';
      if (directText === text || fullText === text) {
        console.log('[IframeBridge] MATCH found in interactive:', el);
        return el;
      }
    }

    // Priority 3: Exact match on any element
    const all = document.querySelectorAll('button, a, span, div, p, h1, h2, h3, h4, h5, h6, label, li, td, th, input');
    console.log('[IframeBridge] Checking', all.length, 'general elements');
    for (const el of all) {
      const directText = getDirectText(el);
      const fullText = el.textContent?.trim() || '';
      if (directText === text || fullText === text) {
        console.log('[IframeBridge] MATCH found in general:', el);
        return el;
      }
    }

    console.log('[IframeBridge] No match found for text:', text);
    return null;
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
   * Get element at specific coordinates (for element picker)
   */
  async function getElementAtPoint(x, y) {
    const element = document.elementFromPoint(x, y);
    
    if (!element) {
      return { found: false };
    }

    // Extract direct text content (same method used in content.js for consistency)
    let directText = '';
    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
      directText = element.value || element.placeholder || '';
    } else {
      // Clone and remove children to get only direct text
      const clone = element.cloneNode(true);
      Array.from(clone.children).forEach(child => child.remove());
      directText = clone.textContent?.trim() || element.textContent?.trim() || '';
    }

    // Generate multiple selector options
    const selectors = {
      id: element.id ? '#' + CSS.escape(element.id) : null,
      querySelector: generateQuerySelector(element),
      xpath: generateXPath(element),
      text: directText.substring(0, 200) || null  // Store more text for better matching
    };

    // Get element information
    const rect = element.getBoundingClientRect();
    const info = {
      found: true,
      tagName: element.tagName.toLowerCase(),
      id: element.id,
      className: element.className,
      text: directText.substring(0, 100),
      selectors: selectors,
      rect: {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height
      }
    };

    return info;
  }

  /**
   * Generate a CSS selector for an element
   */
  function generateQuerySelector(element) {
    // Try ID first
    if (element.id) {
      return '#' + CSS.escape(element.id);
    }

    // Try unique class combination
    if (element.className && typeof element.className === 'string') {
      const classes = element.className.trim().split(/\s+/).filter(c => c);
      if (classes.length > 0) {
        const classSelector = '.' + classes.map(c => CSS.escape(c)).join('.');
        if (document.querySelectorAll(classSelector).length === 1) {
          return classSelector;
        }
      }
    }

    // Build path from element to body
    const path = [];
    let current = element;
    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();
      
      if (current.id) {
        selector += '#' + CSS.escape(current.id);
        path.unshift(selector);
        break;
      }

      if (current.className && typeof current.className === 'string') {
        const classes = current.className.trim().split(/\s+/).filter(c => c);
        if (classes.length > 0) {
          selector += '.' + classes.map(c => CSS.escape(c)).join('.');
        }
      }

      // Add nth-child if needed for uniqueness
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(el => el.tagName === current.tagName);
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          selector += `:nth-child(${index})`;
        }
      }

      path.unshift(selector);
      current = parent;
    }

    return path.join(' > ');
  }

  /**
   * Generate XPath for an element
   */
  function generateXPath(element) {
    if (element.id) {
      return `//*[@id="${element.id}"]`;
    }

    const path = [];
    let current = element;

    while (current && current.nodeType === Node.ELEMENT_NODE) {
      let index = 0;
      let sibling = current.previousSibling;

      while (sibling) {
        if (sibling.nodeType === Node.ELEMENT_NODE && sibling.tagName === current.tagName) {
          index++;
        }
        sibling = sibling.previousSibling;
      }

      const tagName = current.tagName.toLowerCase();
      const xpathIndex = index > 0 ? `[${index + 1}]` : '';
      path.unshift(`${tagName}${xpathIndex}`);

      current = current.parentElement;
    }

    return '/' + path.join('/');
  }

  /**
   * Wait utility
   */
  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

})();
