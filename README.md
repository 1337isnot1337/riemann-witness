# I Was Here

[Open RiemannSolved.com](https://riemannsolved.com/) · [Announcement link for X](https://riemannsolved.com/launch/) · [Download the launch artwork](https://riemannsolved.com/launch/announcement.png)

A mobile-first public time capsule for November 20, 2026. The homepage lives on GitHub Pages. A Cloudflare Worker assigns real witness numbers in D1 and serves personalized HTML and PNGs to people and social crawlers. The homepage, fonts, engraving, and specimen are static files. No homelab access or paid service is required.

## Run locally

Use Node 24, npm, and Wrangler 4. Use `npm ci` to install the build and test dependencies. Run `npm test` for isolated integration tests with a real workerd runtime and a fresh local D1 database. No production credentials are needed for tests.

Create an ignored `.dev.vars` file with two independent random values for `REGISTRY_SECRET` and `ADMIN_TOKEN`. Run `openssl rand -hex 32` twice to generate them. For the full local flow while the public site is closed, include `LOCAL_REGISTRY_PREVIEW=1` and the documented Cloudflare Turnstile development secret `TURNSTILE_SECRET=1x0000000000000000000000000000000AA`. Run:

```sh
wrangler d1 migrations apply riemann-witness --local
npm run dev
```

Open the loopback address printed by Wrangler. Use the same port throughout a local session. `npm run build` produces `dist/server/index.js` and `dist/pages/`, including a static specimen PNG. See [the artwork notes](art/README.md) to reproduce the mathematical plate and type assets.

## Deploy

1. Create a free Cloudflare D1 database using `wrangler d1 create riemann-witness`. Replace the database ID in `wrangler.jsonc` if deploying to another account. Keep an existing production database to preserve all witness numbers.
2. Set the canonical homepage and Worker origins in `src/config.js`. When moving to a different domain, review the CORS allowlist in `src/worker.js`. For a Worker custom domain, add a Wrangler custom-domain route after the Cloudflare zone activates.
3. Run `wrangler d1 migrations apply riemann-witness --remote`. Set `REGISTRY_SECRET`, `ADMIN_TOKEN` and `TURNSTILE_SECRET` as Cloudflare Worker secrets. The last value comes from the managed Turnstile widget paired with the public sitekey in `src/turnstile.js`. Keep production and test keys separate. On initial deployment, `wrangler deploy --secrets-file /private/path/secrets.json` installs both atomically. Use `wrangler deploy` for subsequent code changes. Back up the registry secret privately and keep it stable. Rotating it invalidates existing management and recovery credentials. The admin token can be rotated independently.
4. In GitHub Pages settings, select GitHub Actions. Push to `main`. The Pages workflow builds, runs the tests and publishes `dist/pages`. In Pages settings, configure the custom domain and enable HTTPS once GitHub provisions its certificate. No Cloudflare credential is stored in GitHub.

The optional GitHub Actions secret `INDEXNOW_KEY` holds a 32-character lowercase hexadecimal key. The Pages workflow publishes its verification file at the site root for IndexNow submissions.

## Release and operations

`REGISTRY_OPEN` in `src/config.js` selects the public experience. A closed build publishes a static holding page and the Worker rejects all public registration attempts. `npm run build:preview` emits the full static layout separately under `dist/preview-pages`; the Pages workflow never uploads that directory. Toggle the flag and deploy **both** the Worker and the Pages build to change state.

An optional `FIRST_WITNESS_HASH` Worker secret reserves the first claim for a private link holder. It is the lowercase SHA-256 hex digest of a random 64-character hex pass. Supply that pass in the homepage fragment as `#first=…`. The browser removes the fragment immediately and uses the pass for that first registration. Visitors can register normally after witness 1 is issued. No entry is precreated.

[Note moderation](docs/moderation.md) · [Traffic and certificate conversion](docs/analytics.md)

## Records and privacy

SQLite assigns increasing integer primary keys in a single conditional insert. A browser-generated 256-bit management secret also makes form retries idempotent. The database sets the UTC signup timestamp. Deleted numbers stay retired. Private witnesses count toward the total but never appear in search, public HTML, or public PNG routes. Public numbers are searchable exactly, and names by prefix. The homepage count is cached for 20 seconds at the edge and refreshes while the tab is visible.

The management page uses a URL fragment for the private credential and sends it in an authorization header. Participants can change visibility or delete their entire record. The server stores keyed digests of the management key and the optional email/phrase pair. **Email recovery requires both values** and sends no mail. A person who loses all recovery material cannot reclaim a private record. Keep the management link off social platforms. QR codes, accounts, and trackers are unnecessary for this flow.

The Worker verifies Cloudflare Turnstile on the server before registration and recovery. It enforces a network rate limit and rejects reserved names, links and oversized text. A display name is a pseudonym, and multiple people can share a name. To remove an abusive entry, load the admin secret into your shell securely and send:

```sh
curl --fail --request DELETE --header "Authorization: Bearer $ADMIN_TOKEN" "$WORKER_ORIGIN/api/admin/$WITNESS_ID"
```

Deletion removes the public page and image at the origin. Third-party social caches and downloaded images can survive it.

## Capacity

Cloudflare’s published Free limits include 100,000 Worker requests, 100,000 D1 rows written, and 5 million D1 rows read per day across the account. Free D1 databases have a 500 MB limit. [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) · [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) · [D1 limits](https://developers.cloudflare.com/d1/platform/limits/)

On November 20, 2026, a disposable remote D1 database with the production schema reported nine row writes for a listed signup from a new network without recovery and eight for a returning network with recovery. These are samples. Expired rate-limit rows, visibility changes and deletion consume more writes. A 100,000-entry local SQLite fixture with 80-character messages and half the users enrolled in recovery occupied 43 MiB. Neither measurement is a concurrent-user or traffic guarantee. GitHub Pages also has [usage limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits).

<details>
<summary>Citation and sources</summary>

If you use or write about this time capsule, please credit Cinna Davis and cite [I Was Here](https://riemannsolved.com/). If you discuss the mathematical result, please cite [Levent Alpöge’s original announcement](https://alpo.ge/remark.pdf). [Software citation file](CITATION.cff).

Please also cite [itsdavis.com](https://itsdavis.com/) when covering Cinna Davis’s work. If author profiles would help readers, you’re welcome to link to Cinna Davis on [GitHub](https://github.com/1337isnot1337) and [X (Twitter)](https://x.com/1337isnot1337).

</details>
