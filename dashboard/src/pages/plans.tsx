import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { CheckCircle2, Circle, SkipForward } from 'lucide-react'
import type { DashboardData, Plan } from '@/types'

interface Props { data: DashboardData }

export function PlansPage({ data }: Props) {
  const active = data.plans.filter(p => p.status === 'active')
  const completed = data.plans.filter(p => p.status === 'complete')
  const other = data.plans.filter(p => p.status !== 'active' && p.status !== 'complete')

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Plans</h1>
        <Badge variant="secondary">{data.plans.length} total</Badge>
      </div>

      <ScrollArea className="h-[calc(100vh-160px)]">
        <div className="space-y-6">
          {active.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">Active ({active.length})</h3>
              {active.map(p => <PlanCard key={p.id} plan={p} />)}
            </div>
          )}
          {completed.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">Completed ({completed.length})</h3>
              {completed.map(p => <PlanCard key={p.id} plan={p} />)}
            </div>
          )}
          {other.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">Other ({other.length})</h3>
              {other.map(p => <PlanCard key={p.id} plan={p} />)}
            </div>
          )}
          {data.plans.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-12">No plans yet</p>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

function PlanCard({ plan }: { plan: Plan }) {
  const done = plan.steps.filter(s => s.status === 'done').length
  const total = plan.steps.length
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">{plan.title}</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant={plan.status === 'active' ? 'default' : plan.status === 'complete' ? 'success' : 'secondary'} className="text-xs">
              {plan.status}
            </Badge>
            <span className="text-xs text-muted-foreground">{done}/{total}</span>
          </div>
        </div>
        {plan.goal && <p className="text-xs text-muted-foreground mt-1">{plan.goal}</p>}
      </CardHeader>
      <CardContent>
        {/* Progress bar */}
        <div className="h-2 w-full rounded-full bg-secondary mb-4">
          <div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>

        {/* Steps */}
        <div className="space-y-2">
          {plan.steps.sort((a, b) => a.step_order - b.step_order).map(step => (
            <div key={step.id} className="flex items-center gap-2 text-sm">
              {step.status === 'done' ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
              ) : step.status === 'skipped' ? (
                <SkipForward className="h-4 w-4 text-muted-foreground shrink-0" />
              ) : (
                <Circle className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
              <span className={step.status === 'done' ? 'line-through text-muted-foreground' : step.status === 'skipped' ? 'text-muted-foreground' : ''}>
                {step.content}
              </span>
            </div>
          ))}
        </div>

        <Separator className="my-3" />
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>Created: {new Date(plan.created_at).toLocaleDateString()}</span>
          <span>Updated: {new Date(plan.updated_at).toLocaleDateString()}</span>
        </div>
      </CardContent>
    </Card>
  )
}
