# AutoBrowse Chrome Extension

Plugin to build browser automations.

## Features

- Quick print button in browser toolbar
- Automated print dialog trigger
- Customizable print settings
- Keyboard shortcuts support

## Installation

### Development Mode

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `AutoBrowse` directory

## File Structure

- `manifest.json` - Extension configuration and permissions
- `popup.html` - Extension popup UI
- `popup.css` - Popup styling
- `popup.js` - Popup functionality
- `background.js` - Background service worker
- `content.js` - Content script injected into web pages
- `icons/` - Extension icons (16x16, 48x48, 128x128)

## Usage

1. Click the extension icon in the Chrome toolbar
2. Click "Print Current Page" to trigger the print dialog
3. Customize settings as needed

## Development

The extension uses Manifest V3, the latest Chrome extension standard.

### Key Components

- **Popup**: User interface when clicking the extension icon
- **Background Script**: Service worker for background tasks
- **Content Script**: Runs on web pages to interact with page content

## Permissions

- `activeTab` - Access to the current tab
- `tabs` - Tab management
- `storage` - Store extension settings

## Next Steps

- Add icon files in `icons/` directory (16x16, 48x48, 128x128 PNG files)
- Implement custom print settings
- Add print templates
- Create options page for advanced settings
