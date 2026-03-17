import { cosmiconfig } from 'cosmiconfig'
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'

export interface KontinueConfig {
  projectName?: string
  description?: string
  techStack?: string
}

const explorer = cosmiconfig('kontinue')

export async function loadConfig(cwd: string): Promise<KontinueConfig> {
  const result = await explorer.search(cwd)
  return (result?.config as KontinueConfig) ?? {}
}

export function writeConfig(cwd: string, config: KontinueConfig): void {
  const path = join(cwd, '.kontinuerc.json')
  writeFileSync(path, JSON.stringify(config, null, 2) + '\n', 'utf8')
}

export function hasConfig(cwd: string): boolean {
  return existsSync(join(cwd, '.kontinuerc.json'))
    || existsSync(join(cwd, '.kontinuerc'))
    || existsSync(join(cwd, 'kontinue.config.js'))
}

export type AgentTarget = 'claude-code' | 'vscode' | 'cursor' | 'windsurf'

const AGENT_CONFIG_PATHS: Record<AgentTarget, string> = {
  'claude-code': '.mcp.json',
  'vscode': '.vscode/mcp.json',
  'cursor': '.cursor/mcp.json',
  'windsurf': '.windsurf/mcp.json',
}

// Claude Code / Cursor / Windsurf use { mcpServers: { name: { command, args } } }
const CLAUDE_MCP_ENTRY = {
  command: 'kontinue',
  args: ['mcp'],
}

/**
 * Writes (or merges into) the MCP server config file for each selected AI agent.
 * Returns the list of relative paths that were written.
 */
export function writeAgentMcpConfigs(cwd: string, agents: AgentTarget[]): string[] {
  const written: string[] = []
  for (const agent of agents) {
    const relPath = AGENT_CONFIG_PATHS[agent]
    const absPath = join(cwd, relPath)
    const dir = dirname(absPath)

    let existing: Record<string, unknown> = {}
    if (existsSync(absPath)) {
      try { existing = JSON.parse(readFileSync(absPath, 'utf8')) } catch { /* keep empty */ }
    } else {
      mkdirSync(dir, { recursive: true })
    }

    if (agent === 'vscode') {
      const servers = (existing['servers'] as Record<string, unknown> | undefined) ?? {}
      servers['kontinue'] = {
        type: 'stdio',
        command: 'kontinue',
        args: ['mcp', '--project', cwd],
      }
      existing['servers'] = servers
    } else {
      const mcpServers = (existing['mcpServers'] as Record<string, unknown> | undefined) ?? {}
      mcpServers['kontinue'] = CLAUDE_MCP_ENTRY
      existing['mcpServers'] = mcpServers
    }

    writeFileSync(absPath, JSON.stringify(existing, null, 2) + '\n', 'utf8')
    written.push(relPath)
  }
  return written
}
