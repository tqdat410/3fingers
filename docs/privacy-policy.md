# Privacy policy

Updated: October 21, 2026.

3fingers opens social websites side by side in Chrome. It has no product account, analytics or developer-operated server. Its code processes the following data on your device to provide the workspace.

| Data | Purpose and retention |
| --- | --- |
| Panel URLs, order, pins, width preference, saved overflow panels, extension theme and language preference | Saved in this extension's Chrome local storage until changed or the extension's data is removed. URLs can contain query strings. This is not Chrome Sync storage. |
| Panel navigation URLs | The Back button retains up to 50 same-origin URLs per panel, including query strings, in Chrome session storage. Closing the workspace or removing/replacing the panel clears its runtime history. Session storage also clears when Chrome restarts or the extension is reloaded, updated or disabled. A service-worker restart alone does not clear it. |
| Scroll positions, input gestures, page structure and appearance state | Processed to find the scrolling area, synchronize eligible feeds, drag individual feeds and activate native themes. The extension does not extract post/message text for a database, telemetry or developer review. |
| Reddit `csrf_token` and X `ct0` | With optional cookie and site access, the extension retrieves only these named CSRF cookies to restore native requests in embedded pages. HttpOnly values are discarded and never supplied. Otherwise, a missing value is supplied to that site's own registered panel document. Values remain in memory, are refreshed or removed with cookie changes and are never logged or saved in extension storage. No login/session cookie is read by this bridge. |

Site scripts in a panel retain their own access to their website's data. The extension's native-theme helpers call the site's own controls; some theme preference writes need embedded-context compatibility and may reload the panel. Those native preferences can also affect your other tabs or the site's account settings.

## Connections and access

Social pages connect directly to their own services and third parties under their own privacy policies. They receive normal page requests, cookies, playback and interactions. 3fingers does not send your feed data or CSRF tokens to a developer service, sell it, use it for advertising, or use it for unrelated purposes. There is no developer telemetry. Clicking GitHub opens GitHub, which handles that visit under its own policy. Ubuntu fonts are bundled and do not request Google Fonts.

Site access is requested when you open a site. Reddit and X additionally request Chrome's optional cookies permission. This permission is technically broader than the two names read by this implementation; the code limits its reads to those names and fixed origins. Denying access leaves the saved layout in place. Revoking required access disables the affected panels.

To allow embedding, 3fingers removes X-Frame-Options and the entire Content-Security-Policy response header from network iframe documents matching enabled panel origins in its workspace tab. Matching nested frames are included. This reduces website protection within those documents. Normal tabs remain outside these rules. See the [technical notes](README.md#privacy).

## Website preferences

The website saves only your selected language and light/dark theme in this browser's local storage. These preferences are separate from extension storage and are not sent to a product API. Clear the website's site data in Chrome to reset them.

## Your controls

Change or close panels to update the active layout. Closing a workspace clears its runtime session, not its saved layout or overflow archive. You can revoke site/cookie access or remove the extension at `chrome://extensions`. Removing the extension removes its Chrome extension storage; this does not delete your social accounts, their cookies or their native theme preferences. Manage those separately in the sites or Chrome settings.

3fingers uses data only for its stated workspace features and follows the Limited Use requirements of the Chrome Web Store User Data Policy. The developer cannot inspect your feeds through the extension. If you choose to submit a public bug report, GitHub stores what you send; remove account content, cookies and tokens first.

Questions: [project issues](https://github.com/tqdat410/3fingers/issues). Do not post private account data there. Future changes to data handling will be reflected in this policy.
