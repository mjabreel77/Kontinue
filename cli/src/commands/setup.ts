import { Command } from '@oclif/core'
import { checkbox } from '@inquirer/prompts'
import { resolve } from 'node:path'
import { writeAgentMcpConfigs, type AgentTarget } from '../utils/config.js'
import { writeAgentInstructions } from '../store/markdown.js'
import { ok } from '../utils/display.js'

export default class Setup extends Command {
  static description = 'Configure MCP server integration for AI coding agents (VS Code, Claude Code, Cursor, Windsurf)'

  async run(): Promise<void> {
    const cwd = resolve(process.cwd())

    const agents = await checkbox<AgentTarget>({
      message: 'Select AI agent(s) to configure (space to toggle, enter to confirm):',
      choices: [
        { name: 'VS Code (GitHub Copilot)', value: 'vscode' },
        { name: 'Claude Code', value: 'claude-code' },
        { name: 'Cursor', value: 'cursor' },
        { name: 'Windsurf', value: 'windsurf' },
      ],
    })

    if (agents.length === 0) {
      console.log('No agents selected — nothing written.')
      return
    }

    const mcpWritten = writeAgentMcpConfigs(cwd, agents)
    for (const path of mcpWritten) {
      ok(`MCP config written → ${path}`)
    }

    const instrWritten = writeAgentInstructions(cwd, agents)
    for (const path of instrWritten) {
      ok(`Agent instructions written → ${path}`)
    }

    console.log('\nRestart your AI agent / reload the window to pick up the new MCP server.')
  }
}
