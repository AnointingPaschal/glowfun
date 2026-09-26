import { useQuery, useQueryClient } from '@tanstack/react-query'

/** Off-chain banner for a token (see functions/api/banner). Returns '' when none is set. */
export function useTokenBanner(token: string | undefined) {
  const qc = useQueryClient()
  const key = ['token-banner', token?.toLowerCase()]
  const q = useQuery({
    queryKey: key,
    enabled: !!token,
    staleTime: 60_000,
    queryFn: async () => {
      const r = await fetch(`/api/banner/${token!.toLowerCase()}`)
      if (!r.ok) return ''
      const j = await r.json() as { bannerUri?: string }
      return j.bannerUri ?? ''
    },
  })
  return { bannerUri: q.data ?? '', isLoading: q.isLoading, setLocal: (uri: string) => qc.setQueryData(key, uri) }
}
