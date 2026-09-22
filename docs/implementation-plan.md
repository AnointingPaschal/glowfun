The revert reason is `InvalidAllocation()`. Looking at the decoded input — the method ID is `c03261b8` but the ABI expects `0baf7432`. Those are different function selectors, meaning **the frontend is calling a different function signature than what's deployed on-chain**.

The decoded call shows the struct fields being passed, but something in the struct layout or field order doesn't match the V2 contract. Let me check both: The ABI `launchToken` struct has 11 fields. Now let me check the deployed V2 contract's actual `launchToken` function signature: Found it. Now let me read the actual `launchToken` function to see the `InvalidAllocation` check: Now I see the `_validateAndCompute` call. Let me find that function: Found the exact problem. Line 544:

```solidity
if (curveBps < 5000 || curveBps > 9500 || creatorBps > MAX_CREATOR_ALLOC_BPS || curveBps + creatorBps > 9500) revert InvalidAllocation();
```

The contract requires `curveBps` between **5000 and 9500** (50%–95%). But the LaunchPage's "Deflationary" preset sets `curveBps = 9200` which is fine, and "Community" sets `curveBps = 8000` — but the **slider minimum is set to 4000** (40%), which is below the contract's 5000 minimum.

Also `curveBps + creatorBps > 9500` — so with curveBps=8000 + creatorBps=500 = 8500, that's fine. But with curveBps=9200 + any creatorBps > 300 it would fail.

The fix is simple: **change the slider min from 4000 to 5000** and clamp the presets within valid range. This is a straightforward targeted fix. Here's the exact plan: Here's the problem and the fix:

**Root cause — line 544 of the deployed contract:**
```solidity
if (curveBps < 5000 || curveBps > 9500 || curveBps + creatorBps > 9500) revert InvalidAllocation()
```

The contract enforces a **50% minimum** for curve allocation. But the LaunchPage slider was set to `min={4000}` (40%), so you could drag it below 50% and the contract would reject it.

**Three specific things to fix in `LaunchPage.tsx`:**
1. Slider min: `4000` → `5000` 
2. Slider label: `"40%"` → `"50%"`
3. Add a pre-submit guard that catches `curveBps + creatorBps > 9500` before the wallet even opens, showing a clear error rather than a confusing on-chain revert

Switch to Build mode and I'll apply the fix — it's a 3-line change.
