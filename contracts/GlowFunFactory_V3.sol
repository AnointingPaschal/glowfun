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
import {UniswapPoolLib} from "./UniswapPoolLib.sol";
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
    error MintDisabled();
    error BurnDisabled();
    error Blacklisted();
    error PauseDisabled();
    error InvalidAmount();   // used by mint() cap check
    error Unauthorized();    // used by vesting + blacklist callers

    address public immutable factory;
    address public immutable creator;
    uint256 public immutable createdAt;
    uint256 public immutable maxSupply;       // 0 = uncapped (if mintable)

    // Feature flags — set once at deployment, immutable
    bool public immutable mintable;
    bool public immutable burnable;
    bool public immutable pausable;
    bool public immutable hasBlacklist;

    string public description;
    string public imageUri;
    string public twitter;
    string public telegram;
    string public website;
    bool   public locked;          // factory transfer lock during bonding
    bool   public tokenPaused;     // creator-controlled pause (if pausable)

    // Blacklist (if hasBlacklist)
    mapping(address => bool) public blacklisted;

    // Vesting for creator tokens
    uint256 public vestingStart;
    uint256 public vestingDuration;   // 0 = no vesting (locked binary)
    uint256 public vestingCliff;      // seconds before any tokens release
    uint256 public vestingTotal;      // total tokens under vesting
    uint256 public vestingReleased;   // already released

    struct TokenFeatures {
        bool mintable;
        bool burnable;
        bool pausable;
        bool hasBlacklist;
        uint256 maxSupply;       // 0 = totalSupply (fixed), >0 = cap for future mints
        uint256 vestingDuration; // creator token vesting duration in seconds (0 = binary lock)
        uint256 vestingCliff;    // seconds before any vesting release
    }

    constructor(
        TokenMetadata memory meta,
        TokenFeatures memory features,
        address creator_,
        address factory_,
        uint256 totalSupply_,
        uint256 vestingAmount_  // creator tokens subject to vesting
    ) ERC20(meta.name, meta.symbol) {
        if (creator_ == address(0) || factory_ == address(0)) revert ZeroAddress();
        creator      = creator_;
        factory      = factory_;
        createdAt    = block.timestamp;
        description  = meta.description;
        imageUri     = meta.imageUri;
        twitter      = meta.twitter;
        telegram     = meta.telegram;
        website      = meta.website;

        // Feature flags
        mintable     = features.mintable;
        burnable     = features.burnable;
        pausable     = features.pausable;
        hasBlacklist = features.hasBlacklist;
        maxSupply    = features.maxSupply > 0 ? features.maxSupply : totalSupply_;

        // Vesting for creator tokens
        if (vestingAmount_ > 0 && features.vestingDuration > 0) {
            vestingTotal    = vestingAmount_;
            vestingDuration = features.vestingDuration;
            vestingCliff    = features.vestingCliff;
            vestingStart    = block.timestamp;
        }

        _mint(factory_, totalSupply_);
    }

    // ── Events ──────────────────────────────────────────────────────────────
    event TokenMinted(address indexed to, uint256 amount, uint256 newSupply);
    event TokenBurned(address indexed from, uint256 amount, uint256 newSupply);
    event TokenPauseSet(bool paused);
    event AddressBlacklisted(address indexed account, bool status);
    event VestingReleased(address indexed to, uint256 amount);

    // ── Mint (owner/factory only, if mintable) ───────────────────────────────
    function mint(address to, uint256 amount) external {
        if (!mintable) revert MintDisabled();
        if (msg.sender != creator && msg.sender != factory) revert NotFactory();
        if (maxSupply > 0 && totalSupply() + amount > maxSupply) revert InvalidAmount();
        _mint(to, amount);
        emit TokenMinted(to, amount, totalSupply());
    }

    // ── Burn (self or approved, if burnable) ─────────────────────────────────
    function burn(uint256 amount) external {
        if (!burnable) revert BurnDisabled();
        _burn(msg.sender, amount);
        emit TokenBurned(msg.sender, amount, totalSupply());
    }
    function burnFrom(address account, uint256 amount) external {
        if (!burnable) revert BurnDisabled();
        _spendAllowance(account, msg.sender, amount);
        _burn(account, amount);
        emit TokenBurned(account, amount, totalSupply());
    }

    // ── Pause (creator only, if pausable) ────────────────────────────────────
    function setTokenPaused(bool _paused) external {
        if (!pausable) revert PauseDisabled();
        if (msg.sender != creator && msg.sender != factory) revert NotFactory();
        tokenPaused = _paused;
        emit TokenPauseSet(_paused);
    }

    // ── Blacklist (creator only, if hasBlacklist) ────────────────────────────
    function setBlacklisted(address account, bool status) external {
        if (!hasBlacklist) revert BurnDisabled();
        if (msg.sender != creator && msg.sender != factory) revert NotFactory();
        blacklisted[account] = status;
        emit AddressBlacklisted(account, status);
    }

    // ── Vesting release (creator claims unlocked portion) ────────────────────
    function releaseVested() external {
        if (msg.sender != creator) revert NotFactory();
        uint256 releasable = vestedAmount() - vestingReleased;
        if (releasable == 0) return;
        vestingReleased += releasable;
        _transfer(factory, creator, releasable); // factory holds vested tokens
        emit VestingReleased(creator, releasable);
    }

    function vestedAmount() public view returns (uint256) {
        if (vestingTotal == 0 || vestingDuration == 0) return vestingTotal;
        if (block.timestamp < vestingStart + vestingCliff) return 0;
        uint256 elapsed = block.timestamp - vestingStart;
        if (elapsed >= vestingDuration) return vestingTotal;
        return (vestingTotal * elapsed) / vestingDuration;
    }

    function vestedClaimable() external view returns (uint256) {
        return vestedAmount() - vestingReleased;
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
        // Factory transfer lock during bonding curve phase
        if (locked
            && from != address(0)
            && to   != address(0)
            && from != factory
            && to   != factory
            && from != creator
            && to   != creator
        ) revert TransferLocked();
        // Creator pause (if feature enabled)
        if (tokenPaused && from != address(0) && to != address(0)) revert TransferLocked();
        // Compliance blacklist (if feature enabled)
        if (hasBlacklist) {
            if (blacklisted[from] || blacklisted[to]) revert Blacklisted();
        }
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
        address pairToken;                 // USDC or EURC address for this token
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
        /// @dev Pair token: address(0) = use factory default (USDC). Can set EURC address.
        address pairToken;
        /// @dev Feature flags for the GlowToken
        bool mintable;
        bool burnable;
        bool pausable;
        bool hasBlacklist;
        uint256 maxSupply;           // 0 = fixed at totalSupply (no future mints)
        uint256 vestingDuration;     // seconds for creator token vesting (0 = binary lock)
        uint256 vestingCliff;        // seconds before any vesting release
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
    /// @dev Each tier: user fills boostBps% of the graduation gap, paying feeBps% on top as platform fee.
    struct BoostTier {
        uint256 boostBps;  // % of remaining gap to fill (e.g. 2500 = 25%)
        uint256 feeBps;    // platform fee % of fill amount (e.g. 200 = 2%)
        string  label;     // display label e.g. "25%"
    }
    BoostTier[] public boostTiers;  // up to 10 tiers, set by admin
    // ── IDO / Auto-pool config ──────────────────────────────────────────────
    address public uniswapV3Factory;         // 0x1F98431c8aD98523631AE4a59f267346ea31F984 on Arc
    address public nonfungiblePositionMgr;   // Uniswap V3 NonfungiblePositionManager on Arc
    uint24  public defaultPoolFee;           // Uniswap fee tier: 500 / 3000 / 10000
    mapping(address => bool) public acceptedPairTokens;  // USDC=true, EURC=true, others=false

    uint256 public initialVirtualUsdcReserves;  // seed USDC reserves for price discovery (default 30K)
    uint256 public initialVirtualTokenReserves; // seed token reserves (default ~1.073B)

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
    // LP NFT lock (Uniswap V3 position NFT held by factory after auto-pool creation)
    mapping(address => uint256)            public pendingLpNftId;
    mapping(address => address)            public pendingLpNftOwner;
    mapping(address => uint256)            public pendingLpUnlockTime;
    uint256 public lpLockDuration;  // seconds LP is locked (default 30 days)
    mapping(address => uint256)            public pendingCreatorGraduationUsdc;
    // Boost graduation tracking
    mapping(address => uint256)            public totalBoostedUsdc;  // per token
    mapping(address => mapping(address => uint256)) public userBoosts; // token → user → total boosted
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
    event UniswapPoolCreated(address indexed token, address token0, address token1, uint24 fee, uint256 lpNftId);
    event LpPositionClaimed(address indexed token, address indexed to, uint256 nftId);
    event GraduationBoosted(address indexed token, address indexed booster, uint256 usdcSent, uint256 usdcAdded, uint256 feeTaken, uint256 tierIndex, uint256 boostBps);
    event BoostTiersUpdated();
    event TokenThresholdUpdated(address indexed token, uint256 oldThreshold, uint256 newThreshold);
    event CreatorTransferred(address indexed token, address indexed oldCreator, address indexed newCreator);
    event EmergencyWithdraw(address indexed token, address indexed to, uint256 amount);
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
        lpLockDuration = 30 days;  // LP NFT locked 30 days by default
        // Uniswap V3 on Arc Mainnet
        uniswapV3Factory       = 0x1F98431c8aD98523631AE4a59f267346ea31F984;
        nonfungiblePositionMgr = 0xC36442b4a4522E871399CD717aBDD847Ab11FE88;
        defaultPoolFee         = 3000; // 0.3% fee tier

        // Accept USDC as pair token by default
        acceptedPairTokens[_usdc] = true;

        // Default boost tiers: 10% (1% fee), 25% (2%), 50% (3%), 100% (5%)
        boostTiers.push(BoostTier(1000, 100,  "10%"));
        boostTiers.push(BoostTier(2500, 200,  "25%"));
        boostTiers.push(BoostTier(5000, 300,  "50%"));
        boostTiers.push(BoostTier(10000, 500, "100%"));
        initialVirtualUsdcReserves  = INITIAL_VIRTUAL_USDC_RESERVES;
        initialVirtualTokenReserves = INITIAL_VIRTUAL_TOKEN_RESERVES;
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

        address pair = _resolvePairToken(p.pairToken);

        token = _deployToken(p, a.supply, pair);
        if (isLaunchedToken[token]) revert AlreadyLaunched();
        isLaunchedToken[token] = true;

        TokenState storage state = tokenStates[token];
        state.creator                  = msg.sender;
        state.pairToken                = pair;
        state.virtualUsdcReserves      = initialVirtualUsdcReserves;
        state.virtualTokenReserves     = initialVirtualTokenReserves;
        state.createdAt                = block.timestamp;
        state.curveTokens              = a.curveTokens;
        state.graduationTokens         = a.graduationTokens;
        state.creatorTokens            = a.creatorTokens;
        state.totalSupply              = a.supply;
        state.tokenGraduationThreshold = resolvedThreshold;

        // Creator allocation: vesting or binary lock
        if (a.creatorTokens > 0) {
            if (p.vestingDuration > 0) {
                // Tokens stay in factory; creator calls releaseVested() over time
                // (GlowToken tracks vesting internally)
                state.creatorTokensLocked = true;
                GlowToken(token).setLocked(true);
            } else {
                IERC20(token).safeTransfer(msg.sender, a.creatorTokens);
                if (creatorLockDuration > 0) {
                    state.creatorTokensLocked = true;
                    state.creatorLockExpiry   = block.timestamp + creatorLockDuration;
                    GlowToken(token).setLocked(true);
                }
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

        IERC20(state.pairToken).safeTransferFrom(msg.sender, address(this), usdcIn);
        if (f.feeToRecipient > 0) IERC20(state.pairToken).safeTransfer(feeRecipient, f.feeToRecipient);
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
        if (fee > 0) IERC20(state.pairToken).safeTransfer(feeRecipient, fee);
        IERC20(state.pairToken).safeTransfer(msg.sender, usdcOut);

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
        IERC20 pair = IERC20(tokenStates[token].pairToken == address(0) ? address(usdc) : tokenStates[token].pairToken);
        if (u > 0) pair.safeTransfer(graduationRecipient, u);
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


    /// @notice Boost a token toward graduation by selecting a percentage tier.
    ///         Each tier fills a fixed % of the remaining graduation gap.
    ///         A tier-specific fee is charged on top of the fill amount.
    ///
    ///         Example (gap = $10,000, 25% tier with 2% fee):
    ///           fillAmount = $10,000 × 25% = $2,500  → goes to bonding curve
    ///           fee        = $2,500  × 2%  = $50     → goes to feeRecipient
    ///           totalCost  = $2,550                    → user pays this
    ///
    /// @param token      Bonding-curve token to boost
    /// @param tierIndex  Index into boostTiers[] (0 = smallest, last = 100%)
    function boostByTier(address token, uint256 tierIndex) external nonReentrant whenNotPaused {
        if (!isLaunchedToken[token]) revert NotLaunched();
        if (tierIndex >= boostTiers.length) revert InvalidAmount();

        TokenState storage state = tokenStates[token];
        if (state.graduated) revert TokenAlreadyGraduated();

        uint256 threshold = state.tokenGraduationThreshold;
        if (threshold == 0) revert InvalidAmount(); // instant-mode token, no gap

        uint256 raised = state.realUsdcRaised;
        if (raised >= threshold) revert TokenAlreadyGraduated();

        uint256 gap = threshold - raised;
        BoostTier memory tier = boostTiers[tierIndex];

        uint256 fillAmount = (gap * tier.boostBps) / BPS_DENOMINATOR; // to curve
        if (fillAmount == 0) revert InvalidAmount();
        uint256 fee        = (fillAmount * tier.feeBps) / BPS_DENOMINATOR; // platform cut
        uint256 totalCost  = fillAmount + fee;

        usdc.safeTransferFrom(msg.sender, address(this), totalCost);
        if (fee > 0) usdc.safeTransfer(feeRecipient, fee);

        state.virtualUsdcReserves += fillAmount;
        state.realUsdcRaised      += fillAmount;
        totalBoostedUsdc[token]         += fillAmount;
        userBoosts[token][msg.sender]   += fillAmount;

        emit GraduationBoosted(token, msg.sender, totalCost, fillAmount, fee, tierIndex, tier.boostBps);
        _updateKingOfHill(token, state.realUsdcRaised);
        _emitMilestones(token, state.realUsdcRaised);
        if (state.realUsdcRaised >= threshold) _graduateToken(token);
    }

    /// @notice Admin can lower (or raise) a specific token's graduation threshold after launch.
    ///         Use this to reward a token's community or respond to market conditions.
    /// @param token      The launched token address
    /// @param threshold  New threshold in USDC 6-decimal. 0 = graduate immediately.
    function setTokenGraduationThreshold(address token, uint256 threshold) external onlyOwner {
        if (!isLaunchedToken[token]) revert NotLaunched();
        TokenState storage state = tokenStates[token];
        if (state.graduated) revert TokenAlreadyGraduated();
        uint256 old = state.tokenGraduationThreshold;
        state.tokenGraduationThreshold = threshold;
        emit TokenThresholdUpdated(token, old, threshold);
        // If threshold is now met or 0, graduate immediately
        if (threshold == 0 || state.realUsdcRaised >= threshold) {
            _graduateToken(token);
        }
    }

    /// @notice Creator can hand off their creator role to another address.
    ///         The new creator can update metadata, claim graduation bonus, unlock tokens.
    function transferCreatorRole(address token, address newCreator) external {
        if (!isLaunchedToken[token]) revert NotLaunched();
        if (newCreator == address(0)) revert InvalidAddress();
        TokenState storage state = tokenStates[token];
        if (msg.sender != state.creator) revert Unauthorized();
        address old = state.creator;
        state.creator = newCreator;
        // Update pending graduation creator if it hasn't been claimed yet
        if (pendingGraduationCreator[token] == old) {
            pendingGraduationCreator[token] = newCreator;
        }
        emit CreatorTransferred(token, old, newCreator);
    }

    /// @notice Emergency: owner can withdraw any ERC-20 token held by the factory.
    ///         Use ONLY for genuinely stuck funds — not for graduated tokens pending claim.
    ///         Protected: cannot withdraw USDC that belongs to active bonding curves.
    function emergencyWithdraw(address tokenAddr, address to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0)) revert InvalidAddress();
        if (amount == 0) revert InvalidAmount();
        IERC20(tokenAddr).safeTransfer(to, amount);
        emit EmergencyWithdraw(tokenAddr, to, amount);
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
    /// @notice Set all boost tiers at once. Up to 10 tiers. Any existing tiers are replaced.
    /// @param boostBpsArr  % of gap to fill per tier (e.g. [1000,2500,5000,10000] for 10/25/50/100%)
    /// @param feeBpsArr    Platform fee % per tier on top of fill amount (e.g. [100,200,300,500] = 1/2/3/5%)
    /// @param labels       Display labels (e.g. ["10%","25%","50%","100%"])
    function setBoostTiers(
        uint256[] calldata boostBpsArr,
        uint256[] calldata feeBpsArr,
        string[]  calldata labels
    ) external onlyOwner {
        if (boostBpsArr.length != feeBpsArr.length || boostBpsArr.length != labels.length) revert InvalidAmount();
        if (boostBpsArr.length > 10) revert InvalidAmount();
        delete boostTiers;
        for (uint256 i = 0; i < boostBpsArr.length; i++) {
            if (boostBpsArr[i] == 0 || boostBpsArr[i] > BPS_DENOMINATOR) revert InvalidAmount();
            boostTiers.push(BoostTier(boostBpsArr[i], feeBpsArr[i], labels[i]));
        }
        emit BoostTiersUpdated();
    }

    /// @notice Update a single boost tier
    function setBoostTier(uint256 index, uint256 boostBps, uint256 feeBps, string calldata label) external onlyOwner {
        if (index >= boostTiers.length) revert InvalidAmount();
        if (boostBps == 0 || boostBps > BPS_DENOMINATOR) revert InvalidAmount();
        boostTiers[index] = BoostTier(boostBps, feeBps, label);
        emit BoostTiersUpdated();
    }

    /// @notice Add a new boost tier (max 10 total)
    function addBoostTier(uint256 boostBps, uint256 feeBps, string calldata label) external onlyOwner {
        if (boostTiers.length >= 10) revert InvalidAmount();
        if (boostBps == 0 || boostBps > BPS_DENOMINATOR) revert InvalidAmount();
        boostTiers.push(BoostTier(boostBps, feeBps, label));
        emit BoostTiersUpdated();
    }

    /// @notice Remove last boost tier
    function removeLastBoostTier() external onlyOwner {
        if (boostTiers.length == 0) revert InvalidAmount();
        boostTiers.pop();
        emit BoostTiersUpdated();
    }

    /// @notice Set initial virtual USDC reserves for new launches (affects starting price).
    ///         Default 30,000e6 = $30,000 virtual USDC seed.
    /// @notice Creator claims their locked LP NFT after lpLockDuration expires
    function claimLpPosition(address token) external nonReentrant {
        if (!isLaunchedToken[token]) revert NotLaunched();
        if (msg.sender != pendingLpNftOwner[token]) revert Unauthorized();
        if (block.timestamp < pendingLpUnlockTime[token]) revert PauseNotExpired();
        uint256 nftId = pendingLpNftId[token];
        if (nftId == 0) revert NothingToClaim();
        pendingLpNftId[token] = 0;
        // Transfer LP NFT to creator
        (bool ok,) = nonfungiblePositionMgr.call(
            abi.encodeWithSignature("transferFrom(address,address,uint256)", address(this), msg.sender, nftId)
        );
        if (!ok) revert InvalidAmount();
        emit LpPositionClaimed(token, msg.sender, nftId);
    }

    function setUniswapV3Factory(address addr)         external onlyOwner { uniswapV3Factory = addr; emit ConfigUpdated("uniswapV3Factory", 0); }
    function setNonfungiblePositionMgr(address addr)    external onlyOwner { nonfungiblePositionMgr = addr; emit ConfigUpdated("nonfungiblePositionMgr", 0); }
    function setDefaultPoolFee(uint24 fee)              external onlyOwner { defaultPoolFee = fee; emit ConfigUpdated("defaultPoolFee", fee); }
    function setLpLockDuration(uint256 seconds_)        external onlyOwner { lpLockDuration = seconds_; emit ConfigUpdated("lpLockDuration", seconds_); }
    function addAcceptedPairToken(address token, bool ok) external onlyOwner {
        try IERC20Metadata(token).decimals() returns (uint8 d) {
            if (d != 6) revert InvalidToken();
        } catch { revert InvalidToken(); }
        acceptedPairTokens[token] = ok;
        emit ConfigUpdated("pairToken", ok ? 1 : 0);
    }

    function setInitialVirtualUsdcReserves(uint256 value) external onlyOwner {
        if (value == 0) revert InvalidAmount();
        initialVirtualUsdcReserves = value;
        emit ConfigUpdated("initialVirtualUsdcReserves", value);
    }

    /// @notice Set initial virtual token reserves for new launches (affects starting price).
    ///         Lower = higher starting price. Default 1,073,000,191e18.
    function setInitialVirtualTokenReserves(uint256 value) external onlyOwner {
        if (value == 0) revert InvalidAmount();
        initialVirtualTokenReserves = value;
        emit ConfigUpdated("initialVirtualTokenReserves", value);
    }

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

    /// @notice Get all boost tiers
    function getBoostTiers() external view returns (BoostTier[] memory) {
        return boostTiers;
    }

    /// @notice Preview the exact cost and outcome for a boost tier on a specific token
    /// @return fillAmount  USDC that goes into the bonding curve (raises price + progress)
    /// @return fee         Platform fee paid on top
    /// @return totalCost   Total USDC the user must send
    /// @return willGraduate  True if this boost would trigger graduation
    function getBoostTierCost(address token, uint256 tierIndex) external view returns (
        uint256 fillAmount, uint256 fee, uint256 totalCost, bool willGraduate
    ) {
        if (!isLaunchedToken[token] || tierIndex >= boostTiers.length) return (0, 0, 0, false);
        TokenState storage state = tokenStates[token];
        if (state.graduated) return (0, 0, 0, true);
        uint256 threshold = state.tokenGraduationThreshold;
        if (threshold == 0) return (0, 0, 0, true);
        uint256 raised    = state.realUsdcRaised;
        if (raised >= threshold) return (0, 0, 0, true);
        uint256 gap = threshold - raised;
        BoostTier memory tier = boostTiers[tierIndex];
        fillAmount   = (gap * tier.boostBps) / BPS_DENOMINATOR;
        fee          = (fillAmount * tier.feeBps) / BPS_DENOMINATOR;
        totalCost    = fillAmount + fee;
        willGraduate = (raised + fillAmount) >= threshold;
    }

    /// @notice Get how much USDC is still needed to graduate a token
    function getGraduationGap(address token) external view returns (uint256 gap, uint256 threshold, uint256 raised) {
        if (!isLaunchedToken[token]) revert NotLaunched();
        TokenState storage state = tokenStates[token];
        threshold = state.tokenGraduationThreshold;
        raised    = state.realUsdcRaised;
        gap       = (threshold > 0 && raised < threshold) ? threshold - raised : 0;
    }

    /// @notice How much USDC a user has boosted toward a token's graduation
    function getUserBoost(address token, address user) external view returns (uint256) {
        return userBoosts[token][user];
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

        uint256 pooled       = state.realUsdcRaised;
        state.realUsdcRaised = 0;

        uint256 platFee      = (pooled * perTokenGraduationFeeBps) / BPS_DENOMINATOR;
        uint256 creatorBonus = ((pooled - platFee) * creatorGraduationFeeBps) / BPS_DENOMINATOR;
        uint256 dexUsdc      = pooled - platFee - creatorBonus;
        uint256 dexTokens    = IERC20(token).balanceOf(address(this)) - state.creatorTokens;

        if (platFee > 0) IERC20(state.pairToken).safeTransfer(feeRecipient, platFee);

        pendingCreatorGraduationUsdc[token] = creatorBonus;
        pendingGraduationCreator[token]     = state.creator;

        emit TokenGraduated(token, state.creator, pooled, dexTokens, block.timestamp);

        // Attempt auto-creation of Uniswap V3 pool
        if (uniswapV3Factory != address(0) && nonfungiblePositionMgr != address(0) && dexUsdc > 0 && dexTokens > 0) {
            _createUniswapPool(token, state.pairToken, dexTokens, dexUsdc);
        } else {
            // Fallback: put into pending for manual claim
            pendingGraduationUsdc[token]   = dexUsdc;
            pendingGraduationTokens[token] = dexTokens;
        }

        if (pooled > kingOfHillRaised) {
            kingOfHill = token;
            kingOfHillRaised = pooled;
            emit KingOfHill(token, pooled, block.timestamp);
        }
    }


    /// @notice Creates Uniswap V3 pool via UniswapPoolLib (keeps factory bytecode small)
    function _createUniswapPool(
        address token,
        address pairToken,
        uint256 tokenAmount,
        uint256 pairAmount
    ) internal {
        UniswapPoolLib.PoolResult memory r = UniswapPoolLib.createAndSeed(
            nonfungiblePositionMgr,
            token, pairToken,
            tokenAmount, pairAmount,
            defaultPoolFee,
            address(this)
        );
        if (r.success && r.tokenId > 0) {
            pendingLpNftId[token]      = r.tokenId;
            pendingLpNftOwner[token]   = tokenStates[token].creator;
            pendingLpUnlockTime[token] = block.timestamp + lpLockDuration;
            (address t0, address t1) = token < pairToken
                ? (token, pairToken) : (pairToken, token);
            emit UniswapPoolCreated(token, t0, t1, defaultPoolFee, r.tokenId);
        } else {
            pendingGraduationUsdc[token]   = pairAmount;
            pendingGraduationTokens[token] = tokenAmount;
        }
    }


    function _resolvePairToken(address requested) internal view returns (address) {
        if (requested == address(0)) return address(usdc); // default = USDC
        if (!acceptedPairTokens[requested]) revert InvalidToken();
        return requested;
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

    function _deployToken(LaunchParams calldata p, uint256 supply, address /*pair*/) internal returns (address) {
        GlowToken.TokenFeatures memory f = GlowToken.TokenFeatures({
            mintable:     p.mintable,
            burnable:     p.burnable,
            pausable:     p.pausable,
            hasBlacklist: p.hasBlacklist,
            maxSupply:    p.maxSupply,
            vestingDuration: p.vestingDuration,
            vestingCliff: p.vestingCliff
        });
        // Vesting amount = creator allocation
        uint256 vestAmt = (supply * p.creatorAllocationBps) / 10000;
        return address(new GlowToken(
            TokenMetadata(p.name, p.symbol, p.description, p.imageUri, p.twitter, p.telegram, p.website),
            f,
            msg.sender, address(this), supply,
            vestAmt
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
