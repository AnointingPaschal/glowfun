# Security hardening — runbook

This is the operational counterpart to the in-app Security Center
(`/tools/security`). The app tells you *what* your current setup allows;
this doc is the checklist for actually doing it.

## The real threat model

GlowFunFactory_V3's contract logic is sound — mint, burn, pause and
blacklist are correctly gated. The realistic way funds get diverted isn't a
bug in the contract, it's a private key (the factory owner, or a token's
creator) being phished, leaked, or brute-forced, then used to mint and dump,
blacklist maliciously, or drain fees. Hardening means making that key hard
to steal, and hard to use silently even if it is stolen.

## Tier 1 — Multisig the keys (do this first, no redeploy)

Two roles matter, and they're independent:

- **Factory owner** (`owner()`) — controls every platform-wide `onlyOwner`
  function: fees, thresholds, boost tiers, Uniswap config, emergency
  withdrawals, force-graduate, and the platform-wide pause.
- **Per-token creator** — actually two things:
  - The token's own **immutable** `creator` (set at deploy, gates
    mint/pause/blacklist forever — this can never move).
  - The factory's separate, **mutable** creator record for that token
    (gates metadata edits, unlocking the creator allocation,
    force-graduating, and any unclaimed graduation bonus — movable at any
    time via `transferCreatorRole`, even for an already-launched token).

Move the owner and each token's mutable creator record to a
[Safe](https://safe.global) with 2-3 independent hardware-wallet signers.
Do this from the app: **Security Center -> Platform-wide** (ownership) and
**Security Center -> This token** (creator role) both have a "move this
role to a new address" form with a destination wallet-type check and a
typed-phrase confirmation.

**What this doesn't cover:** a token's immutable creator (mint/pause/
blacklist) can only ever be Safe-protected if the token was *launched*
directly from a Safe address. There's no way to retrofit that for a token
that's already live.

## Tier 2 — Add a timelock in front of the Safe

A Safe stops a single stolen key from acting alone. A **timelock** adds the
other half: even a fully-approved action has to sit publicly on-chain for a
fixed delay before it executes — the window that lets you or your
community catch and react to something malicious before it lands.

OpenZeppelin's `TimelockController` is already vendored in this repo
(`lib/openzeppelin-contracts`) — no new dependency needed.

```bash
export PRIVATE_KEY=0x...              # deployer key — pays gas only, gets no standing power
export MIN_DELAY_SECONDS=86400        # 24h; use 172800 for 48h
export SAFE_ADDRESS=0xYourSafeAddress

forge script contracts/script/DeployTimelock.s.sol:DeployTimelock \
  --rpc-url https://rpc.mainnet.arc.io --broadcast --verify -vvvv
```

This deploys the timelock with your Safe as proposer, executor, **and**
admin — the deployer key retains no ongoing control. Once deployed:

1. Verify the address on the explorer.
2. From the Security Center's Platform-wide tab, transfer factory
   ownership to it.
3. Per token, from that token's Security page, transfer the creator role
   to it.
4. From then on, admin actions are queued through the Safe
   (`schedule()`), sit for the delay, then get executed through the Safe
   (`execute()`) — never called directly.

The app's Security Center -> Timelock tab detects whether the current
owner responds like a `TimelockController` (best-effort — verify on the
explorer, don't rely on it alone).

## Tier 3 — Monitoring: catch it during the delay window

A timelock only helps if someone's watching it. `scripts/security-monitor.mjs`
polls the factory for the same events the in-app activity log shows —
ownership transfers, creator-role transfers, emergency withdrawals,
platform pause/unpause, platform-level blacklist actions, fee/graduation
recipient changes — and pushes an alert to Discord and/or Telegram the
moment one appears.

`.github/workflows/security-monitor.yml` runs it every 10 minutes on
GitHub's own infrastructure — no server to maintain. To enable it, add
these repo secrets (Settings -> Secrets and variables -> Actions):

| Secret | Required | Notes |
|---|---|---|
| `RPC_URL` | yes | An Arc Mainnet RPC endpoint |
| `FACTORY_ADDRESS` | yes | The factory to watch |
| `DISCORD_WEBHOOK_URL` | one of these two | [Creating a webhook](https://support.discord.com/hc/en-us/articles/228383668) |
| `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` | | Create a bot via [@BotFather](https://t.me/BotFather) |

You can also run the script anywhere else that can run Node on a schedule
(a VPS cron, a Cloudflare Worker cron trigger, your laptop) — it only needs
the env vars documented at the top of the file.

## Tier 4 — Frontend & operational hygiene

This protects *users* of the site, not the contracts directly — the other
realistic way funds get diverted is someone being tricked into signing a
transaction they didn't mean to, via a compromised site rather than a
compromised contract.

- `public/_headers` ships baseline security headers (CSP, clickjacking
  protection, MIME-sniffing protection) via Cloudflare Pages' native
  `_headers` support. Read the comment at the top before tightening the CSP
  further — it's deliberately permissive on wallet-related origins because
  narrowing them incorrectly breaks "Connect Wallet" silently.
- Keep the domain registrar and GitHub org locked down with 2FA.
- Pin dependencies and review `package-lock.json` diffs on every bump —
  supply-chain compromise of a build dependency is a realistic way to
  inject malicious JS into a page that otherwise looks untouched.
- The typed-phrase confirm modal + wallet-type banner already shipped on
  every irreversible action (burn, mint, pause, blacklist) is exactly the
  right shape of defense here — friction against a misclick or a
  manipulated call, plus an honest signal about whether a second approval
  is actually protecting the click.

## What can't be fixed without a new contract version

- Role-based access control (a separate "minter" key vs. a "pauser" key,
  instead of one `creator` doing everything) — a real improvement, but
  needs a new contract.
- On-chain mint rate limits or supply-growth caps beyond the existing
  `maxSupply`.
- Native multisig logic *inside* the contract itself (as opposed to the
  contract simply being controlled by a multisig wallet, which Tier 1
  already gets you today).

None of these are retrofittable onto the already-deployed
`GlowFunFactory_V3` or any already-launched token — they'd ship in a `V4`.
