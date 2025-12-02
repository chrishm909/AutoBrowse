// Options page script

document.addEventListener('DOMContentLoaded', () => {
  const urlPattern = document.getElementById('urlPattern');
  const addUrlBtn = document.getElementById('addUrlBtn');
  const urlList = document.getElementById('urlList');
  const statusDiv = document.getElementById('status');

  // Load saved URLs
  loadUrls();

  // Add URL button
  addUrlBtn.addEventListener('click', addUrl);

  // Enter key to add URL
  urlPattern.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      addUrl();
    }
  });

  function addUrl() {
    const pattern = urlPattern.value.trim();
    if (pattern) {
      chrome.storage.sync.get(['enabledUrls'], (data) => {
        const urls = data.enabledUrls || [];
        if (!urls.includes(pattern)) {
          urls.push(pattern);
          chrome.storage.sync.set({ enabledUrls: urls }, () => {
            urlPattern.value = '';
            loadUrls();
            showStatus('URL added successfully! Reload pages to see the bubble.', 'success');
          });
        } else {
          showStatus('This URL is already in the list.', 'success');
        }
      });
    }
  }

  function loadUrls() {
    chrome.storage.sync.get(['enabledUrls'], (data) => {
      const urls = data.enabledUrls || [];
      
      if (urls.length === 0) {
        urlList.innerHTML = '<div class="empty-state">No URLs added yet. Add a URL to get started.</div>';
        return;
      }
      
      urlList.innerHTML = '';
      urls.forEach((url, index) => {
        const item = document.createElement('div');
        item.className = 'url-item';
        
        const urlText = document.createElement('span');
        urlText.className = 'url-text';
        urlText.textContent = url;
        
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-btn';
        removeBtn.textContent = 'Remove';
        removeBtn.addEventListener('click', () => removeUrl(index));
        
        item.appendChild(urlText);
        item.appendChild(removeBtn);
        urlList.appendChild(item);
      });
    });
  }

  function removeUrl(index) {
    chrome.storage.sync.get(['enabledUrls'], (data) => {
      const urls = data.enabledUrls || [];
      const removed = urls.splice(index, 1);
      chrome.storage.sync.set({ enabledUrls: urls }, () => {
        loadUrls();
        showStatus(`Removed ${removed[0]}. Reload pages to update.`, 'success');
      });
    });
  }

  function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = 'status show ' + type;
    setTimeout(() => {
      statusDiv.classList.remove('show');
    }, 4000);
  }
});
