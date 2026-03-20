import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Send, AlertTriangle } from 'lucide-react'
import { sendSignal, acknowledgeSignal } from '@/lib/api'
import { useDashboardStore } from '@/lib/store'

export function SignalsPage() {
  const data = useDashboardStore(s => s.data)
  const [message, setMessage] = useState('')
  const [type, setType] = useState('message')
  const [filterType, setFilterType] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')

  if (!data) return null

  const handleSend = async () => {
    if (!message.trim()) return
    await sendSignal(type, message.trim())
    setMessage('')
  }

  const filtered = data.signals.recent.filter(s => {
    if (filterType !== 'all' && s.type !== filterType) return false
    if (filterStatus !== 'all' && s.status !== filterStatus) return false
    return true
  })

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Signals</h1>

      {/* Signal input bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex gap-2">
            <Input
              placeholder="Message the active agent..."
              value={message}
              onChange={e => setMessage(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
              className="flex-1"
            />
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="message">Message</SelectItem>
                <SelectItem value="priority">Priority</SelectItem>
                <SelectItem value="abort">Abort</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={handleSend} disabled={!message.trim()}>
              <Send className="h-4 w-4 mr-1" /> Send
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Pending signals */}
      {data.signals.pending.length > 0 && (
        <Card className="border-amber-300 dark:border-amber-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4" /> Pending Signals ({data.signals.pending.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.signals.pending.map(s => (
              <div key={s.id} className="flex items-start justify-between gap-3 p-2 rounded-md bg-amber-50 dark:bg-amber-950/20">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="warning" className="text-[10px]">{s.type}</Badge>
                    <span className="text-xs text-muted-foreground">{new Date(s.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="text-sm mt-1">{s.content}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => acknowledgeSignal(s.id)}>Ack</Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex gap-2">
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="message">Message</SelectItem>
            <SelectItem value="priority">Priority</SelectItem>
            <SelectItem value="abort">Abort</SelectItem>
            <SelectItem value="answer">Answer</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="delivered">Delivered</SelectItem>
            <SelectItem value="acknowledged">Acknowledged</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Signal history */}
      <ScrollArea className="h-[calc(100vh-420px)]">
        <div className="space-y-2">
          {filtered.map(s => (
            <Card key={s.id}>
              <CardContent className="p-3">
                <div className="flex items-start gap-3">
                  <Badge variant={
                    s.type === 'abort' ? 'destructive' :
                    s.type === 'priority' ? 'warning' : 'secondary'
                  } className="text-[10px] shrink-0 mt-0.5">
                    {s.type}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">{s.content}</p>
                    <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                      <Badge variant={
                        s.status === 'acknowledged' ? 'success' :
                        s.status === 'delivered' ? 'secondary' : 'outline'
                      } className="text-[9px] py-0">
                        {s.status}
                      </Badge>
                      <span>{s.source}</span>
                      <span>{new Date(s.createdAt).toLocaleString()}</span>
                      {s.acknowledgedAt && <span>· ack {new Date(s.acknowledgedAt).toLocaleString()}</span>}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-12">No signals</p>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
