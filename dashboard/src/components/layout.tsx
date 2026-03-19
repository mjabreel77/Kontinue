import { NavLink, Outlet } from 'react-router-dom'
import { useState, useEffect } from 'react'
import {
  LayoutDashboard, KanbanSquare, Scale, Eye, Radio,
  FileText, Sun, Moon, Monitor, ChevronLeft, ChevronRight,
  MessageSquare, GitBranch, Clock,
} from 'lucide-react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'
import { useTheme } from '@/components/theme-provider'
import { NotificationPanel } from '@/components/notification-panel'
import { SignalWidget } from '@/components/signal-widget'
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
import type { DashboardData } from '@/types'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Overview' },
  { to: '/board', icon: KanbanSquare, label: 'Task Board' },
  { to: '/decisions', icon: Scale, label: 'Decisions' },
  { to: '/observations', icon: Eye, label: 'Observations' },
  { to: '/signals', icon: Radio, label: 'Signals' },
  { to: '/plans', icon: FileText, label: 'Plans' },
]

interface LayoutProps {
  data: DashboardData | null
  connected: boolean
}

function SidebarNav({ data }: { data: DashboardData | null }) {
  const { state } = useSidebar()
  const collapsed = state === 'collapsed'

  return (
    <SidebarMenu>
      {navItems.map((item) => {
        const Icon = item.icon
        const pendingSignals = item.to === '/signals' ? (data?.signals.pending.length ?? 0) : 0
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
              <SidebarMenuBadge className="bg-destructive text-destructive-foreground text-[10px] rounded-full px-1.5 min-w-[18px] h-[18px]">
                {pendingSignals}
              </SidebarMenuBadge>
            )}
          </SidebarMenuItem>
        )
      })}
    </SidebarMenu>
  )
}

function SidebarBrand({ data, connected }: { data: DashboardData | null; connected: boolean }) {
  const { state } = useSidebar()
  const collapsed = state === 'collapsed'

  // Live-updating session age
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

  return (
    <>
      <div className="flex items-center gap-2.5 px-2 pt-1">
        <MessageSquare className="size-5 shrink-0 text-sidebar-primary" />
        {!collapsed && (
          <span className="font-bold text-base tracking-tight">Kontinue</span>
        )}
      </div>
      {!collapsed && data && (
        <div className="px-2 pb-1 flex flex-col gap-1.5">
          {/* Project name + connection status */}
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] font-semibold">{data.project.name}</span>
            <span
              className={`size-[7px] rounded-full shrink-0 ${connected ? 'bg-emerald-500' : 'bg-red-500'}`}
            />
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
      )}
    </>
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

function HealthIndicator({ data }: { data: DashboardData | null }) {
  const { state } = useSidebar()
  if (state === 'collapsed' || !data) return null

  const colorClass =
    data.health.level === 'good'
      ? 'text-emerald-400'
      : data.health.level === 'fair'
        ? 'text-amber-400'
        : 'text-red-400'

  return (
    <div
      className={`px-4 py-1.5 text-[10px] font-semibold border-t border-sidebar-border ${colorClass}`}
    >
      Health: {data.health.level}
      {data.health.reasons.length > 0 && ` — ${data.health.reasons[0]}`}
    </div>
  )
}

export function Layout({ data, connected }: LayoutProps) {
  return (
    <TooltipProvider delayDuration={0}>
      <SidebarProvider defaultOpen={true}>
        <Sidebar collapsible="icon">
          <SidebarHeader>
            <SidebarBrand data={data} connected={connected} />
          </SidebarHeader>

          <SidebarSeparator />

          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Navigation</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarNav data={data} />
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <SidebarSeparator />

          <SidebarFooter>
            <SidebarMenu>
              <SidebarMenuItem>
                <NotificationPanel data={data} />
              </SidebarMenuItem>
            </SidebarMenu>
            <SidebarSeparator />
            <SidebarThemeToggle />
            <SidebarCollapseToggle />
          </SidebarFooter>

          <HealthIndicator data={data} />
        </Sidebar>

        <main className="flex-1 overflow-auto">
          <Outlet />
          <SignalWidget data={data} />
        </main>
      </SidebarProvider>
    </TooltipProvider>
  )
}
