# Cross-Origin Iframe Support - AutoBrowse Extension

## Overview

The AutoBrowse extension now supports automating interactions with cross-origin iframes. This feature allows you to create automations that work across different domains within the same page.

## How It Works

### 1. **Automatic Detection**
When a page loads, the extension automatically detects all iframes, including those from different origins (cross-origin iframes).

### 2. **Permission Request**
When you try to interact with an element inside a cross-origin iframe, the extension will:
- Detect that the element is in a cross-origin iframe
- Show a permission dialog asking if you want to allow access to that domain
- Example: "AutoBrowse would like to access content from: https://example.com"

### 3. **Authorized Access**
Once you grant permission:
- The extension can inject its automation scripts into that iframe's origin
- Future automations on that origin won't require permission again (until you revoke it)
- The extension can execute automation steps within the iframe

### 4. **Communication Bridge**
The extension uses a message-passing system to communicate with cross-origin iframes:
- Commands are sent from the main page to the iframe
- The iframe executes the command and sends back results
- All communication is secure and respects browser security policies

## Supported Actions in Cross-Origin Iframes

All standard automation actions work in cross-origin iframes:
- ✅ **Click** - Click elements inside iframes
- ✅ **Input** - Type text into input fields
- ✅ **Hover** - Hover over elements
- ✅ **Scroll** - Scroll to elements
- ✅ **Find Element** - Locate elements using selectors

## Usage Example

### Creating an Automation with Iframe Elements

1. **Navigate to a page with iframes**
   - Open the page you want to automate
   - The extension will detect any cross-origin iframes automatically

2. **Record or create steps**
   - Click the AutoBrowse bubble
   - Create a new automation
   - Add steps that target elements in iframes

3. **Grant permissions when prompted**
   - When you run the automation, if it encounters a cross-origin iframe element
   - A permission dialog will appear
   - Click "OK" to grant access to that domain

4. **Run your automation**
   - The automation will work seamlessly across main page and iframes
   - Cross-origin interactions will work just like same-origin ones

## Technical Details

### Architecture

```
Main Page (content.js)
    ↓
Iframe Manager (iframe-manager.js)
    ↓ Detects cross-origin iframes
    ↓
Background Script (background.js)
    ↓ Requests permissions
    ↓ Injects bridge script
    ↓
Iframe Bridge (iframe-bridge.js)
    ↓ Executes commands in iframe context
    ↓
Results sent back to main page
```

### Files Added/Modified

1. **manifest.json**
   - Added `scripting` permission
   - Added `host_permissions` for all URLs
   - Added `optional_host_permissions` for dynamic origins
   - Set `all_frames: true` for content scripts
   - Added `iframe-bridge.js` as web accessible resource

2. **iframe-manager.js** (NEW)
   - Detects cross-origin iframes
   - Manages permissions for different origins
   - Handles communication with iframes
   - Provides API for finding elements across iframes

3. **iframe-bridge.js** (NEW)
   - Injected into iframe contexts
   - Receives and executes automation commands
   - Sends results back to parent frame

4. **background.js**
   - Handles permission requests
   - Manages iframe origin tracking
   - Injects scripts into authorized origins
   - Facilitates cross-frame communication

5. **executor.js**
   - Updated to detect cross-origin elements
   - Sends commands to iframes when needed
   - Handles responses from iframes
   - Maintains backward compatibility with same-origin iframes

6. **content.js**
   - Initializes iframe manager
   - Coordinates iframe detection

## Security Considerations

### Permission Model
- **User Consent Required**: Users must explicitly grant permission for each origin
- **Persistent Permissions**: Once granted, permissions are remembered
- **Revocable**: Users can revoke permissions through Chrome's extension settings

### Browser Security
- Respects Same-Origin Policy
- Uses Chrome's official Permissions API
- All communication is controlled and monitored
- Cannot bypass browser security restrictions

### Best Practices
1. Only request permissions when actually needed
2. Clear messaging about why permission is needed
3. Store minimal data about authorized origins
4. Respect user's privacy and security

## Troubleshooting

### "Element not found" in iframe
- **Issue**: Element exists but can't be found
- **Solution**: Ensure permission was granted for that iframe's origin

### Permission dialog doesn't appear
- **Issue**: Extension can't request permissions
- **Solution**: Check that the manifest has proper permissions configured

### Iframe script not executing
- **Issue**: Bridge script not injected
- **Solution**: Reload the page after granting permission

### Cross-origin errors in console
- **Issue**: Trying to access iframe without permission
- **Expected**: The extension should catch this and request permission

## Limitations

1. **Initial Permission Required**: First interaction with each origin requires user permission
2. **Sandboxed Iframes**: Some iframes with restrictive sandbox attributes may not be accessible
3. **Dynamic Iframes**: Iframes loaded after page load are detected but may require retry
4. **Nested Iframes**: Deep nesting of cross-origin iframes may have limitations

## Future Enhancements

- [ ] Visual indicator showing which iframes have granted permissions
- [ ] Bulk permission granting for multiple origins
- [ ] Permission management UI in options page
- [ ] Better error messages for permission issues
- [ ] Support for complex iframe hierarchies
- [ ] Iframe-specific automation templates

## FAQ

**Q: Do I need to grant permission every time?**
A: No, permission is stored and only needs to be granted once per origin.

**Q: Can the extension access any website?**
A: No, the extension can only access sites you explicitly grant permission to.

**Q: What happens if I deny permission?**
A: That automation step will fail, but you'll be able to retry and grant permission later.

**Q: How do I revoke permissions?**
A: Go to Chrome Settings → Extensions → AutoBrowse → Permissions, and remove host permissions.

**Q: Does this work with same-origin iframes?**
A: Yes, same-origin iframes work automatically without any permission prompts.

## Support

For issues, questions, or feature requests related to cross-origin iframe support, please:
1. Check the browser console for detailed error messages
2. Verify permissions are granted in Chrome's extension settings
3. Try reloading the page after granting permissions
4. Create an issue with reproduction steps if problems persist
