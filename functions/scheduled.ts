/**
 * Cloudflare scheduled worker — auto-refreshes Arc token data every 5 minutes.
 * Configured in wrangler.toml (if using Workers) or via Cloudflare dashboard.
 * 
 * For Pages: this runs on any path hit, not a true cron — but the waitUntil
 * pattern in market.ts handles background refresh on every API call.
 *
 * To enable true cron on Cloudflare Workers:
 *   wrangler.toml: [triggers] crons = ["*\/5 * * * *"]
 */
export {}  // placeholder
