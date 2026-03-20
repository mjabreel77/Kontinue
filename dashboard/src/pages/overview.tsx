import { useState } from 'react'
import { Markdown } from '@/components/markdown'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  KanbanSquare, Scale, Eye, Radio, Clock, Activity,
  FileText, ExternalLink, ListChecks, HelpCircle,
  CheckCircle2, ArrowRight, CircleDot,
} from 'lucide-react'
import type { DashboardData, Plan } from '@/types'
import { useDashboardStore } from '@/lib/store'

/* ── Stat Cards ─────────────────────────────────────────────── */

function StatCard({ label, value, sub, icon: Icon, accent }: {
  label: string; value: number | string; sub: string
  icon: React.ComponentType<{ className?: string }>
  accent?: string
}) {
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="flex items-center gap-4 p-4">
        <div className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${accent || 'bg-muted'}`}>
          <Icon className="size-[18px] text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-2xl font-bold tracking-tight">{value}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{sub}</div>
        </div>
        <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      </CardContent>
    </Card>
  )
}

/* ── Session Card ───────────────────────────────────────────── */

function SessionCard({ data }: { data: DashboardData }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Activity className="size-4 text-muted-foreground" />
          Session
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5 pt-0">
        {data.session ? (
          <>
            <Row label="Duration" value={`${data.session.ageMin}m`} />
            <Row label="Tool calls" value={String(data.session.toolCalls)} />
            {data.session.branch && (
              <Row label="Branch">
                <Badge variant="secondary" className="text-[10px] font-mono px-2 py-0">
                  {data.session.branch}
                </Badge>
              </Row>
            )}
          </>
        ) : (
          <p className="text-xs text-muted-foreground">No active session</p>
        )}
      </CardContent>
    </Card>
  )
}

/* ── Checkpoint Card ────────────────────────────────────────── */

function CheckpointCard({ data }: { data: DashboardData }) {
  const cp = data.checkpoint
  const stale = cp && cp.ageMin > 30
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Clock className="size-4 text-muted-foreground" />
          Last Checkpoint
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5 pt-0">
        {cp ? (
          <>
            <Badge variant={stale ? 'destructive' : 'secondary'} className="text-[10px] px-2 py-0">
              {cp.ageMin}m ago
            </Badge>
            <div className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
              <Markdown compact>{cp.progress}</Markdown>
            </div>
            {cp.nextStep && (
              <div className="flex items-start gap-1.5 text-xs">
                <ArrowRight className="size-3 mt-0.5 shrink-0 text-primary" />
                <span className="font-medium">{cp.nextStep}</span>
              </div>
            )}
          </>
        ) : (
          <p className="text-xs text-muted-foreground">No checkpoint yet</p>
        )}
      </CardContent>
    </Card>
  )
}

/* ── Handoff Card ───────────────────────────────────────────── */

function HandoffCard({ data }: { data: DashboardData }) {
  const [open, setOpen] = useState(false)
  const h = data.lastHandoff
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <FileText className="size-4 text-muted-foreground" />
            Last Handoff
          </CardTitle>
          {h && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <button className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline">
                  View full <ExternalLink className="size-[11px]" />
                </button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[80vh]">
                <DialogHeader>
                  <DialogTitle>Session Handoff — {new Date(h.createdAt).toLocaleDateString()}</DialogTitle>
                </DialogHeader>
                <ScrollArea className="h-[60vh] pr-4">
                  <Markdown>{h.summary || 'No handoff note.'}</Markdown>
                  {h.blockers && h.blockers.length > 0 && (
                    <div className="mt-4 pt-3 border-t">
                      <div className="text-xs font-semibold mb-2">Blockers</div>
                      <ul className="list-disc list-inside text-muted-foreground text-sm">
                        {h.blockers.map((b, i) => <li key={i}>{b}</li>)}
                      </ul>
                    </div>
                  )}
                </ScrollArea>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2.5 pt-0">
        {h ? (
          <>
            <Badge variant="secondary" className="text-[10px] px-2 py-0">
              {new Date(h.createdAt).toLocaleDateString()}
            </Badge>
            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-4">
              {h.summary?.slice(0, 300) || 'No note'}
            </p>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">No handoff yet</p>
        )}
      </CardContent>
    </Card>
  )
}

/* ── Active Plans Card (consolidated) ───────────────────────── */

function PlanProgress({ plan }: { plan: Plan }) {
  const done = plan.steps.filter(s => s.status === 'done').length
  const skipped = plan.steps.filter(s => s.status === 'skipped').length
  const total = plan.steps.length
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold truncate pr-2">{plan.title}</span>
        <span className="text-[11px] text-muted-foreground font-medium shrink-0">
          {done}/{total}
        </span>
      </div>
      {plan.goal && (
        <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-1">{plan.goal}</p>
      )}
      {/* Progress bar */}
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex gap-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <CheckCircle2 className="size-3 text-emerald-500" /> {done} done
        </span>
        {skipped > 0 && (
          <span className="flex items-center gap-1">
            <CircleDot className="size-3 text-amber-500" /> {skipped} skipped
          </span>
        )}
        <span className="flex items-center gap-1">
          <CircleDot className="size-3" /> {total - done - skipped} remaining
        </span>
      </div>
    </div>
  )
}

function ActivePlansCard({ plans }: { plans: Plan[] }) {
  const active = plans.filter(p => p.status === 'active')
  if (active.length === 0) return null

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <ListChecks className="size-4 text-muted-foreground" />
          Active Plans
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-auto">
            {active.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-0">
          {active.map((plan, i) => (
            <div key={plan.id}>
              {i > 0 && <Separator className="my-3" />}
              <PlanProgress plan={plan} />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

/* ── Open Questions Card ────────────────────────────────────── */

function OpenQuestionsCard({ questions }: { questions: DashboardData['questions'] }) {
  const open = questions.filter(q => !q.resolvedAt)
  if (open.length === 0) return null

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <HelpCircle className="size-4 text-muted-foreground" />
          Open Questions
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-auto text-amber-600">
            {open.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        {open.map(q => (
          <div
            key={q.id}
            className="flex items-start gap-2.5 text-[13px] p-2.5 rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-800/30"
          >
            <Badge className="text-[9px] px-1.5 py-0 bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300 shrink-0 mt-0.5">
              ?
            </Badge>
            <span className="leading-relaxed">{q.text}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

/* ── Helper ─────────────────────────────────────────────────── */

function Row({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-[13px]">
      <span className="text-muted-foreground">{label}</span>
      {children ?? <span className="font-medium">{value}</span>}
    </div>
  )
}

/* ── Page ───────────────────────────────────────────────────── */

export function OverviewPage() {
  const data = useDashboardStore(s => s.data)
  if (!data) return null

  const taskCounts = {
    todo: data.tasks.todo.length,
    inProgress: data.tasks.inProgress.length,
    done: data.tasks.done.length,
  }
  const totalTasks = taskCounts.todo + taskCounts.inProgress + taskCounts.done
  const activeDecisions = data.decisions.filter(d => !d.supersededById).length
  const activeObs = data.observations.filter(o => !o.resolvedAt).length

  return (
    <div className="p-6 max-w-[1200px] mx-auto space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-[13px] text-muted-foreground mt-0.5">
          {data.project.name} — {data.git.branch || 'no branch'} @ {data.git.commit?.slice(0, 7) || '—'}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Tasks" icon={KanbanSquare} value={totalTasks}
          sub={`${taskCounts.inProgress} active · ${taskCounts.todo} todo · ${taskCounts.done} done`}
        />
        <StatCard
          label="Decisions" icon={Scale} value={data.decisions.length}
          sub={`${activeDecisions} active`}
        />
        <StatCard
          label="Observations" icon={Eye} value={data.observations.length}
          sub={`${activeObs} active`}
        />
        <StatCard
          label="Signals" icon={Radio} value={data.signals.pending.length}
          sub="pending"
        />
      </div>

      {/* Session / Checkpoint / Handoff */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <SessionCard data={data} />
        <CheckpointCard data={data} />
        <HandoffCard data={data} />
      </div>

      {/* Plans + Questions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <ActivePlansCard plans={data.plans} />
        <OpenQuestionsCard questions={data.questions} />
      </div>
    </div>
  )
}
