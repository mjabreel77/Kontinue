import { Command, Flags } from '@oclif/core'
import { resolve } from 'node:path'
import { startMcpServer } from '../mcp/server.js'
import { requireProject } from '../utils/project.js'

export default class Mcp extends Command {
  static description = 'Start the Kontinue MCP server (for Claude Code integration)'
  static hidden = false

  static flags = {
    project: Flags.string({
      char: 'p',
      description: 'Absolute path to the project root (overrides cwd). Useful when launched by VS Code or other editors.',
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(Mcp)
    const cwd = flags.project ? resolve(flags.project) : resolve(process.cwd())
    requireProject(cwd) // fail fast if not initialized
    // MCP uses stdio — no console output after this point
    await startMcpServer(cwd)
  }
}
