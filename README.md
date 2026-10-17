<img src="extension/assets/icons/icon-128.png" alt="3fingers" width="64" height="64">

# 3fingers

Read Facebook, Instagram and Threads side by side in one Chrome tab.
Scroll them together, or drag a feed to scroll it on its own.

**Beta.** Not on the Chrome Web Store yet. Social sites can change and break compatibility.

## Install

1. Download the **3fingers ZIP** from [Releases](https://github.com/tqdat410/3fingers/releases). Choose the attached app ZIP, not GitHub's source-code ZIP.
2. Extract it into a folder you will keep, such as `3fingers-beta`.
3. Open `chrome://extensions` and turn on **Developer mode**.
4. Click **Load unpacked** and select that folder.
5. Click the 3fingers extension icon. Open a social and allow access when Chrome asks.

Use desktop Chrome. No build, server or account with 3fingers is needed.
You may need to sign in at the social site's own page first.

## Use

- The top toggle turns scroll sync on or off. The **+** adds a social, up to three.
- Drag a feed up or down to scroll only that feed. The mouse wheel follows the sync setting.
- Hold the pin-shaped handle to move a panel. Release to save its position; Escape cancels.
- Each panel has reload, change-social and close buttons.

To update, replace the files **inside the same folder**, then click **Reload** on the extension card. Keep the same Chrome profile. Do not remove the extension or load each version from a new folder if you want to keep your layout. Updates are manual during Beta.

## Privacy and feedback

3fingers has no analytics or product server. Your layout stays in Chrome's local storage.
It does not collect posts, messages, passwords or cookie values. The social sites still receive your activity.

To show sites in panels, 3fingers relaxes their embedding protections inside its workspace. Normal tabs are unaffected. Only grant access to sites you want to open. See [technical notes](docs/README.md#privacy) for the trade-off.

Found a problem? [Report a bug](https://github.com/tqdat410/3fingers/issues/new/choose) with your Chrome version and steps to reproduce it. Remove private content from screenshots.

Code is licensed under [GPL v3 only](LICENSE). Commercial use is allowed under its terms.
Ubuntu fonts keep their [own license](extension/assets/fonts/UFL.txt).

[Development and releases](docs/README.md)
