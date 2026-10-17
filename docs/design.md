# 3fingers

A compact workspace for reading several social feeds in desktop Chrome.

## Brand

- Primary: charcoal `#1C1C1C` (`--brand-primary`), sampled from the official logo. White surface, `#F7F7F7` canvas, `#686868` muted text and `#E5E5E5` borders. Focus and toggle use charcoal; errors retain their own color.
- Font: bundled, unmodified Ubuntu 400/500/700 TTF from Google Fonts under UFL 1.0. System fonts cover missing glyphs, including Vietnamese. No font requests or font changes inside social pages.
- Logo: original 1254 x 1254 RGBA PNG at `extension/assets/brand/logo-original.png`. Icons at 16/32/48/128 crop the visible area with padding and preserve transparency. Header, favicon and extension action share the logo.
- Title: `3fingers`. Description: `Read social feeds side by side with synced scrolling.` All extension labels, tooltips, status messages, errors and accessibility text use short English. Localized site matching and multilingual test data remain functional data.
- Fixed brand quote: `Multitask is not real!` Preserve its exact wording, capitalization and punctuation. Show it below the product name in the extension popup and in the README.

## Layout and controls

- Up to three equal-width panels. New workspaces show Facebook, Threads and Instagram with an Open button. Older surplus panels are saved for restoration. No simulated feeds or repeated permission descriptions.
- No main toolbar in the workspace. The Chrome action opens a 300px popup with the logo, name, fixed quote, description, Open workspace, Sync scroll, Reload all and +. Opening the workspace focuses an existing tab or creates one. Controls target the active workspace in the current window when available. Reload all starts all permitted panels together; it is disabled when no panels are enabled. + is disabled at three sites. An empty workspace points to the extension menu.
- Panel toolbar: 32px, reload on the left, supplied charcoal pin icon centered at 18px, change-site and close on the right. Buttons are 28px for a compact desktop layout, with tooltips, keyboard focus and accessible names. No management menu, resize controls or separate site-name bar.
- Panel site picker: anchored to its button, with Facebook, Instagram and Threads only. No title, footer or backdrop. Supports outside dismissal, Escape, arrow keys, Home, End and Enter. Stays within the viewport. The popup's + reveals the same social choices and any saved sites for restoration. Duplicate sites are allowed.
- Drag the pin handle to reorder. The panel scales to 0.96 and follows the pointer in both axes while showing its new position. Release saves; Escape cancels; arrow keys reorder. Preserve iframe viewport, document and scroll offset without reloading.

## Scrolling and site content

- Dragging feed content scrolls that feed independently, including with Sync scroll enabled. A movement threshold preserves normal clicks. Inputs, small buttons, video controls, dialogs and nested scrollers keep native behavior. Shift allows text selection. Native touch scrolling stays local; wheel and keyboard follow the sync setting.
- Comments and dialogs scroll independently and pause their background feed. Sync resumes when the dialog closes. Connection and permission states remain distinct from a loaded site.
- Appending a page below the viewport preserves an active synchronized wheel gesture. Layout anchoring, shrinking, root replacement and viewport changes still reset the scroll baseline to avoid sending automatic movement to other feeds.
- Keep native navigation, posts, inputs, cards, media, comments and backgrounds. Hide only feed scrollbars. During a swipe, temporarily change the cursor and suppress selection. Do not crop, reparent or rebuild feeds, hide site controls, or restyle site content. Compact reading mode remains out of scope.
- Site names and domains remain available in tooltips, accessible labels, the picker and unopened panels. No user content enters product analytics or logs.
- Controls remain reachable in narrow columns; desktop is the primary target. Respect reduced motion. Do not replace the layout with Chrome's two-tab split.

This is a local extension UI. SEO, sitemaps, AI discovery and sharing integrations are outside its scope.
