/**
 * Minimal Uniswap V3 periphery ABIs for the wallet's Swap feature — just the three calls it
 * needs, sourced verbatim from Uniswap's own public interfaces (not re-derived from memory):
 *   - IUniswapV3Factory.getPool         github.com/Uniswap/v3-core/.../IUniswapV3Factory.sol
 *   - IQuoterV2.quoteExactInputSingle   github.com/Uniswap/v3-periphery/.../IQuoterV2.sol
 *   - IV3SwapRouter.exactInputSingle    github.com/Uniswap/swap-router-contracts/.../IV3SwapRouter.sol (SwapRouter02 — no `deadline` field, unlike the original SwapRouter)
 *
 * The Factory address is read live from GlowFunFactory_V3.uniswapV3Factory() (see
 * src/hooks/useTokenTools.ts) since it's owner-mutable and already the address this app's own
 * token-graduation flow trusts. The SwapRouter02 / QuoterV2 addresses are NOT hardcoded here —
 * see SWAP_ROUTER_ADDRESS / QUOTER_ADDRESS in src/constants.ts for why.
 */

export const FACTORY_V3_GETPOOL_ABI = [
  {
    name: 'getPool', type: 'function', stateMutability: 'view',
    inputs: [
      { name: 'tokenA', type: 'address' },
      { name: 'tokenB', type: 'address' },
      { name: 'fee', type: 'uint24' },
    ],
    outputs: [{ name: 'pool', type: 'address' }],
  },
] as const

export const QUOTER_V2_ABI = [
  {
    name: 'quoteExactInputSingle', type: 'function', stateMutability: 'nonpayable',
    inputs: [{
      name: 'params', type: 'tuple', components: [
        { name: 'tokenIn', type: 'address' },
        { name: 'tokenOut', type: 'address' },
        { name: 'amountIn', type: 'uint256' },
        { name: 'fee', type: 'uint24' },
        { name: 'sqrtPriceLimitX96', type: 'uint160' },
      ],
    }],
    outputs: [
      { name: 'amountOut', type: 'uint256' },
      { name: 'sqrtPriceX96After', type: 'uint160' },
      { name: 'initializedTicksCrossed', type: 'uint32' },
      { name: 'gasEstimate', type: 'uint256' },
    ],
  },
] as const

export const SWAP_ROUTER02_ABI = [
  {
    name: 'exactInputSingle', type: 'function', stateMutability: 'payable',
    inputs: [{
      name: 'params', type: 'tuple', components: [
        { name: 'tokenIn', type: 'address' },
        { name: 'tokenOut', type: 'address' },
        { name: 'fee', type: 'uint24' },
        { name: 'recipient', type: 'address' },
        { name: 'amountIn', type: 'uint256' },
        { name: 'amountOutMinimum', type: 'uint256' },
        { name: 'sqrtPriceLimitX96', type: 'uint160' },
      ],
    }],
    outputs: [{ name: 'amountOut', type: 'uint256' }],
  },
] as const

/** Fee tiers to probe (in bps*100, i.e. 500 = 0.05%, 3000 = 0.3%, 10000 = 1%) — the three
 * standard tiers every Uniswap V3 deployment ships with. */
export const CANDIDATE_FEE_TIERS = [500, 3000, 10000] as const
