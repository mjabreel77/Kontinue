import { create } from 'zustand'
import type {
  DashboardData, StateFullEvent, ProjectConfig, GranularEvent,
} from '@/types'
import {
  getProjectConfig, setProjectConfig as saveProjectConfig, clearProjectConfig,
  buildDashboardData, patchDashboardData, getAuthToken,
} from './api'

/* ── Store shape ───────────────────────────────────────────── */

interface DashboardState {
  // Connection
  data: DashboardData | null
  error: string | null
  connected: boolean

  // Actions
  connect: () => void
  reconnect: () => void
  disconnect: () => void
  switchProject: (config: ProjectConfig) => void
}

/* ── Internals (outside Zustand to avoid stale closures) ──── */

let ws: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let ageTimer: ReturnType<typeof setInterval> | null = null
let intentionalClose = false

function minutesAgo(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000))
}

function startAgeRefresh() {
  if (ageTimer) return
  ageTimer = setInterval(() => {
    const { data } = useDashboardStore.getState()
    if (!data) return
    useDashboardStore.setState({
      data: {
        ...data,
        session: data.session ? { ...data.session, ageMin: minutesAgo(data.session.startedAt) } : null,
        checkpoint: data.checkpoint ? { ...data.checkpoint, ageMin: minutesAgo(data.checkpoint.createdAt) } : null,
      },
    })
  }, 60_000)
}

function stopAgeRefresh() {
  if (ageTimer) { clearInterval(ageTimer); ageTimer = null }
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '')
}

/* ── Store ─────────────────────────────────────────────────── */

export const useDashboardStore = create<DashboardState>((set, get) => ({
  data: null,
  error: null,
  connected: false,

  connect: () => {
    // Don't create duplicate connections
    if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) return

    const config = getProjectConfig()
    if (!config) {
      set({ connected: false, data: null })
      return
    }

    intentionalClose = false
    let wsUrl = stripTrailingSlash(config.apiUrl).replace(/^http/, 'ws') + `/ws?projectId=${config.projectId}`
    const token = getAuthToken()
    if (token) wsUrl += `&token=${encodeURIComponent(token)}`
    const socket = new WebSocket(wsUrl)
    ws = socket

    socket.onopen = () => {
      set({ connected: true, error: null })
      startAgeRefresh()
    }

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.tasks !== undefined && msg.decisions !== undefined) {
          set({ data: buildDashboardData(msg as StateFullEvent, config.projectName) })
        } else if (msg.$type) {
          const prev = get().data
          if (prev) set({ data: patchDashboardData(prev, msg as GranularEvent) })
        }
      } catch { /* ignore parse errors */ }
    }

    socket.onerror = () => {
      set({ connected: false, error: 'Connection error' })
    }

    socket.onclose = () => {
      ws = null
      // Only auto-reconnect if this wasn't an intentional disconnect
      if (!intentionalClose) {
        set({ connected: false, error: 'Connection lost — reconnecting...' })
        reconnectTimer = setTimeout(() => get().connect(), 3000)
      }
    }
  },

  reconnect: () => {
    // Tear down cleanly, then reconnect
    intentionalClose = true
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
    if (ws) { ws.close(); ws = null }
    setTimeout(() => {
      intentionalClose = false
      useDashboardStore.getState().connect()
    }, 100)
  },

  disconnect: () => {
    intentionalClose = true
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
    if (ws) { ws.close(); ws = null }
    stopAgeRefresh()
    set({ data: null, connected: false, error: null })
  },

  switchProject: (config: ProjectConfig) => {
    saveProjectConfig(config)
    get().reconnect()
  },
}))
