// Popup script for AutoBrowse extension

let currentTab = null;

document.addEventListener('DOMContentLoaded', async () => {
  const automationList = document.getElementById('automationList');
  const addAutomationBtn = document.getElementById('addAutomationBtn');
  const openOptionsBtn = document.getElementById('openOptionsBtn');
  const statusDiv = document.getElementById('status');
  const pageTitle = document.getElementById('pageTitle');
  const pageUrl = document.getElementById('pageUrl');

  // Get current tab info
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;
  
  if (tab) {
    pageTitle.textContent = tab.title || 'Untitled';
    pageUrl.textContent = new URL(tab.url).hostname;
  }

  // Load automations
  loadAutomations();

  // Add automation button
  addAutomationBtn.addEventListener('click', () => {
    createNewAutomation();
  });

  // Open options page button
  openOptionsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Create new automation
  function createNewAutomation() {
    if (!currentTab) return;
    
    const automationName = prompt('Enter automation name:', `Automation for ${new URL(currentTab.url).hostname}`);
    if (!automationName) return;
    
    chrome.storage.sync.get(['automations'], (data) => {
      const automations = data.automations || [];
      const newAutomation = {
        id: Date.now(),
        name: automationName,
        url: currentTab.url,
        hostname: new URL(currentTab.url).hostname,
        steps: [],
        created: new Date().toISOString()
      };
      
      automations.push(newAutomation);
      chrome.storage.sync.set({ automations: automations }, () => {
        loadAutomations();
        showStatus('Automation created!', 'success');
      });
    });
  }

  // Load and display automations
  function loadAutomations() {
    chrome.storage.sync.get(['automations'], (data) => {
      const automations = data.automations || [];
      
      if (automations.length === 0) {
        automationList.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">🤖</div>
            <div class="empty-state-text">
              No automations yet.<br>
              Create one to get started!
            </div>
          </div>
        `;
        return;
      }
      
      automationList.innerHTML = '';
      automations.forEach((automation) => {
        const item = document.createElement('div');
        item.className = 'automation-item';
        
        const info = document.createElement('div');
        info.className = 'automation-info';
        
        const name = document.createElement('div');
        name.className = 'automation-name';
        name.textContent = automation.name;
        
        const url = document.createElement('div');
        url.className = 'automation-url';
        url.textContent = automation.hostname || automation.url;
        
        const actions = document.createElement('div');
        actions.className = 'automation-actions';
        
        const runBtn = document.createElement('button');
        runBtn.className = 'run-btn';
        runBtn.textContent = 'Run';
        runBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          runAutomation(automation);
        });
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.textContent = 'Delete';
        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          deleteAutomation(automation.id);
        });
        
        info.appendChild(name);
        info.appendChild(url);
        actions.appendChild(runBtn);
        actions.appendChild(deleteBtn);
        item.appendChild(info);
        item.appendChild(actions);
        automationList.appendChild(item);
      });
    });
  }

  // Run automation
  function runAutomation(automation) {
    chrome.tabs.sendMessage(currentTab.id, { 
      action: 'runAutomation', 
      automation: automation 
    }, (response) => {
      if (chrome.runtime.lastError) {
        showStatus('Error: ' + chrome.runtime.lastError.message, 'error');
      } else {
        showStatus('Running automation...', 'success');
      }
    });
  }

  // Delete automation
  function deleteAutomation(id) {
    if (!confirm('Are you sure you want to delete this automation?')) return;
    
    chrome.storage.sync.get(['automations'], (data) => {
      const automations = data.automations || [];
      const filtered = automations.filter(a => a.id !== id);
      chrome.storage.sync.set({ automations: filtered }, () => {
        loadAutomations();
        showStatus('Automation deleted', 'success');
      });
    });
  }

  // Show status message
  function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = 'status show ' + type;
    setTimeout(() => {
      statusDiv.classList.remove('show');
    }, 3000);
  }
});
