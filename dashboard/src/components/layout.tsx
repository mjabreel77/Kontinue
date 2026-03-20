import { NavLink, Outlet } from 'react-router-dom'
import { useState, useEffect } from 'react'
import {
  LayoutDashboard, KanbanSquare, Scale, Eye, Radio,
  FileText, Sun, Moon, Monitor, ChevronLeft, ChevronRight,
  GitBranch, Clock, Activity, Building2, KeyRound,
} from 'lucide-react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useTheme } from '@/components/theme-provider'
import { NotificationPanel } from '@/components/notification-panel'
import { SignalWidget } from '@/components/signal-widget'
import { ProjectSwitcher } from '@/components/project-switcher'
import { useDashboardStore } from '@/lib/store'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  useSidebar,
} from '@/components/ui/sidebar'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Overview' },
  { to: '/board', icon: KanbanSquare, label: 'Task Board' },
  { to: '/decisions', icon: Scale, label: 'Decisions' },
  { to: '/observations', icon: Eye, label: 'Observations' },
  { to: '/signals', icon: Radio, label: 'Signals' },
  { to: '/plans', icon: FileText, label: 'Plans' },
  { to: '/activity', icon: Activity, label: 'Activity' },
  { to: '/workspace', icon: Building2, label: 'Workspace' },
  { to: '/settings', icon: KeyRound, label: 'API Keys' },
]

function SidebarNav() {
  const { state } = useSidebar()
  const collapsed = state === 'collapsed'
  const data = useDashboardStore(s => s.data)
  const pendingCount = data?.signals.pending.length ?? 0

  return (
    <SidebarMenu>
      {navItems.map((item) => {
        const Icon = item.icon
        const pendingSignals = item.to === '/signals' ? pendingCount : 0
        return (
          <SidebarMenuItem key={item.to}>
            <SidebarMenuButton asChild tooltip={item.label}>
              <NavLink
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  isActive ? 'data-[active=true]' : ''
                }
                // NavLink sets data-active via the ref below
                ref={(el) => {
                  // This runs on every render; set data-active for the SidebarMenuButton styling
                  if (el) {
                    const isActive = el.getAttribute('aria-current') === 'page'
                    el.setAttribute('data-active', String(isActive))
                  }
                }}
              >
                <Icon />
                <span>{item.label}</span>
              </NavLink>
            </SidebarMenuButton>
            {pendingSignals > 0 && !collapsed && (
              <SidebarMenuBadge className="bg-destructive text-destructive-foreground text-[10px] rounded-full px-1.5 min-w-4.5 h-4.5">
                {pendingSignals}
              </SidebarMenuBadge>
            )}
          </SidebarMenuItem>
        )
      })}
    </SidebarMenu>
  )
}

function SessionInfo() {
  const { state } = useSidebar()
  const collapsed = state === 'collapsed'
  const data = useDashboardStore(s => s.data)
  const connected = useDashboardStore(s => s.connected)

  const [sessionAge, setSessionAge] = useState(data?.session?.ageMin ?? 0)
  useEffect(() => {
    if (!data?.session) return
    setSessionAge(data.session.ageMin)
    const interval = setInterval(() => setSessionAge((a) => a + 1), 60_000)
    return () => clearInterval(interval)
  }, [data?.session?.id, data?.session?.ageMin])

  const formatAge = (mins: number) => {
    if (mins < 60) return `${mins}m`
    const h = Math.floor(mins / 60)
    const m = mins % 60
    return m > 0 ? `${h}h ${m}m` : `${h}h`
  }

  if (!data || collapsed) return null

  return (
    <div className="px-3 pb-1 flex flex-col gap-1">
      {/* Connection status */}
      <div className="flex items-center gap-1.5">
        <span
          className={`size-[7px] rounded-full shrink-0 ${connected ? 'bg-emerald-500' : 'bg-red-500'}`}
        />
        <span className="text-[11px] opacity-60">{connected ? 'Connected' : 'Disconnected'}</span>
      </div>
      {/* Git branch */}
      {data.git.branch && (
        <div className="flex items-center gap-1.5">
          <GitBranch className="size-3 opacity-50 shrink-0" />
          <span className="text-[11px] opacity-60 font-mono tracking-tight truncate">
            {data.git.branch}
          </span>
        </div>
      )}
      {/* Session time + tool calls */}
      {data.session && (
        <div className="flex items-center gap-1.5">
          <Clock className="size-3 opacity-50 shrink-0" />
          <span className="text-[11px] opacity-60 tracking-tight">
            Session: {formatAge(sessionAge)} · {data.session.toolCalls} calls
          </span>
        </div>
      )}
    </div>
  )
}

function SidebarThemeToggle() {
  const { theme, setTheme } = useTheme()
  const { state } = useSidebar()
  const collapsed = state === 'collapsed'

  const nextTheme = () => {
    if (theme === 'light') setTheme('dark')
    else if (theme === 'dark') setTheme('system')
    else setTheme('light')
  }

  const ThemeIcon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton onClick={nextTheme} tooltip={`Theme: ${theme}`}>
          <ThemeIcon />
          {!collapsed && <span className="capitalize">{theme}</span>}
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

function SidebarCollapseToggle() {
  const { state, toggleSidebar } = useSidebar()
  const collapsed = state === 'collapsed'

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton onClick={toggleSidebar} tooltip="Toggle sidebar">
          {collapsed ? <ChevronRight /> : <ChevronLeft />}
          {!collapsed && <span>Collapse</span>}
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

function HealthIndicator() {
  const { state } = useSidebar()
  const collapsed = state === 'collapsed'
  const data = useDashboardStore(s => s.data)
  if (!data) return null

  const colorClass =
    data.health.level === 'good'
      ? 'text-emerald-400'
      : data.health.level === 'fair'
        ? 'text-amber-400'
        : 'text-red-400'

  const dotColor =
    data.health.level === 'good'
      ? 'bg-emerald-400'
      : data.health.level === 'fair'
        ? 'bg-amber-400'
        : 'bg-red-400'

  if (collapsed) {
    return (
      <div className="flex justify-center py-2 border-t border-sidebar-border">
        <span className={`size-2 rounded-full ${dotColor}`} title={`Health: ${data.health.level}`} />
      </div>
    )
  }

  return (
    <div
      className={`px-4 py-1.5 text-[10px] font-semibold border-t border-sidebar-border ${colorClass}`}
    >
      Health: {data.health.level}
      {data.health.reasons.length > 0 && ` — ${data.health.reasons[0]}`}
    </div>
  )
}

export function Layout() {
  return (
    <TooltipProvider delayDuration={0}>
      <SidebarProvider defaultOpen={true}>
        <Sidebar collapsible="icon">
          <SidebarHeader>
            <SidebarMenu>
              <SidebarMenuItem>
                <ProjectSwitcher />
              </SidebarMenuItem>
            </SidebarMenu>
            <SessionInfo />
          </SidebarHeader>

          <SidebarSeparator />

          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Navigation</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarNav />
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <SidebarSeparator />

          <SidebarFooter>
            <SidebarMenu>
              <SidebarMenuItem>
                <NotificationPanel />
              </SidebarMenuItem>
            </SidebarMenu>
            <SidebarSeparator />
            <SidebarThemeToggle />
            <SidebarCollapseToggle />
          </SidebarFooter>

          <HealthIndicator />
        </Sidebar>

        <main className="flex-1 overflow-auto">
          <Outlet />
          <SignalWidget />
        </main>
      </SidebarProvider>
    </TooltipProvider>
  )
}
