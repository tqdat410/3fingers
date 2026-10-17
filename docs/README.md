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

Browser tests use temporary profiles, a local server on port 49317 and intercepted social fixtures. They do not use your account or prove that every real social route works. Generated diagnostics stay local and are ignored by Git. Test teardown closes its browser/server and deletes the temporary profile; do not start another fixture on a different port when 49317 is already in use.

## Privacy

Site access is requested when opening or selecting a social. Optional host permissions are not grants for every site. Stored legacy custom URLs remain usable, but new selections are Facebook, Instagram and Threads.

The extension removes X-Frame-Options and CSP response headers only for permitted subframes in its registered workspace tab. Removing CSP reduces protection inside those embedded documents. Normal tabs are outside these rules. For the three supported socials, a workspace subframe rule also sets Sec-Fetch-Dest to document for compatibility; this does not turn the iframe into a first-party tab.

Scripts control scrolling only in registered frames. They do not collect posts, DMs, passwords or cookie values, or automate likes/comments/posts. Social sites still connect to their own services. There is no product server or analytics. The bundled Ubuntu fonts do not make requests to Google.

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
