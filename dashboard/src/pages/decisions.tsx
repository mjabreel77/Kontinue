import { useState } from 'react'
import { Markdown } from '@/components/markdown'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Search, ChevronRight } from 'lucide-react'
import type { Decision } from '@/types'
import { useDashboardStore } from '@/lib/store'

export function DecisionsPage() {
  const data = useDashboardStore(s => s.data)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Decision | null>(null)

  if (!data) return null

  const filtered = data.decisions.filter(d => {
    if (!search) return true
    const q = search.toLowerCase()
    return d.summary.toLowerCase().includes(q) ||
      d.tags?.some(t => t.toLowerCase().includes(q)) ||
      d.rationale?.toLowerCase().includes(q)
  })

  const active = filtered.filter(d => !d.supersededById)
  const superseded = filtered.filter(d => d.supersededById)

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Decisions</h1>
        <Badge variant="secondary">{data.decisions.length} total</Badge>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search decisions..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <ScrollArea className="h-[calc(100vh-200px)]">
        <div className="space-y-2">
          {active.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">Active ({active.length})</h3>
              {active.map(d => (
                <DecisionCard key={d.id} decision={d} onClick={() => setSelected(d)} />
              ))}
            </div>
          )}
          {superseded.length > 0 && (
            <div className="space-y-2 mt-6">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">Superseded ({superseded.length})</h3>
              {superseded.map(d => (
                <DecisionCard key={d.id} decision={d} onClick={() => setSelected(d)} dimmed />
              ))}
            </div>
          )}
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-12">No decisions found</p>
          )}
        </div>
      </ScrollArea>

      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-lg">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>{selected.summary}</DialogTitle>
                <DialogDescription>
                  {new Date(selected.createdAt).toLocaleDateString()} · #{selected.id.slice(0, 8)}
                  {selected.supersededById && (
                    <Badge variant="destructive" className="ml-2 text-[10px]">superseded</Badge>
                  )}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 text-sm">
                {selected.rationale && (
                  <div>
                    <h4 className="font-medium mb-1">Rationale</h4>
                    <Markdown className="text-muted-foreground">{selected.rationale}</Markdown>
                  </div>
                )}
                {selected.alternatives && selected.alternatives.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-1">Alternatives Considered</h4>
                    <ul className="list-disc list-inside text-muted-foreground">
                      {selected.alternatives.map((a, i) => <li key={i}>{a}</li>)}
                    </ul>
                  </div>
                )}
                {selected.context && (
                  <div>
                    <h4 className="font-medium mb-1">Context</h4>
                    <Markdown className="text-muted-foreground">{selected.context}</Markdown>
                  </div>
                )}
                {selected.files && selected.files.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-1">Files</h4>
                    <p className="text-xs text-muted-foreground font-mono">{selected.files.join(', ')}</p>
                  </div>
                )}
                {selected.tags && selected.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {selected.tags.map(t => (
                      <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function DecisionCard({ decision, onClick, dimmed }: { decision: Decision; onClick: () => void; dimmed?: boolean }) {
  return (
    <Card
      className={`cursor-pointer transition-all hover:shadow-md ${dimmed ? 'opacity-50' : ''}`}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">{decision.summary}</p>
            {decision.rationale && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{decision.rationale}</p>
            )}
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[10px] text-muted-foreground">
                {new Date(decision.createdAt).toLocaleDateString()}
              </span>
              {decision.tags && decision.tags.length > 0 && decision.tags.slice(0, 3).map(t => (
                <Badge key={t} variant="outline" className="text-[9px] py-0">{t}</Badge>
              ))}
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
        </div>
      </CardContent>
    </Card>
  )
}
