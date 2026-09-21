// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

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

    bool public locked;

    constructor(
        TokenMetadata memory meta,
        address creator_,
        address factory_,
        uint256 totalSupply_
    ) ERC20(meta.name, meta.symbol) {
        if (creator_ == address(0) || factory_ == address(0)) revert ZeroAddress();
        creator    = creator_;
        factory    = factory_;
        createdAt  = block.timestamp;
        description = meta.description;
        imageUri   = meta.imageUri;
        twitter    = meta.twitter;
        telegram   = meta.telegram;
        website    = meta.website;
        _mint(factory_, totalSupply_);
    }

    event MetadataUpdated(address indexed token, string imageUri, string description);
    event URIUpdated(string contractURI);

    function setLocked(bool _locked) external {
        if (msg.sender != factory) revert NotFactory();
        locked = _locked;
    }

    /// @notice ERC-7572: returns full token metadata as inline JSON
    /// Any wallet, DEX, or explorer that supports ERC-7572 will display
    /// the logo, description, and social links automatically.
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

    /// @notice Update token metadata — callable only by the creator
    function updateMetadata(
        string calldata _imageUri,
        string calldata _description,
        string calldata _twitter,
        string calldata _telegram,
        string calldata _website
    ) external {
        if (msg.sender != creator && msg.sender != factory) revert NotFactory();
        if (bytes(_imageUri).length > 0)    imageUri    = _imageUri;
        if (bytes(_description).length > 0) description = _description;
        if (bytes(_twitter).length > 0)     twitter     = _twitter;
        if (bytes(_telegram).length > 0)    telegram    = _telegram;
        if (bytes(_website).length > 0)     website     = _website;
        emit MetadataUpdated(address(this), imageUri, description);
        // Emit ERC-7572 ContractURIUpdated so indexers pick up the change
        emit URIUpdated(string(abi.encodePacked(
            'data:application/json;utf8,{"name":"', name(),
            '","image":"', imageUri, '"}'
        )));
    }

    /// @dev Convert address to lowercase hex string for JSON embedding
    function _toHexString(address addr) internal pure returns (string memory) {
        bytes memory buffer = new bytes(42);
        buffer[0] = '0';
        buffer[1] = 'x';
        for (uint256 i = 0; i < 20; i++) {
            uint8 b = uint8(uint160(addr) >> (8 * (19 - i)));
            buffer[2 + i * 2]     = _hexChar(b >> 4);
            buffer[2 + i * 2 + 1] = _hexChar(b & 0x0f);
        }
        return string(buffer);
    }

    function _hexChar(uint8 v) internal pure returns (bytes1) {
        return v < 10 ? bytes1(v + 48) : bytes1(v + 87);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (
            locked
                && from != address(0)
                && to   != address(0)
                && from != factory
                && to   != factory
                && from != creator
                && to   != creator
        ) revert TransferLocked();
        super._update(from, to, value);
    }
}

contract GlowFunFactory_V2 is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    uint256 public constant VERSION                    = 2;
    uint256 public constant BPS_DENOMINATOR            = 10_000;
    uint256 public constant INITIAL_VIRTUAL_USDC_RESERVES  = 30_000e6;
    uint256 public constant INITIAL_VIRTUAL_TOKEN_RESERVES = 1_073_000_191e18;
    uint256 public constant DEFAULT_GRADUATION_THRESHOLD    = 69_000e6;
    uint256 public constant DEFAULT_PROTOCOL_FEE_BPS        = 100;
    uint256 public constant DEFAULT_CREATION_FEE            = 10e6;
    uint256 public constant DEFAULT_ANTI_SNIPE_DURATION     = 60;
    uint256 public constant DEFAULT_ANTI_SNIPE_TAX_BPS      = 500;
    uint256 public constant DEFAULT_CREATOR_LOCK_DURATION   = 7 days;
    uint256 public constant MAX_FEE_BPS                     = 1000;
    uint256 public constant MAX_CREATOR_ALLOC_BPS           = 1000;
    uint256 public constant MAX_PAUSE_DURATION              = 7 days;

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
    error TransferLocked();
    error NothingToClaim();
    error PauseNotExpired();

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
        uint256 totalSupply;
        uint256 curveAllocationBps;
        uint256 creatorAllocationBps;
        uint256 graduationThresholdUsdc;
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

    // ── NEW: group all 16 config fields into one struct ──────────────────
    // Fixes "Stack too deep" in getConfig() which previously returned 16
    // named values — EVM stack limit is 16 slots, modifiers use some too.
    struct FactoryConfig {
        address usdc_;
        address feeRecipient_;
        address graduationRecipient_;
        uint256 graduationThreshold_;
        uint256 protocolFeeBps_;
        uint256 creationFee_;
        uint256 creatorGraduationFeeBps_;
        uint256 referralFeeBps_;
        uint256 antiSnipeDuration_;
        uint256 antiSnipeTaxBps_;
        uint256 maxBuyBps_;
        uint256 buyCooldown_;
        uint256 creatorLockDuration_;
        uint256 perTokenGraduationFeeBps_;
        address kingOfHill_;
        uint256 kingOfHillRaised_;
    }

    IERC20 public immutable usdc;

    address public feeRecipient;
    address public graduationRecipient;
    uint256 public graduationThreshold;
    uint256 public protocolFeeBps;
    uint256 public creationFee;
    uint256 public creatorGraduationFeeBps;
    uint256 public referralFeeBps;
    uint256 public antiSnipeDuration;
    uint256 public antiSnipeTaxBps;
    uint256 public maxBuyBps;
    uint256 public buyCooldown;
    uint256 public creatorLockDuration;
    uint256 public perTokenGraduationFeeBps;
    uint256 public pausedAt;

    address public pendingFeeRecipient;
    address public pendingGraduationRecipient;

    address[] private _launchedTokens;
    mapping(address => bool)       public isLaunchedToken;
    mapping(address => TokenState) public tokenStates;

    mapping(address => bool) public blacklistedTokens;
    mapping(address => bool) public blacklistedWallets;

    mapping(address token => mapping(address wallet => uint256)) public lastBuyTime;
    mapping(address referrer => uint256)                         public referralEarnings;

    mapping(address token => uint256) public pendingGraduationUsdc;
    mapping(address token => uint256) public pendingGraduationTokens;
    mapping(address token => address) public pendingGraduationCreator;
    mapping(address token => uint256) public pendingCreatorGraduationUsdc;

    address public kingOfHill;
    uint256 public kingOfHillRaised;

    mapping(address token => uint8) private _milestoneMask;

    // ── Events ───────────────────────────────────────────────────────────
    event TokenLaunched(
        address indexed token, address indexed creator,
        string name, string symbol,
        uint256 totalSupply, uint256 curveTokens, uint256 graduationTokens,
        uint256 creatorTokens, uint256 graduationThreshold_, uint256 timestamp
    );
    event TokensBought(
        address indexed token, address indexed buyer, address indexed referrer,
        uint256 usdcIn, uint256 tokensOut, uint256 price,
        uint256 protocolFee, uint256 referralFee, uint256 antiSnipeFee,
        uint256 newRealUsdcRaised, uint256 timestamp
    );
    event TokensSold(
        address indexed token, address indexed seller,
        uint256 tokensIn, uint256 usdcOut, uint256 price,
        uint256 protocolFee, uint256 newRealUsdcRaised, uint256 timestamp
    );
    event TokenGraduated(
        address indexed token, address indexed creator,
        uint256 usdcRaised, uint256 tokenAmount, uint256 timestamp
    );
    event GraduationClaimed(address indexed token, address indexed recipient, uint256 usdcAmount, uint256 tokenAmount);
    event CreatorGraduationClaimed(address indexed token, address indexed creator, uint256 usdcAmount);
    event ReferralEarned(address indexed referrer, address indexed token, uint256 amount);
    event TokenBlacklisted(address indexed token, bool blacklisted);
    event WalletBlacklisted(address indexed wallet, bool blacklisted);
    event MilestoneReached(address indexed token, uint256 progressBps, uint256 realUsdcRaised);
    event KingOfHill(address indexed token, uint256 realUsdcRaised, uint256 timestamp);
    event ProtocolFeeUpdated(uint256 bps);
    event CreationFeeUpdated(uint256 fee);
    event GraduationThresholdUpdated(uint256 threshold);
    event CreatorGraduationFeeUpdated(uint256 bps);
    event ReferralFeeUpdated(uint256 bps);
    event AntiSnipeConfigUpdated(uint256 duration, uint256 taxBps);
    event MaxBuyUpdated(uint256 bps);
    event BuyCooldownUpdated(uint256 seconds_);
    event CreatorLockDurationUpdated(uint256 seconds_);
    event PerTokenGraduationFeeUpdated(uint256 bps);
    event FeeRecipientProposed(address indexed proposed);
    event FeeRecipientUpdated(address indexed newRecipient);
    event GraduationRecipientProposed(address indexed proposed);
    event GraduationRecipientUpdated(address indexed newRecipient);

    // ── Constructor ───────────────────────────────────────────────────────
    constructor(
        address _usdc,
        address _feeRecipient,
        address _graduationRecipient,
        address _owner
    ) Ownable(_owner) {
        if (
            _usdc == address(0) || _feeRecipient == address(0) ||
            _graduationRecipient == address(0) || _owner == address(0)
        ) revert InvalidAddress();

        uint8 usdcDecimals;
        try IERC20Metadata(_usdc).decimals() returns (uint8 d) { usdcDecimals = d; }
        catch { revert InvalidToken(); }
        if (usdcDecimals != 6) revert InvalidToken();

        usdc                   = IERC20(_usdc);
        feeRecipient           = _feeRecipient;
        graduationRecipient    = _graduationRecipient;
        graduationThreshold    = DEFAULT_GRADUATION_THRESHOLD;
        protocolFeeBps         = DEFAULT_PROTOCOL_FEE_BPS;
        creationFee            = DEFAULT_CREATION_FEE;
        creatorGraduationFeeBps = 500;
        referralFeeBps         = 2500;
        antiSnipeDuration      = 60;
        antiSnipeTaxBps        = 500;
        maxBuyBps              = 500;
        buyCooldown            = 30;
        creatorLockDuration    = 7 days;
        perTokenGraduationFeeBps = 100;
    }

    // ── Launch ────────────────────────────────────────────────────────────
    function launchToken(LaunchParams calldata p)
        external nonReentrant whenNotPaused returns (address token)
    {
        if (bytes(p.name).length == 0 || bytes(p.symbol).length == 0) revert InvalidToken();
        if (bytes(p.name).length > 64  || bytes(p.symbol).length > 16) revert InvalidToken();

        LaunchAllocations memory a = _validateAndCompute(p);
        if (creationFee > 0) usdc.safeTransferFrom(msg.sender, feeRecipient, creationFee);

        token = _deployToken(p, a.supply);
        if (isLaunchedToken[token]) revert AlreadyLaunched();
        isLaunchedToken[token] = true;

        TokenState storage state = tokenStates[token];
        state.creator                 = msg.sender;
        state.virtualUsdcReserves     = INITIAL_VIRTUAL_USDC_RESERVES;
        state.virtualTokenReserves    = INITIAL_VIRTUAL_TOKEN_RESERVES;
        state.graduated               = false;
        state.createdAt               = block.timestamp;
        state.curveTokens             = a.curveTokens;
        state.graduationTokens        = a.graduationTokens;
        state.creatorTokens           = a.creatorTokens;
        state.totalSupply             = a.supply;
        state.tokenGraduationThreshold = 1;

        if (a.creatorTokens > 0) {
            IERC20(token).safeTransfer(msg.sender, a.creatorTokens);
            if (creatorLockDuration > 0) {
                state.creatorTokensLocked = true;
                state.creatorLockExpiry   = block.timestamp + creatorLockDuration;
                GlowToken(token).setLocked(true);
            }
        }
        _launchedTokens.push(token);

        emit TokenLaunched(
            token, msg.sender, p.name, p.symbol,
            a.supply, a.curveTokens, a.graduationTokens, a.creatorTokens,
            state.tokenGraduationThreshold, block.timestamp
        );
    }

    // ── Buy ───────────────────────────────────────────────────────────────
    function buyTokens(address token, uint256 minTokensOut, address referrer)
        external nonReentrant whenNotPaused returns (uint256 usdcIn, uint256 tokensOut)
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

        _validateBuySize(state, tokensOut, token);   // ← extracted to cut stack depth

        lastBuyTime[token][msg.sender]  = block.timestamp;
        state.virtualUsdcReserves      += f.usdcForCurve;
        state.virtualTokenReserves     -= tokensOut;
        state.realUsdcRaised           += f.usdcForCurve;
        state.realTokensSold           += tokensOut;

        if (referrer != address(0) && referrer != msg.sender) {
            f.referralFee = (f.protocolFee * referralFeeBps) / BPS_DENOMINATOR;
            referralEarnings[referrer] += f.referralFee;
            emit ReferralEarned(referrer, token, f.referralFee);
        }
        f.feeToRecipient = f.snipeTax + (f.protocolFee - f.referralFee);

        usdc.safeTransferFrom(msg.sender, address(this), usdcIn);
        if (f.feeToRecipient > 0) usdc.safeTransfer(feeRecipient, f.feeToRecipient);
        IERC20(token).safeTransfer(msg.sender, tokensOut);

        emit TokensBought(
            token, msg.sender, referrer, usdcIn, tokensOut,
            _priceFromReserves(state.virtualUsdcReserves, state.virtualTokenReserves),
            f.protocolFee, f.referralFee, f.snipeTax, state.realUsdcRaised, block.timestamp
        );
        _updateKingOfHill(token, state.realUsdcRaised);
        _emitMilestones(token, state.realUsdcRaised);
        if (state.realUsdcRaised >= state.tokenGraduationThreshold) _graduateToken(token);
    }

    /// @dev Extracted from buyTokens to reduce stack depth
    function _validateBuySize(TokenState storage state, uint256 tokensOut, address token) internal view {
        if (maxBuyBps > 0 && tokensOut > (state.curveTokens * maxBuyBps) / BPS_DENOMINATOR)
            revert MaxBuyExceeded();
        if (tokensOut > state.curveTokens - state.realTokensSold) revert InvalidAmount();
        if (IERC20(token).balanceOf(address(this)) < tokensOut) revert InvalidAmount();
    }

    function _calcBuyFees(uint256 usdcIn, uint256 createdAt_) internal view returns (BuyFees memory f) {
        if (block.timestamp < createdAt_ + antiSnipeDuration)
            f.snipeTax = (usdcIn * antiSnipeTaxBps) / BPS_DENOMINATOR;
        f.protocolFee  = ((usdcIn - f.snipeTax) * protocolFeeBps) / BPS_DENOMINATOR;
        f.usdcForCurve = usdcIn - f.protocolFee - f.snipeTax;
    }

    // ── Sell ──────────────────────────────────────────────────────────────
    function sellTokens(address token, uint256 tokensIn, uint256 minUsdcOut)
        external nonReentrant whenNotPaused returns (uint256 usdcOut)
    {
        TokenState storage state = _activeTokenState(token);
        _checkBlacklist(token, msg.sender);
        if (tokensIn == 0 || tokensIn > state.realTokensSold) revert InvalidAmount();

        uint256 usdcOutGross = _getSellAmount(state.virtualUsdcReserves, state.virtualTokenReserves, tokensIn);
        if (usdcOutGross == 0 || usdcOutGross > state.realUsdcRaised) revert InvalidAmount();

        uint256 protocolFee = (usdcOutGross * DEFAULT_PROTOCOL_FEE_BPS) / BPS_DENOMINATOR;
        usdcOut = usdcOutGross - protocolFee;
        if (usdcOut < minUsdcOut) revert InsufficientOutput();

        state.virtualUsdcReserves  -= usdcOutGross;
        state.virtualTokenReserves += tokensIn;
        state.realUsdcRaised       -= usdcOutGross;
        state.realTokensSold       -= tokensIn;

        IERC20(token).safeTransferFrom(msg.sender, address(this), tokensIn);
        if (protocolFee > 0) usdc.safeTransfer(feeRecipient, protocolFee);
        usdc.safeTransfer(msg.sender, usdcOut);

        emit TokensSold(
            token, msg.sender, tokensIn, usdcOut,
            _priceFromReserves(state.virtualUsdcReserves, state.virtualTokenReserves),
            protocolFee, state.realUsdcRaised, block.timestamp
        );
    }

    // ── Claim ─────────────────────────────────────────────────────────────
    function claimGraduation(address token) external nonReentrant {
        if (msg.sender != graduationRecipient) revert InvalidAddress();
        uint256 usdcAmount  = pendingGraduationUsdc[token];
        uint256 tokenAmount = pendingGraduationTokens[token];
        if (usdcAmount == 0 && tokenAmount == 0) revert NothingToClaim();
        pendingGraduationUsdc[token]   = 0;
        pendingGraduationTokens[token] = 0;
        if (usdcAmount  > 0) usdc.safeTransfer(graduationRecipient, usdcAmount);
        if (tokenAmount > 0) IERC20(token).safeTransfer(graduationRecipient, tokenAmount);
        emit GraduationClaimed(token, graduationRecipient, usdcAmount, tokenAmount);
    }

    function claimCreatorGraduation(address token) external nonReentrant {
        if (msg.sender != pendingGraduationCreator[token]) revert InvalidAddress();
        uint256 amount = pendingCreatorGraduationUsdc[token];
        if (amount == 0) revert NothingToClaim();
        pendingCreatorGraduationUsdc[token] = 0;
        usdc.safeTransfer(msg.sender, amount);
        emit CreatorGraduationClaimed(token, msg.sender, amount);
    }

    function claimReferral() external nonReentrant {
        uint256 amount = referralEarnings[msg.sender];
        if (amount == 0) revert NothingToClaim();
        referralEarnings[msg.sender] = 0;
        usdc.safeTransfer(msg.sender, amount);
    }

    /// @notice Creator or owner can update token metadata after launch
    function updateTokenMetadata(
        address token,
        string calldata _imageUri,
        string calldata _description,
        string calldata _twitter,
        string calldata _telegram,
        string calldata _website
    ) external {
        if (!isLaunchedToken[token]) revert NotLaunched();
        TokenState storage state = tokenStates[token];
        if (msg.sender != state.creator && msg.sender != owner()) revert InvalidAddress();
        GlowToken(token).updateMetadata(_imageUri, _description, _twitter, _telegram, _website);
    }

    function unlockCreatorTokens(address token) external {
        if (!isLaunchedToken[token]) revert NotLaunched();
        TokenState storage state = tokenStates[token];
        if (msg.sender != state.creator) revert InvalidAddress();
        if (!state.creatorTokensLocked) return;
        if (block.timestamp < state.creatorLockExpiry) revert PauseNotExpired();
        state.creatorTokensLocked = false;
        GlowToken(token).setLocked(false);
    }

    // ── Admin ─────────────────────────────────────────────────────────────
    function setProtocolFeeBps(uint256 bps) external onlyOwner {
        if (bps > MAX_FEE_BPS) revert InvalidAmount();
        protocolFeeBps = bps; emit ProtocolFeeUpdated(bps);
    }
    function setCreationFee(uint256 fee) external onlyOwner {
        creationFee = fee; emit CreationFeeUpdated(fee);
    }
    function setGraduationThreshold(uint256 threshold) external onlyOwner {
        if (threshold < 1000e6) revert InvalidAmount();
        graduationThreshold = threshold; emit GraduationThresholdUpdated(threshold);
    }
    function setCreatorGraduationFeeBps(uint256 bps) external onlyOwner {
        if (bps > MAX_FEE_BPS) revert InvalidAmount();
        creatorGraduationFeeBps = bps; emit CreatorGraduationFeeUpdated(bps);
    }
    function setReferralFeeBps(uint256 bps) external onlyOwner {
        if (bps > 5000) revert InvalidAmount();
        referralFeeBps = bps; emit ReferralFeeUpdated(bps);
    }
    function setAntiSnipeConfig(uint256 duration, uint256 taxBps) external onlyOwner {
        if (taxBps > 2000) revert InvalidAmount();
        antiSnipeDuration = duration; antiSnipeTaxBps = taxBps;
        emit AntiSnipeConfigUpdated(duration, taxBps);
    }
    function setMaxBuyBps(uint256 bps) external onlyOwner {
        if (bps > 5000) revert InvalidAmount();
        maxBuyBps = bps; emit MaxBuyUpdated(bps);
    }
    function setBuyCooldown(uint256 seconds_) external onlyOwner {
        if (seconds_ > 300) revert InvalidAmount();
        buyCooldown = seconds_; emit BuyCooldownUpdated(seconds_);
    }
    function setCreatorLockDuration(uint256 seconds_) external onlyOwner {
        if (seconds_ > 30 days) revert InvalidAmount();
        creatorLockDuration = seconds_; emit CreatorLockDurationUpdated(seconds_);
    }
    function setPerTokenGraduationFeeBps(uint256 bps) external onlyOwner {
        if (bps > 500) revert InvalidAmount();
        perTokenGraduationFeeBps = bps; emit PerTokenGraduationFeeUpdated(bps);
    }
    function proposeFeeRecipient(address proposed) external onlyOwner {
        if (proposed == address(0)) revert InvalidAddress();
        pendingFeeRecipient = proposed; emit FeeRecipientProposed(proposed);
    }
    function acceptFeeRecipient() external {
        if (msg.sender != pendingFeeRecipient) revert InvalidAddress();
        feeRecipient = pendingFeeRecipient; pendingFeeRecipient = address(0);
        emit FeeRecipientUpdated(feeRecipient);
    }
    function proposeGraduationRecipient(address proposed) external onlyOwner {
        if (proposed == address(0)) revert InvalidAddress();
        pendingGraduationRecipient = proposed; emit GraduationRecipientProposed(proposed);
    }
    function acceptGraduationRecipient() external {
        if (msg.sender != pendingGraduationRecipient) revert InvalidAddress();
        graduationRecipient = pendingGraduationRecipient; pendingGraduationRecipient = address(0);
        emit GraduationRecipientUpdated(graduationRecipient);
    }
    function blacklistToken(address token, bool bl) external onlyOwner {
        if (!isLaunchedToken[token]) revert NotLaunched();
        blacklistedTokens[token] = bl; emit TokenBlacklisted(token, bl);
    }
    function blacklistWallet(address wallet, bool bl) external onlyOwner {
        if (wallet == address(0)) revert InvalidAddress();
        blacklistedWallets[wallet] = bl; emit WalletBlacklisted(wallet, bl);
    }
    function pause() external onlyOwner { pausedAt = block.timestamp; _pause(); }
    function unpause() external onlyOwner { pausedAt = 0; _unpause(); }
    function emergencyUnpause() external {
        if (!paused()) revert PauseNotExpired();
        if (block.timestamp < pausedAt + MAX_PAUSE_DURATION) revert PauseNotExpired();
        pausedAt = 0; _unpause();
    }

    // ── Views ─────────────────────────────────────────────────────────────
    function allTokens() external view returns (address[] memory) { return _launchedTokens; }

    function getTokensPaginated(uint256 offset, uint256 limit)
        external view returns (address[] memory result)
    {
        uint256 total = _launchedTokens.length;
        if (offset >= total) return new address[](0);
        uint256 end = offset + limit;
        if (end > total) end = total;
        result = new address[](end - offset);
        for (uint256 i = offset; i < end; i++) result[i - offset] = _launchedTokens[i];
    }

    function tokenCount() external view returns (uint256) { return _launchedTokens.length; }

    function getTokenState(address token) external view returns (TokenState memory) {
        if (!isLaunchedToken[token]) revert NotLaunched();
        return tokenStates[token];
    }

    function getTokenPrice(address token) public view returns (uint256) {
        if (!isLaunchedToken[token]) revert NotLaunched();
        TokenState storage state = tokenStates[token];
        return _priceFromReserves(state.virtualUsdcReserves, state.virtualTokenReserves);
    }

    function getBuyQuote(address token, uint256 usdcIn) external view returns (uint256 tokensOut) {
        TokenState storage state = _activeTokenState(token);
        if (usdcIn == 0) return 0;
        uint256 snipeTax;
        if (block.timestamp < state.createdAt + antiSnipeDuration)
            snipeTax = (usdcIn * antiSnipeTaxBps) / BPS_DENOMINATOR;
        uint256 protocolFee  = ((usdcIn - snipeTax) * protocolFeeBps) / BPS_DENOMINATOR;
        uint256 usdcForCurve = usdcIn - protocolFee - snipeTax;
        tokensOut = _getBuyAmount(state.virtualUsdcReserves, state.virtualTokenReserves, usdcForCurve);
        uint256 remaining = state.curveTokens - state.realTokensSold;
        if (tokensOut > remaining) tokensOut = remaining;
    }

    function getSellQuote(address token, uint256 tokensIn) external view returns (uint256 usdcOut) {
        TokenState storage state = _activeTokenState(token);
        if (tokensIn == 0 || tokensIn > state.realTokensSold) return 0;
        uint256 gross = _getSellAmount(state.virtualUsdcReserves, state.virtualTokenReserves, tokensIn);
        if (gross > state.realUsdcRaised) gross = state.realUsdcRaised;
        usdcOut = gross - (gross * DEFAULT_PROTOCOL_FEE_BPS) / BPS_DENOMINATOR;
    }

    function getMarketCap(address token) external view returns (uint256) {
        if (!isLaunchedToken[token]) revert NotLaunched();
        TokenState storage state = tokenStates[token];
        return (state.totalSupply * getTokenPrice(token)) / 1e30;
    }

    function getProgress(address token) public view returns (uint256) {
        if (!isLaunchedToken[token]) revert NotLaunched();
        uint256 displayThreshold = graduationThreshold;
        if (displayThreshold == 0) return BPS_DENOMINATOR;
        uint256 progress = (tokenStates[token].realUsdcRaised * BPS_DENOMINATOR) / displayThreshold;
        return progress > BPS_DENOMINATOR ? BPS_DENOMINATOR : progress;
    }

    /// @notice Returns all factory config in one struct (avoids 16-return-value stack overflow)
    function getConfig() external view returns (FactoryConfig memory cfg) {
        cfg.usdc_                    = address(usdc);
        cfg.feeRecipient_            = feeRecipient;
        cfg.graduationRecipient_     = graduationRecipient;
        cfg.graduationThreshold_     = graduationThreshold;
        cfg.protocolFeeBps_          = protocolFeeBps;
        cfg.creationFee_             = creationFee;
        cfg.creatorGraduationFeeBps_ = creatorGraduationFeeBps;
        cfg.referralFeeBps_          = referralFeeBps;
        cfg.antiSnipeDuration_       = antiSnipeDuration;
        cfg.antiSnipeTaxBps_         = antiSnipeTaxBps;
        cfg.maxBuyBps_               = maxBuyBps;
        cfg.buyCooldown_             = buyCooldown;
        cfg.creatorLockDuration_     = creatorLockDuration;
        cfg.perTokenGraduationFeeBps_ = perTokenGraduationFeeBps;
        cfg.kingOfHill_              = kingOfHill;
        cfg.kingOfHillRaised_        = kingOfHillRaised;
    }

    function isCreatorLocked(address token) external view returns (bool) {
        if (!isLaunchedToken[token]) revert NotLaunched();
        TokenState storage state = tokenStates[token];
        return state.creatorTokensLocked && block.timestamp < state.creatorLockExpiry;
    }

    // ── Internal ──────────────────────────────────────────────────────────
    function _validateAndCompute(LaunchParams calldata p)
        internal pure returns (LaunchAllocations memory a)
    {
        uint256 supply    = p.totalSupply == 0 ? 1_000_000_000e18 : p.totalSupply;
        if (supply < 1_000_000e18 || supply > 100_000_000_000e18) revert InvalidSupply();
        uint256 curveBps  = p.curveAllocationBps == 0 ? 8000 : p.curveAllocationBps;
        uint256 creatorBps = p.creatorAllocationBps;
        if (curveBps < 5000 || curveBps > 9500) revert InvalidAllocation();
        if (creatorBps > MAX_CREATOR_ALLOC_BPS)  revert InvalidAllocation();
        if (curveBps + creatorBps > 9500)         revert InvalidAllocation();
        a.supply           = supply;
        a.curveTokens      = (supply * curveBps)   / BPS_DENOMINATOR;
        a.creatorTokens    = (supply * creatorBps)  / BPS_DENOMINATOR;
        a.graduationTokens = supply - a.curveTokens - a.creatorTokens;
    }

    function _deployToken(LaunchParams calldata p, uint256 supply) internal returns (address) {
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

    function _graduateToken(address token) internal {
        TokenState storage state = tokenStates[token];
        if (state.graduated) revert TokenAlreadyGraduated();
        state.graduated = true;

        uint256 pooledUsdc   = state.realUsdcRaised;
        state.realUsdcRaised = 0;

        uint256 platformFee  = (pooledUsdc * perTokenGraduationFeeBps) / BPS_DENOMINATOR;
        uint256 creatorBonus = ((pooledUsdc - platformFee) * creatorGraduationFeeBps) / BPS_DENOMINATOR;
        uint256 dexUsdc      = pooledUsdc - platformFee - creatorBonus;

        if (platformFee > 0) usdc.safeTransfer(feeRecipient, platformFee);

        pendingGraduationUsdc[token]        = dexUsdc;
        pendingCreatorGraduationUsdc[token] = creatorBonus;
        pendingGraduationCreator[token]     = state.creator;
        pendingGraduationTokens[token]      = IERC20(token).balanceOf(address(this));

        emit TokenGraduated(token, state.creator, pooledUsdc, pendingGraduationTokens[token], block.timestamp);

        if (pooledUsdc > kingOfHillRaised) {
            kingOfHill       = token;
            kingOfHillRaised = pooledUsdc;
            emit KingOfHill(token, pooledUsdc, block.timestamp);
        }
    }

    function _emitMilestones(address token, uint256 raised) internal {
        uint256 displayThreshold = graduationThreshold;
        if (displayThreshold == 0) return;
        uint256 progress = (raised * BPS_DENOMINATOR) / displayThreshold;
        if (progress > BPS_DENOMINATOR) progress = BPS_DENOMINATOR;
        uint8 mask = _milestoneMask[token];
        if (progress >= 2500  && (mask & 1) == 0) { _milestoneMask[token] = mask | 1; emit MilestoneReached(token, 2500,  raised); mask = _milestoneMask[token]; }
        if (progress >= 5000  && (mask & 2) == 0) { _milestoneMask[token] = mask | 2; emit MilestoneReached(token, 5000,  raised); mask = _milestoneMask[token]; }
        if (progress >= 7500  && (mask & 4) == 0) { _milestoneMask[token] = mask | 4; emit MilestoneReached(token, 7500,  raised); mask = _milestoneMask[token]; }
        if (progress >= 10000 && (mask & 8) == 0) { _milestoneMask[token] = mask | 8; emit MilestoneReached(token, 10000, raised); }
    }

    function _updateKingOfHill(address token, uint256 raised) internal {
        if (raised > kingOfHillRaised) {
            kingOfHill = token; kingOfHillRaised = raised;
            emit KingOfHill(token, raised, block.timestamp);
        }
    }

    function _activeTokenState(address token) internal view returns (TokenState storage state) {
        if (!isLaunchedToken[token]) revert NotLaunched();
        state = tokenStates[token];
        if (state.graduated) revert TokenAlreadyGraduated();
    }

    function _checkBlacklist(address token, address wallet) internal view {
        if (blacklistedTokens[token] || blacklistedWallets[wallet]) revert Blacklisted();
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
        uint256 allowance = usdc.allowance(buyer, address(this));
        uint256 balance   = usdc.balanceOf(buyer);
        return allowance < balance ? allowance : balance;
    }
}
