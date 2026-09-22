# Fix: InvalidAllocation revert on launchToken

## Root Cause
The V2 contract `_validateAndCompute` enforces:
- `curveBps >= 5000` (50% minimum)
- `curveBps <= 9500` (95% maximum)
- `creatorBps <= 1000` (10% maximum)
- `curveBps + creatorBps <= 9500`

The LaunchPage slider had `min={4000}` (40%), letting users pick values the contract rejects. The "Deflationary" preset sets `curve: 9200` which with any `creatorBps > 300` also fails.

## Files to Change

1. `src/pages/LaunchPage.tsx`
   - Slider `min` for curve: `4000` → `5000`
   - Slider label: `40%` → `50%`
   - "Deflationary" preset: `curve: 9200, creator: 0` — safe, keep as-is
   - Add runtime guard: before calling `doLaunch`, re-validate `curveBps + creatorBps <= 9500` and show a clear error if violated
   - Update the DEX % note in the summary to reflect the real minimum

## Build Sequence
1. Fix slider min from 4000 to 5000 in LaunchPage
2. Fix slider label from "40%" to "50%"
3. Add pre-submit validation guard with user-friendly error
4. Typecheck + push

## Done When
- [ ] Slider cannot go below 50%
- [ ] Pre-submit guard catches curveBps + creatorBps > 9500 before wallet prompt
- [ ] Zero TS errors
- [ ] Pushed to main
