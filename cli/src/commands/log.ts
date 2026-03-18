import { Command } from '@oclif/core'
import { resolve } from 'node:path'
import { requireProject } from '../utils/project.js'
import { getAllDecisions } from '../store/queries.js'
import chalk from 'chalk'

export default class Log extends Command {
  static description = 'Show the full decision log'

  async run(): Promise<void> {
    const cwd = resolve(process.cwd())
    const project = requireProject(cwd)

    const decisions = getAllDecisions(project.id)

    if (decisions.length === 0) {
      console.log(chalk.dim('\n  No decisions recorded yet. Use: kontinue decision "..."\n'))
      return
    }

    console.log()
    console.log(chalk.bold(`  Decision Log · ${project.name}`))
    console.log(chalk.dim('  ' + '─'.repeat(50)))

    let lastDate = ''
    for (const d of decisions) {
      const date = new Date(d.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      if (date !== lastDate) {
        console.log()
        console.log(chalk.dim(`  ${date.toUpperCase()}`))
        lastDate = date
      }
      console.log()
      const branchStr = d.branch ? chalk.dim(` [${d.branch}${d.git_commit ? `@${d.git_commit}` : ''}]`) : ''
      const tagStr = d.tags ? chalk.dim(`  • ${d.tags}`) : ''
      console.log(`  ${chalk.blue('🔵')}  ${chalk.bold(d.summary)}${branchStr}${tagStr}`)
      if (d.context)      console.log(chalk.dim(`      Context: ${d.context}`))
      if (d.rationale)    console.log(chalk.dim(`      Why: ${d.rationale}`))
      if (d.alternatives) console.log(chalk.dim(`      Considered: ${d.alternatives}`))
      if (d.files)        console.log(chalk.dim(`      Files: ${d.files}`))
    }
    console.log()
  }
}
