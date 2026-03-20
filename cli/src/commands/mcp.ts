import { Command, Flags } from '@oclif/core'
import { resolve } from 'node:path'
import { startMcpServer } from '../mcp/server.js'
import { startProxyMcpServer } from '../mcp/proxy-server.js'
import { requireProject } from '../utils/project.js'
import { loadConfig } from '../utils/config.js'
import { getApiKey, getToken } from '../utils/credentials.js'

export default class Mcp extends Command {
  static description = 'Start the Kontinue MCP server (for Claude Code integration)'
  static hidden = false

  static flags = {
    project: Flags.string({
      char: 'p',
      description: 'Absolute path to the project root (overrides cwd). Useful when launched by VS Code or other editors.',
    }),
    backend: Flags.string({
      char: 'b',
      description: 'Backend mode: local (SQLite) or remote (.NET API)',
      options: ['local', 'remote'],
    }),
    'api-url': Flags.string({
      description: 'Remote API base URL (required when --backend=remote)',
      env: 'KONTINUE_API_URL',
    }),
    'project-id': Flags.string({
      description: 'Project GUID for remote backend (auto-resolved from .kontinuerc.json if omitted)',
    }),
    'api-key': Flags.string({
      description: 'API key for remote backend authentication',
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(Mcp)
    const cwd = flags.project ? resolve(flags.project) : resolve(process.cwd())

    // Resolve backend mode from flags or config
    const config = await loadConfig(cwd)
    const backend = flags.backend ?? config.backend ?? 'local'

    if (backend === 'remote') {
      const projectId = flags['project-id'] ?? config.projectId
      const apiUrl = flags['api-url'] ?? config.backendUrl ?? 'http://localhost:5152'
      // Resolve API key: flag > keychain (API key) > keychain (session token) > config fallback
      const apiKey = flags['api-key']
        ?? (projectId ? await getApiKey(apiUrl, projectId) : null)
        ?? await getToken(apiUrl)
        ?? config.apiKey

      if (!projectId) {
        this.error('No project ID found. Pass --project-id or run: kontinue init --backend=remote')
      }

      await startProxyMcpServer({
        apiUrl,
        projectId,
        apiKey,
        cwd,
      })
    } else {
      requireProject(cwd) // fail fast if not initialized
      // MCP uses stdio — no console output after this point
      await startMcpServer(cwd)
    }
  }
}
