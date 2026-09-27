import { useEffect, useRef } from 'react'
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { toast } from 'sonner'
import { parseOnchainError } from '@/utils/errors'

/**
 * One write-contract action with consistent UX: wallet prompt -> "submitted" -> confirmed toast -> onDone().
 * `send(params, label)` where label is the success message (e.g. "Burned").
 */
export function useTx(onDone?: () => void) {
  const { writeContract, data: hash, isPending, reset } = useWriteContract()
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash })
  const label = useRef('Done')
  const done = useRef(onDone); done.current = onDone

  useEffect(() => {
    if (!isSuccess) return
    toast.success(`✅ ${label.current}`)
    done.current?.()
  }, [isSuccess])

  const send = (params: Record<string, unknown>, successLabel: string) => {
    label.current = successLabel
    reset()
    writeContract(params as any, {
      onSuccess: () => toast.message('Submitted — waiting for confirmation…'),
      onError: (e) => toast.error(parseOnchainError(e)),
    })
  }
  return { send, busy: isPending || confirming }
}
