// Content script for AutoBrowse extension

let bubble = null;
let panel = null;
let isOpen = false;

// Initialize on page load
initializeBubble();

// Check if this URL should show the interface
function initializeBubble() {
  try {
    chrome.storage.sync.get(['automations'], (data) => {
      if (chrome.runtime.lastError) {
        console.warn('Storage error:', chrome.runtime.lastError);
        return;
      }
      const automations = data.automations || [];
    const currentUrl = window.location.href;
    const currentHostname = window.location.hostname;
    
    const shouldShow = automations.some(automation => {
      try {
        const matches = currentHostname === automation.hostname || 
                       currentUrl.includes(automation.hostname) ||
                       automation.url.includes(currentHostname);
        return matches;
      } catch (e) {
        return false;
      }
    });
    
    if (shouldShow) {
      if (!bubble) {
        createFloatingUI();
      }
    } else {
      // Remove bubble if it exists but shouldn't be shown
      if (bubble) {
        bubble.remove();
        panel.remove();
        bubble = null;
        panel = null;
      }
    }
    });
  } catch (error) {
    console.warn('Failed to initialize bubble:', error);
  }
}

// Listen for storage changes to update bubble visibility
try {
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync' && changes.automations) {
      initializeBubble();
    }
  });
} catch (error) {
  console.warn('Failed to add storage listener:', error);
}

// Create floating bubble and panel
function createFloatingUI() {
  // Create bubble button
  bubble = document.createElement('div');
  bubble.id = 'autobrowse-bubble';
  bubble.innerHTML = `
    <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
    </svg>
  `;
  
  // Create panel
  panel = document.createElement('div');
  panel.id = 'autobrowse-panel';
  panel.innerHTML = `
    <div class="panel-header">
      <h3 id="panel-title">AutoBrowse</h3>
      <button id="close-panel">×</button>
    </div>
    <div class="panel-content">
      <div id="automation-list-container">
        <h4 style="margin: 0 0 12px 0; font-size: 14px; color: #666;">Available Automations</h4>
        <div id="automation-list"></div>
      </div>
      <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e0e0e0;">
        <button id="record-btn" class="panel-btn primary">🔴 Create New Automation</button>
      </div>
      <div id="status-message"></div>
    </div>
    <div class="panel-content" id="automation-editor" style="display: none;">
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px;">
        <button id="back-to-list" style="background: none; border: none; font-size: 18px; cursor: pointer; padding: 0;">←</button>
        <h4 id="editor-title" style="margin: 0; font-size: 14px; color: #333; flex: 1;"></h4>
      </div>
      <div id="parameters-section" style="margin-bottom: 12px;">
        <div style="display: flex; align-items: center; gap: 4px; margin-bottom: 6px; cursor: pointer;" id="parameters-toggle">
          <span style="font-size: 11px; color: #666;">▶</span>
          <h5 style="margin: 0; font-size: 12px; color: #666; font-weight: 600;">Parameters</h5>
        </div>
        <div id="parameters-container" style="display: none;"></div>
        <button id="add-parameter-btn" class="panel-btn" style="margin-top: 4px; display: none; font-size: 11px; padding: 4px;">+ Add Parameter</button>
      </div>
      <div id="steps-container"></div>
      <button id="add-step-btn" class="panel-btn" style="margin-top: 12px;">+ Add Step</button>
      <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e0e0e0; display: flex; gap: 8px;">
        <button id="save-automation-btn" class="panel-btn primary" style="flex: 1;">💾 Save</button>
        <button id="run-automation-btn" class="panel-btn" style="flex: 1; background: #2c2c2c; color: white;">▶️ Run</button>
        <button id="test-automation-btn" class="panel-btn" style="flex: 1; background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; font-weight: 500; box-shadow: 0 2px 4px rgba(40, 167, 69, 0.2);">🧪 Test</button>
      </div>
      <div id="execution-log"></div>
    </div>
  `;
  
  // Add styles
  const style = document.createElement('style');
  style.textContent = `
    #autobrowse-bubble {
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 56px;
      height: 56px;
      background: #2c2c2c;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 999999;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    
    #autobrowse-bubble:hover {
      transform: scale(1.1);
      box-shadow: 0 6px 16px rgba(0,0,0,0.2);
    }
    
    #autobrowse-bubble.hidden {
      display: none;
    }
    
    #autobrowse-panel {
      position: fixed;
      bottom: 90px;
      right: 20px;
      width: 320px;
      max-height: calc(100vh - 120px);
      background: white;
      border-radius: 8px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.2);
      z-index: 999998;
      opacity: 0;
      transform: translateY(20px) scale(0.95);
      transition: opacity 0.3s, transform 0.3s;
      pointer-events: none;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 12px;
      display: flex;
      flex-direction: column;
    }
    
    #autobrowse-panel.open {
      opacity: 1;
      transform: translateY(0) scale(1);
      pointer-events: all;
    }
    
    .panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 10px;
      border-bottom: 1px solid #e0e0e0;
      background: #2c2c2c;
      color: white;
      border-radius: 8px 8px 0 0;
    }
    
    .panel-header h3 {
      margin: 0;
      font-size: 13px;
      font-weight: 600;
    }
    
    #close-panel {
      background: none;
      border: none;
      color: white;
      font-size: 20px;
      line-height: 1;
      cursor: pointer;
      padding: 0;
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .panel-content {
      padding: 10px;
      overflow-y: auto;
      flex: 1;
      min-height: 0;
    }
    
    .panel-btn {
      width: 100%;
      padding: 6px;
      margin-bottom: 5px;
      border: 1px solid #ddd;
      border-radius: 6px;
      background: white;
      color: #333;
      font-size: 12px;
      cursor: pointer;
      transition: all 0.2s;
      font-weight: 500;
    }
    
    .panel-btn:hover {
      background: #f5f5f5;
      border-color: #999;
    }
    
    .panel-btn.primary {
      background: #2c2c2c;
      color: white;
      border: none;
    }
    
    .panel-btn.primary:hover {
      opacity: 0.9;
    }
    
    #status-message {
      margin-top: 5px;
      padding: 5px;
      border-radius: 4px;
      font-size: 11px;
      text-align: center;
      display: none;
    }
    
    #status-message.show {
      display: block;
    }
    
    #status-message.success {
      background: #d4edda;
      color: #155724;
    }
    
    #status-message.error {
      background: #f8d7da;
      color: #721c24;
    }
    
    #execution-log {
      margin-top: 8px;
      padding: 8px;
      background: #f8f9fa;
      border-radius: 6px;
      max-height: 200px;
      overflow-y: auto;
      font-size: 10px;
      font-family: monospace;
      display: none;
      border: 1px solid #dee2e6;
    }
    
    #execution-log.show {
      display: block;
    }
    
    .log-entry {
      padding: 3px 0;
      display: flex;
      align-items: flex-start;
      gap: 6px;
      border-bottom: 1px solid #e9ecef;
    }
    
    .log-entry:last-child {
      border-bottom: none;
    }
    
    .log-icon {
      flex-shrink: 0;
      font-size: 12px;
    }
    
    .log-icon.success {
      color: #28a745;
    }
    
    .log-icon.error {
      color: #dc3545;
    }
    
    .log-icon.running {
      color: #007bff;
    }
    
    .log-message {
      flex: 1;
      color: #495057;
    }
    
    .log-error {
      color: #dc3545;
      font-weight: 500;
    }
    
    #execution-log::-webkit-scrollbar {
      width: 6px;
    }
    
    #execution-log::-webkit-scrollbar-track {
      background: #f1f1f1;
      border-radius: 3px;
    }
    
    #execution-log::-webkit-scrollbar-thumb {
      background: #888;
      border-radius: 3px;
    }
    
    #execution-log::-webkit-scrollbar-thumb:hover {
      background: #555;
    }
    
    #automation-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    
    .automation-item {
      padding: 6px 8px;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      background: #f9f9f9;
      cursor: pointer;
      transition: all 0.2s;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .automation-item:hover {
      background: #f0f0f0;
      border-color: #2c2c2c;
      transform: translateY(-1px);
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    
    .automation-name {
      font-size: 12px;
      font-weight: 500;
      color: #333;
      flex: 1;
    }
    
    .automation-actions {
      display: flex;
      gap: 8px;
      margin-left: 12px;
    }
    
    .automation-test-btn {
      padding: 3px 8px;
      background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
      color: white;
      border: none;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
      transition: opacity 0.2s;
      box-shadow: 0 2px 4px rgba(40, 167, 69, 0.2);
    }
    
    .automation-test-btn:hover {
      opacity: 0.85;
    }
    
    .automation-run-btn {
      padding: 3px 8px;
      background: #2c2c2c;
      color: white;
      border: none;
      border-radius: 4px;
      font-size: 11px;
      cursor: pointer;
      transition: opacity 0.2s;
    }
    
    .automation-run-btn:hover {
      opacity: 0.8;
    }
    
    .no-automations {
      padding: 10px;
      text-align: center;
      color: #999;
      font-size: 11px;
    }
    
    .step-item {
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      padding: 5px 6px;
      margin-bottom: 4px;
      background: #f9f9f9;
      cursor: pointer;
      transition: all 0.2s;
    }
    
    .step-item:hover {
      background: #f0f0f0;
      border-color: #2c2c2c;
    }
    
    .step-item.expanded {
      background: white;
      border-color: #2c2c2c;
      padding: 6px;
      cursor: default;
    }
    
    .step-item.expanded:hover {
      background: white;
    }
    
    .step-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 4px;
    }
    
    .step-actions {
      display: flex;
      gap: 3px;
      flex-shrink: 0;
    }
    
    .step-apply {
      background: #28a745;
      color: white;
      border: none;
      border-radius: 3px;
      padding: 2px 6px;
      font-size: 10px;
      cursor: pointer;
      flex-shrink: 0;
      display: none;
    }
    
    .step-item.expanded .step-apply {
      display: block;
    }
    
    .step-apply:hover {
      background: #218838;
    }
    
    .step-collapsed {
      display: flex;
      align-items: center;
      gap: 4px;
      flex: 1;
      font-size: 11px;
    }
    
    .step-number {
      font-weight: 600;
      color: #2c2c2c;
      font-size: 11px;
      min-width: 45px;
    }
    
    .step-summary {
      display: flex;
      align-items: center;
      gap: 4px;
      flex: 1;
      color: #666;
      font-size: 10px;
    }
    
    .step-summary-item {
      display: flex;
      align-items: center;
      gap: 2px;
      padding: 1px 4px;
      background: #e8e8e8;
      border-radius: 3px;
      white-space: nowrap;
    }
    
    .step-summary-label {
      font-weight: 500;
      color: #333;
    }
    
    .step-delete {
      background: #dc3545;
      color: white;
      border: none;
      border-radius: 3px;
      padding: 2px 6px;
      font-size: 10px;
      cursor: pointer;
      flex-shrink: 0;
    }
    
    .step-delete:hover {
      background: #c82333;
    }
    
    .step-fields {
      display: none;
      margin-top: 6px;
    }
    
    .step-item.expanded .step-fields {
      display: block;
    }
    
    .step-item.expanded .step-collapsed {
      display: none;
    }
    
    .step-field {
      margin-bottom: 5px;
    }
    
    .step-field label {
      display: block;
      font-size: 10px;
      color: #666;
      margin-bottom: 2px;
      font-weight: 500;
    }
    
    .step-field input,
    .step-field select {
      width: 100%;
      padding: 4px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 11px;
      box-sizing: border-box;
    }
    
    .step-field input:focus,
    .step-field select:focus {
      outline: none;
      border-color: #2c2c2c;
    }
    
    .step-field input[type="number"] {
      width: 100%;
    }
    
    .target-picker-wrapper {
      display: flex;
      gap: 3px;
      align-items: center;
    }
    
    .target-picker-wrapper input {
      flex: 1;
    }
    
    .pick-element-btn {
      background: #6c757d;
      color: white;
      border: none;
      border-radius: 4px;
      padding: 4px 6px;
      font-size: 10px;
      cursor: pointer;
      white-space: nowrap;
      flex-shrink: 0;
    }
    
    .pick-element-btn:hover {
      background: #5a6268;
    }
    
    .pick-element-btn.active {
      background: #ff6b6b;
      animation: pulse 1.5s ease-in-out infinite;
    }
    
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.7; }
    }
    
    .element-highlight {
      position: absolute;
      pointer-events: none;
      border: 3px solid #ff6b6b;
      background: rgba(255, 107, 107, 0.1);
      z-index: 999997;
      transition: all 0.1s ease;
      box-shadow: 0 0 0 2px white, 0 0 10px rgba(255, 107, 107, 0.5);
    }
    
    .picker-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.02);
      z-index: 999996;
      cursor: crosshair;
    }
    
    .picker-tooltip {
      position: fixed;
      background: #2c2c2c;
      color: white;
      padding: 6px 10px;
      border-radius: 6px;
      font-size: 12px;
      font-family: monospace;
      z-index: 999998;
      pointer-events: none;
      max-width: 300px;
      word-break: break-all;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    }
    
    #steps-container:empty::before {
      content: 'No steps yet. Click "Add Step" to begin.';
      display: block;
      text-align: center;
      padding: 15px;
      color: #999;
      font-size: 11px;
    }
    
    #steps-container {
      max-height: 400px;
      overflow-y: auto;
      margin-bottom: 12px;
    }
    
    #steps-container::-webkit-scrollbar {
      width: 8px;
    }
    
    #steps-container::-webkit-scrollbar-track {
      background: #f1f1f1;
      border-radius: 4px;
    }
    
    #steps-container::-webkit-scrollbar-thumb {
      background: #888;
      border-radius: 4px;
    }
    
    #steps-container::-webkit-scrollbar-thumb:hover {
      background: #555;
    }
    
    .step-item.dragging {
      opacity: 0.5;
    }
    .step-item.drag-over {
      border: 2px dashed #007bff;
      background: #e3f2fd;
    }
    
    .automation-name-input {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      background: none;
      border: none;
      color: #333;
      flex: 1;
      outline: none;
    }
    
    .parameter-item {
      display: flex;
      gap: 4px;
      margin-bottom: 4px;
      align-items: center;
    }
    
    .parameter-item input {
      flex: 1;
      padding: 3px 5px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 11px;
    }
    
    .parameter-item button {
      background: #dc3545;
      color: white;
      border: none;
      border-radius: 3px;
      padding: 3px 6px;
      font-size: 10px;
      cursor: pointer;
    }
    
    .parameter-item button:hover {
      background: #c82333;
    }
    
    #parameter-popup-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 1000000;
      display: none;
      align-items: center;
      justify-content: center;
    }
    
    #parameter-popup-overlay.show {
      display: flex;
    }
    
    .parameter-popup {
      background: white;
      border-radius: 8px;
      padding: 16px;
      max-width: 400px;
      width: 90%;
      box-shadow: 0 8px 32px rgba(0,0,0,0.3);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    
    .parameter-popup h3 {
      margin: 0 0 12px 0;
      font-size: 16px;
      color: #333;
    }
    
    .parameter-popup-field {
      margin-bottom: 12px;
    }
    
    .parameter-popup-field label {
      display: block;
      font-size: 12px;
      color: #666;
      margin-bottom: 4px;
      font-weight: 500;
    }
    
    .parameter-popup-field input {
      width: 100%;
      padding: 6px 8px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 13px;
      box-sizing: border-box;
    }
    
    .parameter-popup-buttons {
      display: flex;
      gap: 8px;
      margin-top: 16px;
    }
    
    .parameter-popup-buttons button {
      flex: 1;
      padding: 8px;
      border: none;
      border-radius: 6px;
      font-size: 13px;
      cursor: pointer;
      font-weight: 500;
    }
    
    .parameter-popup-buttons .primary {
      background: #2c2c2c;
      color: white;
    }
    
    .parameter-popup-buttons .primary:hover {
      opacity: 0.9;
    }
    
    .parameter-popup-buttons .secondary {
      background: #f5f5f5;
      color: #333;
    }
    
    .parameter-popup-buttons .secondary:hover {
      background: #e0e0e0;
    }
  `;
  
  document.head.appendChild(style);
  document.body.appendChild(bubble);
  document.body.appendChild(panel);
  
  // Add event listeners
  bubble.addEventListener('click', togglePanel);
  document.getElementById('close-panel').addEventListener('click', closePanel);
  document.getElementById('record-btn').addEventListener('click', startRecording);
  document.getElementById('back-to-list').addEventListener('click', showAutomationList);
  document.getElementById('add-step-btn').addEventListener('click', addStep);
  document.getElementById('save-automation-btn').addEventListener('click', saveCurrentAutomation);
  document.getElementById('run-automation-btn').addEventListener('click', runCurrentAutomation);
  document.getElementById('test-automation-btn').addEventListener('click', testCurrentAutomation);
  document.getElementById('parameters-toggle').addEventListener('click', toggleParametersSection);
  document.getElementById('add-parameter-btn').addEventListener('click', addParameter);
  
  // Load and display automations initially
  loadAutomationsForPage();
}

function togglePanel() {
  isOpen = !isOpen;
  if (isOpen) {
    panel.classList.add('open');
    bubble.classList.add('hidden');
    loadAutomationsForPage(); // Refresh automation list when opening
  } else {
    closePanel();
  }
}

function closePanel() {
  isOpen = false;
  panel.classList.remove('open');
  bubble.classList.remove('hidden');
}

function loadAutomationsForPage() {
  try {
    chrome.storage.sync.get(['automations'], (data) => {
      if (chrome.runtime.lastError) {
        console.warn('Storage error:', chrome.runtime.lastError);
        return;
      }
      const automations = data.automations || [];
    const currentUrl = window.location.href;
    const currentHostname = window.location.hostname;
    
    // Filter automations for current page
    const pageAutomations = automations.filter(automation => {
      try {
        return currentHostname === automation.hostname || 
               currentUrl.includes(automation.hostname) ||
               automation.url.includes(currentHostname);
      } catch (e) {
        return false;
      }
    });
    
      displayAutomationList(pageAutomations);
    });
  } catch (error) {
    console.warn('Failed to load automations:', error);
  }
}

function displayAutomationList(automations) {
  const listContainer = document.getElementById('automation-list');
  
  if (!listContainer) return;
  
  if (automations.length === 0) {
    listContainer.innerHTML = `
      <div class="no-automations">
        No automations available for this page.<br>
        Create one to get started!
      </div>
    `;
    return;
  }
  
  listContainer.innerHTML = '';
  
  automations.forEach(automation => {
    const item = document.createElement('div');
    item.className = 'automation-item';
    item.innerHTML = `
      <div class="automation-name">${automation.name || 'Unnamed Automation'}</div>
      <div class="automation-actions">
        <button class="automation-test-btn" data-id="${automation.id}">🧪 Test</button>
        <button class="automation-run-btn" data-id="${automation.id}">▶️ Run</button>
      </div>
    `;
    
    // Add click handler to open editor
    item.addEventListener('click', (e) => {
      if (!e.target.classList.contains('automation-run-btn') && !e.target.classList.contains('automation-test-btn')) {
        openAutomationEditor(automation);
      }
    });
    
    // Add click handler for test button
    const testBtn = item.querySelector('.automation-test-btn');
    testBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      runAutomation(automation, true); // true = test mode
    });
    
    // Add click handler for run button
    const runBtn = item.querySelector('.automation-run-btn');
    runBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      runAutomation(automation, false); // false = normal mode
    });
    
    listContainer.appendChild(item);
  });
}

function startRecording() {
  const currentUrl = window.location.href;
  const currentHostname = window.location.hostname;
  const pageTitle = document.title;
  
  const automationName = prompt('Enter automation name:', `Automation for ${currentHostname}`);
  if (!automationName) return;
  
  try {
    chrome.storage.sync.get(['automations'], (data) => {
      if (chrome.runtime.lastError) {
        console.warn('Storage error:', chrome.runtime.lastError);
        showStatus('✗ Failed to create automation', 'error');
        return;
      }
      const automations = data.automations || [];
    const newAutomation = {
      id: Date.now(),
      name: automationName,
      url: currentUrl,
      hostname: currentHostname,
      steps: [],
      parameters: [],
      created: new Date().toISOString()
    };
    
      automations.push(newAutomation);
      chrome.storage.sync.set({ automations: automations }, () => {
        if (chrome.runtime.lastError) {
          console.warn('Storage error:', chrome.runtime.lastError);
          showStatus('✗ Failed to save automation', 'error');
          return;
        }
        loadAutomationsForPage();
        showStatus('✓ Automation created!', 'success');
      });
    });
  } catch (error) {
    console.warn('Failed to create automation:', error);
    showStatus('✗ Failed to create automation', 'error');
  }
}

let currentEditingAutomation = null;

function openAutomationEditor(automation) {
  currentEditingAutomation = automation;
  document.getElementById('automation-list-container').parentElement.style.display = 'none';
  const editor = document.getElementById('automation-editor');
  editor.style.display = 'block';
  document.getElementById('panel-title').textContent = 'Edit Automation';
  const headerRow = editor.querySelector('div');
  if (headerRow) {
    let nameInput = document.getElementById('automation-name-input');
    let editorTitle = document.getElementById('editor-title');
    if (!nameInput) {
      nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.id = 'automation-name-input';
      nameInput.className = 'automation-name-input';
      nameInput.style = 'margin: 0; font-size: 14px; font-weight: 600; background: none; border: none; color: #333; flex: 1; outline: none;';
      headerRow.replaceChild(nameInput, editorTitle);
    }
    nameInput.value = automation.name || '';
    nameInput.placeholder = 'Automation Name';
    nameInput.oninput = function() {
      currentEditingAutomation.name = nameInput.value;
    };
    // Add keybind input next to name input
    let keybindInput = document.getElementById('automation-keybind-input');
    if (!keybindInput) {
      keybindInput = document.createElement('input');
      keybindInput.type = 'text';
      keybindInput.id = 'automation-keybind-input';
      keybindInput.className = 'automation-keybind-input';
      keybindInput.style = 'margin-left: 8px; font-size: 11px; background: none; border: none; color: #666; width: 90px; min-width: 70px; max-width: 100px; outline: none;';
      keybindInput.placeholder = 'Key';
      nameInput.insertAdjacentElement('afterend', keybindInput);
    }
    keybindInput.value = automation.keybind || '';
    keybindInput.addEventListener('keydown', function(ev) {
      // Allow clearing
      if (ev.key === 'Escape') {
        ev.preventDefault();
        keybindInput.value = '';
        currentEditingAutomation.keybind = '';
        return;
      }
      ev.preventDefault();
      const combo = eventToShortcut(ev);
      // Block known browser-reserved shortcuts that won't reliably reach pages
      if (isReservedShortcut(combo)) {
        showStatus('✗ Shortcut is reserved by the browser. Pick another.', 'error');
        return;
      }
      if (!combo) {
        // Ignore pure modifier without main key
        if (ev.key === 'Backspace' || ev.key === 'Delete') {
          keybindInput.value = '';
          currentEditingAutomation.keybind = '';
        }
        return;
      }
      keybindInput.value = combo;
      currentEditingAutomation.keybind = combo;
    });
    keybindInput.addEventListener('blur', function() {
      const normalized = normalizeShortcutString(keybindInput.value || '');
      keybindInput.value = normalized;
      currentEditingAutomation.keybind = normalized;
    });
  }
  renderParameters();
  renderSteps();
  setTimeout(() => {
    editor.addEventListener('click', collapseStepsOnOutsideClick);
  }, 0);
}

function collapseStepsOnOutsideClick(e) {
  // Check if click is outside any step item
  const clickedStep = e.target.closest('.step-item');
  if (!clickedStep) {
    // Collapse all expanded steps
    document.querySelectorAll('.step-item.expanded').forEach(item => {
      item.classList.remove('expanded');
    });
  }
}

function showAutomationList() {
  // Collect any unsaved changes from expanded steps before exiting
  if (currentEditingAutomation) {
    const stepElements = document.querySelectorAll('.step-item');
    stepElements.forEach((stepEl, index) => {
      if (currentEditingAutomation.steps[index]) {
        const step = {
          waitBefore: parseInt(stepEl.querySelector('.wait-before').value) || 0,
          target: stepEl.querySelector('.target').value,
          selectorMethod: stepEl.querySelector('.selector-method').value,
          action: stepEl.querySelector('.action').value,
          retryCount: parseInt(stepEl.querySelector('.retry-count').value) || 0,
          retryDelay: parseInt(stepEl.querySelector('.retry-delay').value) || 1000,
          waitAfter: parseInt(stepEl.querySelector('.wait-after').value) || 0,
          waitForNetwork: stepEl.querySelector('.wait-for-network').checked
        };
        
        // Always save value field if it exists (preserve it even when action changes)
        const valueInput = stepEl.querySelector('.value');
        if (valueInput) {
          step.value = valueInput.value || '';
        }
        
        // Save all generated selectors if they exist
        if (stepEl.dataset.selectorAuto) {
          step.selectors = {
            auto: stepEl.dataset.selectorAuto || '',
            querySelector: stepEl.dataset.selectorQuerySelector || '',
            xpath: stepEl.dataset.selectorXpath || '',
            text: stepEl.dataset.selectorText || '',
            position: stepEl.dataset.selectorPosition || '',
            coordinates: stepEl.dataset.selectorCoordinates || '',
            id: stepEl.dataset.selectorId || '',
            class: stepEl.dataset.selectorClass || '',
            attribute: stepEl.dataset.selectorAttribute || '',
            iframe: stepEl.dataset.iframeSelector || ''
          };
        }
        
        currentEditingAutomation.steps[index] = step;
      }
    });
    
    // Save to storage and wait for completion before continuing
    try {
      chrome.storage.sync.get(['automations'], (data) => {
        if (chrome.runtime.lastError) {
          console.warn('Storage error:', chrome.runtime.lastError);
          continueToList();
          return;
        }
        const automations = data.automations || [];
      const index = automations.findIndex(a => a.id === currentEditingAutomation.id);
      
        if (index !== -1) {
          automations[index] = currentEditingAutomation;
          chrome.storage.sync.set({ automations: automations }, () => {
            if (chrome.runtime.lastError) {
              console.warn('Storage error:', chrome.runtime.lastError);
            }
            // Clear reference and continue after save completes
            currentEditingAutomation = null;
            continueToList();
          });
        } else {
          currentEditingAutomation = null;
          continueToList();
        }
      });
    } catch (error) {
      console.warn('Failed to save automation:', error);
      currentEditingAutomation = null;
      continueToList();
    }
  } else {
    continueToList();
  }
}

function continueToList() {
  // Remove click listener from editor
  const editor = document.getElementById('automation-editor');
  editor.removeEventListener('click', collapseStepsOnOutsideClick);
  
  // Show automation list
  document.getElementById('automation-list-container').parentElement.style.display = 'block';
  
  // Hide editor
  editor.style.display = 'none';
  
  // Update title
  document.getElementById('panel-title').textContent = 'AutoBrowse';
  
  // Reload automations from storage
  loadAutomationsForPage();
}

function renderSteps() {
  const stepsContainer = document.getElementById('steps-container');
  stepsContainer.innerHTML = '';
  if (!currentEditingAutomation || !currentEditingAutomation.steps) {
    return;
  }
  currentEditingAutomation.steps.forEach((step, index) => {
    const stepElement = createStepElement(step, index);
    stepElement.setAttribute('draggable', 'true');
    stepElement.addEventListener('dragstart', (e) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', index);
      stepElement.classList.add('dragging');
    });
    stepElement.addEventListener('dragend', (e) => {
      stepElement.classList.remove('dragging');
    });
    stepElement.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      stepElement.classList.add('drag-over');
    });
    stepElement.addEventListener('dragleave', (e) => {
      stepElement.classList.remove('drag-over');
    });
    stepElement.addEventListener('drop', (e) => {
      e.preventDefault();
      stepElement.classList.remove('drag-over');
      const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
      const toIndex = index;
      if (fromIndex !== toIndex) {
        const steps = currentEditingAutomation.steps;
        const moved = steps.splice(fromIndex, 1)[0];
        steps.splice(toIndex, 0, moved);
        renderSteps();
        saveCurrentAutomation(true); // silent save
      }
    });
    stepsContainer.appendChild(stepElement);
  });
}

function createStepElement(step, index) {
  const stepDiv = document.createElement('div');
  stepDiv.className = 'step-item';
  stepDiv.dataset.index = index;
  
  // Restore stored selectors if they exist
  if (step.selectors) {
    stepDiv.dataset.selectorAuto = step.selectors.auto || '';
    stepDiv.dataset.selectorQuerySelector = step.selectors.querySelector || '';
    stepDiv.dataset.selectorXpath = step.selectors.xpath || '';
    stepDiv.dataset.selectorText = step.selectors.text || '';
    stepDiv.dataset.selectorPosition = step.selectors.position || '';
    stepDiv.dataset.selectorCoordinates = step.selectors.coordinates || '';
    stepDiv.dataset.selectorId = step.selectors.id || '';
    stepDiv.dataset.selectorClass = step.selectors.class || '';
    stepDiv.dataset.selectorAttribute = step.selectors.attribute || '';
    stepDiv.dataset.iframeSelector = step.selectors.iframe || '';
  }
  
  const actionText = step.action || 'click';
  const targetText = step.target || 'no target';
  const truncatedTarget = targetText.length > 20 ? targetText.substring(0, 20) + '...' : targetText;
  
  stepDiv.innerHTML = `
    <div class="step-header">
      <div class="step-collapsed">
        <span class="step-number">Step ${index + 1}</span>
        <div class="step-summary">
          <span class="step-summary-item">
            <span class="step-summary-label">${actionText}</span>
          </span>
          <span class="step-summary-item" title="${targetText}">
            ${truncatedTarget}
          </span>
        </div>
      </div>
      <span class="step-number" style="display: none;">Step ${index + 1}</span>
      <div class="step-actions">
        <button class="step-apply" data-index="${index}">Apply</button>
        <button class="step-delete" data-index="${index}">Delete</button>
      </div>
    </div>
    <div class="step-fields">
      <div class="step-field" style="display: flex; align-items: center; gap: 8px; width: fit-content;">
        <input type="checkbox" class="wait-for-network" id="wait-network-${index}" ${step.waitForNetwork ? 'checked' : ''} style="width: 16px; height: 16px; margin: 0;">
        <label for="wait-network-${index}" style="margin: 0; cursor: pointer;">Fetch await</label>
      </div>
      <div class="step-field">
        <label>Wait Before (ms)</label>
        <input type="number" class="wait-before" value="${step.waitBefore || 0}" min="0" step="100">
      </div>
      <div class="step-field">
        <label>Target (CSS Selector)</label>
        <div class="target-picker-wrapper">
          <input type="text" class="target" value="${step.target || ''}" placeholder="e.g., #button-id, .class-name">
          <button class="pick-element-btn" data-index="${index}" title="Pick element (or press Ctrl+Shift+E)">🎯 Pick</button>
        </div>
      </div>
      <div class="step-field">
        <label>Selector Method</label>
        <select class="selector-method">
          <option value="auto" ${!step.selectorMethod || step.selectorMethod === 'auto' ? 'selected' : ''}>Auto (Try All)</option>
          <option value="querySelector" ${step.selectorMethod === 'querySelector' ? 'selected' : ''}>CSS Selector</option>
          <option value="xpath" ${step.selectorMethod === 'xpath' ? 'selected' : ''}>XPath</option>
          <option value="text" ${step.selectorMethod === 'text' ? 'selected' : ''}>Text Content</option>
          <option value="position" ${step.selectorMethod === 'position' ? 'selected' : ''}>Position</option>
          <option value="coordinates" ${step.selectorMethod === 'coordinates' ? 'selected' : ''}>Coordinates (x,y)</option>
          <option value="id" ${step.selectorMethod === 'id' ? 'selected' : ''}>ID (partial)</option>
          <option value="class" ${step.selectorMethod === 'class' ? 'selected' : ''}>Class (partial)</option>
          <option value="attribute" ${step.selectorMethod === 'attribute' ? 'selected' : ''}>Attribute</option>
        </select>
      </div>
      <div class="step-field">
        <label>Action</label>
        <select class="action">
          <option value="click" ${step.action === 'click' ? 'selected' : ''}>Click</option>
          <option value="mousedown" ${step.action === 'mousedown' ? 'selected' : ''}>Mouse Down</option>
          <option value="mouseup" ${step.action === 'mouseup' ? 'selected' : ''}>Mouse Up</option>
          <option value="hover" ${step.action === 'hover' ? 'selected' : ''}>Hover</option>
          <option value="focus" ${step.action === 'focus' ? 'selected' : ''}>Focus</option>
          <option value="input" ${step.action === 'input' ? 'selected' : ''}>Input Text</option>
          <option value="scroll" ${step.action === 'scroll' ? 'selected' : ''}>Scroll</option>
          <option value="wait" ${step.action === 'wait' ? 'selected' : ''}>Wait</option>
        </select>
      </div>
      <div class="step-field value-field" style="display: ${step.action === 'input' ? 'block' : 'none'};">
        <label>Text to Input</label>
        <input type="text" class="value" value="${step.value || ''}" placeholder="e.g., Hello World or {username}">
      </div>
      <div class="step-field">
        <label>Retry Count (if failed)</label>
        <input type="number" class="retry-count" value="${step.retryCount || 0}" min="0" max="20" placeholder="0 = no retry">
      </div>
      <div class="step-field">
        <label>Retry Delay (ms)</label>
        <input type="number" class="retry-delay" value="${step.retryDelay || 1000}" min="0" step="100" placeholder="1000">
      </div>
      <div class="step-field">
        <label>Wait After (ms)</label>
        <input type="number" class="wait-after" value="${step.waitAfter || 0}" min="0" step="100">
      </div>
    </div>
  `;
  
  // Add click handler to expand/collapse
  stepDiv.addEventListener('click', (e) => {
    // Don't expand/collapse if clicking delete or apply button
    if (e.target.classList.contains('step-delete') || e.target.classList.contains('step-apply')) return;
    
    // Don't collapse if clicking inside expanded fields (inputs, selects, labels)
    if (stepDiv.classList.contains('expanded')) {
      const clickedInsideFields = e.target.closest('.step-fields');
      if (clickedInsideFields) return;
    }
    
    // Collapse all other steps
    document.querySelectorAll('.step-item').forEach(item => {
      if (item !== stepDiv) {
        item.classList.remove('expanded');
      }
    });
    
    // Toggle this step
    stepDiv.classList.toggle('expanded');
  });
  
  // Add apply handler
  const applyBtn = stepDiv.querySelector('.step-apply');
  applyBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    applyStep(stepDiv, index);
  });
  
  // Add delete handler
  const deleteBtn = stepDiv.querySelector('.step-delete');
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    deleteStep(index);
  });
  
  // Add pick element handler
  const pickBtn = stepDiv.querySelector('.pick-element-btn');
  pickBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    startElementPicker(stepDiv, index);
  });
  
  // Add input handlers to update summary when fields change
  const actionSelect = stepDiv.querySelector('.action');
  const targetInput = stepDiv.querySelector('.target');
  const valueField = stepDiv.querySelector('.value-field');
  const selectorMethodSelect = stepDiv.querySelector('.selector-method');
  
  actionSelect.addEventListener('change', () => {
    updateStepSummary(stepDiv, actionSelect.value, targetInput.value);
    // Show/hide value field based on action
    if (valueField) {
      valueField.style.display = actionSelect.value === 'input' ? 'block' : 'none';
    }
  });
  
  targetInput.addEventListener('input', () => {
    updateStepSummary(stepDiv, actionSelect.value, targetInput.value);
  });
  
  // When selector method changes, update the target field with the appropriate selector
  selectorMethodSelect.addEventListener('change', () => {
    const method = selectorMethodSelect.value;
    const selectorKey = `selector${method.charAt(0).toUpperCase() + method.slice(1)}`;
    
    // Check if we have a stored selector for this method
    if (stepDiv.dataset[selectorKey]) {
      targetInput.value = stepDiv.dataset[selectorKey];
      updateStepSummary(stepDiv, actionSelect.value, targetInput.value);
    }
  });
  
  return stepDiv;
}

function updateStepSummary(stepDiv, action, target) {
  const summary = stepDiv.querySelector('.step-summary');
  const truncatedTarget = target.length > 20 ? target.substring(0, 20) + '...' : target || 'no target';
  
  summary.innerHTML = `
    <span class="step-summary-item">
      <span class="step-summary-label">${action}</span>
    </span>
    <span class="step-summary-item" title="${target}">
      ${truncatedTarget}
    </span>
  `;
}

function addStep() {
  if (!currentEditingAutomation) return;
  
  if (!currentEditingAutomation.steps) {
    currentEditingAutomation.steps = [];
  }
  
  const newStep = {
    waitBefore: 0,
    target: '',
    selectorMethod: 'auto',
    action: 'click',
    value: '',
    retryCount: 0,
    retryDelay: 1000,
    waitAfter: 0
  };
  
  currentEditingAutomation.steps.push(newStep);
  renderSteps();
  
  // Scroll to bottom to show new step
  const stepsContainer = document.getElementById('steps-container');
  stepsContainer.scrollTop = stepsContainer.scrollHeight;
}

function toggleParametersSection() {
  const container = document.getElementById('parameters-container');
  const addBtn = document.getElementById('add-parameter-btn');
  const toggle = document.getElementById('parameters-toggle');
  const arrow = toggle.querySelector('span');
  
  if (container.style.display === 'none') {
    container.style.display = 'block';
    addBtn.style.display = 'block';
    arrow.textContent = '▼';
  } else {
    container.style.display = 'none';
    addBtn.style.display = 'none';
    arrow.textContent = '▶';
  }
}

function renderParameters() {
  const container = document.getElementById('parameters-container');
  if (!container) return;
  
  if (!currentEditingAutomation.parameters) {
    currentEditingAutomation.parameters = [];
  }
  
  container.innerHTML = '';
  
  currentEditingAutomation.parameters.forEach((param, index) => {
    const paramDiv = document.createElement('div');
    paramDiv.className = 'parameter-item';
    paramDiv.innerHTML = `
      <input type="text" class="param-name" placeholder="Name (e.g., username)" value="${param.name || ''}" />
      <input type="text" class="param-default" placeholder="Default value" value="${param.defaultValue || ''}" />
      <button class="param-delete" data-index="${index}">×</button>
    `;
    
    const nameInput = paramDiv.querySelector('.param-name');
    const defaultInput = paramDiv.querySelector('.param-default');
    
    nameInput.addEventListener('input', () => {
      currentEditingAutomation.parameters[index].name = nameInput.value;
    });
    
    defaultInput.addEventListener('input', () => {
      currentEditingAutomation.parameters[index].defaultValue = defaultInput.value;
    });
    
    paramDiv.querySelector('.param-delete').addEventListener('click', () => {
      deleteParameter(index);
    });
    
    container.appendChild(paramDiv);
  });
}

function addParameter() {
  if (!currentEditingAutomation) return;
  
  if (!currentEditingAutomation.parameters) {
    currentEditingAutomation.parameters = [];
  }
  
  currentEditingAutomation.parameters.push({
    name: '',
    defaultValue: ''
  });
  
  renderParameters();
}

function deleteParameter(index) {
  if (!currentEditingAutomation || !currentEditingAutomation.parameters) return;
  
  currentEditingAutomation.parameters.splice(index, 1);
  renderParameters();
}

function applyStep(stepDiv, index) {
  if (!currentEditingAutomation || !currentEditingAutomation.steps) return;
  
  // Update the step data in memory
  const step = {
    waitBefore: parseInt(stepDiv.querySelector('.wait-before').value) || 0,
    target: stepDiv.querySelector('.target').value,
    selectorMethod: stepDiv.querySelector('.selector-method').value,
    action: stepDiv.querySelector('.action').value,
    retryCount: parseInt(stepDiv.querySelector('.retry-count').value) || 0,
    retryDelay: parseInt(stepDiv.querySelector('.retry-delay').value) || 1000,
    waitAfter: parseInt(stepDiv.querySelector('.wait-after').value) || 0
  };
  
  // Add value field for input action
  const valueInput = stepDiv.querySelector('.value');
  if (valueInput && step.action === 'input') {
    step.value = valueInput.value;
  }
  
  currentEditingAutomation.steps[index] = step;
  
  // Update the summary display
  updateStepSummary(stepDiv, step.action, step.target);
  
  // Collapse the step
  stepDiv.classList.remove('expanded');
  
  showStatus('✓ Step updated', 'success');
}

function deleteStep(index) {
  if (!currentEditingAutomation || !currentEditingAutomation.steps) return;
  
  currentEditingAutomation.steps.splice(index, 1);
  renderSteps();
}

function saveCurrentAutomation(silent = false) {
  if (!currentEditingAutomation) return;
  
  // Collect data from step fields
  const stepElements = document.querySelectorAll('.step-item');
  currentEditingAutomation.steps = [];
  
  stepElements.forEach((stepEl) => {
    const step = {
      waitBefore: parseInt(stepEl.querySelector('.wait-before').value) || 0,
      target: stepEl.querySelector('.target').value,
      selectorMethod: stepEl.querySelector('.selector-method').value,
      action: stepEl.querySelector('.action').value,
      retryCount: parseInt(stepEl.querySelector('.retry-count').value) || 0,
      retryDelay: parseInt(stepEl.querySelector('.retry-delay').value) || 1000,
      waitAfter: parseInt(stepEl.querySelector('.wait-after').value) || 0,
      waitForNetwork: stepEl.querySelector('.wait-for-network').checked
    };
    
    // Always save value field if it exists (preserve it even when action changes)
    const valueInput = stepEl.querySelector('.value');
    if (valueInput) {
      step.value = valueInput.value || '';
    }
    
    // Save all generated selectors if they exist
    if (stepEl.dataset.selectorAuto) {
      step.selectors = {
        auto: stepEl.dataset.selectorAuto || '',
        querySelector: stepEl.dataset.selectorQuerySelector || '',
        xpath: stepEl.dataset.selectorXpath || '',
        text: stepEl.dataset.selectorText || '',
        position: stepEl.dataset.selectorPosition || '',
        coordinates: stepEl.dataset.selectorCoordinates || '',
        id: stepEl.dataset.selectorId || '',
        class: stepEl.dataset.selectorClass || '',
        attribute: stepEl.dataset.selectorAttribute || '',
        iframe: stepEl.dataset.iframeSelector || ''
      };
    }
    
    currentEditingAutomation.steps.push(step);
  });
  
  // Save to storage
  try {
    chrome.storage.sync.get(['automations'], (data) => {
      if (chrome.runtime.lastError) {
        console.warn('Storage error:', chrome.runtime.lastError);
        if (!silent) {
          showStatus('✗ Failed to save', 'error');
        }
        return;
      }
      const automations = data.automations || [];
    const index = automations.findIndex(a => a.id === currentEditingAutomation.id);
    
      if (index !== -1) {
        automations[index] = currentEditingAutomation;
        chrome.storage.sync.set({ automations: automations }, () => {
          if (chrome.runtime.lastError) {
            console.warn('Storage error:', chrome.runtime.lastError);
            if (!silent) {
              showStatus('✗ Failed to save', 'error');
            }
            return;
          }
          if (!silent) {
            showStatus('✓ Automation saved!', 'success');
          }
        });
      }
    });
  } catch (error) {
    console.warn('Failed to save automation:', error);
    if (!silent) {
      showStatus('✗ Failed to save', 'error');
    }
  }
}

function testCurrentAutomation() {
  if (!currentEditingAutomation) return;
  
  // Save first
  saveCurrentAutomation(true); // silent save
  
  // Then run in test mode
  setTimeout(() => {
    runAutomation(currentEditingAutomation, true); // true = test mode
  }, 500);
}

function runCurrentAutomation() {
  if (!currentEditingAutomation) return;
  
  // Save first
  saveCurrentAutomation(true); // silent save
  
  // Then run in normal mode
  setTimeout(() => {
    runAutomation(currentEditingAutomation, false); // false = normal mode
  }, 500);
}

function runAutomation(automation, testMode = false) {
  if (!automation || !automation.steps || automation.steps.length === 0) {
    showStatus('✗ No steps to execute', 'error');
    return;
  }

  // Check if automation has parameters
  if (automation.parameters && automation.parameters.length > 0) {
    showParameterPopup(automation, (paramValues) => {
      executeAutomationWithParams(automation, paramValues, testMode);
    });
  } else {
    executeAutomationWithParams(automation, {}, testMode);
  }
}

function executeAutomationWithParams(automation, paramValues, testMode = false) {
  const modeText = testMode ? ' (Test Mode - Step-by-Step)' : '';
  showStatus(`Running: ${automation.name || 'automation'}${modeText}...`, 'success');
  
  // Clear and show execution log
  const logContainer = document.getElementById('execution-log');
  if (logContainer) {
    logContainer.innerHTML = '';
    logContainer.classList.add('show');
    addLogEntry('running', `Starting automation: ${automation.name}`, false);
  }
  
  // Clone automation and substitute parameters in steps
  const automationWithParams = JSON.parse(JSON.stringify(automation));
  automationWithParams.steps = automationWithParams.steps.map(step => {
    const newStep = { ...step };
    if (newStep.target) {
      newStep.target = substituteParameters(newStep.target, paramValues);
    }
    if (newStep.value) {
      newStep.value = substituteParameters(newStep.value, paramValues);
    }
    return newStep;
  });
  
  try {
    // Use the automation executor
    window.automationExecutor.run(
      automationWithParams,
      // Progress callback
      (stepIndex, totalSteps, message) => {
        showStatus(`[${stepIndex}/${totalSteps}] ${message}`, 'success');
      },
      // Complete callback
      () => {
        showStatus(`✓ ${automation.name || 'Automation'} completed successfully`, 'success');
        if (logContainer) {
          addLogEntry('success', 'Automation completed successfully!', false);
        }
      },
      // Error callback
      (error) => {
        showStatus(`✗ Error: ${error.message}`, 'error');
        console.log('Automation error:', error.message);
        if (logContainer) {
          addLogEntry('error', `Failed: ${error.message}`, true);
        }
      },
      // Step callback
      (stepIndex, step, success, error) => {
        if (logContainer) {
          if (success) {
            addLogEntry('success', `Step ${stepIndex}: ${step.action} on ${step.target || 'page'}`, false);
          } else {
            addLogEntry('error', `Step ${stepIndex}: ${step.action} - ${error}`, true);
          }
        }
      },
      // Test mode flag
      testMode
    );
  } catch (error) {
    // Catch any synchronous errors
    console.log('Failed to start automation:', error.message);
    showStatus(`✗ Failed to start: ${error.message}`, 'error');
    if (logContainer) {
      addLogEntry('error', `Failed to start: ${error.message}`, true);
    }
  }
}

function substituteParameters(text, paramValues) {
  if (!text) return text;
  let result = text;
  for (const [name, value] of Object.entries(paramValues)) {
    const pattern = new RegExp(`\\{${name}\\}`, 'g');
    result = result.replace(pattern, value);
  }
  return result;
}

function showParameterPopup(automation, callback) {
  // Create or get popup overlay
  let overlay = document.getElementById('parameter-popup-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'parameter-popup-overlay';
    document.body.appendChild(overlay);
  }
  
  // Build popup content
  const popupContent = document.createElement('div');
  popupContent.className = 'parameter-popup';
  
  let html = `<h3>Enter Parameters for "${automation.name || 'Automation'}"</h3>`;
  
  automation.parameters.forEach((param, index) => {
    const paramName = param.name || `param${index}`;
    const defaultValue = param.defaultValue || '';
    html += `
      <div class="parameter-popup-field">
        <label>${paramName}</label>
        <input type="text" class="param-input" data-name="${paramName}" value="${defaultValue}" placeholder="Enter ${paramName}">
      </div>
    `;
  });
  
  html += `
    <div class="parameter-popup-buttons">
      <button class="secondary" id="param-cancel">Cancel</button>
      <button class="primary" id="param-submit">Run</button>
    </div>
  `;
  
  popupContent.innerHTML = html;
  overlay.innerHTML = '';
  overlay.appendChild(popupContent);
  overlay.classList.add('show');
  
  // Add event listeners
  document.getElementById('param-cancel').addEventListener('click', () => {
    overlay.classList.remove('show');
  });
  
  document.getElementById('param-submit').addEventListener('click', () => {
    const paramValues = {};
    const inputs = popupContent.querySelectorAll('.param-input');
    inputs.forEach(input => {
      paramValues[input.dataset.name] = input.value;
    });
    overlay.classList.remove('show');
    callback(paramValues);
  });
  
  // Focus first input
  setTimeout(() => {
    const firstInput = popupContent.querySelector('.param-input');
    if (firstInput) {
      firstInput.focus();
      // Select all text so user can immediately start typing to replace it
      firstInput.select();
    }
  }, 100);
  
  // Allow Enter to submit from anywhere in the popup (including input fields)
  popupContent.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      document.getElementById('param-submit').click();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      document.getElementById('param-cancel').click();
    }
  }, true); // Use capture phase to catch events before they reach inputs
}

function addLogEntry(type, message, isError) {
  const logContainer = document.getElementById('execution-log');
  if (!logContainer) return;
  
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  
  const icon = document.createElement('span');
  icon.className = `log-icon ${type}`;
  icon.textContent = type === 'success' ? '✓' : type === 'error' ? '✗' : '▶';
  
  const messageSpan = document.createElement('span');
  messageSpan.className = isError ? 'log-error' : 'log-message';
  messageSpan.textContent = message;
  
  entry.appendChild(icon);
  entry.appendChild(messageSpan);
  logContainer.appendChild(entry);
  
  // Auto-scroll to bottom
  logContainer.scrollTop = logContainer.scrollHeight;
}

function showStatus(message, type) {
  const statusDiv = document.getElementById('status-message');
  if (statusDiv) {
    statusDiv.textContent = message;
    statusDiv.className = 'show ' + type;
    setTimeout(() => {
      statusDiv.classList.remove('show');
    }, 3000);
  }
}

// Listen for messages from background script
try {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    try {
      if (request.action === 'runAutomation') {
        const automation = request.automation;
        showStatus(`Running: ${automation.name}`, 'success');
        // Execute automation steps here
        sendResponse({ status: 'success' });
      }
    } catch (error) {
      console.warn('Message handler error:', error);
      sendResponse({ status: 'error', error: error.message });
    }
    return true;
  });
} catch (error) {
  console.warn('Failed to add message listener:', error);
}

// Element Picker functionality
let pickerActive = false;
let currentPickerStep = null;
let currentPickerIndex = null;
let currentPickerElement = null;
let highlightBox = null;
let pickerOverlay = null;
let pickerTooltip = null;

// Global keyboard shortcut for element picker (Ctrl+Shift+E)
if (!window._elementPickerShortcutListener) {
  window._elementPickerShortcutListener = true;
  document.addEventListener('keydown', (e) => {
    // Only trigger if editor is open and a step is expanded
    const editor = document.getElementById('automation-editor');
    if (!editor || editor.style.display === 'none') return;
    
    const expandedStep = document.querySelector('.step-item.expanded');
    if (!expandedStep) return;
    
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'e') {
      e.preventDefault();
      e.stopPropagation();
      const index = parseInt(expandedStep.dataset.index);
      startElementPicker(expandedStep, index);
    }
  }, true);
}

function startElementPicker(stepDiv, index) {
  if (pickerActive) return;
  
  pickerActive = true;
  currentPickerStep = stepDiv;
  currentPickerIndex = index;
  
  // Update pick button state
  const pickBtn = stepDiv.querySelector('.pick-element-btn');
  pickBtn.classList.add('active');
  pickBtn.textContent = '✕ Cancel';
  
  // Create overlay
  pickerOverlay = document.createElement('div');
  pickerOverlay.className = 'picker-overlay';
  document.body.appendChild(pickerOverlay);
  
  // Create highlight box
  highlightBox = document.createElement('div');
  highlightBox.className = 'element-highlight';
  document.body.appendChild(highlightBox);
  
  // Create tooltip
  pickerTooltip = document.createElement('div');
  pickerTooltip.className = 'picker-tooltip';
  document.body.appendChild(pickerTooltip);
  
  // Add event listeners
  document.addEventListener('mousemove', handlePickerMouseMove, true);
  document.addEventListener('click', handlePickerClick, true);
  document.addEventListener('keydown', handlePickerKeyDown, true);
  
  showStatus('Hover & use ↑↓←→ to navigate, Click to select (ESC to cancel)', 'success');
}

function stopElementPicker() {
  if (!pickerActive) return;
  
  pickerActive = false;
  
  // Remove overlay and highlight
  if (pickerOverlay) pickerOverlay.remove();
  if (highlightBox) highlightBox.remove();
  if (pickerTooltip) pickerTooltip.remove();
  
  // Reset button
  if (currentPickerStep) {
    const pickBtn = currentPickerStep.querySelector('.pick-element-btn');
    pickBtn.classList.remove('active');
    pickBtn.textContent = '🎯 Pick';
  }
  
  // Remove event listeners
  document.removeEventListener('mousemove', handlePickerMouseMove, true);
  document.removeEventListener('click', handlePickerClick, true);
  document.removeEventListener('keydown', handlePickerKeyDown, true);
  
  currentPickerStep = null;
  currentPickerIndex = null;
  currentPickerElement = null;
}

function handlePickerMouseMove(e) {
  if (!pickerActive) return;
  
  // Get element under cursor (excluding our UI elements)
  const element = getElementUnderCursor(e);
  if (!element) return;
  
  currentPickerElement = element;
  updatePickerHighlight(element);
  
  // Update tooltip with element tag
  const elementTag = getElementTag(element);
  pickerTooltip.innerHTML = `${elementTag}<br><small style="opacity: 0.7;">↑ Parent | ↓ Child | Click to select</small>`;
  pickerTooltip.style.left = (e.clientX + 15) + 'px';
  pickerTooltip.style.top = (e.clientY + 15) + 'px';
}

function updatePickerHighlight(element) {
  if (!element) return;
  
  // Get element's bounding rect
  let rect = element.getBoundingClientRect();
  
  // If element is inside an iframe, adjust coordinates
  if (element._parentIframe) {
    const iframe = element._parentIframe;
    const iframeRect = iframe.getBoundingClientRect();
    
    // Convert iframe-relative coordinates to page-relative coordinates
    rect = {
      left: iframeRect.left + rect.left,
      top: iframeRect.top + rect.top,
      width: rect.width,
      height: rect.height,
      right: iframeRect.left + rect.right,
      bottom: iframeRect.top + rect.bottom
    };
  }
  
  // Update highlight position
  highlightBox.style.left = rect.left + window.scrollX + 'px';
  highlightBox.style.top = rect.top + window.scrollY + 'px';
  highlightBox.style.width = rect.width + 'px';
  highlightBox.style.height = rect.height + 'px';
}

function getElementTag(element) {
  if (!element) return '';
  
  let tag = `<${element.tagName.toLowerCase()}`;
  
  // Add key attributes
  if (element.id) tag += ` id="${element.id}"`;
  if (element.className && typeof element.className === 'string') {
    const classes = element.className.trim().split(/\s+/).filter(c => c).slice(0, 3).join(' ');
    if (classes) tag += ` class="${classes}${element.className.trim().split(/\s+/).length > 3 ? '...' : ''}"`;
  }
  
  // Add other notable attributes (limit to important ones)
  const notableAttrs = ['name', 'type', 'role', 'data-testid', 'aria-label'];
  notableAttrs.forEach(attr => {
    if (element.hasAttribute(attr)) {
      let val = element.getAttribute(attr);
      if (val.length > 30) val = val.substring(0, 30) + '...';
      tag += ` ${attr}="${val}"`;
    }
  });
  
  tag += '>';
  return tag;
}

function handlePickerClick(e) {
  if (!pickerActive) return;
  
  e.preventDefault();
  e.stopPropagation();
  
  // Use currentPickerElement if available (after navigation), otherwise get element under cursor
  const element = currentPickerElement || getElementUnderCursor(e);
  if (!element) return;
  
  // Generate selectors for all strategies (pass click coordinates)
  const selectors = generateAllSelectors(element, e.clientX, e.clientY);
  
  if (currentPickerStep) {
    const targetInput = currentPickerStep.querySelector('.target');
    const selectorMethodSelect = currentPickerStep.querySelector('.selector-method');
    
    // Store all selectors as data attributes on the step
    currentPickerStep.dataset.selectorAuto = selectors.auto;
    currentPickerStep.dataset.selectorQuerySelector = selectors.querySelector;
    currentPickerStep.dataset.selectorXpath = selectors.xpath;
    currentPickerStep.dataset.selectorText = selectors.text;
    currentPickerStep.dataset.selectorPosition = selectors.position;
    currentPickerStep.dataset.selectorCoordinates = selectors.coordinates;
    currentPickerStep.dataset.selectorId = selectors.id;
    currentPickerStep.dataset.selectorClass = selectors.class;
    currentPickerStep.dataset.selectorAttribute = selectors.attribute;
    currentPickerStep.dataset.iframeSelector = selectors.iframe || '';
    
    // Set the target input to the current strategy's selector
    const currentMethod = selectorMethodSelect.value || 'auto';
    targetInput.value = selectors[currentMethod] || selectors.auto;
    
    // Update summary
    const actionSelect = currentPickerStep.querySelector('.action');
    updateStepSummary(currentPickerStep, actionSelect.value, targetInput.value);
  }
  
  stopElementPicker();
  showStatus('✓ Element selected', 'success');
}

function handlePickerKeyDown(e) {
  if (!pickerActive) return;
  
  if (e.key === 'Escape') {
    e.preventDefault();
    stopElementPicker();
    showStatus('Element picker cancelled', 'error');
    return;
  }
  
  // Arrow Up: Select parent
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (currentPickerElement && currentPickerElement.parentElement) {
      currentPickerElement = currentPickerElement.parentElement;
      updatePickerHighlight(currentPickerElement);
      const elementTag = getElementTag(currentPickerElement);
      pickerTooltip.innerHTML = `${elementTag}<br><small style="opacity: 0.7;">↑ Parent | ↓ Child | Click to select</small>`;
    }
    return;
  }
  
  // Arrow Down: Select first child
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (currentPickerElement && currentPickerElement.children.length > 0) {
      currentPickerElement = currentPickerElement.children[0];
      updatePickerHighlight(currentPickerElement);
      const elementTag = getElementTag(currentPickerElement);
      pickerTooltip.innerHTML = `${elementTag}<br><small style="opacity: 0.7;">↑ Parent | ↓ Child | Click to select</small>`;
    }
    return;
  }
  
  // Arrow Left/Right: Navigate siblings
  if (e.key === 'ArrowLeft') {
    e.preventDefault();
    if (currentPickerElement && currentPickerElement.previousElementSibling) {
      currentPickerElement = currentPickerElement.previousElementSibling;
      updatePickerHighlight(currentPickerElement);
      const elementTag = getElementTag(currentPickerElement);
      pickerTooltip.innerHTML = `${elementTag}<br><small style="opacity: 0.7;">↑ Parent | ↓ Child | ← → Siblings | Click to select</small>`;
    }
    return;
  }
  
  if (e.key === 'ArrowRight') {
    e.preventDefault();
    if (currentPickerElement && currentPickerElement.nextElementSibling) {
      currentPickerElement = currentPickerElement.nextElementSibling;
      updatePickerHighlight(currentPickerElement);
      const elementTag = getElementTag(currentPickerElement);
      pickerTooltip.innerHTML = `${elementTag}<br><small style="opacity: 0.7;">↑ Parent | ↓ Child | ← → Siblings | Click to select</small>`;
    }
    return;
  }
}

function getElementUnderCursor(e) {
  // Temporarily hide our UI elements
  const uiElements = [pickerOverlay, highlightBox, pickerTooltip, bubble, panel];
  const originalDisplay = uiElements.map(el => el ? el.style.display : null);
  uiElements.forEach(el => { if (el) el.style.display = 'none'; });
  
  // Get element at point
  let element = document.elementFromPoint(e.clientX, e.clientY);
  
  // Check if element is an iframe and try to access its content
  if (element && element.tagName === 'IFRAME') {
    try {
      const iframeDoc = element.contentDocument || element.contentWindow.document;
      if (iframeDoc) {
        // Get coordinates relative to iframe
        const iframeRect = element.getBoundingClientRect();
        const iframeX = e.clientX - iframeRect.left;
        const iframeY = e.clientY - iframeRect.top;
        
        // Get element inside iframe
        const iframeElement = iframeDoc.elementFromPoint(iframeX, iframeY);
        if (iframeElement) {
          // Store iframe reference on the element for later use
          iframeElement._parentIframe = element;
          element = iframeElement;
        }
      }
    } catch (err) {
      // Cross-origin iframe - can't access content
      console.warn('Cannot access iframe content (cross-origin):', err.message);
    }
  }
  
  // Restore UI elements
  uiElements.forEach((el, i) => { if (el) el.style.display = originalDisplay[i] || ''; });
  
  return element;
}

function generateSelector(element) {
  // Priority: ID > unique class > tag with nth-child
  
  // Try ID
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
  
  // Try tag + class
  if (element.className && typeof element.className === 'string') {
    const classes = element.className.trim().split(/\s+/).filter(c => c);
    if (classes.length > 0) {
      const tagClass = element.tagName.toLowerCase() + '.' + classes.map(c => CSS.escape(c)).join('.');
      if (document.querySelectorAll(tagClass).length === 1) {
        return tagClass;
      }
    }
  }
  
  // Build path with nth-child
  const path = [];
  let current = element;
  
  while (current && current !== document.body) {
    let selector = current.tagName.toLowerCase();
    
    if (current.id) {
      selector = '#' + CSS.escape(current.id);
      path.unshift(selector);
      break;
    }
    
    // Add nth-child if there are siblings of same type
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

function generateAllSelectors(element, clickX = null, clickY = null) {
  // Check if element is inside an iframe
  const iframe = element._parentIframe || null;
  const iframeSelector = iframe ? generateSelector(iframe) : null;
  
  const selectors = {
    auto: '',
    querySelector: '',
    xpath: '',
    text: '',
    position: '',
    coordinates: '',
    id: '',
    class: '',
    attribute: '',
    iframe: iframeSelector // Store iframe selector if element is in iframe
  };
  
  // 1. Auto / CSS Selector (default CSS strategy)
  selectors.auto = generateSelector(element);
  selectors.querySelector = selectors.auto;
  
  // 2. XPath - Generate XPath expression
  const getXPath = (el) => {
    if (el.id) {
      return `//*[@id="${el.id}"]`;
    }
    const parts = [];
    let current = el;
    while (current && current !== document.body) {
      let index = 1;
      let sibling = current.previousElementSibling;
      while (sibling) {
        if (sibling.tagName === current.tagName) index++;
        sibling = sibling.previousElementSibling;
      }
      const tagName = current.tagName.toLowerCase();
      const part = index > 1 ? `${tagName}[${index}]` : tagName;
      parts.unshift(part);
      current = current.parentElement;
    }
    return '//' + parts.join('/');
  };
  selectors.xpath = getXPath(element);
  
  // 3. Text Content - Get visible text (prefer direct text nodes over nested content)
  let text = '';
  // For input elements, use value or placeholder
  if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
    text = element.value || element.placeholder || '';
  } else {
    // Get direct text content (excluding child elements' text when possible)
    // This gives more precise targeting
    const clone = element.cloneNode(true);
    // Remove child element nodes to get only direct text
    Array.from(clone.children).forEach(child => child.remove());
    text = clone.textContent?.trim() || element.textContent?.trim() || element.innerText?.trim() || '';
  }
  // Store full text for better matching (increased from 50 to 100 chars)
  selectors.text = text.length > 100 ? text.substring(0, 100) : text;
  
  // 4. Position - Pure DOM structure with nth-of-type (no IDs or classes)
  const getPositionSelector = (el) => {
    const path = [];
    let current = el;
    while (current && current !== document.body && current !== document.documentElement) {
      const parent = current.parentElement;
      if (!parent) break;
      
      const tagName = current.tagName.toLowerCase();
      
      // Count siblings of the same type
      const siblings = Array.from(parent.children).filter(child => 
        child.tagName.toLowerCase() === tagName
      );
      
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        path.unshift(`${tagName}:nth-of-type(${index})`);
      } else {
        path.unshift(tagName);
      }
      
      current = parent;
    }
    return path.length > 0 ? path.join(' > ') : tagName;
  };
  selectors.position = getPositionSelector(element);
  
  // 5. Coordinates - Store absolute (x,y) position for clicking
  if (clickX !== null && clickY !== null) {
    selectors.coordinates = `${clickX},${clickY}`;
  } else {
    // Fallback: get center of element's bounding rect
    const rect = element.getBoundingClientRect();
    const x = Math.round(rect.left + rect.width / 2);
    const y = Math.round(rect.top + rect.height / 2);
    selectors.coordinates = `${x},${y}`;
  }
  
  // 6. ID (partial) - Use full ID or partial
  if (element.id) {
    selectors.id = element.id;
  } else {
    selectors.id = selectors.auto; // fallback to CSS
  }
  
  // 6. Class (partial) - Use first class or all classes
  if (element.className && typeof element.className === 'string') {
    const classes = element.className.trim().split(/\s+/).filter(c => c);
    if (classes.length > 0) {
      selectors.class = classes[0]; // Use first class for partial matching
    } else {
      selectors.class = selectors.auto;
    }
  } else {
    selectors.class = selectors.auto;
  }
  
  // 7. Attribute - Find best attribute
  const bestAttribute = (() => {
    // Priority: data-testid, data-test, id, name, aria-label, type
    const attrPriority = ['data-testid', 'data-test', 'data-id', 'name', 'aria-label', 'type', 'role', 'title'];
    for (const attr of attrPriority) {
      if (element.hasAttribute(attr)) {
        const value = element.getAttribute(attr);
        return `[${attr}="${value}"]`;
      }
    }
    // Fallback: use any data- attribute
    for (const attr of element.attributes) {
      if (attr.name.startsWith('data-')) {
        return `[${attr.name}="${attr.value}"]`;
      }
    }
    return null;
  })();
  selectors.attribute = bestAttribute || selectors.auto;
  
  return selectors;
}

// Listen for keybinds and run automation
// Helper: check if target is editable (to avoid intercepting typing)
function isEditableTarget(el) {
  if (!el) return false;
  const editableSelectors = 'input, textarea, [contenteditable="true"], [contenteditable=""], [contenteditable="plaintext-only"]';
  return !!el.closest(editableSelectors);
}

// Helper: canonicalize an input string like "ctrl+shift+k" to "Ctrl+Shift+K"
function normalizeShortcutString(input) {
  if (!input || typeof input !== 'string') return '';
  const parts = input.split('+').map(p => p.trim().toLowerCase()).filter(Boolean);
  let hasCtrl = false, hasAlt = false, hasShift = false, hasMeta = false; let key = '';
  parts.forEach(p => {
    if (p === 'ctrl' || p === 'control') hasCtrl = true;
    else if (p === 'alt' || p === 'option') hasAlt = true;
    else if (p === 'shift') hasShift = true;
    else if (p === 'meta' || p === 'cmd' || p === 'command' || p === 'win' || p === 'super') hasMeta = true;
    else key = p;
  });
  if (!key) return (hasCtrl||hasAlt||hasShift||hasMeta) ? '' : '';
  key = canonicalizeKeyName(key);
  const order = [];
  if (hasMeta) order.push('Cmd');
  if (hasCtrl) order.push('Ctrl');
  if (hasAlt) order.push('Alt');
  if (hasShift) order.push('Shift');
  order.push(key);
  return order.join('+');
}

// Helper: turn a KeyboardEvent into canonical string like "Ctrl+Alt+K"
function eventToShortcut(e) {
  const isModifierOnly = e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta';
  const keyName = isModifierOnly ? '' : canonicalizeKeyName(e.key);
  if (!keyName) {
    // no non-modifier key -> not a full shortcut
    return '';
  }
  const parts = [];
  if (e.metaKey) parts.push('Cmd');
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  parts.push(keyName);
  return parts.join('+');
}

// Helper: normalize various key names
function canonicalizeKeyName(k) {
  if (!k) return '';
  let key = k;
  // If single letter/number, uppercase letter
  if (key.length === 1) return key.toUpperCase();
  const map = {
    ' ': 'Space',
    'arrowup': 'ArrowUp',
    'arrowdown': 'ArrowDown',
    'arrowleft': 'ArrowLeft',
    'arrowright': 'ArrowRight',
    'escape': 'Esc',
    'esc': 'Esc',
    'enter': 'Enter',
    'tab': 'Tab',
    'backspace': 'Backspace',
    'delete': 'Delete',
    'pageup': 'PageUp',
    'pagedown': 'PageDown',
    'home': 'Home',
    'end': 'End',
    'insert': 'Insert',
    'space': 'Space'
  };
  const lower = key.toLowerCase();
  if (map[lower]) return map[lower];
  // Function keys
  if (/^f\d{1,2}$/i.test(key)) return key.toUpperCase();
  return key.length === 1 ? key.toUpperCase() : key;
}

// Known reserved shortcuts in Chrome/Windows that usually won't reach pages
function isReservedShortcut(combo) {
  const c = normalizeShortcutString(combo);
  if (!c) return false;
  const reserved = new Set([
    'Ctrl+L', 'Ctrl+K', 'Ctrl+E', // focus omnibox / search
    'Ctrl+T', 'Ctrl+N', 'Ctrl+Shift+N', // new tab/window
    'Ctrl+W', 'Ctrl+Shift+W', // close tab/window
    'Ctrl+R', 'Ctrl+Shift+R', // reload
    'Ctrl+F', // find
    'Ctrl+P', // print
    'Ctrl+S', // save
    'Ctrl+O', // open
    'Ctrl+J', // downloads
    'Ctrl+H', // history
    'Ctrl+Shift+I', 'Ctrl+Shift+C', // devtools
    'Ctrl+U', // view source
    'Ctrl+Plus', 'Ctrl+Minus', 'Ctrl+0', // zoom
    'Alt+F4' // OS close window
  ]);
  if (reserved.has(c)) return true;
  if (/^Ctrl\+[1-9]$/.test(c)) return true; // switch to tab 1..9
  if (/^Ctrl\+F\d{1,2}$/.test(c)) return true; // many F-keys with Ctrl
  if (c === 'Ctrl+Tab' || c === 'Ctrl+Shift+Tab') return true; // tab navigation
  return false;
}

if (!window._autobrowseKeybindListener) {
  window._autobrowseKeybindListener = true;
  document.addEventListener('keydown', function(e) {
    if (isEditableTarget(e.target)) return; // don't trigger while typing
    try {
      chrome.storage.sync.get(['automations'], (data) => {
        const automations = (data && data.automations) || [];
        const pressed = eventToShortcut(e);
        if (!pressed) return;
        automations.forEach(auto => {
          if (!auto || !auto.keybind) return;
          const stored = normalizeShortcutString(auto.keybind);
          if (stored && stored === pressed) {
            try { runAutomation(auto); } catch (_) {}
          }
        });
      });
    } catch (_) {}
  });
}
