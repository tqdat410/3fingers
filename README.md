<img src="extension/assets/icons/icon-128.png" alt="3fingers" width="64" height="64">

# 3fingers

> Multitask is not real!

Read social feeds side by side in one Chrome tab.
Supports Facebook, Instagram, Threads, TikTok, Reddit, YouTube Shorts and X.
Sync your feeds, or scroll them separately. TikTok and YouTube keep their own video navigation.

Available on GitHub. Not on the Chrome Web Store yet. Social sites can change and break compatibility.

## Install

1. Download the **3fingers ZIP** from the [latest release](https://github.com/tqdat410/3fingers/releases/latest). Choose the attached app ZIP, not GitHub's source-code ZIP.
2. Extract it into a folder you will keep, such as `3fingers`.
3. Open `chrome://extensions` and turn on **Developer mode**.
4. Click **Load unpacked** and select that folder.
5. Click the 3fingers extension icon to open the workspace. Open a social and allow access when Chrome asks.

Use desktop Chrome. No build, server or account with 3fingers is needed.
You may need to sign in at the social site's own page first. Reddit and X also ask for optional cookie access to read their CSRF tokens. After upgrading, click **Open** on an existing panel if prompted.

## Use

- Click the extension icon to open or return to your workspace. Click it while in the workspace for **Reload all**, the tool theme, GitHub and **+** to add a social, up to three.
- Drag a feed up or down to scroll only that feed. The mouse wheel syncs panels with outline pins.
- Click a panel's pin to scroll independently: solid means pinned, outline means synced. TikTok and YouTube always scroll independently. Facebook and Instagram Reels also scroll independently while open; returning to the feed restores your pin choice.
- Drag an empty area of a panel's topbar to move it. Release to save its position; Escape cancels. The icon buttons keep their own actions.
- TikTok keeps its native playback and navigation controls, including Auto Scroll when available.
- YouTube opens directly in Shorts. Regular YouTube videos and search are outside the supported scope.
- The sun/moon beside reload changes the social’s built-in theme. Reddit and YouTube may reload that panel to apply it. The setting may also affect your other tabs on that site. The popup’s sun/moon changes the extension theme separately.
- X supports reading Home and post replies. Some settings and other secondary features may fail.
- Each panel also has change-social and close buttons.

To update, replace the files **inside the same folder**, then click **Reload** on the extension card. Keep the same Chrome profile. Do not remove the extension or load each version from a new folder if you want to keep your layout. This also applies when updating from Beta. GitHub installs update manually.

## Privacy and feedback

3fingers has no analytics or product server. Your layout stays in Chrome's local storage.
It does not collect posts, messages or passwords. Reddit and X CSRF tokens are used only inside their own panels and are never saved or logged. Panel Back keeps a short URL history for the current runtime session. The social sites still receive your activity. See the [privacy policy](docs/privacy-policy.md) for data use and deletion.

To show sites in panels, 3fingers relaxes their embedding protections inside its workspace. Normal tabs retain their embedding protections. Only grant access to sites you want to open. See [technical notes](docs/README.md#privacy) for the trade-off.

Found a problem? [Report a bug](https://github.com/tqdat410/3fingers/issues/new/choose) with your Chrome version and steps to reproduce it. Remove private content from screenshots.

Code is licensed under [GPL v3 only](LICENSE). Commercial use is allowed under its terms.
Ubuntu fonts keep their [own license](extension/assets/fonts/UFL.txt).

[Development and releases](docs/README.md)
