import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { DashboardData, Observation } from '@/types'

interface Props { data: DashboardData }

export function ObservationsPage({ data }: Props) {
  const [selected, setSelected] = useState<Observation | null>(null)
  const active = data.observations.filter(o => !o.resolved_at)
  const resolved = data.observations.filter(o => o.resolved_at)

  return (
    <div style={{ padding: 24, maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.3 }}>Observations</h1>
        <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 6, backgroundColor: 'var(--color-muted)', color: 'var(--color-muted-foreground)', fontWeight: 500 }}>
          {data.observations.length} total
        </span>
      </div>

      {active.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--color-muted-foreground)', marginBottom: 8 }}>
            Active ({active.length})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {active.map(o => (
              <ObservationCard key={o.id} observation={o} onViewDetail={() => setSelected(o)} />
            ))}
          </div>
        </div>
      )}

      {resolved.length > 0 && (
        <div>
          <h3 style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--color-muted-foreground)', marginBottom: 8 }}>
            Resolved ({resolved.length})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {resolved.map(o => (
              <ObservationCard key={o.id} observation={o} resolved onViewDetail={() => setSelected(o)} />
            ))}
          </div>
        </div>
      )}

      {data.observations.length === 0 && (
        <p style={{ textAlign: 'center', padding: '48px 0', fontSize: 13, color: 'var(--color-muted-foreground)' }}>No observations yet</p>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, color: 'var(--color-muted-foreground)' }}>#{selected.id}</span>
                  Observation
                  {selected.task_id && (
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, backgroundColor: 'var(--color-muted)', color: 'var(--color-muted-foreground)', fontWeight: 500 }}>
                      Task #{selected.task_id}
                    </span>
                  )}
                </DialogTitle>
              </DialogHeader>
              <ScrollArea className="max-h-[60vh] pr-4">
                <p style={{ fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap', color: 'var(--color-foreground)' }}>
                  {selected.content}
                </p>
              </ScrollArea>
              <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 12, fontSize: 11, color: 'var(--color-muted-foreground)', display: 'flex', gap: 16 }}>
                <span>Created: {new Date(selected.created_at + 'Z').toLocaleString()}</span>
                {selected.resolved_at && <span>Resolved: {new Date(selected.resolved_at + 'Z').toLocaleString()}</span>}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ObservationCard({ observation: o, resolved, onViewDetail }: { observation: Observation; resolved?: boolean; onViewDetail: () => void }) {
  const truncated = o.content.length > 180
  const displayText = truncated ? o.content.slice(0, 180) + '…' : o.content

  return (
    <div style={{
      padding: '14px 16px', borderRadius: 8,
      border: '1px solid var(--color-border)',
      backgroundColor: 'var(--color-card)',
      opacity: resolved ? 0.5 : 1,
    }}>
      <p style={{
        fontSize: 13, lineHeight: 1.6,
        color: 'var(--color-card-foreground)',
        textDecoration: resolved ? 'line-through' : 'none',
      }}>
        {displayText}
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, fontSize: 11, color: 'var(--color-muted-foreground)' }}>
        {o.task_id && <span>Task #{o.task_id}</span>}
        <span>{new Date(o.created_at + 'Z').toLocaleDateString()}</span>
        <button
          onClick={onViewDetail}
          style={{
            marginLeft: 'auto', fontSize: 11, fontWeight: 500,
            color: 'var(--color-primary)', cursor: 'pointer',
            border: 'none', background: 'none', padding: 0,
            textDecoration: 'none',
          }}
          onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
          onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}
        >
          View details →
        </button>
      </div>
    </div>
  )
}
