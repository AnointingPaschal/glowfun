// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

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

    constructor(
        string memory name_,
        string memory symbol_,
        string memory description_,
        string memory imageUri_,
        string memory twitter_,
        string memory telegram_,
        string memory website_,
        address creator_,
        address factory_,
        uint256 totalSupply_
    ) ERC20(name_, symbol_) {
        if (creator_ == address(0) || factory_ == address(0)) revert ZeroAddress();

        creator = creator_;
        factory = factory_;
        createdAt = block.timestamp;

        description = description_;
        imageUri = imageUri_;
        twitter = twitter_;
        telegram = telegram_;
        website = website_;

        _mint(factory_, totalSupply_);
    }
}

contract GlowFunFactory is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant MAX_PROTOCOL_FEE_BPS = 500;

    uint256 public constant CURVE_TOKENS_FOR_SALE = 800_000_000e18;
    uint256 public constant GRADUATION_TOKEN_RESERVE = 200_000_000e18;

    uint256 public constant INITIAL_VIRTUAL_USDC_RESERVES = 30_000e6;
    uint256 public constant INITIAL_VIRTUAL_TOKEN_RESERVES = 1_073_000_191e18;

    uint256 public constant DEFAULT_GRADUATION_THRESHOLD = 69_000e6;
    uint256 public constant DEFAULT_PROTOCOL_FEE_BPS = 100;

    struct TokenState {
        address creator;
        uint256 virtualUsdcReserves;
        uint256 virtualTokenReserves;
        uint256 realUsdcRaised;
        uint256 realTokensSold;
        bool graduated;
        uint256 createdAt;
        uint256 curveTokens;
        uint256 graduationTokens;
        uint256 creatorTokens;
        uint256 totalSupply;
        uint256 tokenGraduationThreshold;
    }

    IERC20 public usdc;

    uint256 public creationFee;
    uint256 public protocolFeeBps;
    uint256 public graduationThreshold;

    address public feeRecipient;
    address public graduationRecipient;

    mapping(address token => TokenState) public tokenStates;
    mapping(address token => bool) public isLaunchedToken;
    address[] private _launchedTokens;

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

    event TokenLaunched(address indexed token, address indexed creator, string name, string symbol, uint256 timestamp);
    event TokenLaunchedV2(
        address indexed token,
        address indexed creator,
        string name,
        string symbol,
        uint256 totalSupply,
        uint256 curveTokens,
        uint256 graduationTokens,
        uint256 creatorTokens,
        uint256 graduationThreshold,
        uint256 timestamp
    );
    event TokensBought(address indexed token, address indexed buyer, uint256 usdcIn, uint256 tokensOut, uint256 price);
    event TokensSold(address indexed token, address indexed seller, uint256 tokensIn, uint256 usdcOut, uint256 price);
    event TokenGraduated(
        address indexed token,
        address indexed recipient,
        uint256 usdcAmount,
        uint256 tokenAmount,
        uint256 timestamp
    );

    event CreationFeeUpdated(uint256 fee);
    event ProtocolFeeUpdated(uint256 feeBps);
    event FeeRecipientUpdated(address recipient);
    event GraduationRecipientUpdated(address recipient);
    event GraduationThresholdUpdated(uint256 threshold);
    event UsdcAddressUpdated(address usdc);

    constructor(address _usdc, address _feeRecipient, address _graduationRecipient, address _owner) Ownable(_owner) {
        if (_usdc == address(0) || _feeRecipient == address(0) || _graduationRecipient == address(0) || _owner == address(0)) {
            revert InvalidAddress();
        }

        usdc = IERC20(_usdc);
        feeRecipient = _feeRecipient;
        graduationRecipient = _graduationRecipient;

        protocolFeeBps = DEFAULT_PROTOCOL_FEE_BPS;
        graduationThreshold = DEFAULT_GRADUATION_THRESHOLD;
    }

    struct LaunchParams {
        string name;
        string symbol;
        string description;
        string imageUri;
        string twitter;
        string telegram;
        string website;
        uint256 totalSupply;
        uint256 curveAllocationBps;
        uint256 creatorAllocationBps;
        uint256 graduationThresholdUsdc;
    }

    function launchToken(LaunchParams calldata p) external nonReentrant whenNotPaused returns (address token) {
        uint256 supply = p.totalSupply == 0 ? 1_000_000_000e18 : p.totalSupply;
        if (supply < 1_000_000e18 || supply > 100_000_000_000e18) revert InvalidSupply();

        uint256 curveBps = p.curveAllocationBps == 0 ? 8000 : p.curveAllocationBps;
        if (curveBps < 5000 || curveBps > 9500) revert InvalidAllocation();

        uint256 creatorBps = p.creatorAllocationBps;
        if (creatorBps > 1000) revert InvalidAllocation();
        if (curveBps + creatorBps > 9500) revert InvalidAllocation();

        uint256 curveTokens = (supply * curveBps) / BPS_DENOMINATOR;
        uint256 creatorTokens = (supply * creatorBps) / BPS_DENOMINATOR;
        uint256 graduationTokens = supply - curveTokens - creatorTokens;

        uint256 gradThresh = p.graduationThresholdUsdc == 0 ? graduationThreshold : p.graduationThresholdUsdc;

        if (creationFee > 0) {
            usdc.safeTransferFrom(msg.sender, feeRecipient, creationFee);
        }

        GlowToken newToken = new GlowToken({
            name_: p.name,
            symbol_: p.symbol,
            description_: p.description,
            imageUri_: p.imageUri,
            twitter_: p.twitter,
            telegram_: p.telegram,
            website_: p.website,
            creator_: msg.sender,
            factory_: address(this),
            totalSupply_: supply
        });

        token = address(newToken);
        if (isLaunchedToken[token]) revert TokenAlreadyExists();

        if (creatorTokens > 0) {
            IERC20(token).safeTransfer(msg.sender, creatorTokens);
        }

        isLaunchedToken[token] = true;
        tokenStates[token] = TokenState({
            creator: msg.sender,
            virtualUsdcReserves: INITIAL_VIRTUAL_USDC_RESERVES,
            virtualTokenReserves: INITIAL_VIRTUAL_TOKEN_RESERVES,
            realUsdcRaised: 0,
            realTokensSold: 0,
            graduated: false,
            createdAt: block.timestamp,
            curveTokens: curveTokens,
            graduationTokens: graduationTokens,
            creatorTokens: creatorTokens,
            totalSupply: supply,
            tokenGraduationThreshold: gradThresh
        });

        _launchedTokens.push(token);

        emit TokenLaunchedV2(
            token,
            msg.sender,
            p.name,
            p.symbol,
            supply,
            curveTokens,
            graduationTokens,
            creatorTokens,
            gradThresh,
            block.timestamp
        );
    }

    function buyTokens(address token, uint256 minTokensOut)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 usdcIn, uint256 tokensOut)
    {
        TokenState storage state = _activeTokenState(token);

        usdcIn = _spendableUsdc(msg.sender);
        if (usdcIn == 0) revert InvalidAmount();

        uint256 fee = (usdcIn * protocolFeeBps) / BPS_DENOMINATOR;
        uint256 usdcForCurve = usdcIn - fee;

        tokensOut = _getBuyAmount(state.virtualUsdcReserves, state.virtualTokenReserves, usdcForCurve);
        if (tokensOut < minTokensOut) revert SlippageExceeded();
        if (state.realTokensSold + tokensOut > state.curveTokens) revert CurveSupplyExceeded();

        if (IERC20(token).balanceOf(address(this)) < tokensOut) revert InsufficientTokenLiquidity();

        state.virtualUsdcReserves += usdcForCurve;
        state.virtualTokenReserves -= tokensOut;
        state.realUsdcRaised += usdcForCurve;
        state.realTokensSold += tokensOut;

        usdc.safeTransferFrom(msg.sender, address(this), usdcIn);
        if (fee > 0) {
            usdc.safeTransfer(feeRecipient, fee);
        }
        IERC20(token).safeTransfer(msg.sender, tokensOut);

        emit TokensBought(token, msg.sender, usdcIn, tokensOut, _priceFromReserves(state.virtualUsdcReserves, state.virtualTokenReserves));

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

        if (tokensIn == 0) revert InvalidAmount();
        if (tokensIn > state.realTokensSold) revert InvalidAmount();

        uint256 usdcOutGross = _getSellAmount(state.virtualUsdcReserves, state.virtualTokenReserves, tokensIn);
        if (usdcOutGross == 0) revert InvalidAmount();
        if (usdcOutGross > state.realUsdcRaised) revert InsufficientUsdcLiquidity();

        uint256 fee = (usdcOutGross * protocolFeeBps) / BPS_DENOMINATOR;
        usdcOutNet = usdcOutGross - fee;

        if (usdcOutNet < minUsdcOut) revert SlippageExceeded();

        state.virtualUsdcReserves -= usdcOutGross;
        state.virtualTokenReserves += tokensIn;
        state.realUsdcRaised -= usdcOutGross;
        state.realTokensSold -= tokensIn;

        IERC20(token).safeTransferFrom(msg.sender, address(this), tokensIn);
        if (fee > 0) {
            usdc.safeTransfer(feeRecipient, fee);
        }
        usdc.safeTransfer(msg.sender, usdcOutNet);

        emit TokensSold(
            token,
            msg.sender,
            tokensIn,
            usdcOutNet,
            _priceFromReserves(state.virtualUsdcReserves, state.virtualTokenReserves)
        );
    }

    function getTokenPrice(address token) external view returns (uint256) {
        TokenState storage state = _validTokenState(token);
        return _priceFromReserves(state.virtualUsdcReserves, state.virtualTokenReserves);
    }

    function getBuyQuote(address token, uint256 usdcIn) external view returns (uint256 tokensOut) {
        TokenState storage state = _activeViewTokenState(token);
        if (usdcIn == 0) return 0;

        uint256 fee = (usdcIn * protocolFeeBps) / BPS_DENOMINATOR;
        uint256 usdcForCurve = usdcIn - fee;

        tokensOut = _getBuyAmount(state.virtualUsdcReserves, state.virtualTokenReserves, usdcForCurve);

        uint256 remainingCurveTokens = state.curveTokens - state.realTokensSold;
        if (tokensOut > remainingCurveTokens) {
            tokensOut = remainingCurveTokens;
        }
    }

    function getSellQuote(address token, uint256 tokensIn) external view returns (uint256 usdcOutNet) {
        TokenState storage state = _activeViewTokenState(token);
        if (tokensIn == 0 || tokensIn > state.realTokensSold) return 0;

        uint256 usdcOutGross = _getSellAmount(state.virtualUsdcReserves, state.virtualTokenReserves, tokensIn);
        if (usdcOutGross > state.realUsdcRaised) {
            usdcOutGross = state.realUsdcRaised;
        }

        uint256 fee = (usdcOutGross * protocolFeeBps) / BPS_DENOMINATOR;
        usdcOutNet = usdcOutGross - fee;
    }

    function getMarketCap(address token) external view returns (uint256 marketCapUsdc6) {
        TokenState storage state = _validTokenState(token);
        uint256 price = _priceFromReserves(state.virtualUsdcReserves, state.virtualTokenReserves);
        marketCapUsdc6 = (state.realTokensSold * price) / 1e30;
    }

    function getProgress(address token) external view returns (uint256) {
        TokenState storage state = _validTokenState(token);
        if (graduationThreshold == 0) return 1e18;

        uint256 progress = (state.realUsdcRaised * 1e18) / graduationThreshold;
        if (progress > 1e18) return 1e18;
        return progress;
    }

    function getTokenState(address token) external view returns (TokenState memory) {
        return _validTokenState(token);
    }

    function allTokens() external view returns (address[] memory) {
        return _launchedTokens;
    }

    function tokenCount() external view returns (uint256) {
        return _launchedTokens.length;
    }

    function setCreationFee(uint256 fee) external onlyOwner {
        creationFee = fee;
        emit CreationFeeUpdated(fee);
    }

    function setProtocolFeeBps(uint256 bps) external onlyOwner {
        if (bps > MAX_PROTOCOL_FEE_BPS) revert InvalidFeeBps();
        protocolFeeBps = bps;
        emit ProtocolFeeUpdated(bps);
    }

    function setFeeRecipient(address recipient) external onlyOwner {
        if (recipient == address(0)) revert InvalidAddress();
        feeRecipient = recipient;
        emit FeeRecipientUpdated(recipient);
    }

    function setGraduationRecipient(address recipient) external onlyOwner {
        if (recipient == address(0)) revert InvalidAddress();
        graduationRecipient = recipient;
        emit GraduationRecipientUpdated(recipient);
    }

    function setGraduationThreshold(uint256 threshold) external onlyOwner {
        graduationThreshold = threshold;
        emit GraduationThresholdUpdated(threshold);
    }

    function setUsdcAddress(address usdcAddress) external onlyOwner {
        if (usdcAddress == address(0)) revert InvalidAddress();
        usdc = IERC20(usdcAddress);
        emit UsdcAddressUpdated(usdcAddress);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _graduateToken(address token, TokenState storage state) internal {
        uint256 effectiveGraduationThreshold =
            state.tokenGraduationThreshold == 0 ? graduationThreshold : state.tokenGraduationThreshold;
        if (state.realUsdcRaised < effectiveGraduationThreshold) return;

        state.graduated = true;

        uint256 pooledUsdc = state.realUsdcRaised;
        if (pooledUsdc > 0) {
            state.realUsdcRaised = 0;
            usdc.safeTransfer(graduationRecipient, pooledUsdc);
        }

        uint256 reserveTokens = state.graduationTokens;
        if (reserveTokens > 0) {
            IERC20(token).safeTransfer(graduationRecipient, reserveTokens);
        }

        emit TokenGraduated(token, graduationRecipient, pooledUsdc, reserveTokens, block.timestamp);
    }

    function _activeTokenState(address token) internal view returns (TokenState storage state) {
        state = _validTokenState(token);
        if (state.graduated) revert TokenAlreadyGraduated();
    }

    function _activeViewTokenState(address token) internal view returns (TokenState storage state) {
        state = _validTokenState(token);
        if (state.graduated) revert TokenAlreadyGraduated();
    }

    function _validTokenState(address token) internal view returns (TokenState storage state) {
        if (!isLaunchedToken[token]) revert InvalidToken();
        state = tokenStates[token];
    }

    function _priceFromReserves(uint256 usdcReserves, uint256 tokenReserves) internal pure returns (uint256) {
        return (usdcReserves * 1e30) / tokenReserves;
    }

    function _getBuyAmount(uint256 usdcReserves, uint256 tokenReserves, uint256 usdcIn)
        internal
        pure
        returns (uint256 tokensOut)
    {
        tokensOut = (tokenReserves * usdcIn) / (usdcReserves + usdcIn);
    }

    function _getSellAmount(uint256 usdcReserves, uint256 tokenReserves, uint256 tokensIn)
        internal
        pure
        returns (uint256 usdcOut)
    {
        usdcOut = (usdcReserves * tokensIn) / (tokenReserves + tokensIn);
    }

    function _spendableUsdc(address buyer) internal view returns (uint256) {
        uint256 allowance = usdc.allowance(buyer, address(this));
        uint256 balance = usdc.balanceOf(buyer);
        return allowance < balance ? allowance : balance;
    }
}
