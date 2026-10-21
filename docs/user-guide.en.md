# 3fingers Docs

Browse social feeds side by side in one Chrome tab, with up to three panels.

## Supported socials

Facebook, Instagram, Threads, X and Reddit support synced scrolling. TikTok and YouTube Shorts scroll independently. Facebook and Instagram Reels also scroll independently while open; returning to the feed restores your pin choice.

YouTube support is limited to Shorts. Some X settings and secondary features may not work.

## Install

1. Download the app ZIP under **Assets** in the [latest GitHub release](https://github.com/tqdat410/3fingers/releases/latest), not the source-code ZIP.
2. Extract it into a folder you will keep.
3. Open `chrome://extensions`, turn on **Developer mode**, then click **Load unpacked** and select that folder.
4. Click the 3fingers icon in Chrome to open your feeds.

Use Chrome on a computer. No build or server is needed. If a social asks you to sign in, open it in a normal tab using the same Chrome profile, sign in, then return to 3fingers.

## Connect a social

Click **+** in the extension menu to add a social, or use a panel's change-site button to replace it. Chrome asks for access when needed and normally remembers your choice. If you decline, click **Open** on the panel to try again later.

Chrome's “Read and change your data” prompt lets 3fingers display and control that site's page. Reddit and X also need cookie access; TikTok needs access to its subdomains for video playback. See the [privacy policy](privacy-policy.md) for what is accessed and why.

## Read together or independently

- Use the mouse wheel to scroll synced feeds together.
- **Outline pin:** synced. **Solid pin:** scrolls independently. Click the pin to switch.
- Drag a feed's content up or down to scroll only that feed, even when synced.

Comments and dialogs keep their own scrolling. Close them to return to the feed. Short-video viewers use their own navigation, as noted above.

## Arrange panels

Drag an empty area of a panel's topbar to change its position. Release to save; press Escape to cancel. You can also focus its pin and use the arrow keys to reorder it.

Use **+** to add a panel, the change-site button to replace its social, or **×** to close it. You can open the same social more than once, up to three panels in total.

One panel fills the page; three share equal widths. With two panels, the width button offers **33%, 50% or 66%**. The other panel fills the remaining space.

## Navigation and appearance

**Back** and **Reload** affect only their panel. Back may reload the page and does not restore unsent drafts. **Reload all** in the extension menu refreshes all open panels together.

The panel's sun/moon button changes the social's own theme. Some sites reload to apply it, and the choice may affect other tabs or your account settings. If the site's theme control is unavailable, the button is disabled. The sun/moon in the extension menu changes only 3fingers.

## Language

From version **1.1**, **EN / VI** shows the current language; click it to switch. The first choice follows Chrome's language, and your manual choice is saved. This changes 3fingers, not the social sites. The **?** button opens this guide in the selected language.

## Update

Download the new app ZIP and replace the files **in the same installation folder**. Then click **Reload** on the 3fingers card at `chrome://extensions`.

Keep the same Chrome profile and do not remove the extension if you want to keep your layout. GitHub installations update manually.

## Compatibility and help

If a panel fails to load, try **Reload**, then check the social in a normal tab. A **Connected** status means the extension can communicate with the panel; it does not guarantee every post or video has loaded. Social websites can change and break compatibility.

Embedding these sites reduces some of their security protections inside 3fingers. Read the [privacy policy](privacy-policy.md) for details.

[Report a problem](https://github.com/tqdat410/3fingers/issues/new/choose) with your Chrome version and steps to reproduce it. Remove private content, cookies and tokens from screenshots or logs.

## Source and license

3fingers is an independent project under [GPL-3.0-only](https://github.com/tqdat410/3fingers/blob/main/LICENSE), which allows commercial use under its terms. [Source code and releases](https://github.com/tqdat410/3fingers) are on GitHub. The project is not affiliated with the social platforms.
