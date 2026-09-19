Based on running a real launchpad on Arc mainnet, here are the most valuable additions grouped by priority:

---

**Tier 1 — Revenue & Economics (add these)**

| Feature | What it does | Why |
|---|---|---|
| **Creator graduation bonus** | 5% of graduation USDC goes to token creator | Incentivizes creators to market their token to reach $69K |
| **Referral fee** | 0.25% of each trade goes to whoever referred the buyer (passed as param) | Viral growth — influencers share links with their ref code |
| **Creation fee in USDC** | Already exists at $5 — raise to $10–$25 | Filters spam tokens, more revenue per launch |
| **Anti-snipe tax** | Extra 5% fee on buys in first 60 seconds after launch | Prevents bots from sniping new tokens at launch price |

---

**Tier 2 — Safety & Trust**

| Feature | What it does | Why |
|---|---|---|
| **Max buy limit per wallet** | Cap any single wallet to X% of curve tokens per tx | Prevents one whale dumping on everyone |
| **Cooldown between buys** | Same wallet must wait N seconds between buys | Slows bots |
| **Creator lock** | If creator takes allocation, it's locked for 7 days | Prevents instant rug by creator |
| **Token blacklist** | Owner can blacklist a token address from trading | Emergency rug/scam response |
| **Wallet blacklist** | Owner can blacklist a wallet from trading | Block known bots/exploiters |

---

**Tier 3 — Graduation & DEX**

| Feature | What it does | Why |
|---|---|---|
| **Auto-LP on graduation** | On graduation, contract automatically creates Uniswap V4 pool with the USDC + tokens | Currently graduation just sends funds to you — automating the DEX listing is the real pump.fun magic |
| **LP burn on graduation** | After creating the pool, burn the LP tokens | Makes liquidity permanent, builds trust |
| **Per-token graduation fee** | Platform takes 1% of graduation USDC | Additional revenue at graduation milestone |

---

**Tier 4 — Community & Gamification**

| Feature | What it does | Why |
|---|---|---|
| **King of the Hill** | Track which token raised the most in last 24h | Drives competition, shown on the feed |
| **Milestone events** | Emit events at 25%, 50%, 75% graduation progress | Frontend can show live alerts |
| **Token comments on-chain** | Store last N comments on-chain per token | Decentralized chat, no backend needed |

---

**My recommendation: deploy with Tier 1 + Tier 2 safety features.** That gives you real revenue share, referral growth, and basic bot/rug protection — which are the features that make a launchpad worth using over others.

Which of these do you want me to add to the contract?
