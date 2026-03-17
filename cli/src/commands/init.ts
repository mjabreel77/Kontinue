import { Command, Flags } from '@oclif/core'
import { input, checkbox } from '@inquirer/prompts'
import { createProject, findProjectByPath } from '../store/queries.js'
import { writeConfig, loadConfig, writeAgentMcpConfigs, type AgentTarget } from '../utils/config.js'
import { writeAgentInstructions } from '../store/markdown.js'
import { ok, warn } from '../utils/display.js'
import { basename, resolve } from 'node:path'

export default class Init extends Command {
  static description = 'Initialize Kontinue memory for this project'

  static flags = {
    name: Flags.string({ char: 'n', description: 'Project name' }),
    description: Flags.string({ char: 'd', description: 'Short project description' }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(Init)
    const cwd = resolve(process.cwd())

    const existing = findProjectByPath(cwd)
    if (existing) {
      warn(`Already initialized as "${existing.name}". Memory store is at ~/.kontinue/`)
      return
    }

    const existingConfig = await loadConfig(cwd)

    const name = flags.name
      ?? existingConfig.projectName
      ?? await input({ message: 'Project name:', default: basename(cwd) })

    const description = flags.description
      ?? existingConfig.description
      ?? await input({ message: 'Short description (optional):', default: '' })

    const techStack = existingConfig.techStack
      ?? await input({ message: 'Tech stack (optional, e.g. "TypeScript, Next.js, Postgres"):', default: '' })

    const agents = await checkbox<AgentTarget>({
      message: 'Configure MCP server for AI agent(s) (space to select, enter to skip):',
      choices: [
        { name: 'Claude Code', value: 'claude-code' },
        { name: 'VS Code (GitHub Copilot)', value: 'vscode' },
        { name: 'Cursor', value: 'cursor' },
        { name: 'Windsurf', value: 'windsurf' },
      ],
    })

    createProject(name, cwd, description || undefined)
    writeConfig(cwd, {
      projectName: name,
      description: description || undefined,
      techStack: techStack || undefined,
    })

    if (agents.length > 0) {
      const mcpWritten = writeAgentMcpConfigs(cwd, agents)
      for (const path of mcpWritten) {
        ok(`MCP config written \u2192 ${path}`)
      }
      const instrWritten = writeAgentInstructions(cwd, agents)
      for (const path of instrWritten) {
        ok(`Agent instructions written \u2192 ${path}`)
      }
    }

    ok(`Initialized "${name}" — memory store ready`)
    ok('Config written to .kontinuerc.json')
    ok('Run: kontinue start')
  }
}
