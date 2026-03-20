import { useState, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  CheckCircle2, MessageSquare, Scale, Eye, FileText,
  Radio, Clock, AlertTriangle, Zap, Search, X
} from 'lucide-react'
import { useDashboardStore } from '@/lib/store'

const typeIcons: Record<string, React.ReactNode> = {
  task: <CheckCircle2 className="h-4 w-4 text-blue-500" />,
  decision: <Scale className="h-4 w-4 text-purple-500" />,
  observation: <Eye className="h-4 w-4 text-amber-500" />,
  signal: <Radio className="h-4 w-4 text-red-500" />,
  checkpoint: <Clock className="h-4 w-4 text-emerald-500" />,
  plan: <FileText className="h-4 w-4 text-cyan-500" />,
  handoff: <Zap className="h-4 w-4 text-orange-500" />,
  session: <MessageSquare className="h-4 w-4 text-muted-foreground" />,
}

const allTypes = Object.keys(typeIcons)

export function ActivityPage() {
  const data = useDashboardStore(s => s.data)
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState<string | null>(null)

  const filtered = useMemo(() => {
    if (!data) return []
    const lc = search.toLowerCase()
    return data.activity.filter(item => {
      if (activeFilter && item.type !== activeFilter) return false
      if (search && !item.summary.toLowerCase().includes(lc)) return false
      return true
    })
  }, [data?.activity, search, activeFilter])

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Activity Feed</h1>
        <Badge variant="secondary" className="text-xs">{filtered.length} events</Badge>
      </div>

      {/* Search + Filters */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search activity..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {allTypes.map(type => (
            <Button
              key={type}
              variant={activeFilter === type ? 'default' : 'outline'}
              size="sm"
              className="h-7 text-[11px] capitalize"
              onClick={() => setActiveFilter(activeFilter === type ? null : type)}
            >
              {typeIcons[type]}
              <span className="ml-1">{type}</span>
            </Button>
          ))}
          {(activeFilter || search) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-[11px]"
              onClick={() => { setActiveFilter(null); setSearch('') }}
            >
              <X className="size-3 mr-1" /> Clear
            </Button>
          )}
        </div>
      </div>

      <ScrollArea className="h-[calc(100vh-220px)]">
        <div className="space-y-1">
          {filtered.map((item, i) => (
            <Card key={i} className="shadow-none border-0 border-b rounded-none hover:bg-muted/30 transition-colors">
              <CardContent className="p-3 flex items-start gap-3">
                <div className="mt-0.5">
                  {typeIcons[item.type] || <AlertTriangle className="h-4 w-4 text-muted-foreground" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm">{item.summary}</p>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(item.ts).toLocaleString()}
                  </span>
                </div>
                <Badge variant="outline" className="text-[9px] shrink-0">{item.type}</Badge>
              </CardContent>
            </Card>
          ))}
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-12">
              {search || activeFilter ? 'No matching activity' : 'No activity yet'}
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
