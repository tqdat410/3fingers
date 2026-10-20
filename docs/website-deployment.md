# Website build and deployment

The basic bilingual website lives in `website/`. Astro emits static HTML and assets into `website/dist/`; there is no SSR adapter, Worker, Function, product API or analytics. Guide and privacy pages read the same Markdown as GitHub directly from `docs/user-guide.en.md`, `docs/user-guide.vi.md`, `docs/privacy-policy.md` and `docs/privacy-policy.vi.md`. Relative document links resolve to matching website pages when available, otherwise to the repository on GitHub.

## Design brief

- Register: Brand.
- Scene: Desktop Chrome users checking what the extension does before installing, with a mobile reader able to consult the same guide in daylight.
- Direction: Restrained editorial, because the product needs clear installation and reading instructions rather than a simulated social feed.
- Color: Restrained. White `oklch(1 0 0)` background, charcoal `#1C1C1C` (`oklch(0.227 0 0)`) text and action fill. Existing neutral brand palette governs.
- Type: Bundled Ubuntu 400/500/700, with system glyph fallback. Weight and size provide contrast within one family.
- Signature: Large 3fingers name with the exact quote `Multitask is not real!` and the official transparent logo.
- Dials: variance 3, motion 1, density 3. The user requested a basic website and postponed detailed design.

Logo, icon, original Ubuntu files and both font license notices are copied from `extension/assets/` into the generated website assets by `website/scripts/copy-assets.mjs` before each build. The generated copies are ignored by Git. No external font requests occur.

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

Root `/` uses a stored language choice, then browser Vietnamese (`vi` or `vi-*`), otherwise English. The English fallback and both language links remain readable without JavaScript. Language links persist a choice and keep the current page type. Explicit `/en/` and `/vi/` routes never auto-redirect. The only website storage is the local language preference. Download always links to the current stable GitHub release, independently of an unreleased extension version in this repository.

## Cloudflare Pages Git integration

Deployment has not been performed. Cloudflare account access, project availability, DNS ownership and the live custom domain remain unverified. This is the requested static Pages route; no Wrangler authentication or Workers deployment is needed.

1. In Cloudflare, create a **Pages** project and connect the GitHub repository. Use production branch `main`; enable branch preview deployments as desired.
2. Set root directory to `website`, build command to `npm run build`, and build output directory to `dist`. Set `NODE_VERSION` to `24`. Keep the complete checkout: the build reads sibling `../docs/` and `../extension/assets/`. Commit `website/package-lock.json` so Pages can install the pinned dependencies.
3. Configure build watch inclusion paths relative to the repository root: `website/*`, `docs/*`, `extension/assets/*`. Cloudflare's `*` matches across directory separators, so these include nested website files, shared documents, fonts and logo assets. Verify a documentation-only branch preview before relying on selective builds. See [Pages build watch paths](https://developers.cloudflare.com/pages/configuration/build-watch-paths/).
4. Inspect a branch preview: open `/`, both locales, both guides, both privacy pages and an unknown URL. Verify static 404 behavior, language switching, font/logo requests and the GitHub download link. Production promotion follows the repository's merge/release workflow.
5. To use `3fingers.tranquocdat.com`, **register the hostname in the Pages project's Custom domains first**. Complete the dashboard's ownership instructions, then create or confirm the requested DNS CNAME pointing to that project's actual `*.pages.dev` hostname. Do not guess the project hostname or create a CNAME before Pages has registered the custom domain. Wait for certificate activation and verify HTTPS before describing it as live.

Use the Pages deployment history to roll back a bad static deployment. A branch preview does not establish that the production domain or its DNS is ready.

References: [Astro static output](https://docs.astro.build/en/reference/configuration-reference/#output), [Cloudflare Pages Git integration](https://developers.cloudflare.com/pages/configuration/git-integration/), [Pages build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/), [Pages monorepos](https://developers.cloudflare.com/pages/configuration/monorepos/), [Pages custom domains](https://developers.cloudflare.com/pages/configuration/custom-domains/).
