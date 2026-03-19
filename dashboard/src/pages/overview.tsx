import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { KanbanSquare, Scale, Eye, Radio, Clock, Activity, FileText, ChevronRight, ExternalLink } from 'lucide-react'
import type { DashboardData } from '@/types'

interface Props { data: DashboardData }

function StatCard({ label, value, sub, icon: Icon }: { label: string; value: number | string; sub: string; icon: React.ComponentType<{ style?: React.CSSProperties }> }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', borderRadius: 8, border: '1px solid var(--color-border)', backgroundColor: 'var(--color-card)' }}>
      <div style={{ width: 40, height: 40, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--color-muted)' }}>
        <Icon style={{ width: 18, height: 18, color: 'var(--color-muted-foreground)' }} />
      </div>
      <div>
        <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.1, color: 'var(--color-foreground)' }}>{value}</div>
        <div style={{ fontSize: 11, color: 'var(--color-muted-foreground)', marginTop: 2 }}>{sub}</div>
      </div>
      <div style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 500, color: 'var(--color-muted-foreground)' }}>{label}</div>
    </div>
  )
}

function InfoCard({ title, icon: Icon, children, action }: { title: string; icon: React.ComponentType<{ style?: React.CSSProperties }>; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div style={{ borderRadius: 8, border: '1px solid var(--color-border)', backgroundColor: 'var(--color-card)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '1px solid var(--color-border)' }}>
        <Icon style={{ width: 15, height: 15, color: 'var(--color-muted-foreground)' }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-foreground)' }}>{title}</span>
        {action && <span style={{ marginLeft: 'auto' }}>{action}</span>}
      </div>
      <div style={{ padding: 16 }}>
        {children}
      </div>
    </div>
  )
}

export function OverviewPage({ data }: Props) {
  const [handoffOpen, setHandoffOpen] = useState(false)
  const taskCounts = {
    todo: data.tasks.todo.length,
    inProgress: data.tasks.inProgress.length,
    done: data.tasks.done.length,
  }
  const totalTasks = taskCounts.todo + taskCounts.inProgress + taskCounts.done
  const activeDecisions = data.decisions.filter(d => !d.superseded_by).length
  const activeObs = data.observations.filter(o => !o.resolved_at).length

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.3, color: 'var(--color-foreground)' }}>Dashboard</h1>
        <p style={{ fontSize: 13, color: 'var(--color-muted-foreground)', marginTop: 2 }}>
          {data.project.name} — {data.git.branch || 'no branch'} @ {data.git.commit?.slice(0, 7) || '—'}
        </p>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 20 }}>
        <StatCard label="Tasks" value={totalTasks} sub={`${taskCounts.inProgress} active · ${taskCounts.todo} todo · ${taskCounts.done} done`} icon={KanbanSquare} />
        <StatCard label="Decisions" value={data.decisions.length} sub={`${activeDecisions} active`} icon={Scale} />
        <StatCard label="Observations" value={data.observations.length} sub={`${activeObs} active`} icon={Eye} />
        <StatCard label="Signals" value={data.signals.pending.length} sub="pending" icon={Radio} />
      </div>

      {/* Session / Checkpoint / Handoff row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12, marginBottom: 20 }}>
        <InfoCard title="Session" icon={Activity}>
          {data.session ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--color-muted-foreground)' }}>Duration</span>
                <span style={{ fontWeight: 500 }}>{data.session.ageMin}m</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--color-muted-foreground)' }}>Tool calls</span>
                <span style={{ fontWeight: 500 }}>{data.session.toolCalls}</span>
              </div>
              {data.session.branch && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, alignItems: 'center' }}>
                  <span style={{ color: 'var(--color-muted-foreground)' }}>Branch</span>
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, backgroundColor: 'var(--color-muted)', fontWeight: 500 }}>{data.session.branch}</span>
                </div>
              )}
            </div>
          ) : (
            <p style={{ fontSize: 12, color: 'var(--color-muted-foreground)' }}>No active session</p>
          )}
        </InfoCard>

        <InfoCard title="Last Checkpoint" icon={Clock}>
          {data.checkpoint ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{
                alignSelf: 'flex-start', fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 500,
                backgroundColor: data.checkpoint.ageMin > 30 ? '#fef2f2' : 'var(--color-muted)',
                color: data.checkpoint.ageMin > 30 ? '#dc2626' : 'var(--color-muted-foreground)',
              }}>
                {data.checkpoint.ageMin}m ago
              </span>
              <p style={{ fontSize: 12, color: 'var(--color-muted-foreground)', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {data.checkpoint.progress}
              </p>
              {data.checkpoint.next_step && (
                <p style={{ fontSize: 12 }}><strong>Next:</strong> {data.checkpoint.next_step}</p>
              )}
            </div>
          ) : (
            <p style={{ fontSize: 12, color: 'var(--color-muted-foreground)' }}>No checkpoint yet</p>
          )}
        </InfoCard>

        <InfoCard
          title="Last Handoff"
          icon={FileText}
          action={data.lastHandoff ? (
            <Dialog open={handoffOpen} onOpenChange={setHandoffOpen}>
              <DialogTrigger asChild>
                <button style={{
                  display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 500,
                  color: 'var(--color-primary)', cursor: 'pointer', border: 'none', background: 'none', padding: 0,
                }}>
                  View full <ExternalLink style={{ width: 11, height: 11 }} />
                </button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[80vh]">
                <DialogHeader>
                  <DialogTitle>Session Handoff — {new Date(data.lastHandoff!.ended_at).toLocaleDateString()}</DialogTitle>
                </DialogHeader>
                <ScrollArea className="h-[60vh] pr-4">
                  <div style={{ fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap', color: 'var(--color-foreground)' }}>
                    {data.lastHandoff!.handoff_note || 'No handoff note.'}
                  </div>
                  {data.lastHandoff!.files_touched && (
                    <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--color-border)' }}>
                      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Files touched</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {data.lastHandoff!.files_touched.split('\n').filter(Boolean).map((f, i) => (
                          <span key={i} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, backgroundColor: 'var(--color-muted)', fontFamily: 'monospace' }}>{f}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </ScrollArea>
              </DialogContent>
            </Dialog>
          ) : undefined}
        >
          {data.lastHandoff ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ alignSelf: 'flex-start', fontSize: 11, padding: '2px 8px', borderRadius: 4, backgroundColor: 'var(--color-muted)', fontWeight: 500 }}>
                {new Date(data.lastHandoff.ended_at).toLocaleDateString()}
              </span>
              <p style={{ fontSize: 12, color: 'var(--color-muted-foreground)', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {data.lastHandoff.handoff_note?.slice(0, 300) || 'No note'}
              </p>
            </div>
          ) : (
            <p style={{ fontSize: 12, color: 'var(--color-muted-foreground)' }}>No handoff yet</p>
          )}
        </InfoCard>
      </div>

      {/* Active Plans */}
      {data.plans.filter(p => p.status === 'active').length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, color: 'var(--color-foreground)' }}>Active Plans</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.plans.filter(p => p.status === 'active').map(plan => {
              const done = plan.steps.filter(s => s.status === 'done').length
              const total = plan.steps.length
              const pct = total > 0 ? Math.round((done / total) * 100) : 0
              return (
                <div key={plan.id} style={{ padding: '12px 16px', borderRadius: 8, border: '1px solid var(--color-border)', backgroundColor: 'var(--color-card)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{plan.title}</span>
                    <span style={{ fontSize: 11, color: 'var(--color-muted-foreground)', fontWeight: 500 }}>{done}/{total}</span>
                  </div>
                  <div style={{ height: 4, borderRadius: 2, backgroundColor: 'var(--color-muted)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 2, backgroundColor: 'var(--color-primary)', width: `${pct}%`, transition: 'width 0.3s' }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Open Questions */}
      {data.questions.filter(q => q.status === 'open').length > 0 && (
        <div>
          <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Open Questions</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {data.questions.filter(q => q.status === 'open').map(q => (
              <div key={q.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 14px', borderRadius: 8, border: '1px solid var(--color-border)', backgroundColor: 'var(--color-card)', fontSize: 13 }}>
                <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, backgroundColor: '#fef3c7', color: '#92400e', fontWeight: 600, flexShrink: 0 }}>?</span>
                <span>{q.question}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
