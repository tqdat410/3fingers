# 3fingers Docs

Read social feeds side by side in one desktop Chrome tab. You can use one, two or three panels.

## Supported socials

| Social | Scrolling | Notes |
| --- | --- | --- |
| Facebook | Synced feed | Reels scroll independently while open. |
| Instagram | Synced feed | Reels scroll independently while open. |
| Threads | Synced feed | Feed loading can vary. |
| TikTok | Independent | Keeps native short-video navigation. |
| X | Synced feed | Home and replies; secondary services may fail. |
| Reddit | Synced feed | Requests optional cookies access. |
| YouTube Shorts | Independent | Regular YouTube videos are outside the supported scope. |

## Install

Download the app ZIP attached to the [latest GitHub release](https://github.com/tqdat410/3fingers/releases/latest). GitHub's automatically generated source-code ZIP is for development.

Extract the app into a folder you will keep. Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select that folder. No build or server is needed.

Click the extension icon to open 3fingers. If a social needs a login, sign in on its normal website tab first, then return to 3fingers.

## Connect a social

Open a panel or select a social with the change-site button. Chrome may ask for site access. The extension uses that access to display the page and run its scrolling and appearance controls. The wording “Read and change your data” describes Chrome's permission capability, not a separate posting feature.

Reddit and X additionally request optional cookies access to retrieve only their named CSRF cookies for native requests in embedded pages. HttpOnly values are discarded. The Chrome permission is broader than the two names read by the implementation. Other socials do not request cookie API access.

TikTok needs access to its subdomains for video playback. Access is requested for the site you choose. You can deny the request and keep your layout; use Open to try again later. Chrome normally remembers granted access. It should not ask again for the same already-granted permissions on every reload.

## Read together or independently

The mouse wheel synchronizes panels with outline pins. Each feed keeps its own reading position.

Click a pin to exclude that panel from synchronized scrolling. A solid pin means independent; an outline pin means synced. Pinning one panel does not stop the remaining pair from syncing. Drag a feed's content up or down to scroll only that feed, even when its pin is an outline.

Comments, chats and dialogs keep their own scrolling. Close them to return to the feed. TikTok and YouTube Shorts always keep independent video navigation. Facebook and Instagram Reels become independent while open; leaving the viewer restores your pin choice. Inline videos do not change the feed policy.

## Arrange panels

Drag an empty area of a panel's small topbar to move it. Release to save its position or press Escape to cancel. The pin's arrow keys also reorder panels. Icon buttons keep their normal click actions.

Use **+** in the extension menu to add a social. Three panels is the limit; duplicate socials are allowed. Use the panel's change-site button to replace it, or close to remove it.

One panel fills the page. Three have equal widths. With two, the width button offers 33%, 50% and 66%, and the other panel fills the remaining space.

## Navigation and appearance

Back affects only its panel and follows its recorded same-origin URL history. It may reload the page; it does not restore unsent drafts or every temporary app state. Reload refreshes one panel; **Reload all** in the extension menu starts all permitted panels together.

The panel sun/moon triggers the social's native theme. Some sites reload that panel to apply it. The preference may also affect other tabs or the site's account settings. An unavailable native control stays disabled instead of forcing a custom palette. The sun/moon in the extension menu changes only 3fingers' interface.

## Language

The next source build after v1.0.0 adds an **EN / VI** button beside the tool theme button. It shows the current language; click it to switch to the other language. On first use, Chrome's interface language selects VI for Vietnamese and EN otherwise. A manual choice is saved locally. Switching updates the extension's text and tooltips without reloading feeds.

The **?** button to the right of GitHub opens the website guide in the current tool language.

This does not change a social site's language. Chrome's own permission dialog and extension metadata follow Chrome's locale separately.

## Update

Download the next app ZIP and replace the files **inside the same installation folder**. Keep your Chrome profile and click **Reload** on the extension card. Do not remove the extension or load a new folder if you want to retain its layout. This works when moving from Beta to Stable too. GitHub installations update manually.

## Compatibility and help

YouTube support is Shorts only. X supports reading Home and replies; secondary services or settings can fail. Websites can change their embedding behavior, native themes or feed structure. A Connected status confirms communication with the extension, not successful loading of every post or video.

Try the site's normal tab to distinguish site/network problems from panel problems. Use the same Chrome profile. If access was revoked, reopen the panel and grant access again if you choose.

3fingers relaxes embedding protections inside its workspace, including the entire CSP header on matching network iframe documents. This reduces protection inside those documents. See the [privacy policy](privacy-policy.md) and [technical notes](README.md#privacy).

[Report a problem](https://github.com/tqdat410/3fingers/issues/new/choose) with your Chrome version and steps to reproduce it. Remove private feed content, cookies and tokens from screenshots or logs.

## Source and license

3fingers is an independent project, licensed under [GPL-3.0-only](https://github.com/tqdat410/3fingers/blob/main/LICENSE). GPLv3 allows commercial use under its terms. Source code, releases and issue reports are on [GitHub](https://github.com/tqdat410/3fingers). The project is not affiliated with the supported social platforms.
