import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Plus, Maximize2, Minimize2, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react'
import { addTask } from '@/lib/api'
import type { DashboardData, Task } from '@/types'

interface Props { data: DashboardData }

const INITIAL_SHOW = 7

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

  return (
    <div className={`p-6 space-y-4 ${fullscreen ? 'fixed inset-0 z-50 bg-background' : ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Task Board</h1>
        <div className="flex gap-2">
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Add Task
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
                  <Button onClick={handleAdd} disabled={!title.trim()}>Add Task</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          <Button size="sm" variant="outline" onClick={() => setFullscreen(!fullscreen)}>
            {fullscreen ? <><Minimize2 className="h-4 w-4 mr-1" /> Exit</> : <><Maximize2 className="h-4 w-4 mr-1" /> Fullscreen</>}
          </Button>
        </div>
      </div>

      {/* Board */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, flex: 1, minHeight: 0, height: fullscreen ? 'calc(100vh - 80px)' : 'calc(100vh - 160px)' }}>
        {columns.map(col => {
          const expanded = expandedCols[col.key]
          const visible = expanded ? col.tasks : col.tasks.slice(0, INITIAL_SHOW)
          const hasMore = col.tasks.length > INITIAL_SHOW

          return (
            <div key={col.key} style={{ display: 'flex', flexDirection: 'column', borderRadius: 8, border: '1px solid var(--color-border)', backgroundColor: 'var(--color-card)', overflow: 'hidden', minHeight: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--color-border)' }}>
                <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--color-muted-foreground)' }}>{col.label}</span>
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, backgroundColor: 'var(--color-muted)', color: 'var(--color-muted-foreground)', fontWeight: 500 }}>{col.tasks.length}</span>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {visible.length === 0 && (
                    <p style={{ textAlign: 'center', padding: '24px 0', fontSize: 12, color: 'var(--color-muted-foreground)' }}>No tasks</p>
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
                      className="w-full text-xs text-muted-foreground"
                      onClick={() => toggleExpand(col.key)}
                    >
                      {expanded ? (
                        <><ChevronUp className="h-3 w-3 mr-1" /> Show less</>
                      ) : (
                        <><ChevronDown className="h-3 w-3 mr-1" /> Show {col.tasks.length - INITIAL_SHOW} more</>
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
        <DialogContent className="max-w-lg">
          {selectedTask && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span className="text-muted-foreground text-sm">#{selectedTask.id}</span>
                  {selectedTask.title}
                  {selectedTask.external_url && (
                    <a href={selectedTask.external_url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                    </a>
                  )}
                </DialogTitle>
                <DialogDescription>
                  <Badge variant={
                    selectedTask.status === 'in-progress' ? 'default' :
                    selectedTask.status === 'done' ? 'success' :
                    selectedTask.status === 'abandoned' ? 'destructive' : 'secondary'
                  } className="text-xs">
                    {selectedTask.status}
                  </Badge>
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 text-sm">
                {selectedTask.description && (
                  <div>
                    <h4 className="font-medium mb-1">Description</h4>
                    <p className="text-muted-foreground whitespace-pre-wrap">{selectedTask.description}</p>
                  </div>
                )}
                {selectedTask.outcome && (
                  <div>
                    <h4 className="font-medium mb-1">Outcome</h4>
                    <p className="text-muted-foreground whitespace-pre-wrap">{selectedTask.outcome}</p>
                  </div>
                )}
                {selectedTask.items && selectedTask.items.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-1">Checklist</h4>
                    <div className="space-y-1">
                      {selectedTask.items.map(item => (
                        <div key={item.id} className="flex items-center gap-2 text-xs">
                          <span>{item.done ? '✓' : '○'}</span>
                          <span className={item.done ? 'line-through text-muted-foreground' : ''}>{item.content}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Created: {new Date(selectedTask.created_at).toLocaleString()}</span>
                  <span>Updated: {new Date(selectedTask.updated_at).toLocaleString()}</span>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function TaskCard({ task, isStale, onClick }: { task: Task; isStale: boolean; onClick: () => void }) {
  return (
    <div
      className={`rounded-lg border p-3 cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 ${
        isStale ? 'border-red-300 dark:border-red-800 border-l-[3px] border-l-red-500' : 'hover:border-ring'
      }`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">#{task.id}</span>
            <span className="text-sm font-medium truncate">{task.title}</span>
          </div>
          {task.description && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{task.description}</p>
          )}
        </div>
        {isStale && <Badge variant="destructive" className="text-[10px] shrink-0">stale</Badge>}
        {task.external_url && <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0" />}
      </div>
      {task.items && task.items.length > 0 && (
        <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
          <span>{task.items.filter(i => i.done).length}/{task.items.length}</span>
          <div className="flex-1 h-1 rounded-full bg-secondary">
            <div
              className="h-1 rounded-full bg-primary transition-all"
              style={{ width: `${(task.items.filter(i => i.done).length / task.items.length) * 100}%` }}
            />
          </div>
        </div>
      )}
      <div className="mt-2 text-[10px] text-muted-foreground">
        {new Date(task.updated_at).toLocaleDateString()}
        {task.blockers && task.blockers.length > 0 && (
          <Badge variant="warning" className="ml-2 text-[9px] py-0">blocked by {task.blockers.length}</Badge>
        )}
      </div>
    </div>
  )
}
