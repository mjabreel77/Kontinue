import { Command, Flags } from '@oclif/core'
import { input, checkbox, select, confirm } from '@inquirer/prompts'
import { createProject, findProjectByPath, deleteProject } from '../store/queries.js'
import { writeConfig, loadConfig, writeAgentMcpConfigs, type AgentTarget, type KontinueConfig } from '../utils/config.js'
import { writeAgentInstructions, writeIdentity } from '../store/markdown.js'
import { ok, warn } from '../utils/display.js'
import { basename, resolve } from 'node:path'
import { installPostCommitHook } from '../utils/git.js'
import { KontinueApiClient } from '../mcp/api-client.js'
import { getToken, storeToken, storeApiKey } from '../utils/credentials.js'

export default class Init extends Command {
  static description = 'Initialize Kontinue memory for this project'

  static flags = {
    name: Flags.string({ char: 'n', description: 'Project name' }),
    description: Flags.string({ char: 'd', description: 'Short project description' }),
    force: Flags.boolean({ char: 'f', description: 'Reset existing project record and reinitialize (preserves nothing)' }),
    backend: Flags.string({
      char: 'b',
      description: 'Backend mode: local (SQLite) or remote (.NET API)',
      options: ['local', 'remote'],
    }),
    'api-url': Flags.string({
      description: 'Remote API base URL',
      default: process.env.KONTINUE_API_URL || 'http://localhost:5152',
      env: 'KONTINUE_API_URL',
    }),
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace name or ID for remote backend',
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(Init)
    const cwd = resolve(process.cwd())

    const existingConfig = await loadConfig(cwd)

    // Determine backend mode
    const backend = (flags.backend ?? existingConfig.backend ?? 'local') as 'local' | 'remote'

    if (backend === 'remote') {
      await this.initRemote(cwd, flags, existingConfig)
    } else {
      await this.initLocal(cwd, flags, existingConfig)
    }
  }

  private async initLocal(cwd: string, flags: Record<string, any>, existingConfig: KontinueConfig): Promise<void> {
    const existing = findProjectByPath(cwd)
    if (existing) {
      if (!flags.force) {
        warn(`Already initialized as "${existing.name}". Use --force to reinitialize, or run: kontinue setup`)
        return
      }
      deleteProject(existing.id)
      warn(`Existing project "${existing.name}" removed — reinitializing...`)
    }

    const name = flags.name
      ?? existingConfig.projectName
      ?? await input({ message: 'Project name:', default: basename(cwd) })

    const description = flags.description
      ?? existingConfig.description
      ?? await input({ message: 'Short description (optional):', default: '' })

    const techStack = existingConfig.techStack
      ?? await input({ message: 'Tech stack (optional, e.g. "TypeScript, Next.js, Postgres"):', default: '' })

    const agents = await this.promptAgents()

    createProject(name, cwd, description || undefined)
    const config: KontinueConfig = {
      projectName: name,
      description: description || undefined,
      techStack: techStack || undefined,
      backend: 'local',
    }
    writeConfig(cwd, config)
    writeIdentity(cwd, name, description || undefined, techStack || undefined)

    this.writeAgentConfigs(cwd, agents, config)

    ok(`Initialized "${name}" — local memory store ready`)
    ok('Config written to .kontinuerc.json')

    const hookPath = installPostCommitHook(cwd)
    if (hookPath) ok('Git hook installed → .git/hooks/post-commit')

    ok('Run: kontinue start')
  }

  private async initRemote(cwd: string, flags: Record<string, any>, existingConfig: KontinueConfig): Promise<void> {
    const apiUrl = flags['api-url'] ?? existingConfig.backendUrl ?? 'http://localhost:5152'

    // Check existing remote config
    if (existingConfig.projectId && existingConfig.workspaceId && !flags.force) {
      warn(`Already initialized as remote project ${existingConfig.projectId}. Use --force to reinitialize.`)
      return
    }

    // Ensure user is logged in (browser auth flow)
    ok(`Connecting to ${apiUrl}...`)
    let token = await getToken(apiUrl)

    if (!token) {
      ok('You need to log in first. Opening browser...')
      const { browserAuthFlow } = await import('./auth/login.js')
      try {
        const result = await browserAuthFlow(apiUrl)
        token = result.token
        await storeToken(apiUrl, token)
        ok(`Logged in as ${result.email}`)
      } catch (error) {
        this.error(`Login failed: ${error instanceof Error ? error.message : String(error)}`)
      }
    } else {
      // Verify the token is still valid
      try {
        const res = await fetch(`${apiUrl}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) {
          ok('Session expired. Opening browser to re-authenticate...')
          const { browserAuthFlow } = await import('./auth/login.js')
          const result = await browserAuthFlow(apiUrl)
          token = result.token
          await storeToken(apiUrl, token)
          ok(`Logged in as ${result.email}`)
        } else {
          const me = await res.json() as { email: string }
          ok(`Logged in as ${me.email}`)
        }
      } catch {
        this.error(`Cannot reach server at ${apiUrl}. Is the backend running?`)
      }
    }

    const authHeaders = { Authorization: `Bearer ${token}` }

    // Fetch workspaces
    let workspaces: any[]
    try {
      const res = await fetch(`${apiUrl}/api/workspaces`, { headers: authHeaders })
      workspaces = res.ok ? await res.json() as any[] : []
    } catch {
      this.error(`Cannot reach server at ${apiUrl}. Is the backend running?`)
    }

    // Resolve workspace
    let workspaceId: string
    let workspaceName: string

    if (flags.workspace) {
      const match = workspaces.find(
        (w: any) => w.id === flags.workspace || w.name === flags.workspace || w.slug === flags.workspace
      )
      if (match) {
        workspaceId = match.id
        workspaceName = match.name
      } else {
        this.error(`Workspace "${flags.workspace}" not found. Available: ${workspaces.map((w: any) => w.name).join(', ') || '(none)'}`)
      }
    } else if (workspaces.length === 0) {
      workspaceName = await input({ message: 'No workspaces found. Create one — name:', default: 'default' })
      const slug = workspaceName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      ok(`Creating workspace "${workspaceName}"...`)
      const res = await fetch(`${apiUrl}/api/workspaces`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: workspaceName, slug }),
      })
      const ws = await res.json() as any
      workspaceId = ws.id
      ok(`Workspace created: ${workspaceId}`)
    } else if (workspaces.length === 1) {
      workspaceId = workspaces[0].id
      workspaceName = workspaces[0].name
      ok(`Using workspace "${workspaceName}"`)
    } else {
      const choices = [
        ...workspaces.map((w: any) => ({ name: `${w.name} (${w.slug})`, value: w.id })),
        { name: '+ Create new workspace', value: '__new__' },
      ]
      const chosen = await select({ message: 'Select workspace:', choices })
      if (chosen === '__new__') {
        workspaceName = await input({ message: 'Workspace name:' })
        const slug = workspaceName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
        const res = await fetch(`${apiUrl}/api/workspaces`, {
          method: 'POST',
          headers: { ...authHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: workspaceName, slug }),
        })
        const ws = await res.json() as any
        workspaceId = ws.id
        ok(`Workspace created: ${workspaceId}`)
      } else {
        workspaceId = chosen
        workspaceName = workspaces.find((w: any) => w.id === chosen)!.name
      }
    }

    // Collect project details
    const name = flags.name
      ?? existingConfig.projectName
      ?? await input({ message: 'Project name:', default: basename(cwd) })

    const description = flags.description
      ?? existingConfig.description
      ?? await input({ message: 'Short description (optional):', default: '' })

    const techStack = existingConfig.techStack
      ?? await input({ message: 'Tech stack (optional, e.g. "TypeScript, Next.js, Postgres"):', default: '' })

    // Check if a project with this path already exists
    const existingProjects = await KontinueApiClient.listProjects(apiUrl, workspaceId, token)
    const existingRemote = existingProjects.find((p: any) => p.path === cwd)
    let projectId: string

    if (existingRemote && !flags.force) {
      projectId = existingRemote.id
      ok(`Found existing remote project "${existingRemote.name}" for this path`)
    } else {
      ok(`Creating project "${name}" on server...`)
      const project = await KontinueApiClient.createProject(apiUrl, workspaceId, name, cwd, token)
      projectId = project.id
      ok(`Project created: ${projectId}`)
    }

    // Offer to create a scoped API key for MCP
    const createKey = await confirm({ message: 'Create an API key for MCP/automation? (recommended)', default: true })
    if (createKey) {
      try {
        const res = await fetch(`${apiUrl}/api/keys`, {
          method: 'POST',
          headers: { ...authHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'default', expiresInDays: null, projectIds: [projectId] }),
        })
        if (res.ok) {
          const data = await res.json() as { key: string; keyPrefix: string }
          await storeApiKey(apiUrl, projectId, data.key)
          ok(`API key created: ${data.keyPrefix}… (stored in OS keychain)`)
        } else {
          warn('Could not create API key — you can create one later with: kontinue auth create')
        }
      } catch {
        warn('Could not create API key — you can create one later with: kontinue auth create')
      }
    }

    const agents = await this.promptAgents()

    // Write config with remote details
    const config: KontinueConfig = {
      projectName: name,
      description: description || undefined,
      techStack: techStack || undefined,
      backend: 'remote',
      backendUrl: apiUrl,
      workspaceId,
      projectId,
    }
    writeConfig(cwd, config)
    writeIdentity(cwd, name, description || undefined, techStack || undefined)

    this.writeAgentConfigs(cwd, agents, config)

    ok(`Initialized "${name}" — connected to ${apiUrl}`)
    ok(`Workspace: ${workspaceName} (${workspaceId})`)
    ok(`Project:   ${projectId}`)
    ok('Config written to .kontinuerc.json')

    const hookPath = installPostCommitHook(cwd)
    if (hookPath) ok('Git hook installed → .git/hooks/post-commit')

    ok('Run: kontinue start')
  }

  private async promptAgents(): Promise<AgentTarget[]> {
    return checkbox<AgentTarget>({
      message: 'Configure MCP server for AI agent(s) (space to select, enter to skip):',
      choices: [
        { name: 'Claude Code', value: 'claude-code' },
        { name: 'VS Code (GitHub Copilot)', value: 'vscode' },
        { name: 'Cursor', value: 'cursor' },
        { name: 'Windsurf', value: 'windsurf' },
      ],
    })
  }

  private writeAgentConfigs(cwd: string, agents: AgentTarget[], config: KontinueConfig): void {
    if (agents.length === 0) return

    const mcpWritten = writeAgentMcpConfigs(cwd, agents, config)
    for (const path of mcpWritten) {
      ok(`MCP config written → ${path}`)
    }
    const instrWritten = writeAgentInstructions(cwd, agents)
    for (const path of instrWritten) {
      ok(`Agent instructions written → ${path}`)
    }
  }
}
