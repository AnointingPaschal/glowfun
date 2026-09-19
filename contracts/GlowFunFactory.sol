// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

// ---------------------------------------------------------------------------
// File-level struct so both GlowToken and GlowFunFactory can reference it
// without cross-contract type gymnastics.
// Bundling the 7 string fields here means _deployToken only pushes 1 pointer
// onto the stack instead of 14 slots (7 strings × 2 slots each).
// ---------------------------------------------------------------------------
struct TokenMetadata {
    string name;
    string symbol;
    string description;
    string imageUri;
    string twitter;
    string telegram;
    string website;
}

// ===========================================================================
//  GlowToken
// ===========================================================================
contract GlowToken is ERC20 {
    address public immutable factory;
    address public immutable creator;
    uint256 public immutable createdAt;

    string public description;
    string public imageUri;
    string public twitter;
    string public telegram;
    string public website;

    error ZeroAddress();

    // Constructor now takes 4 parameters instead of 10 — the 7 strings are
    // bundled in `meta`, cutting the caller's stack pressure dramatically.
    constructor(
        TokenMetadata memory meta,
        address creator_,
        address factory_,
        uint256 totalSupply_
    ) ERC20(meta.name, meta.symbol) {
        if (creator_ == address(0) || factory_ == address(0)) revert ZeroAddress();

        creator   = creator_;
        factory   = factory_;
        createdAt = block.timestamp;

        description = meta.description;
        imageUri    = meta.imageUri;
        twitter     = meta.twitter;
        telegram    = meta.telegram;
        website     = meta.website;

        _mint(factory_, totalSupply_);
    }
}

// ===========================================================================
//  GlowFunFactory
// ===========================================================================
contract GlowFunFactory is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ── Constants ─────────────────────────────────────────────────────
    uint256 internal constant BPS_DENOMINATOR          = 10_000;
    uint256 internal constant MAX_PROTOCOL_FEE_BPS     = 500;
    uint256 private constant MAX_PAUSE_DURATION         = 7 days;

    uint256 private constant INITIAL_VIRTUAL_USDC_RESERVES  = 30_000e6;
    uint256 private constant INITIAL_VIRTUAL_TOKEN_RESERVES  = 1_073_000_191e18;

    uint256 private constant DEFAULT_GRADUATION_THRESHOLD = 69_000e6;
    uint256 private constant DEFAULT_PROTOCOL_FEE_BPS    = 100;

    // ── Structs ───────────────────────────────────────────────────────
    struct TokenState {
        address creator;
        uint256 virtualUsdcReserves;
        uint256 virtualTokenReserves;
        uint256 realUsdcRaised;
        uint256 realTokensSold;
        bool    graduated;
        uint256 createdAt;
        uint256 curveTokens;
        uint256 graduationTokens;
        uint256 creatorTokens;
        uint256 totalSupply;
        uint256 tokenGraduationThreshold;
    }

    struct LaunchParams {
        string  name;
        string  symbol;
        string  description;
        string  imageUri;
        string  twitter;
        string  telegram;
        string  website;
        uint256 totalSupply;
        uint256 curveAllocationBps;
        uint256 creatorAllocationBps;
        uint256 graduationThresholdUsdc;
    }

    // Intermediate computation result — keeps launchToken's frame shallow.
    struct LaunchAllocations {
        uint256 supply;
        uint256 curveTokens;
        uint256 creatorTokens;
        uint256 graduationTokens;
        uint256 gradThresh;
    }

    // ── State ─────────────────────────────────────────────────────────
    IERC20 public immutable usdc;

    uint256 public creationFee;
    uint256 public protocolFeeBps;
    uint256 public graduationThreshold;
    uint256 public pausedAt;

    address public feeRecipient;
    address public graduationRecipient;
    address public pendingFeeRecipient;
    address public pendingGraduationRecipient;

    mapping(address => TokenState) public tokenStates;
    mapping(address => bool)       public isLaunchedToken;
    mapping(address => uint256)    internal pendingGraduationUsdc;
    mapping(address => uint256)    internal pendingGraduationTokens;
    address[] private _launchedTokens;

    // ── Errors ────────────────────────────────────────────────────────
    error InvalidToken();
    error TokenAlreadyExists();
    error TokenAlreadyGraduated();
    error InvalidAmount();
    error InvalidFeeBps();
    error InvalidAddress();
    error SlippageExceeded();
    error CurveSupplyExceeded();
    error InsufficientTokenLiquidity();
    error InsufficientUsdcLiquidity();
    error InvalidSupply();
    error InvalidAllocation();

    // ── Events ────────────────────────────────────────────────────────
    event TokenLaunchedV2(
        address indexed token,
        address indexed creator,
        uint256 totalSupply,
        uint256 curveTokens,
        uint256 graduationTokens,
        uint256 creatorTokens,
        uint256 graduationThreshold,
        uint256 timestamp
    );
    event TokensBought(
        address indexed token,
        address indexed buyer,
        uint256 usdcIn,
        uint256 tokensOut,
        uint256 price
    );
    event TokensSold(
        address indexed token,
        address indexed seller,
        uint256 tokensIn,
        uint256 usdcOut,
        uint256 price
    );
    event TokenGraduated(
        address indexed token,
        address indexed recipient,
        uint256 usdcAmount,
        uint256 tokenAmount,
        uint256 timestamp
    );
    event GraduationClaimed(
        address indexed token,
        address indexed recipient,
        uint256 usdc,
        uint256 tokens
    );
    event CreationFeeUpdated(uint256 fee);
    event ProtocolFeeUpdated(uint256 feeBps);
    event FeeRecipientProposed(address recipient);
    event FeeRecipientUpdated(address recipient);
    event GraduationRecipientProposed(address recipient);
    event GraduationRecipientUpdated(address recipient);
    event GraduationThresholdUpdated(uint256 threshold);

    // ── Constructor ───────────────────────────────────────────────────
    constructor(
        address _usdc,
        address _feeRecipient,
        address _graduationRecipient,
        address _owner
    ) Ownable(_owner) {
        if (
            _usdc                == address(0) ||
            _feeRecipient        == address(0) ||
            _graduationRecipient == address(0) ||
            _owner               == address(0)
        ) revert InvalidAddress();

        usdc = IERC20(_usdc);
        // Note: decimals check removed — Arc EVM returns 0 for EOA calls,
        // triggering false reverts. Pass the correct USDC address (6 decimals).

        feeRecipient        = _feeRecipient;
        graduationRecipient = _graduationRecipient;
        protocolFeeBps      = DEFAULT_PROTOCOL_FEE_BPS;
        graduationThreshold = DEFAULT_GRADUATION_THRESHOLD;
    }

    // ── Launch ────────────────────────────────────────────────────────

    function launchToken(LaunchParams calldata p)
        external
        nonReentrant
        whenNotPaused
        returns (address token)
    {
        if (bytes(p.name).length   == 0 || bytes(p.symbol).length == 0) revert InvalidToken();
        if (bytes(p.name).length   > 64 || bytes(p.symbol).length > 16) revert InvalidToken();
        if (p.graduationThresholdUsdc != 0 && p.graduationThresholdUsdc < 1_000e6) revert InvalidAmount();

        // Validate + compute allocations in a separate frame (avoids stack overflow)
        LaunchAllocations memory a = _validateAndCompute(p);

        if (creationFee > 0) {
            usdc.safeTransferFrom(msg.sender, feeRecipient, creationFee);
        }

        // Deploy token in a separate frame (struct pointer = 1 stack slot)
        token = _deployToken(p, a.supply);

        if (isLaunchedToken[token]) revert TokenAlreadyExists();

        if (a.creatorTokens > 0) {
            IERC20(token).safeTransfer(msg.sender, a.creatorTokens);
        }

        tokenStates[token] = TokenState({
            creator:                   msg.sender,
            virtualUsdcReserves:       INITIAL_VIRTUAL_USDC_RESERVES,
            virtualTokenReserves:      INITIAL_VIRTUAL_TOKEN_RESERVES,
            realUsdcRaised:            0,
            realTokensSold:            0,
            graduated:                 false,
            createdAt:                 block.timestamp,
            curveTokens:               a.curveTokens,
            graduationTokens:          a.graduationTokens,
            creatorTokens:             a.creatorTokens,
            totalSupply:               a.supply,
            tokenGraduationThreshold:  a.gradThresh
        });

        isLaunchedToken[token] = true;
        _launchedTokens.push(token);

        emit TokenLaunchedV2(
            token,
            msg.sender,
            a.supply,
            a.curveTokens,
            a.graduationTokens,
            a.creatorTokens,
            a.gradThresh,
            block.timestamp
        );
    }

    // ── Trade ─────────────────────────────────────────────────────────

    function buyTokens(address token, uint256 minTokensOut)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 usdcIn, uint256 tokensOut)
    {
        TokenState storage state = _activeTokenState(token);

        usdcIn = _spendableUsdc(msg.sender);
        if (usdcIn == 0) revert InvalidAmount();

        uint256 fee          = (usdcIn * protocolFeeBps) / BPS_DENOMINATOR;
        uint256 usdcForCurve = usdcIn - fee;

        tokensOut = _getBuyAmount(state.virtualUsdcReserves, state.virtualTokenReserves, usdcForCurve);
        if (tokensOut < minTokensOut)                          revert SlippageExceeded();
        if (state.realTokensSold + tokensOut > state.curveTokens) revert CurveSupplyExceeded();
        if (IERC20(token).balanceOf(address(this)) < tokensOut)   revert InsufficientTokenLiquidity();

        state.virtualUsdcReserves  += usdcForCurve;
        state.virtualTokenReserves -= tokensOut;
        state.realUsdcRaised       += usdcForCurve;
        state.realTokensSold       += tokensOut;

        usdc.safeTransferFrom(msg.sender, address(this), usdcIn);
        if (fee > 0) usdc.safeTransfer(feeRecipient, fee);
        IERC20(token).safeTransfer(msg.sender, tokensOut);

        emit TokensBought(
            token, msg.sender, usdcIn, tokensOut,
            _priceFromReserves(state.virtualUsdcReserves, state.virtualTokenReserves)
        );

        if (state.realUsdcRaised >= state.tokenGraduationThreshold) {
            _graduateToken(token, state);
        }
    }

    function sellTokens(address token, uint256 tokensIn, uint256 minUsdcOut)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 usdcOutNet)
    {
        TokenState storage state = _activeTokenState(token);

        if (tokensIn == 0 || tokensIn > state.realTokensSold) revert InvalidAmount();

        uint256 usdcOutGross = _getSellAmount(state.virtualUsdcReserves, state.virtualTokenReserves, tokensIn);
        if (usdcOutGross == 0)                    revert InvalidAmount();
        if (usdcOutGross > state.realUsdcRaised)  revert InsufficientUsdcLiquidity();

        uint256 fee = (usdcOutGross * protocolFeeBps) / BPS_DENOMINATOR;
        usdcOutNet  = usdcOutGross - fee;

        if (usdcOutNet < minUsdcOut) revert SlippageExceeded();

        state.virtualUsdcReserves  -= usdcOutGross;
        state.virtualTokenReserves += tokensIn;
        state.realUsdcRaised       -= usdcOutGross;
        state.realTokensSold       -= tokensIn;

        IERC20(token).safeTransferFrom(msg.sender, address(this), tokensIn);
        if (fee > 0) usdc.safeTransfer(feeRecipient, fee);
        usdc.safeTransfer(msg.sender, usdcOutNet);

        emit TokensSold(
            token, msg.sender, tokensIn, usdcOutNet,
            _priceFromReserves(state.virtualUsdcReserves, state.virtualTokenReserves)
        );
    }

    // ── Graduation ────────────────────────────────────────────────────

    function claimGraduation(address token) external nonReentrant {
        uint256 usdcAmt  = pendingGraduationUsdc[token];
        uint256 tokenAmt = pendingGraduationTokens[token];
        if (usdcAmt == 0 && tokenAmt == 0) revert InvalidToken();

        pendingGraduationUsdc[token]   = 0;
        pendingGraduationTokens[token] = 0;

        if (usdcAmt  > 0) usdc.safeTransfer(graduationRecipient, usdcAmt);
        if (tokenAmt > 0) IERC20(token).safeTransfer(graduationRecipient, tokenAmt);

        emit GraduationClaimed(token, graduationRecipient, usdcAmt, tokenAmt);
    }

    // ── Views ─────────────────────────────────────────────────────────

    function getTokenPrice(address token) external view returns (uint256) {
        TokenState storage s = _validTokenState(token);
        return _priceFromReserves(s.virtualUsdcReserves, s.virtualTokenReserves);
    }

    function getBuyQuote(address token, uint256 usdcIn) external view returns (uint256 tokensOut) {
        TokenState storage s = _activeTokenState(token);
        if (usdcIn == 0) return 0;
        uint256 usdcForCurve = usdcIn - (usdcIn * protocolFeeBps) / BPS_DENOMINATOR;
        tokensOut = _getBuyAmount(s.virtualUsdcReserves, s.virtualTokenReserves, usdcForCurve);
        uint256 remaining = s.curveTokens - s.realTokensSold;
        if (tokensOut > remaining) tokensOut = remaining;
    }

    function getSellQuote(address token, uint256 tokensIn) external view returns (uint256 usdcOutNet) {
        TokenState storage s = _activeTokenState(token);
        if (tokensIn == 0 || tokensIn > s.realTokensSold) return 0;
        uint256 gross = _getSellAmount(s.virtualUsdcReserves, s.virtualTokenReserves, tokensIn);
        if (gross > s.realUsdcRaised) gross = s.realUsdcRaised;
        usdcOutNet = gross - (gross * protocolFeeBps) / BPS_DENOMINATOR;
    }

    function getMarketCap(address token) external view returns (uint256 marketCapUsdc6) {
        TokenState storage s = _validTokenState(token);
        marketCapUsdc6 = (s.realTokensSold * _priceFromReserves(s.virtualUsdcReserves, s.virtualTokenReserves)) / 1e30;
    }

    function getProgress(address token) external view returns (uint256) {
        TokenState storage s = _validTokenState(token);
        if (graduationThreshold == 0) return 1e18;
        uint256 p = (s.realUsdcRaised * 1e18) / graduationThreshold;
        return p > 1e18 ? 1e18 : p;
    }

    function getTokenState(address token) external view returns (TokenState memory) {
        return _validTokenState(token);
    }

    function allTokens() external view returns (address[] memory) {
        return _launchedTokens;
    }

    }


    // ── Admin ─────────────────────────────────────────────────────────

    function setCreationFee(uint256 fee) external onlyOwner {
        creationFee = fee;
        emit CreationFeeUpdated(fee);
    }

    function setProtocolFeeBps(uint256 bps) external onlyOwner {
        if (bps > MAX_PROTOCOL_FEE_BPS) revert InvalidFeeBps();
        protocolFeeBps = bps;
        emit ProtocolFeeUpdated(bps);
    }

    function proposeFeeRecipient(address recipient) external onlyOwner {
        if (recipient == address(0)) revert InvalidAddress();
        pendingFeeRecipient = recipient;
        emit FeeRecipientProposed(recipient);
    }

    function acceptFeeRecipient() external {
        if (msg.sender != pendingFeeRecipient) revert InvalidAddress();
        feeRecipient        = pendingFeeRecipient;
        pendingFeeRecipient = address(0);
        emit FeeRecipientUpdated(feeRecipient);
    }

    function proposeGraduationRecipient(address recipient) external onlyOwner {
        if (recipient == address(0)) revert InvalidAddress();
        pendingGraduationRecipient = recipient;
        emit GraduationRecipientProposed(recipient);
    }

    function acceptGraduationRecipient() external {
        if (msg.sender != pendingGraduationRecipient) revert InvalidAddress();
        graduationRecipient        = pendingGraduationRecipient;
        pendingGraduationRecipient = address(0);
        emit GraduationRecipientUpdated(graduationRecipient);
    }

    function setGraduationThreshold(uint256 threshold) external onlyOwner {
        if (threshold < 1_000e6) revert InvalidAmount();
        graduationThreshold = threshold;
        emit GraduationThresholdUpdated(threshold);
    }

    function pause() external onlyOwner {
        pausedAt = block.timestamp;
        _pause();
    }

    function unpause() external onlyOwner {
        pausedAt = 0;
        _unpause();
    }

    function emergencyUnpause() external {
        if (!paused()) revert InvalidAmount();
        if (block.timestamp < pausedAt + MAX_PAUSE_DURATION) revert InvalidAmount();
        pausedAt = 0;
        _unpause();
    }

    // ── Internal helpers ──────────────────────────────────────────────

    /// @dev Validates BPS constraints and computes token allocations.
    ///      Own call frame keeps launchToken's stack shallow.
    function _validateAndCompute(LaunchParams calldata p)
        internal
        view
        returns (LaunchAllocations memory a)
    {
        uint256 supply = p.totalSupply == 0 ? 1_000_000_000e18 : p.totalSupply;
        if (supply < 1_000_000e18 || supply > 100_000_000_000e18) revert InvalidSupply();

        uint256 curveBps   = p.curveAllocationBps   == 0 ? 8000 : p.curveAllocationBps;
        uint256 creatorBps = p.creatorAllocationBps;

        if (curveBps < 5000 || curveBps > 9500)  revert InvalidAllocation();
        if (creatorBps > 1000)                     revert InvalidAllocation();
        if (curveBps + creatorBps > 9500)          revert InvalidAllocation();

        uint256 curveTokens   = (supply * curveBps)  / BPS_DENOMINATOR;
        uint256 creatorTokens = (supply * creatorBps) / BPS_DENOMINATOR;

        a.supply           = supply;
        a.curveTokens      = curveTokens;
        a.creatorTokens    = creatorTokens;
        a.graduationTokens = supply - curveTokens - creatorTokens;
        a.gradThresh       = p.graduationThresholdUsdc == 0
            ? graduationThreshold
            : p.graduationThresholdUsdc;
    }

    /// @dev Deploys a GlowToken.
    ///      Key fix: build TokenMetadata field-by-field so only 2–3 stack
    ///      slots are live at any moment, then pass the struct pointer (1 slot)
    ///      to the constructor instead of 10 individual arguments (17+ slots).
    function _deployToken(LaunchParams calldata p, uint256 supply)
        internal
        returns (address)
    {
        TokenMetadata memory meta;
        meta.name        = p.name;
        meta.symbol      = p.symbol;
        meta.description = p.description;
        meta.imageUri    = p.imageUri;
        meta.twitter     = p.twitter;
        meta.telegram    = p.telegram;
        meta.website     = p.website;

        return address(new GlowToken(meta, msg.sender, address(this), supply));
    }

    function _graduateToken(address token, TokenState storage state) internal {
        uint256 thresh = state.tokenGraduationThreshold == 0
            ? graduationThreshold
            : state.tokenGraduationThreshold;
        if (state.realUsdcRaised < thresh) return;

        state.graduated      = true;
        uint256 pooledUsdc   = state.realUsdcRaised;
        state.realUsdcRaised = 0;

        uint256 tokenAmt                   = IERC20(token).balanceOf(address(this));
        pendingGraduationUsdc[token]        = pooledUsdc;
        pendingGraduationTokens[token]      = tokenAmt;

        emit TokenGraduated(token, graduationRecipient, pooledUsdc, tokenAmt, block.timestamp);
    }

    function _activeTokenState(address token) internal view returns (TokenState storage state) {
        state = _validTokenState(token);
        if (state.graduated) revert TokenAlreadyGraduated();
    }


    function _validTokenState(address token) internal view returns (TokenState storage state) {
        if (!isLaunchedToken[token]) revert InvalidToken();
        state = tokenStates[token];
    }

    function _priceFromReserves(uint256 uR, uint256 tR) internal pure returns (uint256) {
        return (uR * 1e30) / tR;
    }

    function _getBuyAmount(uint256 uR, uint256 tR, uint256 uIn) internal pure returns (uint256) {
        return (tR * uIn) / (uR + uIn);
    }

    function _getSellAmount(uint256 uR, uint256 tR, uint256 tIn) internal pure returns (uint256) {
        return (uR * tIn) / (tR + tIn);
    }

    function _spendableUsdc(address buyer) internal view returns (uint256) {
        uint256 a = usdc.allowance(buyer, address(this));
        uint256 b = usdc.balanceOf(buyer);
        return a < b ? a : b;
    }
}
