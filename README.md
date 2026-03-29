# Bearer Token Extractor

A Chrome extension primarily designed for **UiPath token extraction** - captures bearer tokens (UserAccessToken, PortalPkceToken, IdToken) from API calls and displays them in an easy-to-use popup interface. Perfect for UiPath developers and testers working with UiPath Cloud Platform authentication.

⚠️ **SECURITY WARNING**: This extension captures authentication credentials. Only use for authorized testing, development, and debugging. See [SECURITY.md](SECURITY.md) for detailed security analysis.

## Features

### Core Features
- 🔍 **Automatically captures unique bearer tokens** from all HTTP requests
- 🏷️ **Detects and labels token types** (IdToken, PortalPkceToken, UserAccessToken)
- 🚀 **Quick-nav buttons** for UiPath environments (Alpha, Staging, Prod)
- 🌐 **Navigate to any URL** directly from the extension
- 📋 **One-click copy to clipboard**
- 🕒 **Timestamp tracking** for each captured token
- 🗑️ **Clear all tokens** with a single click
- 🔄 **Auto-refreshes token list** every 2 seconds
- 🔐 **Memory-only storage** (no persistence to disk)

### Security Features
- ⏰ **Token expiration warnings** - Visual indicators for expired and expiring tokens
- 🎭 **Token masking** - Option to hide middle portion of tokens (show first/last 8 chars)
- ⏱️ **Auto-cleanup timer** - Automatically clear tokens after configurable time (default: 15 minutes)
- 🔒 **URL validation** - Prevents navigation to dangerous protocols (javascript:, data:, etc.)
- 🛡️ **Sender validation** - Only accepts messages from extension pages
- 🚫 **Minimal permissions** - Removed unused `scripting` permission (v1.1.0)

## Installation

### Prerequisites
- Google Chrome browser (version 88 or higher)
- Understanding of the security implications (see [Permissions](#permissions) section)
- Authorization to test/debug on target websites

### Steps
1. Clone this repository or download the files:
   ```bash
   git clone https://github.com/nikhil-maryala/bearer-token-extractor.git
   ```
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right corner
4. Click "Load unpacked"
5. Select the directory containing the extension files
6. **Review the permissions warning** Chrome displays before confirming

## Usage

### Quick Start with UiPath Environments
1. Click the extension icon in your Chrome toolbar
2. Click one of the environment buttons:
   - **Alpha**: Navigate to `https://alpha.uipath.com/portal_/home`
   - **Staging**: Navigate to `https://staging.uipath.com/portal_/home`
   - **Prod**: Navigate to `https://cloud.uipath.com/portal_/home`
3. Tokens will be automatically captured and categorized by type

### Manual Navigation
1. Enter a URL in the input field and click "Navigate" (or press Enter)
2. The extension will automatically capture any bearer tokens from API calls made on the page
3. Each token is displayed with:
   - **Token Type Badge**: IdToken, PortalPkceToken, UserAccessToken, or Unknown
   - **Capture Time**: When the token was first seen
   - **Source URL**: The API endpoint that used the token
4. Click "Copy Token" to copy a specific token to your clipboard
5. Click "Clear All" to remove all captured tokens

### Token Types
The extension automatically detects and categorizes tokens:
- **IdToken** (Blue): Tokens from UiPath identity services (`id-*.uipath.com`, `account.uipath.com`)
- **PortalPkceToken** (Purple): Tokens with `client_id: 73ba6224-d591-4a4f-b3ab-508e646f2932`
- **UserAccessToken** (Orange): Tokens with `client_id: 1119a927-10ab-4543-bd1a-ad6bfbbc27f4`
- **Unknown** (Gray): Other bearer tokens that don't match known patterns

### Settings (⚙️)
Click the settings button to configure:

1. **Auto-cleanup tokens**
   - Enable automatic clearing of tokens after a specified time
   - Configurable duration (1-120 minutes, default: 15 minutes)
   - Helps prevent accidental token exposure from forgotten sessions

2. **Token masking**
   - Show only first and last 8 characters of tokens
   - Example: `eyJhbGci...3NzYifQ`
   - Useful when sharing screenshots or during screen recordings

### Token Expiration Indicators
- **Red "EXPIRED"** - Token has already expired
- **Orange "Expires in Xm"** - Token expires in less than 1 hour
- **Gray time display** - Token expiration time (days, hours, minutes)

## How It Works

1. **Request Interception**: The extension uses Chrome's `webRequest.onBeforeSendHeaders` API to monitor all HTTP/HTTPS requests
2. **Token Extraction**: When a request contains an `Authorization` header starting with `Bearer`, the token is extracted
3. **JWT Decoding**: Bearer tokens are decoded as JWTs to extract payload information (client_id, etc.)
4. **Type Detection**: Tokens are categorized based on the request URL and JWT payload contents
5. **Memory Storage**: Tokens are stored in a Map data structure in memory, isolated per browser tab
6. **Automatic Cleanup**: When a tab is closed, all associated tokens are immediately deleted from memory

**Important**: Tokens are stored ONLY in memory and are NEVER written to disk, localStorage, or transmitted to external servers.

## Permissions

When you install this extension, Chrome will request the following permissions. **You must accept these permissions for the extension to function.**

### Required Permissions Explained

#### 1. `webRequest` - **REQUIRED**
- **What it does**: Allows the extension to intercept and read HTTP request headers
- **Why it's needed**: This is the core functionality - the extension must read the `Authorization` header to extract bearer tokens
- **What you're granting**: The extension can see the headers (but not the body) of all HTTP requests your browser makes
- **Security impact**: HIGH - The extension can see authentication tokens, cookies in headers, and URLs you visit
- **Data collected**: Authorization headers containing bearer tokens
- **Mitigation**: Tokens are only stored in memory and never transmitted externally

#### 2. `activeTab` - **REQUIRED**
- **What it does**: Provides access to the currently active browser tab
- **Why it's needed**: To identify which tab tokens belong to and to enable navigation features
- **What you're granting**: The extension can read the URL and basic metadata of your current tab
- **Security impact**: LOW - Limited to the tab you're actively viewing
- **Data collected**: Current tab ID and URL
- **Mitigation**: Only accesses tab information, does not inject scripts or modify page content

#### 3. `storage` - **REQUIRED**
- **What it does**: Allows the extension to save user preferences
- **Why it's needed**: To persist settings (auto-cleanup, token masking preferences)
- **What you're granting**: The extension can store configuration data locally
- **Security impact**: LOW - Only stores user preferences, not sensitive data
- **Data collected**: Settings (auto-cleanup enabled/time, token masking preference)
- **Mitigation**: No sensitive data stored; settings are local-only

#### 4. `host_permissions: <all_urls>` - **REQUIRED** ⚠️
- **What it does**: Grants access to all websites (HTTP and HTTPS)
- **Why it's needed**: To capture tokens from any website during development/testing
- **What you're granting**: The extension can monitor network traffic on ALL websites you visit
- **Security impact**: **VERY HIGH** - Broadest possible permission scope
- **Data collected**: Authorization headers from all websites
- **Mitigation**: Only headers are read; consider restricting to specific domains in production
- **Alternative**: Can be manually restricted to `https://*.uipath.com/*` for production use

### Permission Warnings During Installation

When installing, Chrome will display warnings such as:
- ✅ **"Read and change all your data on all websites"** - Due to `<all_urls>` and `webRequest`
- ✅ **"Read your browsing history"** - Due to `webRequest` seeing URLs

**These warnings are accurate.** This extension has broad access because it's designed as a development/testing tool.

### How to Limit Permissions (Advanced)

If you want to restrict the extension to only UiPath domains:

1. Modify `manifest.json` and change:
```json
"host_permissions": [
  "<all_urls>"
]
```

To:
```json
"host_permissions": [
  "https://*.uipath.com/*"
]
```

2. Reload the extension in `chrome://extensions/`

This will limit token capture to only UiPath domains.

## Security & Privacy

### What Data is Collected?
- ✅ **Bearer tokens** from Authorization headers
- ✅ **Request URLs** where tokens are used
- ✅ **JWT payload data** (client_id, expiration, etc.)
- ✅ **Timestamps** when tokens are captured
- ❌ **NOT collected**: Request/response bodies, cookies, form data, passwords, personal information

### Where is Data Stored?
- ✅ **In memory only** (JavaScript Map object in service worker)
- ✅ **Isolated per tab** (tokens from different tabs are kept separate)
- ❌ **NOT stored**: On disk, in localStorage, in databases, in cloud services

### Where is Data Sent?
- ❌ **NOWHERE** - No external servers, no analytics, no telemetry
- ✅ **100% local processing** - All data stays on your computer
- ✅ **No network requests** made by the extension (except user-initiated navigation)

### Data Retention
- ✅ **Cleared on tab close** - Tokens automatically deleted when tab is closed
- ✅ **Cleared on browser close** - All tokens deleted when browser is closed
- ✅ **Manual clear** - User can clear tokens anytime with "Clear All" button

### Security Best Practices

#### ✅ DO:
- Only install from trusted sources (official repository)
- Use in development/testing environments only
- Clear tokens after each testing session
- Disable/remove extension when not actively using it
- Only grant access to websites you're authorized to test
- Review captured tokens before copying/sharing
- Keep the extension updated

#### ❌ DON'T:
- Use on production systems or live user accounts
- Share captured tokens with unauthorized parties
- Leave extension enabled on shared/public computers
- Install modified versions from unknown sources
- Use for unauthorized access or malicious purposes
- Ignore Chrome's permission warnings
- Use on websites you don't own or have permission to test

### Compliance

- ✅ **GDPR**: No personal data transmitted or stored persistently
- ✅ **Privacy**: No tracking, analytics, or external communication
- ⚠️ **Use Case**: Intended for authorized testing and development only
- ⚠️ **Risk Level**: HIGH - Handles sensitive authentication credentials

### For Security Researchers & Auditors

A detailed security analysis is available in [SECURITY.md](SECURITY.md), including:
- Complete threat model and risk assessment
- Identified vulnerabilities and mitigations
- Code security review
- Recommendations for hardening
- Incident response procedures

## Dev Server

Iterate on the extension UI without loading it into Chrome. Serves the popup as a regular web page with Chrome APIs shimmed and live-reloads on file changes.

### One-time setup
1. Set `BEARER_TOKEN_EXTRACTOR_REPO_USERNAME` and `BEARER_TOKEN_EXTRACTOR_REPO_PASSWORD` environment variables. The credentails are in 1Password (Vault=`PO`, secret name=`uipath - bearer-token-extractor`).
2. Install dependencies:
```bash
cd dev && npm install
npx playwright install chromium
```

### Dev loop
```bash
cd dev && npm start
# opens at http://localhost:3000
```

1. Edit any extension file (`popup.js`, `popup.css`, `background.js`, etc.) — the page auto-reloads
2. To inject a real token: go to a UiPath portal page, open DevTools Network tab, right-click any request with an `Authorization` header → **Copy as fetch()**, paste into the dev toolbar at the bottom of the page
3. Click **Fetch Tenants** to call the real UiPath tenant API using the injected token
4. Use the sample token buttons for quick UI testing without a real token

### Tests
```bash
cd dev && npx playwright test
```

Most tests run with sample tokens (no real credentials needed). To also run integration tests that hit the real UiPath API, save a "Copy as fetch()" string to `dev/.dev-token` — this file is gitignored.

## Files

- `manifest.json`: Extension configuration and permissions
- `background.js`: Service worker that intercepts requests and captures tokens
- `popup.html`: User interface layout
- `popup.css`: Styling and visual design
- `popup.js`: UI logic and user interaction handling
- `SECURITY.md`: Comprehensive security analysis and review
- `README.md`: This file

## Known Limitations

1. **Broad Scope**: `<all_urls>` permission is very permissive (can be manually restricted to specific domains)
2. **No Encryption**: Tokens stored in plain text in memory (acceptable for dev tool, not transmitted)
3. **Chrome Only**: Not compatible with Firefox or other browsers
4. **JWT-only Expiration**: Expiration detection only works for JWT tokens with `exp` claim

## Changelog

### v1.1.0 (2025-12-26)
**Security Improvements:**
- ✅ Removed unused `scripting` permission
- ✅ Added URL validation to prevent dangerous protocols (javascript:, data:, file:, etc.)
- ✅ Added sender validation in message handlers
- ✅ Implemented token expiration checking with visual warnings
- ✅ Added auto-cleanup timer (configurable 1-120 minutes)
- ✅ Added token masking option
- ✅ Added `storage` permission for settings persistence

**New Features:**
- ⚙️ Settings modal for configuration
- ⏰ Token expiration indicators (EXPIRED, expiring soon warnings)
- 🎭 Token masking (show first/last 8 characters)
- ⏱️ Auto-cleanup timer with configurable duration

**Documentation:**
- 📄 Comprehensive SECURITY.md with threat analysis
- 📝 Detailed permissions disclosure in README
- 🔍 Security best practices and compliance information

### v1.0.0 (2025-12-26)
- Initial release with core token capture functionality

## Recommendations

### For Individual Developers:
- Use a separate Chrome profile for development/testing
- Restrict `host_permissions` to only required domains
- Uninstall when not actively developing
- Never use with personal accounts on production services

### For Organizations:
- Deploy only to authorized developer machines
- Use Chrome Enterprise policies to control extension installation
- Audit extension usage through Chrome device management
- Provide security training on proper usage
- Consider building a signed/packaged version for internal use

## Troubleshooting

### Extension not capturing tokens?
1. Check that the website is making requests with `Authorization: Bearer` headers
2. Verify the extension is enabled in `chrome://extensions/`
3. Reload the extension after making code changes
4. Check browser console for errors (F12 → Console)

### Permission denied errors?
1. Ensure you accepted all permissions during installation
2. Try removing and reinstalling the extension
3. Check if Chrome Enterprise policies are blocking the extension

### Tokens not showing up?
1. Make sure you're on the correct tab
2. Click "Clear All" and navigate to the page again
3. Refresh the popup by closing and reopening it
4. Check if tokens are actually being sent (open Network tab in DevTools)

## Contributing

Contributions are welcome! Please:
1. Review [SECURITY.md](SECURITY.md) before submitting security-related changes
2. Test thoroughly on multiple websites
3. Update documentation for any permission or functionality changes
4. Follow Chrome extension best practices

## License

MIT License - See LICENSE file for details

## Disclaimer

This tool is provided as-is for **authorized testing and development purposes only**. Users are responsible for:
- Ensuring they have permission to test target websites
- Protecting captured tokens from unauthorized access
- Compliance with applicable laws and regulations
- Proper handling of authentication credentials

The authors are not responsible for misuse, unauthorized access, or security incidents resulting from use of this extension.

### Trademark and Affiliation Notice

This extension is **not affiliated with, endorsed by, or associated with**:
- JWT.io
- Auth0, Inc.
- The JSON Web Token (JWT) specification or working groups
- Any other authentication service or identity provider

The JWT icon is used solely to represent the token extraction functionality of this development tool. JWT® is a registered trademark. All trademarks, logos, and brand names are the property of their respective owners.
