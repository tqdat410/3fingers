# Store preparation

This is a maintainer checklist and draft submission text. GitHub Stable is released first, with manual unpacked installation. No Store submission or approval is recorded here. Keep the GitHub installation instructions until the Store item is live.

## Listing draft

- Name: **3fingers**
- Summary: **Read social feeds side by side in one Chrome tab.**
- Single purpose: **Read and navigate social feeds together in one workspace, with optional synchronized scrolling.**
- Suggested GitHub About: **Read social feeds side by side in one Chrome tab.**

Description:

> Open up to three social feeds in one Chrome tab. Sync eligible feeds with the mouse wheel, pin a feed to read independently, or drag its content to scroll it on its own. Rearrange panels, change sites and use their native light/dark themes.
>
> Supports Facebook, Instagram, Threads, TikTok, X, Reddit and YouTube Shorts. TikTok and YouTube Shorts keep native independent video navigation. Facebook and Instagram Reels also become independent while open.
>
> Your layout stays on your device. There is no product account, analytics or product server. Sites keep their own accounts and connections. Some site features may not work when embedded, and website changes can affect compatibility.

The brand quote remains **Multitask is not real!**; it is separate from the product summary. Avoid claims that every site syncs, compatibility is guaranteed, or security is certified.

## Privacy and permission justification

Publish [the privacy policy](privacy-policy.md) at an accessible public URL before submitting. Once committed and pushed, the intended URL is `https://github.com/tqdat410/3fingers/blob/main/docs/privacy-policy.md`; verify it from a signed-out browser rather than assuming it is live. Reconcile the actual candidate, policy and live Dashboard fields. Local-only processing still requires disclosure. [Chrome user-data guidance](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)

| Permission | Current use |
| --- | --- |
| `storage` | Local layout/archive/tool theme and session-only panel navigation/runtime state. |
| `scripting` | Inject bundled scroll/gesture helpers and native appearance adapters into registered permitted documents. |
| `webNavigation` | Track panel documents, same-origin navigation and reconnects; validate exact frame/document before injection. |
| `declarativeNetRequestWithHostAccess` | Session rules remove embedding headers only for matching origins' subframe documents in registered workspace tabs. Meta compatibility also adjusts Sec-Fetch-Dest. This includes matching nested frames; the entire CSP header is removed. |
| Optional `cookies` | Retrieve only named Reddit `csrf_token` and X `ct0` for their native embedded requests; discard HttpOnly values without supplying them. No enumeration, login-cookie reads or cookie API writes. Name restrictions are implementation controls. |
| Optional HTTPS hosts | The chooser requests each site's needed hosts at selection/Open. TikTok needs its subdomains for video; Reddit also needs its parent host for cookie-change events. X does not request api.x.com. The broad declaration preserves existing saved custom HTTPS panels; it does not grant all sites on installation. |
| Optional localhost/127.0.0.1 HTTP hosts | Existing saved local custom panels and local development fixtures. These remain declared; testing alone is not a sufficient production justification. |

The broad HTTPS and local optional declarations need an explicit release decision. Keep and substantiate the existing legacy custom-panel contract, or propose a narrower Store build with a visible migration path before changing it. Optional permissions are also subject to least-privilege policy. Do not describe these declarations as being reserved for future sites. [Use of Permissions](https://developer.chrome.com/docs/webstore/program-policies/permissions)

Review the live Dashboard categories for browsing activity (URLs), authentication-related information (transient CSRF values) and website content/interaction (DOM structure, scrolling, appearance). Explain that there is no developer collection service or onward sale. Do not tick “no user data” simply because there is no backend. Resolve exact category definitions against the current form; do not invent data collection from permission capability alone.

Before submission, verify that the in-product permission flow explains any sensitive handling a user would not reasonably expect, especially the CSRF fallback and embedding-protection change. If current consent is insufficient, make that focused disclosure change and retest; the privacy document alone is not a substitute for required prominent consent.

## Reviewer notes

All extension logic is bundled. Web apps run their own scripts in cross-origin iframes. Bundled MAIN-world adapters inspect loaded site modules or mounted components and call native theme controls; TikTok may initialize its matching site module, and Reddit may use its native feature loader. There is no extension-page remote script or fetched-string eval. Unknown native signatures fail closed. Explain this implementation rather than answering an execution-context question with an unsupported blanket claim.

The MV3 policy has an exemption for remote code in contexts isolated from extension APIs, including iframes. This supports the distinction above, but does not guarantee approval; reviewers must still understand all functionality and data handling. [MV3 requirements](https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements)

Document the full CSP removal and fixed CSRF bridge openly. Include synthetic boundary-test evidence and the tested native reading journeys. DNR changes whole header values; preserving each dynamic response's CSP while removing only frame-ancestors is not a drop-in string replacement through this API. [DNR API](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest)

Review steps: install in desktop Chrome, click the extension icon, Open a panel and allow that site's access. For signed-in feeds, sign in on the site's normal tab first; never send reviewers personal credentials. Use a separate test account only if required. Check outline/solid pins, independent video panels, reorder, reload and native themes. The Connected status only confirms extension communication.

## Candidate acceptance

1. Keep the three-panel limit and existing supported sites. Run `npm run check`, `npm test`, `npm run test:browser` and `npm run release:pack`. Verify the ZIP contains `myfeeds.html` plus the `workspace.html` redirect, no plans or private diagnostics, and the declared source commit.
2. Test the final extracted candidate in visible Chrome Stable with real signed-in sites. Record OS, Chrome version, viewport, source commit and archive hash. Check each site: load, pagination/video navigation, comments, native theme, Back, reload, reorder and replacement. Reels must restore the user's pin choice on exit; video-only sites must not join sync.
3. Run at least 60 minutes on a core three-feed layout and a shorter mixed-video layout. Compare ordinary tabs, two panels and three panels on the same device/content conditions. Record Chrome Task Manager CPU/memory at start, 15, 30 and 60 minutes; sample scroll/long-task traces. Look for crashes, growing detached frames/rules, repeated full DOM scans and worsening scroll responsiveness. High memory alone is not a leak; distinguish site rendering from extension overhead before fixing.
4. Check idle/background/foreground, sleep/resume, worker restart, network recovery and permission revocation. Require no cross-panel input routing, stale-token use or unhandled extension errors. Do not claim incognito support until cookie-store selection and storage isolation are tested.
5. Verify clean Store onboarding and the update route separately. Unpacked Beta and Store installs may have different extension IDs and storage; do not promise automatic layout migration. Keep the Beta usable until a tested transition is documented.
6. For the Store candidate, complete these gates, increase the numeric version and display name together when the package changes, commit, wait for CI on that exact commit, tag and package from the tag. GitHub Stable has its own release route and does not imply these Store gates are complete. Match the Store upload to its tested source/version, keep published assets immutable, and obtain Store publication authorization before submission.

Do not invent universal CPU/RAM thresholds from fixture tests. Record the baseline and a repeatable degradation before assigning a performance bug. A failed native theme/API probe is a compatibility failure to reproduce, not a reason to force a custom palette.

## Listing assets and release

Provide the bundled 128px PNG icon, a **440 × 280** small promotional image and at least one **1280 × 800** or **640 × 400** screenshot of the actual product. Use test accounts and remove personal content. A GIF can help GitHub users but is optional. Preserve the supplied logo and charcoal brand. [Store image requirements](https://developer.chrome.com/docs/webstore/images)

Record the Store item ID, verified policy URL, dashboard disclosures, tested onboarding/update route and reviewer outcome when they exist. GitHub Stable and Chrome Web Store approval are separate states. If review rejects a compatibility mechanism, preserve the rejection reason, reproduce it and agree a concrete change before revising product scope. If the candidate regresses, keep users on the last tested Beta; never replace an already published archive under its old version.
