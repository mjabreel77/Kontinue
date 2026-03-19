import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  CheckCircle2, MessageSquare, Scale, Eye, FileText,
  Radio, Clock, AlertTriangle, Zap
} from 'lucide-react'
import type { DashboardData } from '@/types'

interface Props { data: DashboardData }

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

export function ActivityPage({ data }: Props) {
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Activity Feed</h1>

      <ScrollArea className="h-[calc(100vh-140px)]">
        <div className="space-y-1">
          {data.activity.map((item, i) => (
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
          {data.activity.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-12">No activity yet</p>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
