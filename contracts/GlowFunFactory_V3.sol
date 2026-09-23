// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * ██████  ██       ██████  ██     ██ ███████ ██    ██ ███    ██
 * ██       ██      ██    ██ ██     ██ ██      ██    ██ ████   ██
 * ██   ███ ██      ██    ██ ██  █  ██ █████   ██    ██ ██ ██  ██
 * ██    ██ ██      ██    ██ ██ ███ ██ ██      ██    ██ ██  ██ ██
 *  ██████  ███████  ██████   ███ ███  ██       ██████  ██   ████
 *
 * GlowFun Factory V3 — Arc Mainnet (Chain 5042)
 * USDC-powered bonding curve token launchpad
 *
 * Changes from V2:
 *  ✓ No hardcoded limits — owner sets any value, any time
 *  ✓ Individual setters — change one thing without touching the rest
 *  ✓ graduationThreshold = 0  → instant Uniswap listing on launch
 *  ✓ updateConfig still works as a batch setter
 *  ✓ protocolFeeBps used consistently in both buy AND sell
 *  ✓ All V2 functionality preserved
 */

import {ERC20}         from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20}        from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata}from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20}     from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable}       from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable}      from "@openzeppelin/contracts/utils/Pausable.sol";

// ─────────────────────────────────────────────────────────────────────────────
// GlowToken  (unchanged from V2 — fully compatible)
// ─────────────────────────────────────────────────────────────────────────────
struct TokenMetadata {
    string name;
    string symbol;
    string description;
    string imageUri;
    string twitter;
    string telegram;
    string website;
}

contract GlowToken is ERC20 {
    error ZeroAddress();
    error NotFactory();
    error TransferLocked();

    address public immutable factory;
    address public immutable creator;
    uint256 public immutable createdAt;

    string public description;
    string public imageUri;
    string public twitter;
    string public telegram;
    string public website;
    bool   public locked;

    constructor(
        TokenMetadata memory meta,
        address creator_,
        address factory_,
        uint256 totalSupply_
    ) ERC20(meta.name, meta.symbol) {
        if (creator_ == address(0) || factory_ == address(0)) revert ZeroAddress();
        creator     = creator_;
        factory     = factory_;
        createdAt   = block.timestamp;
        description = meta.description;
        imageUri    = meta.imageUri;
        twitter     = meta.twitter;
        telegram    = meta.telegram;
        website     = meta.website;
        _mint(factory_, totalSupply_);
    }

    event MetadataUpdated(address indexed token, string imageUri, string description);
    event URIUpdated(string contractURI);

    function setLocked(bool _locked) external {
        if (msg.sender != factory) revert NotFactory();
        locked = _locked;
    }

    /// @notice ERC-7572 on-chain metadata — wallets read this for the logo
    function contractURI() external view returns (string memory) {
        return string(abi.encodePacked(
            'data:application/json;utf8,{"name":"', name(),
            '","symbol":"', symbol(),
            '","description":"', description,
            '","image":"', imageUri,
            '","twitter":"', twitter,
            '","telegram":"', telegram,
            '","website":"', website,
            '","creator":"', _toHexString(creator),
            '"}'
        ));
    }

    function updateMetadata(
        string calldata _imageUri,
        string calldata _description,
        string calldata _twitter,
        string calldata _telegram,
        string calldata _website
    ) external {
        if (msg.sender != creator && msg.sender != factory) revert NotFactory();
        if (bytes(_imageUri).length    > 0) imageUri    = _imageUri;
        if (bytes(_description).length > 0) description = _description;
        if (bytes(_twitter).length     > 0) twitter     = _twitter;
        if (bytes(_telegram).length    > 0) telegram    = _telegram;
        if (bytes(_website).length     > 0) website     = _website;
        emit MetadataUpdated(address(this), imageUri, description);
        emit URIUpdated(string(abi.encodePacked(
            'data:application/json;utf8,{"name":"', name(), '","image":"', imageUri, '"}'
        )));
    }

    function _update(address from, address to, uint256 value) internal override {
        if (locked
            && from != address(0)
            && to   != address(0)
            && from != factory
            && to   != factory
            && from != creator
            && to   != creator
        ) revert TransferLocked();
        super._update(from, to, value);
    }

    function _toHexString(address addr) internal pure returns (string memory) {
        bytes memory buf = new bytes(42);
        buf[0] = '0'; buf[1] = 'x';
        for (uint256 i = 0; i < 20; i++) {
            uint8 b = uint8(uint160(addr) >> (8 * (19 - i)));
            buf[2 + i * 2]     = _hexChar(b >> 4);
            buf[2 + i * 2 + 1] = _hexChar(b & 0x0f);
        }
        return string(buf);
    }

    function _hexChar(uint8 v) internal pure returns (bytes1) {
        return v < 10 ? bytes1(v + 48) : bytes1(v + 87);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// GlowFunFactory_V3
// ─────────────────────────────────────────────────────────────────────────────
contract GlowFunFactory_V3 is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ── Constants ────────────────────────────────────────────────────────────
    uint256 public constant VERSION             = 3;
    uint256 public constant BPS_DENOMINATOR     = 10_000;
    uint256 public constant INITIAL_VIRTUAL_USDC_RESERVES   = 30_000e6;
    uint256 public constant INITIAL_VIRTUAL_TOKEN_RESERVES  = 1_073_000_191e18;
    uint256 public constant MAX_PAUSE_DURATION  = 7 days;

    // ── Errors ───────────────────────────────────────────────────────────────
    error NotLaunched();
    error AlreadyLaunched();
    error TokenAlreadyGraduated();
    error InsufficientOutput();
    error InvalidAmount();
    error InvalidAddress();
    error InvalidToken();
    error InvalidSupply();
    error InvalidAllocation();
    error Blacklisted();
    error CooldownActive();
    error MaxBuyExceeded();
    error NothingToClaim();
    error PauseNotExpired();
    error Unauthorized();

    // ── Structs ──────────────────────────────────────────────────────────────
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
        uint256 tokenGraduationThreshold;  // 0 = instant, else USDC target
        bool    creatorTokensLocked;
        uint256 creatorLockExpiry;
    }

    struct LaunchParams {
        string  name;
        string  symbol;
        string  description;
        string  imageUri;
        string  twitter;
        string  telegram;
        string  website;
        uint256 totalSupply;            // 0 → default 1B
        uint256 curveAllocationBps;     // 0 → default 8000 (80%)
        uint256 creatorAllocationBps;   // 0 → no creator allocation
        /// @dev 0 = instant graduation (uses global graduationThreshold).
        ///      If global is also 0, caller must provide initialLiquidityUsdc.
        uint256 graduationThresholdUsdc;
        /// @dev USDC sent by creator at launch to seed Uniswap instantly (only when threshold==0).
        uint256 initialLiquidityUsdc;
    }

    struct LaunchAllocations {
        uint256 supply;
        uint256 curveTokens;
        uint256 graduationTokens;
        uint256 creatorTokens;
    }

    struct BuyFees {
        uint256 snipeTax;
        uint256 protocolFee;
        uint256 referralFee;
        uint256 usdcForCurve;
        uint256 feeToRecipient;
    }

    // ── Config (all settable by owner, NO hardcoded limits) ──────────────────
    IERC20  public immutable usdc;

    address public feeRecipient;
    address public graduationRecipient;

    uint256 public graduationThreshold;       // 0 = instant graduation globally
    uint256 public protocolFeeBps;            // buy + sell fee
    uint256 public creationFee;               // USDC paid at launch
    uint256 public creatorGraduationFeeBps;   // % of raised USDC to creator on grad
    uint256 public referralFeeBps;            // % of protocol fee to referrer
    uint256 public antiSnipeDuration;         // seconds after launch with snipe tax
    uint256 public antiSnipeTaxBps;           // extra tax during snipe window
    uint256 public maxBuyBps;                 // max single buy as % of curve supply (0 = off)
    uint256 public buyCooldown;               // seconds between buys per wallet (0 = off)
    uint256 public creatorLockDuration;       // seconds creator tokens are locked (0 = no lock)
    uint256 public perTokenGraduationFeeBps;  // platform fee taken from pooled USDC on graduation

    address public pendingFeeRecipient;
    address public pendingGraduationRecipient;

    uint256 public pausedAt;

    // ── State ─────────────────────────────────────────────────────────────────
    address[]                              public launchedTokens;
    mapping(address => bool)               public isLaunchedToken;
    mapping(address => TokenState)         public tokenStates;
    mapping(address => bool)               public blacklistedTokens;
    mapping(address => bool)               public blacklistedWallets;
    mapping(address => mapping(address => uint256)) public lastBuyTime;
    mapping(address => uint256)            public referralEarnings;
    mapping(address => uint256)            public pendingGraduationUsdc;
    mapping(address => uint256)            public pendingGraduationTokens;
    mapping(address => address)            public pendingGraduationCreator;
    mapping(address => uint256)            public pendingCreatorGraduationUsdc;
    address                                public kingOfHill;
    uint256                                public kingOfHillRaised;
    mapping(address => uint8)  private    _milestoneMask;

    // ── Events ────────────────────────────────────────────────────────────────
    event TokenLaunched(address indexed token, address indexed creator, string name, string symbol, uint256 totalSupply, uint256 curveTokens, uint256 graduationTokens, uint256 creatorTokens, uint256 graduationThreshold_, uint256 timestamp);
    event TokensBought(address indexed token, address indexed buyer, address indexed referrer, uint256 usdcIn, uint256 tokensOut, uint256 price, uint256 protocolFee, uint256 referralFee, uint256 antiSnipeFee, uint256 newRealUsdcRaised, uint256 timestamp);
    event TokensSold(address indexed token, address indexed seller, uint256 tokensIn, uint256 usdcOut, uint256 price, uint256 protocolFee, uint256 newRealUsdcRaised, uint256 timestamp);
    event TokenGraduated(address indexed token, address indexed creator, uint256 usdcRaised, uint256 tokenAmount, uint256 timestamp);
    event GraduationClaimed(address indexed token, address indexed recipient, uint256 usdcAmount, uint256 tokenAmount);
    event CreatorGraduationClaimed(address indexed token, address indexed creator, uint256 usdcAmount);
    event ReferralEarned(address indexed referrer, address indexed token, uint256 amount);
    event TokenBlacklisted(address indexed token, bool blacklisted);
    event WalletBlacklisted(address indexed wallet, bool blacklisted);
    event MilestoneReached(address indexed token, uint256 progressBps, uint256 realUsdcRaised);
    event KingOfHill(address indexed token, uint256 realUsdcRaised, uint256 timestamp);
    event FeeRecipientProposed(address indexed proposed);
    event FeeRecipientUpdated(address indexed newRecipient);
    event GraduationRecipientProposed(address indexed proposed);
    event GraduationRecipientUpdated(address indexed newRecipient);
    event ConfigUpdated(string field, uint256 value);

    // ── Constructor ───────────────────────────────────────────────────────────
    constructor(
        address _usdc,
        address _feeRecipient,
        address _graduationRecipient,
        address _owner
    ) Ownable(_owner) {
        if (_usdc == address(0) || _feeRecipient == address(0) ||
            _graduationRecipient == address(0) || _owner == address(0))
            revert InvalidAddress();

        // Enforce USDC (6 decimals) — only check, not a limit
        try IERC20Metadata(_usdc).decimals() returns (uint8 d) {
            if (d != 6) revert InvalidToken();
        } catch { revert InvalidToken(); }

        usdc                     = IERC20(_usdc);
        feeRecipient             = _feeRecipient;
        graduationRecipient      = _graduationRecipient;

        // Sensible defaults — owner can change any of these freely
        graduationThreshold      = 69_000e6;   // $69,000 USDC
        protocolFeeBps           = 100;         // 1%
        creationFee              = 10e6;        // $10 USDC
        creatorGraduationFeeBps  = 500;         // 5% of raised USDC on graduation
        referralFeeBps           = 2500;        // 25% of protocol fee to referrer
        antiSnipeDuration        = 60;          // 60-second snipe window
        antiSnipeTaxBps          = 500;         // 5% extra snipe tax
        maxBuyBps                = 500;         // max 5% of curve per buy
        buyCooldown              = 30;          // 30-second cooldown
        creatorLockDuration      = 7 days;      // 7-day creator lock
        perTokenGraduationFeeBps = 100;         // 1% platform fee on graduation
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CORE FUNCTIONS
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Launch a new bonding-curve token
    function launchToken(LaunchParams calldata p)
        external nonReentrant whenNotPaused
        returns (address token)
    {
        if (bytes(p.name).length   == 0 || bytes(p.symbol).length == 0) revert InvalidToken();
        if (bytes(p.name).length   > 64 || bytes(p.symbol).length > 16) revert InvalidToken();

        // Resolve threshold: per-token override → global → 0 (instant)
        uint256 resolvedThreshold = p.graduationThresholdUsdc > 0
            ? p.graduationThresholdUsdc
            : graduationThreshold;

        bool instantMode = (resolvedThreshold == 0);
        if (instantMode && p.initialLiquidityUsdc == 0) revert InvalidAmount();

        LaunchAllocations memory a = _validateAndCompute(p);

        // Collect fees upfront
        if (creationFee > 0) usdc.safeTransferFrom(msg.sender, feeRecipient, creationFee);
        if (instantMode)     usdc.safeTransferFrom(msg.sender, address(this), p.initialLiquidityUsdc);

        token = _deployToken(p, a.supply);
        if (isLaunchedToken[token]) revert AlreadyLaunched();
        isLaunchedToken[token] = true;

        TokenState storage state = tokenStates[token];
        state.creator                  = msg.sender;
        state.virtualUsdcReserves      = INITIAL_VIRTUAL_USDC_RESERVES;
        state.virtualTokenReserves     = INITIAL_VIRTUAL_TOKEN_RESERVES;
        state.createdAt                = block.timestamp;
        state.curveTokens              = a.curveTokens;
        state.graduationTokens         = a.graduationTokens;
        state.creatorTokens            = a.creatorTokens;
        state.totalSupply              = a.supply;
        state.tokenGraduationThreshold = resolvedThreshold;

        if (a.creatorTokens > 0) {
            IERC20(token).safeTransfer(msg.sender, a.creatorTokens);
            if (creatorLockDuration > 0) {
                state.creatorTokensLocked = true;
                state.creatorLockExpiry   = block.timestamp + creatorLockDuration;
                GlowToken(token).setLocked(true);
            }
        }

        launchedTokens.push(token);
        emit TokenLaunched(token, msg.sender, p.name, p.symbol, a.supply, a.curveTokens, a.graduationTokens, a.creatorTokens, resolvedThreshold, block.timestamp);

        if (instantMode) {
            state.realUsdcRaised = p.initialLiquidityUsdc;
            _graduateToken(token);
        }
    }

    /// @notice Buy tokens from bonding curve. Contract reads USDC allowance automatically.
    function buyTokens(address token, uint256 minTokensOut, address referrer)
        external nonReentrant whenNotPaused
        returns (uint256 usdcIn, uint256 tokensOut)
    {
        TokenState storage state = _activeTokenState(token);
        _checkBlacklist(token, msg.sender);
        if (buyCooldown > 0 && block.timestamp < lastBuyTime[token][msg.sender] + buyCooldown)
            revert CooldownActive();

        usdcIn = _spendableUsdc(msg.sender);
        if (usdcIn == 0) revert InvalidAmount();

        BuyFees memory f = _calcBuyFees(usdcIn, state.createdAt);
        if (f.usdcForCurve == 0) revert InvalidAmount();

        tokensOut = _getBuyAmount(state.virtualUsdcReserves, state.virtualTokenReserves, f.usdcForCurve);
        if (tokensOut < minTokensOut) revert InsufficientOutput();
        _validateBuySize(state, tokensOut, token);

        lastBuyTime[token][msg.sender]  = block.timestamp;
        state.virtualUsdcReserves      += f.usdcForCurve;
        state.virtualTokenReserves     -= tokensOut;
        state.realUsdcRaised           += f.usdcForCurve;
        state.realTokensSold           += tokensOut;

        if (referrer != address(0) && referrer != msg.sender) {
            f.referralFee               = (f.protocolFee * referralFeeBps) / BPS_DENOMINATOR;
            referralEarnings[referrer] += f.referralFee;
            emit ReferralEarned(referrer, token, f.referralFee);
        }
        f.feeToRecipient = f.snipeTax + (f.protocolFee - f.referralFee);

        usdc.safeTransferFrom(msg.sender, address(this), usdcIn);
        if (f.feeToRecipient > 0) usdc.safeTransfer(feeRecipient, f.feeToRecipient);
        IERC20(token).safeTransfer(msg.sender, tokensOut);

        emit TokensBought(token, msg.sender, referrer, usdcIn, tokensOut,
            _priceFromReserves(state.virtualUsdcReserves, state.virtualTokenReserves),
            f.protocolFee, f.referralFee, f.snipeTax, state.realUsdcRaised, block.timestamp);

        _updateKingOfHill(token, state.realUsdcRaised);
        _emitMilestones(token, state.realUsdcRaised);

        // Graduate if threshold hit (also handles threshold=0 edge case: won't fire because instantMode used)
        if (state.tokenGraduationThreshold > 0 &&
            state.realUsdcRaised >= state.tokenGraduationThreshold)
            _graduateToken(token);
    }

    /// @notice Sell tokens back to bonding curve for USDC
    function sellTokens(address token, uint256 tokensIn, uint256 minUsdcOut)
        external nonReentrant whenNotPaused
        returns (uint256 usdcOut)
    {
        TokenState storage state = _activeTokenState(token);
        _checkBlacklist(token, msg.sender);
        if (tokensIn == 0 || tokensIn > state.realTokensSold) revert InvalidAmount();

        uint256 gross = _getSellAmount(state.virtualUsdcReserves, state.virtualTokenReserves, tokensIn);
        if (gross == 0 || gross > state.realUsdcRaised) revert InvalidAmount();

        uint256 fee = (gross * protocolFeeBps) / BPS_DENOMINATOR;
        usdcOut     = gross - fee;
        if (usdcOut < minUsdcOut) revert InsufficientOutput();

        state.virtualUsdcReserves  -= gross;
        state.virtualTokenReserves += tokensIn;
        state.realUsdcRaised       -= gross;
        state.realTokensSold       -= tokensIn;

        IERC20(token).safeTransferFrom(msg.sender, address(this), tokensIn);
        if (fee > 0) usdc.safeTransfer(feeRecipient, fee);
        usdc.safeTransfer(msg.sender, usdcOut);

        emit TokensSold(token, msg.sender, tokensIn, usdcOut,
            _priceFromReserves(state.virtualUsdcReserves, state.virtualTokenReserves),
            fee, state.realUsdcRaised, block.timestamp);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CLAIMS
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice graduationRecipient claims USDC + tokens after graduation to seed Uniswap
    function claimGraduation(address token) external nonReentrant {
        if (msg.sender != graduationRecipient) revert Unauthorized();
        uint256 u = pendingGraduationUsdc[token];
        uint256 t = pendingGraduationTokens[token];
        if (u == 0 && t == 0) revert NothingToClaim();
        pendingGraduationUsdc[token]   = 0;
        pendingGraduationTokens[token] = 0;
        if (u > 0) usdc.safeTransfer(graduationRecipient, u);
        if (t > 0) IERC20(token).safeTransfer(graduationRecipient, t);
        emit GraduationClaimed(token, graduationRecipient, u, t);
    }

    /// @notice Token creator claims their USDC bonus after graduation
    function claimCreatorGraduation(address token) external nonReentrant {
        if (msg.sender != pendingGraduationCreator[token]) revert Unauthorized();
        uint256 amount = pendingCreatorGraduationUsdc[token];
        if (amount == 0) revert NothingToClaim();
        pendingCreatorGraduationUsdc[token] = 0;
        usdc.safeTransfer(msg.sender, amount);
        emit CreatorGraduationClaimed(token, msg.sender, amount);
    }

    /// @notice Referrers claim accumulated USDC earnings
    function claimReferral() external nonReentrant {
        uint256 amount = referralEarnings[msg.sender];
        if (amount == 0) revert NothingToClaim();
        referralEarnings[msg.sender] = 0;
        usdc.safeTransfer(msg.sender, amount);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TOKEN MANAGEMENT
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Creator or owner can update token's image, description, and social links
    function updateTokenMetadata(
        address token,
        string calldata _imageUri,
        string calldata _description,
        string calldata _twitter,
        string calldata _telegram,
        string calldata _website
    ) external {
        if (!isLaunchedToken[token]) revert NotLaunched();
        if (msg.sender != tokenStates[token].creator && msg.sender != owner()) revert Unauthorized();
        GlowToken(token).updateMetadata(_imageUri, _description, _twitter, _telegram, _website);
    }

    /// @notice Creator unlocks their allocation after the lock period expires
    function unlockCreatorTokens(address token) external {
        if (!isLaunchedToken[token]) revert NotLaunched();
        TokenState storage state = tokenStates[token];
        if (msg.sender != state.creator) revert Unauthorized();
        if (!state.creatorTokensLocked) return;
        if (block.timestamp < state.creatorLockExpiry) revert PauseNotExpired();
        state.creatorTokensLocked = false;
        GlowToken(token).setLocked(false);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // GRADUATION HELPERS
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Owner force-graduates any token (pays USDC gap from their wallet)
    function forceGraduate(address token) external onlyOwner nonReentrant {
        if (!isLaunchedToken[token]) revert NotLaunched();
        TokenState storage state = tokenStates[token];
        if (state.graduated) revert TokenAlreadyGraduated();
        uint256 thresh = state.tokenGraduationThreshold;
        if (thresh > 0 && state.realUsdcRaised < thresh) {
            uint256 gap = thresh - state.realUsdcRaised;
            usdc.safeTransferFrom(msg.sender, address(this), gap);
            state.virtualUsdcReserves += gap;
            state.realUsdcRaised       = thresh;
        }
        _graduateToken(token);
    }

    /// @notice Token creator force-graduates their own token (pays USDC gap)
    function creatorForceGraduate(address token) external nonReentrant {
        if (!isLaunchedToken[token]) revert NotLaunched();
        TokenState storage state = tokenStates[token];
        if (state.graduated)           revert TokenAlreadyGraduated();
        if (msg.sender != state.creator) revert Unauthorized();
        uint256 thresh = state.tokenGraduationThreshold;
        if (thresh > 0 && state.realUsdcRaised < thresh) {
            uint256 gap = thresh - state.realUsdcRaised;
            usdc.safeTransferFrom(msg.sender, address(this), gap);
            state.virtualUsdcReserves += gap;
            state.realUsdcRaised       = thresh;
        }
        _graduateToken(token);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ADMIN — INDIVIDUAL SETTERS (no limits, no validation — owner controls all)
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Set graduation threshold. 0 = instant Uniswap listing on every launch.
    function setGraduationThreshold(uint256 value) external onlyOwner {
        graduationThreshold = value;
        emit ConfigUpdated("graduationThreshold", value);
    }

    /// @notice Set protocol fee for buys and sells. 100 = 1%.
    function setProtocolFeeBps(uint256 value) external onlyOwner {
        protocolFeeBps = value;
        emit ConfigUpdated("protocolFeeBps", value);
    }

    /// @notice Set USDC creation fee per token launch. 10e6 = $10.
    function setCreationFee(uint256 value) external onlyOwner {
        creationFee = value;
        emit ConfigUpdated("creationFee", value);
    }

    /// @notice Set % of raised USDC sent to creator on graduation. 500 = 5%.
    function setCreatorGraduationFeeBps(uint256 value) external onlyOwner {
        creatorGraduationFeeBps = value;
        emit ConfigUpdated("creatorGraduationFeeBps", value);
    }

    /// @notice Set referral fee as % of protocol fee. 2500 = 25%.
    function setReferralFeeBps(uint256 value) external onlyOwner {
        referralFeeBps = value;
        emit ConfigUpdated("referralFeeBps", value);
    }

    /// @notice Set anti-snipe window duration in seconds. 0 = disabled.
    function setAntiSnipeDuration(uint256 value) external onlyOwner {
        antiSnipeDuration = value;
        emit ConfigUpdated("antiSnipeDuration", value);
    }

    /// @notice Set anti-snipe tax in BPS. 500 = 5%.
    function setAntiSnipeTaxBps(uint256 value) external onlyOwner {
        antiSnipeTaxBps = value;
        emit ConfigUpdated("antiSnipeTaxBps", value);
    }

    /// @notice Set max buy size as % of curve supply. 0 = no limit.
    function setMaxBuyBps(uint256 value) external onlyOwner {
        maxBuyBps = value;
        emit ConfigUpdated("maxBuyBps", value);
    }

    /// @notice Set cooldown between buys per wallet in seconds. 0 = no cooldown.
    function setBuyCooldown(uint256 value) external onlyOwner {
        buyCooldown = value;
        emit ConfigUpdated("buyCooldown", value);
    }

    /// @notice Set how long creator tokens are locked after launch. 0 = no lock.
    function setCreatorLockDuration(uint256 value) external onlyOwner {
        creatorLockDuration = value;
        emit ConfigUpdated("creatorLockDuration", value);
    }

    /// @notice Set platform fee taken from pooled USDC at graduation. 100 = 1%.
    function setPerTokenGraduationFeeBps(uint256 value) external onlyOwner {
        perTokenGraduationFeeBps = value;
        emit ConfigUpdated("perTokenGraduationFeeBps", value);
    }

    /// @notice Batch update all config in one transaction (no restrictions)
    function updateConfig(
        uint256 _graduationThreshold,
        uint256 _protocolFeeBps,
        uint256 _creationFee,
        uint256 _creatorGraduationFeeBps,
        uint256 _referralFeeBps,
        uint256 _antiSnipeDuration,
        uint256 _antiSnipeTaxBps,
        uint256 _maxBuyBps,
        uint256 _buyCooldown,
        uint256 _creatorLockDuration,
        uint256 _perTokenGraduationFeeBps
    ) external onlyOwner {
        graduationThreshold      = _graduationThreshold;
        protocolFeeBps           = _protocolFeeBps;
        creationFee              = _creationFee;
        creatorGraduationFeeBps  = _creatorGraduationFeeBps;
        referralFeeBps           = _referralFeeBps;
        antiSnipeDuration        = _antiSnipeDuration;
        antiSnipeTaxBps          = _antiSnipeTaxBps;
        maxBuyBps                = _maxBuyBps;
        buyCooldown              = _buyCooldown;
        creatorLockDuration      = _creatorLockDuration;
        perTokenGraduationFeeBps = _perTokenGraduationFeeBps;
        emit ConfigUpdated("all", 0);
    }

    // ── Fee recipients (2-step for safety) ───────────────────────────────────
    function proposeFeeRecipient(address proposed) external onlyOwner {
        if (proposed == address(0)) revert InvalidAddress();
        pendingFeeRecipient = proposed;
        emit FeeRecipientProposed(proposed);
    }
    function acceptFeeRecipient() external {
        if (msg.sender != pendingFeeRecipient) revert Unauthorized();
        feeRecipient = pendingFeeRecipient;
        pendingFeeRecipient = address(0);
        emit FeeRecipientUpdated(feeRecipient);
    }
    function proposeGraduationRecipient(address proposed) external onlyOwner {
        if (proposed == address(0)) revert InvalidAddress();
        pendingGraduationRecipient = proposed;
        emit GraduationRecipientProposed(proposed);
    }
    function acceptGraduationRecipient() external {
        if (msg.sender != pendingGraduationRecipient) revert Unauthorized();
        graduationRecipient = pendingGraduationRecipient;
        pendingGraduationRecipient = address(0);
        emit GraduationRecipientUpdated(graduationRecipient);
    }

    // ── Blacklist ─────────────────────────────────────────────────────────────
    function blacklistToken(address token, bool bl) external onlyOwner {
        if (!isLaunchedToken[token]) revert NotLaunched();
        blacklistedTokens[token] = bl;
        emit TokenBlacklisted(token, bl);
    }
    function blacklistWallet(address wallet, bool bl) external onlyOwner {
        if (wallet == address(0)) revert InvalidAddress();
        blacklistedWallets[wallet] = bl;
        emit WalletBlacklisted(wallet, bl);
    }

    // ── Pause ─────────────────────────────────────────────────────────────────
    function pause()   external onlyOwner { pausedAt = block.timestamp; _pause(); }
    function unpause() external onlyOwner { pausedAt = 0; _unpause(); }
    function emergencyUnpause() external {
        if (!paused() || block.timestamp < pausedAt + MAX_PAUSE_DURATION) revert PauseNotExpired();
        pausedAt = 0;
        _unpause();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // VIEW FUNCTIONS
    // ─────────────────────────────────────────────────────────────────────────

    function launchedTokensCount() external view returns (uint256) { return launchedTokens.length; }

    function getTokenPrice(address token) public view returns (uint256) {
        if (!isLaunchedToken[token]) revert NotLaunched();
        TokenState storage s = tokenStates[token];
        return _priceFromReserves(s.virtualUsdcReserves, s.virtualTokenReserves);
    }

    function getBuyQuote(address token, uint256 usdcIn) external view returns (uint256 tokensOut) {
        TokenState storage state = _activeTokenState(token);
        if (usdcIn == 0) return 0;
        uint256 snipeTax = (block.timestamp < state.createdAt + antiSnipeDuration)
            ? (usdcIn * antiSnipeTaxBps) / BPS_DENOMINATOR : 0;
        uint256 fee  = ((usdcIn - snipeTax) * protocolFeeBps) / BPS_DENOMINATOR;
        tokensOut    = _getBuyAmount(state.virtualUsdcReserves, state.virtualTokenReserves, usdcIn - fee - snipeTax);
        uint256 avail = state.curveTokens - state.realTokensSold;
        if (tokensOut > avail) tokensOut = avail;
    }

    function getSellQuote(address token, uint256 tokensIn) external view returns (uint256 usdcOut) {
        TokenState storage state = _activeTokenState(token);
        if (tokensIn == 0 || tokensIn > state.realTokensSold) return 0;
        uint256 gross = _getSellAmount(state.virtualUsdcReserves, state.virtualTokenReserves, tokensIn);
        if (gross > state.realUsdcRaised) gross = state.realUsdcRaised;
        usdcOut = gross - (gross * protocolFeeBps) / BPS_DENOMINATOR;
    }

    function getMarketCap(address token) external view returns (uint256) {
        if (!isLaunchedToken[token]) revert NotLaunched();
        return (tokenStates[token].totalSupply * getTokenPrice(token)) / 1e30;
    }

    function getProgress(address token) public view returns (uint256) {
        if (!isLaunchedToken[token]) revert NotLaunched();
        uint256 thresh = tokenStates[token].tokenGraduationThreshold;
        if (thresh == 0) return BPS_DENOMINATOR;
        uint256 p = (tokenStates[token].realUsdcRaised * BPS_DENOMINATOR) / thresh;
        return p > BPS_DENOMINATOR ? BPS_DENOMINATOR : p;
    }

    function isCreatorLocked(address token) external view returns (bool) {
        if (!isLaunchedToken[token]) revert NotLaunched();
        TokenState storage s = tokenStates[token];
        return s.creatorTokensLocked && block.timestamp < s.creatorLockExpiry;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // INTERNAL
    // ─────────────────────────────────────────────────────────────────────────

    function _graduateToken(address token) internal {
        TokenState storage state = tokenStates[token];
        if (state.graduated) revert TokenAlreadyGraduated();
        state.graduated = true;

        uint256 pooled      = state.realUsdcRaised;
        state.realUsdcRaised = 0;

        uint256 platFee     = (pooled * perTokenGraduationFeeBps) / BPS_DENOMINATOR;
        uint256 creatorBonus= ((pooled - platFee) * creatorGraduationFeeBps) / BPS_DENOMINATOR;
        uint256 dexUsdc     = pooled - platFee - creatorBonus;

        if (platFee > 0) usdc.safeTransfer(feeRecipient, platFee);

        pendingGraduationUsdc[token]        = dexUsdc;
        pendingCreatorGraduationUsdc[token] = creatorBonus;
        pendingGraduationCreator[token]     = state.creator;
        pendingGraduationTokens[token]      = IERC20(token).balanceOf(address(this));

        emit TokenGraduated(token, state.creator, pooled, pendingGraduationTokens[token], block.timestamp);

        if (pooled > kingOfHillRaised) {
            kingOfHill = token;
            kingOfHillRaised = pooled;
            emit KingOfHill(token, pooled, block.timestamp);
        }
    }

    function _validateAndCompute(LaunchParams calldata p) internal pure returns (LaunchAllocations memory a) {
        a.supply    = p.totalSupply == 0 ? 1_000_000_000e18 : p.totalSupply;
        if (a.supply < 1_000_000e18 || a.supply > 100_000_000_000e18) revert InvalidSupply();
        uint256 curveBps   = p.curveAllocationBps == 0 ? 8000 : p.curveAllocationBps;
        uint256 creatorBps = p.creatorAllocationBps;
        // Only hard limit: total can't exceed 100%
        if (curveBps < 5000 || curveBps > 9500 || creatorBps > 1000 || curveBps + creatorBps > 9500)
            revert InvalidAllocation();
        a.curveTokens      = (a.supply * curveBps)   / BPS_DENOMINATOR;
        a.creatorTokens    = (a.supply * creatorBps)  / BPS_DENOMINATOR;
        a.graduationTokens = a.supply - a.curveTokens - a.creatorTokens;
    }

    function _deployToken(LaunchParams calldata p, uint256 supply) internal returns (address) {
        return address(new GlowToken(
            TokenMetadata(p.name, p.symbol, p.description, p.imageUri, p.twitter, p.telegram, p.website),
            msg.sender, address(this), supply
        ));
    }

    function _emitMilestones(address token, uint256 raised) internal {
        uint256 thresh = tokenStates[token].tokenGraduationThreshold;
        if (thresh == 0) return;
        uint256 progress = (raised * BPS_DENOMINATOR) / thresh;
        if (progress > BPS_DENOMINATOR) progress = BPS_DENOMINATOR;
        uint8 mask = _milestoneMask[token];
        if (progress >= 2500  && (mask & 1) == 0) { mask |= 1; emit MilestoneReached(token, 2500,  raised); }
        if (progress >= 5000  && (mask & 2) == 0) { mask |= 2; emit MilestoneReached(token, 5000,  raised); }
        if (progress >= 7500  && (mask & 4) == 0) { mask |= 4; emit MilestoneReached(token, 7500,  raised); }
        if (progress >= 10000 && (mask & 8) == 0) { mask |= 8; emit MilestoneReached(token, 10000, raised); }
        _milestoneMask[token] = mask;
    }

    function _updateKingOfHill(address token, uint256 raised) internal {
        if (raised > kingOfHillRaised) {
            kingOfHill = token;
            kingOfHillRaised = raised;
            emit KingOfHill(token, raised, block.timestamp);
        }
    }

    function _validateBuySize(TokenState storage state, uint256 tokensOut, address token) internal view {
        if (maxBuyBps > 0 && tokensOut > (state.curveTokens * maxBuyBps) / BPS_DENOMINATOR)
            revert MaxBuyExceeded();
        if (tokensOut > state.curveTokens - state.realTokensSold ||
            IERC20(token).balanceOf(address(this)) < tokensOut)
            revert InvalidAmount();
    }

    function _calcBuyFees(uint256 usdcIn, uint256 createdAt_) internal view returns (BuyFees memory f) {
        if (block.timestamp < createdAt_ + antiSnipeDuration)
            f.snipeTax = (usdcIn * antiSnipeTaxBps) / BPS_DENOMINATOR;
        f.protocolFee  = ((usdcIn - f.snipeTax) * protocolFeeBps) / BPS_DENOMINATOR;
        f.usdcForCurve = usdcIn - f.protocolFee - f.snipeTax;
    }

    function _activeTokenState(address token) internal view returns (TokenState storage state) {
        if (!isLaunchedToken[token]) revert NotLaunched();
        state = tokenStates[token];
        if (state.graduated) revert TokenAlreadyGraduated();
    }

    function _checkBlacklist(address token, address wallet) internal view {
        if (blacklistedTokens[token] || blacklistedWallets[wallet]) revert Blacklisted();
    }

    function _spendableUsdc(address buyer) internal view returns (uint256) {
        uint256 allowance = usdc.allowance(buyer, address(this));
        uint256 balance   = usdc.balanceOf(buyer);
        return allowance < balance ? allowance : balance;
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
}
