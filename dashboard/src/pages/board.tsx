import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import {
  Plus, Maximize2, Minimize2, ChevronDown, ChevronUp,
  ExternalLink, Circle, Loader2, CheckCircle2, XCircle,
  AlertTriangle, ListChecks, Clock, GripVertical,
} from 'lucide-react'
import { addTask } from '@/lib/api'
import type { DashboardData, Task } from '@/types'

interface Props { data: DashboardData }

const INITIAL_SHOW = 7

/* ── Column config — icons only, no colors ─────────────────── */

const columnMeta: Record<string, { icon: React.ReactNode; emptyText: string }> = {
  todo:       { icon: <Circle className="size-3.5" />,                    emptyText: 'No tasks in the queue' },
  inProgress: { icon: <Loader2 className="size-3.5 animate-spin" />,     emptyText: 'Nothing in progress' },
  done:       { icon: <CheckCircle2 className="size-3.5" />,             emptyText: 'No completed tasks yet' },
}

/* ── Checklist progress bar ────────────────────────────────── */

function ChecklistBar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  return (
    <div className="flex items-center gap-2 w-full" title={`${done}/${total} items`}>
      <div className="flex-1 h-1 rounded-full bg-muted">
        <div
          className="h-1 rounded-full bg-primary/60 transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] text-muted-foreground font-medium shrink-0">{done}/{total}</span>
    </div>
  )
}

/* ── Task Card ─────────────────────────────────────────────── */

function TaskCard({ task, isStale, onClick }: {
  task: Task; isStale: boolean; onClick: () => void
}) {
  const checkDone = task.items?.filter(i => i.done).length ?? 0
  const checkTotal = task.items?.length ?? 0
  const hasBlockers = task.blockers && task.blockers.length > 0

  return (
    <button
      onClick={onClick}
      className={`group w-full text-left rounded-lg border bg-card px-3 py-2.5 cursor-pointer
        transition-all duration-150
        hover:shadow-sm hover:border-primary/30
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
        ${isStale ? 'border-destructive/40' : ''}
      `}
    >
      {/* Header: id + badges */}
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-[10px] text-muted-foreground/70 font-mono">#{task.id}</span>
        {isStale && (
          <Badge variant="destructive" className="text-[9px] px-1 py-0 h-3.5">stale</Badge>
        )}
        {hasBlockers && (
          <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 border-muted-foreground/30 text-muted-foreground">
            <AlertTriangle className="size-2.5 mr-0.5" /> blocked
          </Badge>
        )}
        {task.external_url && (
          <ExternalLink className="size-3 text-muted-foreground/50 ml-auto shrink-0" />
        )}
      </div>

      {/* Title */}
      <p className="text-[13px] font-medium leading-snug">{task.title}</p>

      {/* Description preview */}
      {task.description && (
        <p className="text-[11px] text-muted-foreground/70 mt-1 line-clamp-2 leading-relaxed">
          {task.description}
        </p>
      )}

      {/* Footer */}
      {(checkTotal > 0 || task.updated_at) && (
        <div className="mt-2 flex items-center gap-3">
          {checkTotal > 0 && (
            <div className="flex-1 min-w-0">
              <ChecklistBar done={checkDone} total={checkTotal} />
            </div>
          )}
          <span className="text-[10px] text-muted-foreground/50 shrink-0 ml-auto">
            {new Date(task.updated_at).toLocaleDateString()}
          </span>
        </div>
      )}
    </button>
  )
}

/* ── Task Detail Dialog ────────────────────────────────────── */

function TaskDetail({ task, onClose }: { task: Task; onClose: () => void }) {
  const statusIcon = {
    'todo': <Circle className="size-4 text-muted-foreground" />,
    'in-progress': <Loader2 className="size-4 text-primary animate-spin" />,
    'done': <CheckCircle2 className="size-4 text-primary" />,
    'abandoned': <XCircle className="size-4 text-destructive" />,
  }[task.status] || null

  const statusBadgeVariant: 'default' | 'success' | 'destructive' | 'secondary' =
    task.status === 'in-progress' ? 'default' :
    task.status === 'done' ? 'success' :
    task.status === 'abandoned' ? 'destructive' : 'secondary'

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2.5">
          {statusIcon}
          <span className="text-muted-foreground text-sm font-mono">#{task.id}</span>
          <span className="truncate">{task.title}</span>
          {task.external_url && (
            <a
              href={task.external_url}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0"
              onClick={e => e.stopPropagation()}
            >
              <ExternalLink className="size-3.5 text-muted-foreground hover:text-foreground transition-colors" />
            </a>
          )}
        </DialogTitle>
        <DialogDescription asChild>
          <div className="flex items-center gap-2 pt-1">
            <Badge variant={statusBadgeVariant} className="text-[11px]">
              {task.status}
            </Badge>
            {task.external_ref && (
              <Badge variant="outline" className="text-[10px] font-mono">{task.external_ref}</Badge>
            )}
          </div>
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 text-sm">
        {task.description && (
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Description</h4>
            <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{task.description}</p>
          </div>
        )}

        {task.outcome && (
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Outcome</h4>
            <p className="text-[13px] leading-relaxed whitespace-pre-wrap text-muted-foreground">{task.outcome}</p>
          </div>
        )}

        {task.items && task.items.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5 flex items-center gap-1.5">
              <ListChecks className="size-3.5" />
              Checklist
              <span className="text-[10px] font-normal">
                ({task.items.filter(i => i.done).length}/{task.items.length})
              </span>
            </h4>
            <div className="space-y-1.5">
              {task.items.map(item => (
                <div key={item.id} className="flex items-start gap-2 text-[13px]">
                  {item.done ? (
                    <CheckCircle2 className="size-4 text-primary mt-0.5 shrink-0" />
                  ) : (
                    <Circle className="size-4 text-muted-foreground mt-0.5 shrink-0" />
                  )}
                  <span className={item.done ? 'line-through text-muted-foreground' : ''}>{item.content}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {task.blockers && task.blockers.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-destructive mb-1.5 flex items-center gap-1.5">
              <AlertTriangle className="size-3.5" />
              Blocked by
            </h4>
            <div className="space-y-1">
              {task.blockers.map(b => (
                <div key={b.id} className="flex items-center gap-2 text-[13px]">
                  <span className="text-muted-foreground font-mono text-[11px]">#{b.id}</span>
                  <span>{b.title}</span>
                  <Badge variant="secondary" className="text-[9px] ml-auto">{b.status}</Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {task.blocking && task.blocking.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Blocking</h4>
            <div className="space-y-1">
              {task.blocking.map(b => (
                <div key={b.id} className="flex items-center gap-2 text-[13px]">
                  <span className="text-muted-foreground font-mono text-[11px]">#{b.id}</span>
                  <span>{b.title}</span>
                  <Badge variant="secondary" className="text-[9px] ml-auto">{b.status}</Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        <Separator />
        <div className="flex justify-between text-[11px] text-muted-foreground">
          <span>Created {new Date(task.created_at).toLocaleString()}</span>
          <span>Updated {new Date(task.updated_at).toLocaleString()}</span>
        </div>
      </div>
    </DialogContent>
  )
}

/* ── Board Page ────────────────────────────────────────────── */

export function BoardPage({ data }: Props) {
  const [fullscreen, setFullscreen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [expandedCols, setExpandedCols] = useState<Record<string, boolean>>({})

  const staleIds = new Set(data.staleTasks.map(t => t.id))

  const handleAdd = async () => {
    if (!title.trim()) return
    await addTask(title.trim(), desc.trim())
    setTitle('')
    setDesc('')
    setAddOpen(false)
  }

  const toggleExpand = (col: string) => {
    setExpandedCols(prev => ({ ...prev, [col]: !prev[col] }))
  }

  const columns = [
    { key: 'todo', label: 'Todo', tasks: data.tasks.todo },
    { key: 'inProgress', label: 'In Progress', tasks: data.tasks.inProgress },
    { key: 'done', label: 'Done', tasks: data.tasks.done },
  ]

  const totalTasks = columns.reduce((sum, c) => sum + c.tasks.length, 0)

  return (
    <div className={`p-6 space-y-4 ${fullscreen ? 'fixed inset-0 z-50 bg-background' : ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Task Board</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            {totalTasks} task{totalTasks !== 1 ? 's' : ''} across {columns.filter(c => c.tasks.length > 0).length} columns
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="size-4 mr-1.5" /> Add Task
            </Button>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Task</DialogTitle>
                <DialogDescription>Create a new task for the agent to work on.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3 pt-2">
                <Input placeholder="Task title..." value={title} onChange={e => setTitle(e.target.value)} autoFocus />
                <Textarea placeholder="Description — what does done look like?" value={desc} onChange={e => setDesc(e.target.value)} rows={3} />
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
                  <Button onClick={handleAdd} disabled={!title.trim()}>Create</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          <Button size="sm" variant="outline" onClick={() => setFullscreen(!fullscreen)}>
            {fullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </Button>
        </div>
      </div>

      {/* Board columns */}
      <div
        className="grid grid-cols-3 gap-3"
        style={{ height: fullscreen ? 'calc(100vh - 100px)' : 'calc(100vh - 180px)' }}
      >
        {columns.map(col => {
          const meta = columnMeta[col.key] || columnMeta.todo
          const expanded = expandedCols[col.key]
          const visible = expanded ? col.tasks : col.tasks.slice(0, INITIAL_SHOW)
          const hasMore = col.tasks.length > INITIAL_SHOW

          return (
            <div
              key={col.key}
              className="flex flex-col rounded-lg border bg-muted/30 overflow-hidden min-h-0"
            >
              {/* Column header */}
              <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-border/60">
                <div className="flex items-center gap-2 text-muted-foreground">
                  {meta.icon}
                  <span className="text-[11px] font-semibold uppercase tracking-wider">{col.label}</span>
                </div>
                <span className="text-[11px] font-medium tabular-nums text-muted-foreground/70">
                  {col.tasks.length}
                </span>
              </div>

              {/* Cards */}
              <div className="flex-1 overflow-y-auto p-2">
                <div className="flex flex-col gap-1.5">
                  {visible.length === 0 && (
                    <p className="text-center py-12 text-[12px] text-muted-foreground/50">
                      {meta.emptyText}
                    </p>
                  )}
                  {visible.map(task => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      isStale={staleIds.has(task.id)}
                      onClick={() => setSelectedTask(task)}
                    />
                  ))}
                  {hasMore && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-xs text-muted-foreground mt-1"
                      onClick={() => toggleExpand(col.key)}
                    >
                      {expanded ? (
                        <><ChevronUp className="size-3 mr-1" /> Show less</>
                      ) : (
                        <><ChevronDown className="size-3 mr-1" /> {col.tasks.length - INITIAL_SHOW} more</>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Task Detail Dialog */}
      <Dialog open={!!selectedTask} onOpenChange={() => setSelectedTask(null)}>
        {selectedTask && <TaskDetail task={selectedTask} onClose={() => setSelectedTask(null)} />}
      </Dialog>
    </div>
  )
}
