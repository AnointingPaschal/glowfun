export const parseOnchainError = (error: unknown): string => {
  const msg = (error as any)?.message?.toLowerCase() ?? ''
  if (msg.includes('user rejected') || (error as any)?.code === 4001) return 'Transaction cancelled.'
  if (msg.includes('insufficient funds') || msg.includes('exceeds balance')) return 'Insufficient USDC balance.'
  if (msg.includes('slippageexceeded')) return 'Slippage exceeded. Increase slippage tolerance or reduce amount.'
  if (msg.includes('tokengraduated')) return 'This token has already graduated to a DEX.'
  if (msg.includes('invalidtoken')) return 'Invalid token address.'
  if (msg.includes('invalidamount')) return 'Invalid amount.'
  if (msg.includes('curvesupplyexceeded')) return 'Bonding curve supply exceeded.'
  if (msg.includes('reverted')) {
    const reason = msg.match(/reason="([^"]+)"/)
    return reason ? `Transaction failed: ${reason[1]}` : 'Transaction reverted. Please try again.'
  }
  if (msg.includes('network') || msg.includes('timeout')) return 'Network error. Please retry.'
  return 'Something went wrong. Please try again.'
}
