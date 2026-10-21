# Privacy policy

Updated: October 21, 2026.

3fingers has no account system, analytics or developer-operated server. It processes data on your device to display social websites and coordinate scrolling.

- **Saved layout:** panel URLs, order, pins, widths, saved overflow panels, theme and language stay in Chrome's local extension storage until changed or removed. URLs may include query strings. This data does not use Chrome Sync.
- **Back history:** up to 50 same-origin URLs per panel, including query strings, stay in Chrome session storage. Closing the workspace or removing/replacing a panel clears the corresponding history. Restarting Chrome or reloading, updating or disabling the extension also clears it; a background service-worker restart does not.
- **Scrolling and appearance:** the extension reads scroll positions, gestures, page structure and theme state to operate its controls. It does not collect post or message text for a database, analytics or developer review.
- **Reddit and X cookies:** with permission, it reads only Reddit's `csrf_token` and X's `ct0` to help embedded pages make their own requests. HttpOnly values are discarded. A missing token is supplied only to that site's registered panel. Tokens stay in memory, follow cookie changes, and are never logged or saved in extension storage. This feature does not read login or session cookies.

Native theme changes may reload a panel and affect the site's other tabs or account settings.

## Connections and access

Social websites connect directly to their services and third parties, using their own cookies and privacy policies. 3fingers does not send your feeds or tokens to the developer, sell them, use them for advertising or use them for unrelated purposes. Links to GitHub open GitHub under its own policy. Fonts are bundled locally; the tool does not contact Google Fonts.

Chrome asks for site access when you open a social. Reddit and X also request optional cookie access. Chrome grants broader cookie access than the two names this code reads; those reads are restricted to fixed sites. Declining keeps your saved layout; revoking required access disables the affected panels.

To embed websites, 3fingers removes `X-Frame-Options` and the **entire `Content-Security-Policy` header** from matching network iframe documents in its workspace, including matching nested frames. This reduces those pages' security protections. Normal tabs are unaffected. See [technical details](README.md#privacy).

## Website preferences

The website separately saves your language and theme in this browser's local storage. These preferences are not sent to a product API. Clear the website's site data to reset them.

## Your controls

Manage permissions or remove 3fingers at `chrome://extensions`. Closing the workspace clears its active session, but keeps the saved layout and overflow panels. Removing the extension clears its extension storage, not your social accounts, site cookies or native theme settings. Manage those through the sites or Chrome settings.

3fingers uses data only for the features described here and follows the Limited Use requirements of the Chrome Web Store User Data Policy. The developer cannot view your feeds through the extension.

For questions, use [GitHub issues](https://github.com/tqdat410/3fingers/issues). Reports are public: remove private content, cookies and tokens before posting. Changes to data handling will be reflected in this policy.
