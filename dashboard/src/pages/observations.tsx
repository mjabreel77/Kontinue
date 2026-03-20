import { useState } from 'react'
import { Markdown } from '@/components/markdown'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Eye, Search, CheckCircle2 } from 'lucide-react'
import type { Observation } from '@/types'
import { useDashboardStore } from '@/lib/store'

export function ObservationsPage() {
  const data = useDashboardStore(s => s.data)
  const [selected, setSelected] = useState<Observation | null>(null)
  const [search, setSearch] = useState('')

  if (!data) return null

  const lc = search.toLowerCase()
  const filtered = data.observations.filter(o =>
    !search || o.content.toLowerCase().includes(lc) || o.files?.some(f => f.toLowerCase().includes(lc))
  )
  const active = filtered.filter(o => !o.resolvedAt)
  const resolved = filtered.filter(o => o.resolvedAt)

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-[22px] font-bold tracking-tight">Observations</h1>
        <Badge variant="secondary" className="text-xs font-medium">
          {data.observations.length} total
        </Badge>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          placeholder="Search observations..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {active.length > 0 && (
        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Active ({active.length})
          </h3>
          <div className="flex flex-col gap-2">
            {active.map(o => (
              <ObservationCard key={o.id} observation={o} onViewDetail={() => setSelected(o)} />
            ))}
          </div>
        </section>
      )}

      {resolved.length > 0 && (
        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Resolved ({resolved.length})
          </h3>
          <div className="flex flex-col gap-2">
            {resolved.map(o => (
              <ObservationCard key={o.id} observation={o} resolved onViewDetail={() => setSelected(o)} />
            ))}
          </div>
        </section>
      )}

      {filtered.length === 0 && (
        <p className="text-center py-12 text-sm text-muted-foreground">
          {search ? 'No observations match your search' : 'No observations yet'}
        </p>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Eye className="size-4 text-amber-500" />
                  <span className="text-sm text-muted-foreground">Observation</span>
                  {selected.taskId && (
                    <Badge variant="outline" className="text-[11px] font-medium">
                      Task #{selected.taskId.slice(0, 8)}
                    </Badge>
                  )}
                  {selected.resolvedAt && (
                    <Badge variant="secondary" className="text-[11px]">
                      <CheckCircle2 className="size-3 mr-1" /> Resolved
                    </Badge>
                  )}
                </DialogTitle>
              </DialogHeader>
              <ScrollArea className="max-h-[60vh] pr-4">
                <Markdown>{selected.content}</Markdown>
                {selected.files && selected.files.length > 0 && (
                  <div className="mt-4 pt-3 border-t">
                    <span className="text-[11px] font-medium text-muted-foreground">Files: </span>
                    <span className="text-[12px] font-mono">{selected.files.join(', ')}</span>
                  </div>
                )}
              </ScrollArea>
              <div className="border-t pt-3 text-[11px] text-muted-foreground flex gap-4">
                <span>Created: {new Date(selected.createdAt).toLocaleString()}</span>
                {selected.resolvedAt && <span>Resolved: {new Date(selected.resolvedAt).toLocaleString()}</span>}
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
    <div className={`p-3.5 rounded-lg border bg-card ${resolved ? 'opacity-50' : ''}`}>
      <p className={`text-sm leading-relaxed ${resolved ? 'line-through' : ''}`}>
        {displayText}
      </p>
      <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
        {o.taskId && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            Task #{o.taskId.slice(0, 8)}
          </Badge>
        )}
        {o.files && o.files.length > 0 && (
          <span className="font-mono truncate max-w-[200px]">{o.files.join(', ')}</span>
        )}
        <span>{new Date(o.createdAt).toLocaleDateString()}</span>
        <Button
          variant="link"
          size="sm"
          onClick={onViewDetail}
          className="ml-auto text-[11px] h-auto p-0 font-medium"
        >
          View details →
        </Button>
      </div>
    </div>
  )
}
