import { useState, useEffect, useCallback, useRef } from 'react'
import type { DashboardData } from '@/types'

const API_BASE = 'http://localhost:3456'

export function useApiData() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    const es = new EventSource(`${API_BASE}/api/events`)
    esRef.current = es

    // Backend sends named events ('full' for initial state, 'update' for changes)
    const handleEvent = (event: MessageEvent) => {
      try {
        const parsed = JSON.parse(event.data) as DashboardData
        setData(parsed)
        setConnected(true)
        setError(null)
      } catch {
        // ignore parse errors
      }
    }

    es.addEventListener('full', handleEvent)
    es.addEventListener('update', handleEvent)
    // Fallback: also handle unnamed messages (some EventSource implementations
    // in Electron may deliver named events via onmessage instead)
    es.onmessage = handleEvent

    es.onerror = () => {
      setConnected(false)
      setError('Connection lost — retrying...')
    }

    es.onopen = () => {
      setConnected(true)
      setError(null)
    }

    return () => {
      es.removeEventListener('full', handleEvent)
      es.removeEventListener('update', handleEvent)
      es.onmessage = null
      es.close()
      esRef.current = null
    }
  }, [])

  return { data, error, connected }
}

export async function sendSignal(type: string, content: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/signals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, content, source: 'web' }),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function acknowledgeSignal(id: number): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/signals/${id}/acknowledge`, { method: 'POST' })
    return res.ok
  } catch {
    return false
  }
}

export async function addTask(title: string, description: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description }),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function updateTaskStatus(
  taskId: number, status: string, note?: string
): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/tasks/${taskId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, note }),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function fetchSignalHistory(params: {
  type?: string
  status?: string
  source?: string
  page?: number
  limit?: number
}): Promise<{ signals: Array<Record<string, unknown>>; total: number; page: number; pages: number }> {
  const sp = new URLSearchParams()
  if (params.type) sp.set('type', params.type)
  if (params.status) sp.set('status', params.status)
  if (params.source) sp.set('source', params.source)
  if (params.page) sp.set('page', String(params.page))
  if (params.limit) sp.set('limit', String(params.limit))
  const res = await fetch(`${API_BASE}/api/signals/history?${sp.toString()}`)
  return res.json()
}
