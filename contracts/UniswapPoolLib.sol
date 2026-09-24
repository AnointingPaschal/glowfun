// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IUniswapV3PoolInit {
    function initialize(uint160 sqrtPriceX96) external;
}

interface IPositionManager {
    struct MintParams {
        address token0; address token1; uint24 fee;
        int24 tickLower; int24 tickUpper;
        uint256 amount0Desired; uint256 amount1Desired;
        uint256 amount0Min; uint256 amount1Min;
        address recipient; uint256 deadline;
    }
    function mint(MintParams calldata params) external
        returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1);
    function createAndInitializePoolIfNecessary(
        address token0, address token1, uint24 fee, uint160 sqrtPriceX96
    ) external payable returns (address pool);
}

/**
 * @title UniswapPoolLib
 * @notice Library for creating Uniswap V3 pools and seeding initial liquidity.
 *         Extracted from GlowFunFactory_V3 to keep factory bytecode under the
 *         24,576-byte EIP-170 limit.
 */
library UniswapPoolLib {
    using SafeERC20 for IERC20;

    int24 internal constant TICK_LOWER = -887200;
    int24 internal constant TICK_UPPER =  887200;

    struct PoolResult {
        bool    success;
        uint256 tokenId;   // LP NFT id (0 if failed)
    }

    /**
     * @notice Creates a Uniswap V3 pool, sets the opening price, and seeds full-range liquidity.
     * @param positionMgr  NonfungiblePositionManager address
     * @param token        New meme token address
     * @param pairToken    USDC/EURC address
     * @param tokenAmount  Tokens going into the pool
     * @param pairAmount   Pair-token (USDC/EURC) going into the pool
     * @param fee          Pool fee tier (500 / 3000 / 10000)
     * @param recipient    Address that receives the LP NFT
     */
    function createAndSeed(
        address positionMgr,
        address token,
        address pairToken,
        uint256 tokenAmount,
        uint256 pairAmount,
        uint24  fee,
        address recipient
    ) internal returns (PoolResult memory result) {
        if (positionMgr == address(0) || tokenAmount == 0 || pairAmount == 0)
            return result;

        // Sort tokens (Uniswap requires token0 < token1)
        (address t0, address t1, uint256 a0, uint256 a1) = token < pairToken
            ? (token, pairToken, tokenAmount, pairAmount)
            : (pairToken, token, pairAmount, tokenAmount);

        uint160 sqrtPrice = computeSqrtPriceX96(a0, a1);

        // Approve both to position manager
        IERC20(token).approve(positionMgr, tokenAmount);
        IERC20(pairToken).approve(positionMgr, pairAmount);

        // Create + initialize pool (noop if already exists)
        try IPositionManager(positionMgr).createAndInitializePoolIfNecessary(
            t0, t1, fee, sqrtPrice
        ) returns (address) {
            // Seed full-range liquidity
            try IPositionManager(positionMgr).mint(
                IPositionManager.MintParams({
                    token0: t0, token1: t1, fee: fee,
                    tickLower: TICK_LOWER, tickUpper: TICK_UPPER,
                    amount0Desired: a0, amount1Desired: a1,
                    amount0Min: 0, amount1Min: 0,
                    recipient: recipient,
                    deadline: block.timestamp + 300
                })
            ) returns (uint256 nftId, uint128, uint256, uint256) {
                result.success = true;
                result.tokenId = nftId;
            } catch {}
        } catch {}

        // Always clear approvals
        IERC20(token).approve(positionMgr, 0);
        IERC20(pairToken).approve(positionMgr, 0);
    }

    /**
     * @notice Computes sqrtPriceX96 for a Uniswap V3 pool.
     *         price = amount1 / amount0 in the pool's token ordering.
     *         sqrtPriceX96 = sqrt(price) * 2^96
     */
    function computeSqrtPriceX96(uint256 amount0, uint256 amount1)
        internal pure returns (uint160)
    {
        if (amount0 == 0 || amount1 == 0) return 0;
        // ratioX192 = (amount1 << 192) / amount0
        // We compute in two steps to avoid overflow:
        //   step1 = (amount1 << 128) / amount0
        //   ratioX192 = step1 << 64
        uint256 step1 = (amount1 << 128) / amount0;
        uint256 ratioX192 = step1 << 64;
        return uint160(sqrt(ratioX192));
    }

    /// @dev Babylonian integer square root
    function sqrt(uint256 x) internal pure returns (uint256 y) {
        if (x == 0) return 0;
        uint256 z = (x + 1) >> 1;
        y = x;
        while (z < y) { y = z; z = (x / z + z) >> 1; }
    }
}
