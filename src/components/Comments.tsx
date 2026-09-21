import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAccount } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { MessageSquare, Heart, Send, Loader2, RefreshCw } from 'lucide-react'
import { formatAddress, timeAgo } from '@/utils/format'

interface Comment { id:number; token_address:string; author:string; content:string; likes:number; created_at:string }

export function Comments({ tokenAddress }: { tokenAddress: string }) {
  const { address } = useAccount()
  const [comments, setComments] = useState<Comment[]>([])
  const [total, setTotal]       = useState(0)
  const [loading, setLoading]   = useState(true)
  const [posting, setPosting]   = useState(false)
  const [text, setText]         = useState('')
  const [liking, setLiking]     = useState<number|null>(null)
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
      const res = await fetch('/api/comments', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ token_address:tokenAddress, author:address, content:text.trim() }) })
      const data = await res.json() as any
      if (data.ok && data.comment) { setComments(c=>[data.comment,...c]); setTotal(t=>t+1); setText('') }
    } catch {}
    setPosting(false)
  }

  const like = async (id: number) => {
    if (likedIds.has(id)) return
    setLiking(id)
    try {
      const res = await fetch(`/api/comments/${id}/like`, { method:'POST' })
      const data = await res.json() as any
      if (data.ok) { setComments(c=>c.map(cm=>cm.id===id?{...cm,likes:cm.likes+1}:cm)); setLikedIds(s=>new Set([...s,id])) }
    } catch {}
    setLiking(null)
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <MessageSquare size={13} style={{ color:'var(--accent)' }}/>
          <span className="text-xs font-bold" style={{ color:'var(--text1)' }}>Comments</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold" style={{ background:'rgba(99,102,241,0.12)', color:'var(--accent)' }}>{total}</span>
        </div>
        <button onClick={load} className="p-1.5 rounded-lg" style={{ background:'var(--surface3)', border:'1px solid var(--border)' }}>
          <RefreshCw size={10} style={{ color:'var(--text2)' }}/>
        </button>
      </div>

      {/* Post box */}
      {address ? (
        <div className="flex gap-2 mb-4">
          <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[9px] font-bold text-white"
            style={{ background:'linear-gradient(135deg,var(--accent),var(--accent2))', marginTop:2 }}>
            {address.slice(2,4).toUpperCase()}
          </div>
          <div className="flex-1 flex flex-col gap-2">
            <textarea value={text} onChange={e=>setText(e.target.value)} placeholder="Write something…" rows={2}
              className="w-full px-3 py-2.5 rounded-xl text-xs outline-none resize-none"
              style={{ background:'var(--surface3)', border:'1px solid var(--border)', color:'var(--text1)', lineHeight:1.5 }}/>
            <button onClick={post} disabled={posting||!text.trim()}
              className="self-end flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all"
              style={{ background:text.trim()?'var(--accent)':'var(--surface3)', color:text.trim()?'#fff':'var(--text2)', opacity:posting?0.6:1 }}>
              {posting ? <Loader2 size={10} className="animate-spin"/> : <Send size={10}/>}
              Post
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 py-5 mb-4 rounded-xl" style={{ background:'var(--surface3)', border:'1px solid var(--border)' }}>
          <MessageSquare size={20} style={{ color:'var(--text3)' }}/>
          <p className="text-[11px]" style={{ color:'var(--text2)' }}>Connect wallet to comment</p>
          <ConnectKitButton/>
        </div>
      )}

      {/* Comments list */}
      {loading ? (
        <div className="flex items-center justify-center py-6 gap-2" style={{ color:'var(--text2)' }}>
          <Loader2 size={14} className="animate-spin"/><span className="text-xs">Loading…</span>
        </div>
      ) : comments.length === 0 ? (
        <div className="text-center py-8">
          <MessageSquare size={24} style={{ color:'var(--text3)' }} className="mx-auto mb-2"/>
          <p className="text-xs" style={{ color:'var(--text2)' }}>No comments yet. Be the first!</p>
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence>
            {comments.map(c => (
              <motion.div key={c.id} initial={{ opacity:0, y:4 }} animate={{ opacity:1, y:0 }}
                className="flex gap-2.5 p-3 rounded-xl" style={{ background:'var(--surface3)', border:'1px solid var(--border)' }}>
                <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[9px] font-bold text-white"
                  style={{ background:`linear-gradient(135deg,hsl(${parseInt(c.author.slice(2,6),16)%360},60%,55%),hsl(${(parseInt(c.author.slice(2,6),16)+120)%360},55%,45%))` }}>
                  {c.author.slice(2,4).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold" style={{ color:'var(--accent)' }}>{formatAddress(c.author)}</span>
                    <span className="text-[8px]" style={{ color:'var(--text2)' }}>{timeAgo(new Date(c.created_at).getTime()/1000)}</span>
                  </div>
                  <p className="text-[11px] leading-relaxed mb-1.5" style={{ color:'var(--text1)' }}>{c.content}</p>
                  <button onClick={() => like(c.id)} disabled={likedIds.has(c.id)||liking===c.id}
                    className="flex items-center gap-1 text-[9px] transition-all"
                    style={{ color:likedIds.has(c.id)?'var(--red)':'var(--text2)', background:'none', border:'none', cursor:'pointer', padding:0 }}>
                    {liking===c.id ? <Loader2 size={9} className="animate-spin"/> : <Heart size={9} fill={likedIds.has(c.id)?'currentColor':'none'}/>}
                    {c.likes}
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}
