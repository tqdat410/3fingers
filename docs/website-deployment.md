# Website build and deployment

The bilingual website lives in `website/`. Astro emits static HTML and assets into `website/dist/`; there is no SSR adapter, Worker, Function, product API or analytics. Docs and privacy read the same Markdown as GitHub directly from `docs/user-guide.en.md`, `docs/user-guide.vi.md`, `docs/privacy-policy.md` and `docs/privacy-policy.vi.md`. Relative document links resolve to matching website pages when available, otherwise to the repository on GitHub.

`/en/docs/` and `/vi/docs/` aggregate the user guide and complete privacy policy, covering supported socials, installation, permissions, scrolling, layout, navigation, themes, language, updates, compatibility and license. Existing `/en/guide/` and `/vi/guide/` render the same Docs with canonical links to `/docs/`, keeping the extension's help URLs and existing anchors working. Standalone `/privacy/` pages remain available. The Docs sidebar derives its contents links from generated heading IDs and stays sticky on desktop. Contents are always displayed, including on mobile; neither the title nor choosing a section collapses them. The native thin scroll thumb is transparent at rest and appears on hover, keyboard focus or scrolling, with no visible track/buttons. `SiteControls.astro` shares theme and single EN/VI controls between the homepage and sidebar; theme/language preferences remain the same local keys.

## Design brief

- Register: Brand.
- Scene: Desktop Chrome users checking what the extension does before installing, with a mobile reader able to consult the same guide in daylight.
- Direction: Restrained editorial, because the product needs clear installation and reading instructions rather than a simulated social feed.
- Color: Restrained. Light mode uses white background and charcoal `#1C1C1C` text/action fill. Dark mode uses `#1C1C1C` background and `#F1F1F1` text. The homepage toggle saves the theme locally and applies it to document pages too.
- Type: Bundled Ubuntu 400/500/700, with system glyph fallback. Weight and size provide contrast within one family.
- Signature: Headerless homepage, official logo left of a fixed-size heading that alternates between `3fingers` (first) and the exact two-line quote `Multitask is not real!`. The heading automatically decodes between the name and quote every five seconds, starting with the name. Hover does not trigger changes. Reduced motion switches the text immediately. The quote reserves the heading dimensions so surrounding content does not shift. Small GitHub, theme, single EN/VI and icon-only Docs controls precede download buttons, with Docs immediately after EN/VI. The homepage tab title is `Welcome to 3fingers`; Welcome is not displayed in the page. The installation guide link opens the localized installation section in Docs. GitHub links to Stable; Chrome Web Store is visibly disabled with a coming-soon label until a real listing exists. Social icons precede three installation steps and a compact footer. Docs uses a left sidebar; standalone privacy retains its document header.
- Dials: variance 3, motion 1, density 3. The user requested a basic website and postponed detailed design.

Theme changes use a 500ms radial reveal from the button center with the browser's [same-document View Transitions API](https://developer.chrome.com/docs/web-platform/view-transitions/same-document). Homepage and Docs EN/VI links keep normal navigation/history. The `pagereveal` event starts a 550ms text scramble on visible translated text: random ASCII characters settle into the correct translated graphemes, preserving Vietnamese accents. Docs includes the visible article text without animating the entire long document offscreen. Temporary overlays retain the final text's layout and expose only the correct text to screen readers; original text nodes are restored on completion or navigation. The quote and icons remain unchanged. Unsupported browsers keep ordinary navigation/theme changes; reduced-motion preferences disable both effects. No animation library is used. Social names remain as image alt text without visible captions. GitHub and download links open new tabs with `noopener noreferrer`.

Logo, icon, original Ubuntu files and both font license notices are copied from `extension/assets/` into the generated website assets by `website/scripts/copy-assets.mjs` before each build. The generated copies are ignored by Git. No external font requests occur.

Social and GitHub/Chrome SVGs are vendored from [Simple Icons](https://github.com/simple-icons/simple-icons/tree/c71c69e3a27e4436936b831c72643e6513b9f49b/icons), revision `c71c69e3a27e4436936b831c72643e6513b9f49b`, under its [CC0 license](https://github.com/simple-icons/simple-icons/blob/c71c69e3a27e4436936b831c72643e6513b9f49b/LICENSE.md). They load locally from `public/social-icons/`; no icon CDN requests occur.

## Local commands

Use Node 24 (the pinned Astro release also accepts Node 22.22 or newer). From the repository root:

```sh
npm --prefix website ci
npm --prefix website run build
npm --prefix website test
npm --prefix website exec playwright install chromium
npm --prefix website run test:browser
npm --prefix website run preview
```

Preview uses `http://127.0.0.1:4321`. Stop it with Ctrl+C. Browser tests serve the existing build on that same deterministic port, fail when it is busy, print their PID, and close their server/browser in `finally`. They save ignored responsive screenshots in `website/test-results/`. They must run after the build. `npm --prefix website run dev` also uses port 4321; do not run preview/dev and browser tests together.

Root `/` uses a stored language choice, then browser Vietnamese (`vi` or `vi-*`), otherwise English. The English fallback and both language links remain readable without JavaScript. Language links persist a choice and keep the current page type. Explicit `/en/` and `/vi/` routes never auto-redirect. Website local storage holds language and theme preferences. GitHub download always links to the current stable release, independently of an unreleased extension version in this repository.

When a dev server already owns port 4321, browser tests can reuse it without starting or stopping a server: set `WEBSITE_TEST_URL=http://127.0.0.1:4321` for `npm --prefix website run test:browser`. Static tests still inspect `website/dist`; run the build first. With no override, the browser test owns the built-site server and fails on a busy port.

## Cloudflare Pages Git integration

The Cloudflare Pages project is **3fingers**, connected to **tqdat410/3fingers** with production branch **main**. Its default hostname is https://3fingers.pages.dev. The project builds static assets only; no Workers or Functions are deployed.

- Root directory: `website`; build command: `npm run build`; output: `dist`; `NODE_VERSION=24` for production and previews.
- Build watch paths: `website/*`, `docs/*`, `extension/assets/*`, relative to the repository root. These include nested files. The full checkout is required because the website reads shared docs and extension assets outside its root.
- Production deploys automatically on pushes to `main`; other branches receive previews. GitHub Actions independently checks the extension and website. Inspect build logs and revision in the Pages project's deployment history before calling a rollout complete.
- Wrangler OAuth was used to create the Git-connected project. Credentials are stored encrypted with a key in Windows Credential Manager; they are not committed. Normal Git deployments do not need a local CLI login. The current CLI grant permits Pages management and account/zone reads, not DNS edits.

### Custom domain

`3fingers.tranquocdat.com` is registered in the Pages project's Custom domains. In the Cloudflare zone for `tranquocdat.com`, configure a proxied CNAME named `3fingers` targeting `3fingers.pages.dev` with automatic TTL. The Pages hostname must already be registered before adding the CNAME. Wait for the custom domain and HTTPS certificate to become active.

### Verify and roll back

After a rollout, check both locales, Docs, legacy `/guide/` help links, privacy pages and an unknown path returning 404. Verify logo/fonts, Docs navigation, language/theme controls and GitHub download links on desktop and mobile. The first production build from `aeb1b87` passed the live website browser suite at its Pages hostname.

Use the Pages deployment history to roll back to a previous successful production deployment. The initial deployment ID is `ff44d098-0032-4ed8-b12d-695e8d8b8afd`; select it when reverting a later rollout to the initial website. Rollback is not a Git revert: revert the source too before the next automatic deployment if the change must stay removed.

References: [Astro static output](https://docs.astro.build/en/reference/configuration-reference/#output), [Cloudflare Pages Git integration](https://developers.cloudflare.com/pages/configuration/git-integration/), [Pages build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/), [Pages monorepos](https://developers.cloudflare.com/pages/configuration/monorepos/), [Pages custom domains](https://developers.cloudflare.com/pages/configuration/custom-domains/).
