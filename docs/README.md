# Development

3fingers is a Manifest V3 Chrome extension. The runtime is plain JavaScript/CSS with no backend or runtime package dependencies.

## Setup

Use Node.js 22+ and PowerShell 7 for packaging.

```powershell
npm ci
npx playwright install chromium
npm run check
npm test
npm run test:browser
npm run release:pack
```

Load the `extension` directory at `chrome://extensions`. No build is needed. Reload the extension and its workspace after editing it.

Click the Chrome extension icon for workspace controls. Open workspace focuses an existing workspace or creates one. The popup owns Reload all, tool theme, GitHub and adding sites; panel controls stay in the workspace. Popup commands are restricted to the extension's popup page, and the workspace rechecks permissions and the three-panel limit. No new browser permissions are required.

Each panel stores a boolean `pinned` preference, defaulting to false for existing workspaces. A solid pin excludes that panel in both directions at the scroll router without reconnecting its iframe. Global sync settings are retired and removed during normalization; unpinned panels participate unless the social requires native independent scrolling. TikTok is always excluded as both source and follower, regardless of its stored pin preference. The authenticated ready handshake tells its content script to leave native gestures untouched. The solid TikTok pin cannot enable sync, but remains focusable for arrow-key reorder. Replacing TikTok with another social resumes the stored user pin preference. Pinning affects scroll membership only, including when a panel is reloaded or switched to another site.

Panel `theme` is `site` (native until chosen), `light` or `dark`. The existing Meta adapters select the site's own light/dark root classes and color-scheme; Instagram also uses its native pair. Their choices stay in extension storage, with a small observer retaining the chosen classes. TikTok instead activates its own More menu and Device/Dark/Light segmented control. Its native handler updates both palette and React-rendered engagement colors; root attributes alone do not do this. The helper closes a native menu only if it opened it, adds no CSS/colors or fabricated preference values, and disables itself if the verified control is absent. TikTok owns any preference persistence caused by that native action; its extension theme normalizes to `site` and actual native changes update the toolbar through the authenticated content port. The independent `toolTheme` key affects extension surfaces only. Navigation reinjects against the exact document ID, and unknown structures leave the site-theme control disabled.

TikTok's native theme handler also needs its preference cookies in an embedded document. A guarded MAIN-world accessor on that document alone forwards native writes to `tiktok_webapp_theme`, `tiktok_webapp_theme_source` and `tiktok_webapp_theme_manual` with `SameSite=None; Secure` when TikTok omitted SameSite. Without it, even clicking the native control can silently return to System/light in an iframe. The accessor keeps the native getter unchanged, preserves values/domain/path/expiry and explicit SameSite policies, and forwards all other writes unchanged. It reads or logs no cookie values and adds no cookies API permission or global browser exception. Native preference sharing with other TikTok tabs follows the cookies' original domain/path. The bridge is document-local, idempotent and limited to the exact registered direct TikTok frame; it is compatibility code, not a security boundary against TikTok's own scripts.

Panel Back uses a bounded list of up to 50 visited same-origin URLs in the existing runtime session. Authenticated content ports report committed routes through Navigation API currententrychange, with full document loads reported on reconnect. A workspace-only command replaces just the selected frame's location with its previous URL. Native joint-history traversal was rejected because it can rewind sibling panels. Back can reload the previous page and does not restore unsaved input or arbitrary in-memory SPA state; it is disabled without a recorded previous route. Routes are not analytics and are removed with the runtime panel/session.

Two-panel widths use an optional workspace `split: { id, share }`, with share 1 or 2 meaning thirds for the keyed panel. No split means halves. The peer fills the complement; a one-panel or three-panel layout drops the split and fills the workspace equally. Width changes persist without reconfiguring or replacing iframes, and keyed proportions follow reorder. The existing minimum panel width still applies on narrow viewports.

Width labels display 33%, 50% and 66%; the underlying thirds remain exact. Workspace dropdowns dismiss on unrelated outside click/wheel or focus changes, including interactions inside social frames. While a menu is open, the workspace subscribes its authenticated frame ports to one-shot pointer/wheel/touch/key notifications. Closing it removes the subscription, so normal scrolling does not add an interaction message stream. Events are observed passively and keep native behavior. Interactions within a menu retain that menu; the popup's picker follows the same outside-dismissal behavior.

TikTok uses its native For You page and video navigation. Native Auto Scroll, where exposed by TikTok, stays site-owned; the extension adds no auto-next or TikTok prefetch. Anonymous native playback has been verified with the TikTok subdomain grant; existing-login reuse and long-session Auto Scroll are not guaranteed by the fixture tests.

Browser tests use temporary profiles, a local server on port 49317 and intercepted social fixtures. They do not use your account or prove that every real social route works. Generated diagnostics stay local and are ignored by Git. Test teardown closes its browser/server and deletes the temporary profile; do not start another fixture on a different port when 49317 is already in use.

## Privacy

Site access is requested when opening or selecting a social. Optional host permissions are not grants for every site. Stored legacy custom URLs remain usable, but new selections are Facebook, Instagram, Threads and TikTok.

TikTok requests `https://*.tiktok.com/*` because its player loads video from additional TikTok subdomains. Access to `www.tiktok.com` alone can load the page while video requests fail with HTTP 403 due to the embedded request's cookie context. Existing TikTok panels with that older grant keep their position and preferences but show Open until you approve the broader TikTok access. Permission denial leaves the layout intact. Other sites retain their exact host grants. This does not add cookie-reading APIs or expand frame-header rules to video servers.

The extension removes X-Frame-Options and CSP response headers only for permitted subframes in its registered workspace tab. Removing CSP reduces protection inside those embedded documents. Normal tabs are outside these rules. For Facebook, Instagram and Threads, a workspace subframe rule also sets Sec-Fetch-Dest to document for compatibility; this does not turn the iframe into a first-party tab.

Scripts control scrolling and the selected native theme only in registered frames. They do not collect posts, DMs, passwords or cookie values, or automate likes/comments/posts. Meta panel theme choices stay in extension storage; TikTok's native UI owns persistence of its own theme choice. Social sites still connect to their own services. There is no product server or analytics. The bundled Ubuntu fonts do not make requests to Google.

Threads homepage panels also load ahead through their native pagination. After site access is granted, a document-start MAIN-world helper recognizes the current 4000px viewport observer and uses the panel's own document with a 6000px forward margin. An implicit cross-origin iframe root can ignore margins; the local document makes the preload distance effective. Other observer configurations, routes, normal tabs and non-extension frames retain native behavior. Threads handles requests and its loading/end/error checks. This can load extra content before you read it and still cannot guarantee uninterrupted scrolling on a slow connection. Site changes that no longer match the known configuration fall back to native loading.

Layout and URLs use chrome.storage.local; runtime sessions use extension session storage. This is not a backup of site drafts or history. A comment/chat or modal keeps its own scrolling. The background feed resumes sync when the modal closes.

## Releases

One branch: `main`. One GitHub Actions job runs checks, tests and packaging on pushes and pull requests. GitHub Releases carry Beta prereleases and, later, Stable releases. No nightly branch, update server or Chrome Web Store publishing is configured.

The numeric version in package.json, package-lock.json and the manifest must agree. The manifest's version_name is the display/release name. First Beta: numeric `0.6.0`, display `0.6.0-beta.1`, tag `v0.6.0-beta.1`. Each published build increases the numeric version: for example Beta 2 `0.6.1-beta.2` with numeric `0.6.1`, then Stable `0.6.2`.

1. Update the versions, run the checks and commit. Wait for CI on that exact commit.
2. Create an annotated tag matching version_name, then create a clean detached worktree of that tag.
3. Run `npm ci` and `npm run release:pack` there. The ZIP has manifest.json at its root, runtime files, icons, fonts and required licenses; the source logo and development files are excluded. Its timestamps are fixed for repeatable packaging.
4. Push that tag and create a GitHub prerelease for Beta, or a normal release for Stable. Attach only the ZIP and its .sha256 from the tagged worktree. Link to the matching public source tag.
5. Download the assets again, verify SHA-256, extract to a stable directory and Load unpacked. For updates, overwrite that same directory and Reload, preserving the Chrome profile and extension ID.

Use [the Releases page](https://github.com/tqdat410/3fingers/releases) for Beta links. A prerelease is not the stable latest release. Never publish generated diagnostics, private account screenshots, secrets or local development history.

## License and brand

Code is GPL-3.0-only; commercial use is allowed subject to the GPL. Existing MIT grants on earlier copies are not revoked. Bundled Ubuntu fonts retain UFL 1.0 separately. See [notices](third-party-notices.md) and [design](design.md).
