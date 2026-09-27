/**
 * Minimal Circle CCTP V2 ABIs — sourced verbatim from Circle's own contracts repo
 * (github.com/circlefin/evm-cctp-contracts, src/v2/TokenMessengerV2.sol +
 * src/v2/MessageTransmitterV2.sol), not re-derived from memory.
 *
 * IMPORTANT — see CCTP_BRIDGE_DISABLED_REASON in src/constants.ts. As of when this was
 * written there's an open, unresolved, unacknowledged bug in Circle's own attestation
 * indexer specifically for Arc's CCTP domain (26): burns confirm on-chain but the attester
 * never issues an attestation, so the minted side never arrives — real, currently-frozen
 * funds are already reported (circlefin/arc-node#200: 1,252+ USDC stuck 69+ days; the same
 * gap is also open on testnet as circlefin/evm-cctp-contracts#110). These ABIs and the
 * addresses in constants.ts are real and verified, wired up and ready — but the actual burn
 * transaction stays disabled in the UI until Circle fixes this, because there is no way to
 * un-burn USDC once `depositForBurn` succeeds on Arc.
 */

export const TOKEN_MESSENGER_V2_ABI = [
  {
    name: 'depositForBurn', type: 'function', stateMutability: 'nonpayable',
    inputs: [
      { name: 'amount', type: 'uint256' },
      { name: 'destinationDomain', type: 'uint32' },
      { name: 'mintRecipient', type: 'bytes32' },
      { name: 'burnToken', type: 'address' },
      { name: 'destinationCaller', type: 'bytes32' },
      { name: 'maxFee', type: 'uint256' },
      { name: 'minFinalityThreshold', type: 'uint32' },
    ],
    outputs: [],
  },
] as const

export const MESSAGE_TRANSMITTER_V2_ABI = [
  {
    name: 'receiveMessage', type: 'function', stateMutability: 'nonpayable',
    inputs: [
      { name: 'message', type: 'bytes' },
      { name: 'attestation', type: 'bytes' },
    ],
    outputs: [{ name: 'success', type: 'bool' }],
  },
] as const

/** minFinalityThreshold for a "standard" (not fast/fee-paying) CCTP V2 transfer. */
export const CCTP_STANDARD_FINALITY_THRESHOLD = 2000

/** Circle-assigned CCTP domain IDs (not the same as chain IDs). */
export const CCTP_DOMAINS = {
  ethereum: 0,
  avalanche: 1,
  optimism: 2,
  arbitrum: 3,
  base: 6,
  polygon: 7,
  arc: 26,
} as const
