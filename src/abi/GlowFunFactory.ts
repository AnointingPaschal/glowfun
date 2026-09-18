export const FACTORY_ABI = [
  // Launch
  { name: 'launchToken', type: 'function', stateMutability: 'nonpayable', inputs: [ { name: 'name', type: 'string' }, { name: 'symbol', type: 'string' }, { name: 'description', type: 'string' }, { name: 'imageUri', type: 'string' }, { name: 'twitter', type: 'string' }, { name: 'telegram', type: 'string' }, { name: 'website', type: 'string' } ], outputs: [{ name: 'token', type: 'address' }] },
  // Trade
  { name: 'buyTokens', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'token', type: 'address' }, { name: 'minTokensOut', type: 'uint256' }], outputs: [{ name: 'usdcIn', type: 'uint256' }, { name: 'tokensOut', type: 'uint256' }] },
  { name: 'sellTokens', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'token', type: 'address' }, { name: 'tokensIn', type: 'uint256' }, { name: 'minUsdcOut', type: 'uint256' }], outputs: [{ name: 'usdcOutNet', type: 'uint256' }] },
  // Views
  { name: 'getTokenPrice', type: 'function', stateMutability: 'view', inputs: [{ name: 'token', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'getBuyQuote', type: 'function', stateMutability: 'view', inputs: [{ name: 'token', type: 'address' }, { name: 'usdcIn', type: 'uint256' }], outputs: [{ name: 'tokensOut', type: 'uint256' }] },
  { name: 'getSellQuote', type: 'function', stateMutability: 'view', inputs: [{ name: 'token', type: 'address' }, { name: 'tokensIn', type: 'uint256' }], outputs: [{ name: 'usdcOutNet', type: 'uint256' }] },
  { name: 'getMarketCap', type: 'function', stateMutability: 'view', inputs: [{ name: 'token', type: 'address' }], outputs: [{ name: 'marketCapUsdc6', type: 'uint256' }] },
  { name: 'getProgress', type: 'function', stateMutability: 'view', inputs: [{ name: 'token', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'getTokenState', type: 'function', stateMutability: 'view', inputs: [{ name: 'token', type: 'address' }], outputs: [{ name: '', type: 'tuple', components: [ { name: 'creator', type: 'address' }, { name: 'virtualUsdcReserves', type: 'uint256' }, { name: 'virtualTokenReserves', type: 'uint256' }, { name: 'realUsdcRaised', type: 'uint256' }, { name: 'realTokensSold', type: 'uint256' }, { name: 'graduated', type: 'bool' }, { name: 'createdAt', type: 'uint256' } ] }] },
  { name: 'allTokens', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'address[]' }] },
  { name: 'tokenCount', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'isLaunchedToken', type: 'function', stateMutability: 'view', inputs: [{ name: '', type: 'address' }], outputs: [{ name: '', type: 'bool' }] },
  // Admin reads
  { name: 'creationFee', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'protocolFeeBps', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'feeRecipient', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'address' }] },
  { name: 'graduationRecipient', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'address' }] },
  { name: 'graduationThreshold', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'paused', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'bool' }] },
  { name: 'owner', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'address' }] },
  // Admin writes
  { name: 'setCreationFee', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'fee', type: 'uint256' }], outputs: [] },
  { name: 'setProtocolFeeBps', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'bps', type: 'uint256' }], outputs: [] },
  { name: 'setFeeRecipient', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'recipient', type: 'address' }], outputs: [] },
  { name: 'setGraduationRecipient', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'recipient', type: 'address' }], outputs: [] },
  { name: 'setGraduationThreshold', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'threshold', type: 'uint256' }], outputs: [] },
  { name: 'setUsdcAddress', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'usdcAddress', type: 'address' }], outputs: [] },
  { name: 'pause', type: 'function', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { name: 'unpause', type: 'function', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  // Events
  { name: 'TokenLaunched', type: 'event', inputs: [{ name: 'token', type: 'address', indexed: true }, { name: 'creator', type: 'address', indexed: true }, { name: 'name', type: 'string' }, { name: 'symbol', type: 'string' }, { name: 'timestamp', type: 'uint256' }] },
  { name: 'TokensBought', type: 'event', inputs: [{ name: 'token', type: 'address', indexed: true }, { name: 'buyer', type: 'address', indexed: true }, { name: 'usdcIn', type: 'uint256' }, { name: 'tokensOut', type: 'uint256' }, { name: 'price', type: 'uint256' }] },
  { name: 'TokensSold', type: 'event', inputs: [{ name: 'token', type: 'address', indexed: true }, { name: 'seller', type: 'address', indexed: true }, { name: 'tokensIn', type: 'uint256' }, { name: 'usdcOut', type: 'uint256' }, { name: 'price', type: 'uint256' }] },
  { name: 'TokenGraduated', type: 'event', inputs: [{ name: 'token', type: 'address', indexed: true }, { name: 'recipient', type: 'address', indexed: true }, { name: 'usdcAmount', type: 'uint256' }, { name: 'tokenAmount', type: 'uint256' }, { name: 'timestamp', type: 'uint256' }] },
] as const
