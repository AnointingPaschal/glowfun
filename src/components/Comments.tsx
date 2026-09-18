import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAccount } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { MessageSquare, Heart, Send, Loader2, RefreshCw } from 'lucide-react'
import { GlassCard } from '@/components/GlassCard'
import { formatAddress, timeAgo } from '@/utils/format'

interface Comment {
  id: number
  token_address: string
  author: string
  content: string
  likes: number
  created_at: string
}

interface Props {
  tokenAddress: string
}

export function Comments({ tokenAddress }: Props) {
  const { address } = useAccount()
  const [comments, setComments] = useState<Comment[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [posting, setPosting] = useState(false)
  const [text, setText] = useState('')
  const [liking, setLiking] = useState<number | null>(null)
  const [likedIds, setLikedIds] = useState<Set<number>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/comments?token=${tokenAddress}&limit=50`)
      const data = await res.json() as any
      setComments(data.comments ?? [])
      setTotal(data.total ?? 0)
    } catch {}
    setLoading(false)
  }, [tokenAddress])

  useEffect(() => { load() }, [load])

  const post = async () => {
    if (!address || !text.trim()) return
    setPosting(true)
    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token_address: tokenAddress, author: address, content: text.trim() }),
      })
      const data = await res.json() as any
      if (data.ok && data.comment) {
        setComments(c => [data.comment, ...c])
        setTotal(t => t + 1)
        setText('')
      }
    } catch {}
    setPosting(false)
  }

  const like = async (id: number) => {
    if (likedIds.has(id) || liking === id) return
    setLiking(id)
    try {
      await fetch('/api/comments/like', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      setComments(cs => cs.map(c => c.id === id ? { ...c, likes: c.likes + 1 } : c))
      setLikedIds(s => new Set([...s, id]))
    } catch {}
    setLiking(null)
  }

  return (
    <GlassCard className="overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-2">
          <MessageSquare size={14} style={{ color: '#a78bfa' }} />
          <span className="text-sm font-semibold text-white">Comments</span>
          <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(139,92,246,0.1)', color: '#a78bfa' }}>{total}</span>
        </div>
        <button onClick={load} disabled={loading} className="p-1.5 rounded-lg" style={{ color: 'rgba(255,255,255,0.3)' }}>
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Input */}
      <div className="p-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        {!address ? (
          <div className="flex items-center justify-between">
            <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Connect wallet to comment</span>
            <ConnectKitButton />
          </div>
        ) : (
          <div className="flex gap-2">
            <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold" style={{ background: `hsl(${parseInt(address.slice(2,6),16)%360},60%,35%)` }}>
              {address.slice(2,4).toUpperCase()}
            </div>
            <div className="flex-1 flex gap-2">
              <input
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && post()}
                placeholder="Say something..."
                maxLength={500}
                className="flex-1 px-3 py-2 rounded-xl text-sm text-white outline-none"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
              />
              <button
                onClick={post}
                disabled={posting || !text.trim()}
                className="px-3 py-2 rounded-xl text-sm font-medium disabled:opacity-40 flex items-center gap-1.5"
                style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)', color: 'white' }}
              >
                {posting ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Comment list */}
      <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 size={18} className="animate-spin" style={{ color: 'rgba(255,255,255,0.2)' }} />
          </div>
        ) : comments.length === 0 ? (
          <div className="py-10 text-center">
            <MessageSquare size={24} className="mx-auto mb-2" style={{ color: 'rgba(255,255,255,0.1)' }} />
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>No comments yet. Be the first!</p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {comments.map(c => (
              <motion.div key={c.id} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="px-4 py-3 flex gap-3">
                <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold" style={{ background: `hsl(${parseInt(c.author.slice(2,6),16)%360},55%,32%)` }}>
                  {c.author.slice(2,4).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium" style={{ color: '#a78bfa' }}>{formatAddress(c.author)}</span>
                    <span className="text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>{timeAgo(new Date(c.created_at).getTime() / 1000)}</span>
                  </div>
                  <p className="text-sm break-words" style={{ color: 'rgba(255,255,255,0.75)', lineHeight: '1.5' }}>{c.content}</p>
                  <button
                    onClick={() => like(c.id)}
                    disabled={likedIds.has(c.id) || liking === c.id}
                    className="flex items-center gap-1 mt-1.5 text-xs transition-all"
                    style={{ color: likedIds.has(c.id) ? '#f472b6' : 'rgba(255,255,255,0.25)', background: 'none', border: 'none', cursor: likedIds.has(c.id) ? 'default' : 'pointer', padding: 0 }}
                  >
                    <Heart size={11} fill={likedIds.has(c.id) ? '#f472b6' : 'none'} />
                    {c.likes > 0 && <span>{c.likes}</span>}
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </GlassCard>
  )
}
