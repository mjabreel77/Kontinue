import { useState, useEffect, useCallback } from 'react'
import { ChevronsUpDown, FolderKanban, Plus, Check } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  SidebarMenuButton,
  useSidebar,
} from '@/components/ui/sidebar'
import {
  getProjectConfig, fetchWorkspaces, fetchProjects,
} from '@/lib/api'
import { useDashboardStore } from '@/lib/store'

interface Workspace {
  id: string
  name: string
  slug: string
}

interface Project {
  id: string
  name: string
  path?: string | null
}

export function ProjectSwitcher() {
  const { state } = useSidebar()
  const collapsed = state === 'collapsed'
  const config = getProjectConfig()
  const switchProject = useDashboardStore(s => s.switchProject)

  const [open, setOpen] = useState(false)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [projectsByWs, setProjectsByWs] = useState<Record<string, Project[]>>({})
  const [loading, setLoading] = useState(false)

  const loadData = useCallback(async () => {
    if (!config?.apiUrl) return
    setLoading(true)
    try {
      const ws = await fetchWorkspaces(config.apiUrl)
      setWorkspaces(ws)

      const projectMap: Record<string, Project[]> = {}
      await Promise.all(
        ws.map(async (w) => {
          try {
            projectMap[w.id] = await fetchProjects(config.apiUrl, w.id)
          } catch {
            projectMap[w.id] = []
          }
        })
      )
      setProjectsByWs(projectMap)
    } catch {
      // silently fail — user can still use current project
    }
    setLoading(false)
  }, [config?.apiUrl])

  useEffect(() => {
    if (open) loadData()
  }, [open, loadData])

  const handleSelect = (ws: Workspace, project: Project) => {
    switchProject({
      ...config!,
      workspaceId: ws.id,
      projectId: project.id,
      projectName: project.name,
    })
    setOpen(false)
  }

  if (!config) return null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <SidebarMenuButton
          size="lg"
          tooltip={config.projectName}
          className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
        >
          <div className="flex size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <FolderKanban className="size-4" />
          </div>
          {!collapsed && (
            <>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{config.projectName}</span>
                <span className="truncate text-[11px] text-muted-foreground">
                  {workspaces.find(w => w.id === config.workspaceId)?.name || 'Workspace'}
                </span>
              </div>
              <ChevronsUpDown className="ml-auto size-4 opacity-50" />
            </>
          )}
        </SidebarMenuButton>
      </PopoverTrigger>
      <PopoverContent
        className="w-65 p-0"
        align="start"
        side={collapsed ? 'right' : 'bottom'}
        sideOffset={4}
      >
        <ScrollArea className="max-h-80">
          <div className="p-1">
            {loading && workspaces.length === 0 ? (
              <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                Loading…
              </div>
            ) : (
              workspaces.map((ws) => (
                <div key={ws.id}>
                  <div className="px-2 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    {ws.name}
                  </div>
                  {(projectsByWs[ws.id] ?? []).map((project) => {
                    const isActive = project.id === config.projectId
                    return (
                      <button
                        key={project.id}
                        onClick={() => handleSelect(ws, project)}
                        className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-sm hover:bg-accent transition-colors text-left"
                      >
                        <FolderKanban className="size-4 shrink-0 text-muted-foreground" />
                        <span className={`flex-1 truncate ${isActive ? 'font-semibold' : ''}`}>
                          {project.name}
                        </span>
                        {isActive && <Check className="size-4 text-primary shrink-0" />}
                      </button>
                    )
                  })}
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}
