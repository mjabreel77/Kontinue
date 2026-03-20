import { useState, useRef, useEffect } from 'react'
import {
  Radio, Send, MessageSquare,
  AlertTriangle, Zap, HelpCircle, Check, X, Bot,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { sendSignal, acknowledgeSignal } from '@/lib/api'
import { useDashboardStore } from '@/lib/store'
import type { Signal } from '@/types'

const typeIcons: Record<string, React.ReactNode> = {
  message: <MessageSquare className="size-3.5" />,
  priority: <Zap className="size-3.5" />,
  abort: <AlertTriangle className="size-3.5" />,
  answer: <HelpCircle className="size-3.5" />,
}

const typeColors: Record<string, string> = {
  message: 'text-blue-500',
  priority: 'text-amber-500',
  abort: 'text-red-500',
  answer: 'text-emerald-500',
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

const typeBadgeColors: Record<string, string> = {
  message: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
  priority: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
  abort: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
  answer: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
}

const statusColors: Record<string, string> = {
  pending: 'text-amber-600 dark:text-amber-400',
  delivered: 'text-blue-600 dark:text-blue-400',
  acknowledged: 'text-emerald-600 dark:text-emerald-400',
}

function timeDiff(from: string, to: string): string {
  const diff = new Date(to).getTime() - new Date(from).getTime()
  const secs = Math.round(diff / 1000)
  if (secs < 60) return `${secs}s`
  return `${Math.round(secs / 60)}m`
}

/* ── Signal entry: type badge + message + metadata + nested agent reply ── */

function SignalEntry({ signal, onAck }: { signal: Signal; onAck: (id: string) => void }) {
  const isAcked = signal.status === 'acknowledged'

  return (
    <div className="px-4 py-3 border-b border-border/40 last:border-0">
      {/* Type badge + message */}
      <div className="flex items-start gap-2.5">
        <span className={`${typeColors[signal.type] || 'text-muted-foreground'} mt-0.5 shrink-0`}>
          {typeIcons[signal.type] || <Radio className="size-3.5" />}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Badge className={`text-[9px] uppercase px-1.5 py-0 border-0 font-bold tracking-wide ${typeBadgeColors[signal.type] || 'bg-muted text-muted-foreground'}`}>
              {signal.type}
            </Badge>
            {!isAcked && (
              <button
                onClick={() => onAck(signal.id)}
                className="ml-auto text-[10px] text-emerald-600 dark:text-emerald-400 hover:underline font-medium flex items-center gap-1"
              >
                <Check className="size-3" /> ack
              </button>
            )}
          </div>
          <p className="text-[13px] leading-relaxed">{signal.content}</p>
          {/* Metadata row */}
          <div className="flex items-center gap-1.5 mt-1.5 text-[10px] text-muted-foreground">
            <span>{timeAgo(signal.createdAt)}</span>
            <span className="opacity-40">·</span>
            <span className="capitalize">{signal.source}</span>
            <span className="opacity-40">·</span>
            <span className={statusColors[signal.status] || 'text-muted-foreground'}>{signal.status}</span>
            {signal.deliveredAt && (
              <>
                <span className="opacity-40">·</span>
                <span title="Time to deliver">{timeDiff(signal.createdAt, signal.deliveredAt)}</span>
              </>
            )}
            {signal.acknowledgedAt && (
              <>
                <span className="opacity-40">·</span>
                <span title="Time to acknowledge">{timeDiff(signal.deliveredAt || signal.createdAt, signal.acknowledgedAt)}</span>
              </>
            )}
          </div>

          {/* Agent reply — indented with left border */}
          {signal.agentResponse && (
            <div className="mt-2.5 ml-0.5 pl-3 border-l-2 border-violet-300 dark:border-violet-700">
              <div className="flex items-center gap-1.5 mb-1">
                <Bot className="size-3 text-violet-500" />
                <span className="text-[10px] font-semibold text-violet-600 dark:text-violet-400">Agent reply</span>
              </div>
              <p className="text-[13px] leading-relaxed text-muted-foreground">{signal.agentResponse}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function SignalWidget() {
  const [expanded, setExpanded] = useState(false)
  const [message, setMessage] = useState('')
  const [signalType, setSignalType] = useState<'message' | 'priority'>('message')
  const [sending, setSending] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const data = useDashboardStore(s => s.data)
  const allSignals = data?.signals.recent ?? []
  const pendingCount = data?.signals.pending.length ?? 0

  // Auto-scroll to bottom on new signals when expanded
  useEffect(() => {
    if (expanded && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [expanded, allSignals.length])

  // Focus input when expanded
  useEffect(() => {
    if (expanded) inputRef.current?.focus()
  }, [expanded])

  const handleSend = async () => {
    const text = message.trim()
    if (!text || sending) return
    setSending(true)
    const ok = await sendSignal(signalType, text)
    setSending(false)
    if (ok) {
      setMessage('')
      inputRef.current?.focus()
    }
  }

  const handleAck = async (id: string) => {
    await acknowledgeSignal(id)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
    if (e.key === 'Escape') {
      setExpanded(false)
    }
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2">
      {/* Expanded signal list */}
      {expanded && (
        <div className="w-[400px] rounded-2xl border bg-card shadow-2xl overflow-hidden animate-in slide-in-from-bottom-2 fade-in duration-200">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
            <div className="flex items-center gap-2">
              <Radio className="size-4 text-primary" />
              <span className="text-sm font-semibold">Signals</span>
              {pendingCount > 0 && (
                <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4">
                  {pendingCount}
                </Badge>
              )}
            </div>
            <button
              onClick={() => setExpanded(false)}
              className="size-7 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
            >
              <X className="size-4 text-muted-foreground" />
            </button>
          </div>

          {/* Chat-style signal list */}
          <ScrollArea className="h-[350px]">
            <div ref={scrollRef} className="flex flex-col py-2">
              {allSignals.length === 0 ? (
                <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
                  No signals yet
                </div>
              ) : (
                [...allSignals].reverse().map((signal: Signal) => (
                  <SignalEntry key={signal.id} signal={signal} onAck={handleAck} />
                ))
              )}
            </div>
          </ScrollArea>

          {/* Type toggle + Input */}
          <div className="border-t bg-muted/20 p-3">
            <div className="flex items-center gap-2 mb-2">
              <button
                onClick={() => setSignalType('message')}
                className={`text-[11px] px-2.5 py-1 rounded-full font-medium transition-colors ${
                  signalType === 'message'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                Message
              </button>
              <button
                onClick={() => setSignalType('priority')}
                className={`text-[11px] px-2.5 py-1 rounded-full font-medium transition-colors ${
                  signalType === 'priority'
                    ? 'bg-amber-500 text-white'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                Priority
              </button>
            </div>
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Send a signal to the agent..."
                className="flex-1 h-9 rounded-full bg-background border px-4 text-sm outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 placeholder:text-muted-foreground/60"
                disabled={sending}
              />
              <button
                onClick={handleSend}
                disabled={!message.trim() || sending}
                className="size-9 shrink-0 flex items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Send className="size-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating toggle button */}
      {!expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="group flex items-center gap-2 h-11 pl-4 pr-5 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl hover:bg-primary/90 transition-all duration-200 animate-in fade-in slide-in-from-bottom-1"
        >
          <Radio className="size-4" />
          <span className="text-sm font-medium">Signals</span>
          {pendingCount > 0 && (
            <span className="flex items-center justify-center min-w-5 h-5 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold">
              {pendingCount}
            </span>
          )}
        </button>
      )}
    </div>
  )
}
