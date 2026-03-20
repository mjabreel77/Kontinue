import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCircle2, Scale, Eye, FileText, Radio, Clock, Zap, MessageSquare, AlertTriangle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import { SidebarMenuButton, useSidebar } from '@/components/ui/sidebar'
import { useDashboardStore } from '@/lib/store'

const typeIcons: Record<string, React.ReactNode> = {
  task: <CheckCircle2 className="size-3.5 text-blue-500 shrink-0" />,
  decision: <Scale className="size-3.5 text-purple-500 shrink-0" />,
  observation: <Eye className="size-3.5 text-amber-500 shrink-0" />,
  signal: <Radio className="size-3.5 text-red-500 shrink-0" />,
  checkpoint: <Clock className="size-3.5 text-emerald-500 shrink-0" />,
  plan: <FileText className="size-3.5 text-cyan-500 shrink-0" />,
  handoff: <Zap className="size-3.5 text-orange-500 shrink-0" />,
  session: <MessageSquare className="size-3.5 text-slate-400 shrink-0" />,
}

const typeRoutes: Record<string, string> = {
  task: '/board',
  decision: '/decisions',
  observation: '/observations',
  signal: '/signals',
  plan: '/plans',
  checkpoint: '/',
  handoff: '/',
  session: '/',
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function NotificationPanel() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const { state } = useSidebar()
  const collapsed = state === 'collapsed'
  const data = useDashboardStore(s => s.data)
  const activities = data?.activity ?? []
  const count = activities.length

  const handleClick = (type: string) => {
    const route = typeRoutes[type]
    if (route) {
      setOpen(false)
      navigate(route)
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <SheetTrigger asChild>
            <SidebarMenuButton
              data-active={open}
              className="relative"
            >
              <Bell />
              {!collapsed && <span>Activity</span>}
              {count > 0 && (
                <span className={`
                  text-[10px] leading-4 min-w-4 h-4 px-1 rounded-full
                  bg-destructive text-destructive-foreground font-bold text-center
                  ${collapsed ? 'absolute top-1 right-1' : 'ml-auto'}
                `}>
                  {count > 99 ? '99+' : count}
                </span>
              )}
            </SidebarMenuButton>
          </SheetTrigger>
        </TooltipTrigger>
        {collapsed && <TooltipContent side="right">Activity</TooltipContent>}
      </Tooltip>

      <SheetContent side="right" className="p-0 flex flex-col sm:max-w-md">
        <SheetHeader className="px-6 pt-6 pb-4 border-b">
          <div className="flex items-center justify-between">
            <SheetTitle>Activity</SheetTitle>
            {count > 0 && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {count} {count === 1 ? 'event' : 'events'}
              </Badge>
            )}
          </div>
          <SheetDescription>Recent activity across your project</SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1">
          {activities.length === 0 ? (
            <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
              No activity yet
            </div>
          ) : (
            <div className="flex flex-col">
              {activities.map((item, i) => (
                <button
                  key={i}
                  onClick={() => handleClick(item.type)}
                  className="flex items-start gap-3 px-6 py-3 border-b border-border/40 last:border-0 hover:bg-muted/40 transition-colors text-left cursor-pointer"
                >
                  <div className="mt-0.5">
                    {typeIcons[item.type] || <AlertTriangle className="size-3.5 text-slate-400 shrink-0" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] leading-snug">{item.summary}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-muted-foreground">{timeAgo(item.ts)}</span>
                      <span className="text-[10px] text-muted-foreground/60 capitalize">{item.type}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
