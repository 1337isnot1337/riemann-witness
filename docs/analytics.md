# Witness registry analytics

Open [Cloudflare Web Analytics](https://dash.cloudflare.com/?to=/:account/web-analytics) and select **riemannsolved.com** for the Visits and Page Views charts. The site uses Cloudflare's free manual JavaScript beacon on the GitHub Pages holding page and, after release, on the registry home, announcement link and history pages. Preview builds and Worker-rendered pages, including recovery, management, and individual certificates, have no beacon. [Cloudflare Web Analytics](https://developers.cloudflare.com/web-analytics/about/)

## Run the report

From the repository root with Node 22.13 or newer and the authenticated `cf` and `wrangler` CLIs:

```sh
# Before opening the registry
node scripts/analytics.mjs --holding --days 7

# After opening
node scripts/analytics.mjs --days 7
```

At launch, record the first timestamp when both the public registry page and the production registration endpoint are open in `docs/launch-utc.txt`. Use `YYYY-MM-DDTHH:MM:SSZ`. The report splits traffic at that instant. `--launch` and the `REGISTRY_LAUNCH_UTC` environment variable can override the recorded time. `--days` includes the current UTC day and accepts 1–90. Cloudflare can take time to process recent beacons.

On a machine with a different `cf` credential store, provide an account-scoped token with **Account Analytics Read** in `CLOUDFLARE_ANALYTICS_API_TOKEN`. Wrangler obtains its database credentials independently. Keep both credentials out of the repository and command output.

## Read the numbers

- **Visits** are Cloudflare's observed site entries from direct links or other sites. Page views include navigation within the site. The report queries the exact canonical hostname and excludes traffic classified as bots by Cloudflare. Browsers that block the beacon can be missed, and Cloudflare can sample the underlying traffic data. [Cloudflare metric definitions](https://developers.cloudflare.com/web-analytics/data-metrics/high-level-metrics/), [Cloudflare sampling](https://developers.cloudflare.com/web-analytics/faq/#is-the-data-sampled)
- **Certificates** are successful new registrations, public and private. D1 migration `0002_certificate_issuance.sql` increments a count by UTC day inside the insert transaction. Updates, duplicate submits while the entry exists, and deletions leave the count alone. The ledger stores only dates and counts and begins with the migration.
- **Certificates per 100 visits** is 100 × certificates issued ÷ measured visits in the displayed period. It compares aggregates and can exceed 100. A dash means there were zero measured visits. The UTC launch day's certificate count covers the whole day, so leave production closed to registrations until release. Earlier holding-page traffic is excluded from the launch day's registry visit denominator.
- **Public badge referrals.** The “Get my own badge” link on public certificates opens `/join/#sign`. Filter Web Analytics by path `/join/` to count measured visits to that landing page from the rollout onward. The path carries no witness ID. Direct visits and forwarded copies of the link count too. Certificate issuance is counted across all channels, so this figure measures visits to the form rather than completed registrations from badges.

To verify a deployment, load `https://riemannsolved.com/` in a browser with the network log open and preserve the log when navigating away. Check for the successful `static.cloudflareinsights.com/beacon.min.js` request and the POST to `cloudflareinsights.com/cdn-cgi/rum`, then confirm a measurement arrives in Web Analytics or the report. The Web Analytics dashboard shows the site's total traffic over the selected range. Use the report for the exact launch split and issuance totals.

For a fresh D1 instance, apply the registry migrations before deploying the Worker:

```sh
wrangler d1 migrations apply riemann-witness --remote
```
