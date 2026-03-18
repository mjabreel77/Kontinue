import { Command, Flags } from '@oclif/core'
import { resolve } from 'node:path'
import { requireProject } from '../utils/project.js'
import { getAllChunks, getChunkCount } from '../store/queries.js'
import { section, sourceColor } from '../utils/display.js'
import chalk from 'chalk'

export default class Search extends Command {
  static description = 'Display all indexed project memory'

  static flags = {
    limit: Flags.integer({ char: 'l', description: 'Max chunks to display', default: 20 }),
    type:  Flags.string({ char: 't', description: 'Filter by type: task, decision, note, session' }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(Search)
    const cwd = resolve(process.cwd())
    const project = requireProject(cwd)

    const total = getChunkCount(project.id)
    if (total === 0) {
      console.log(chalk.dim('\n  No memory indexed yet. Run: kontinue start\n'))
      return
    }

    let chunks = getAllChunks(project.id)
    if (flags.type) chunks = chunks.filter(c => c.source_type === flags.type)
    chunks = chunks.slice(0, flags.limit)

    console.log()
    console.log('  ' + chalk.bold('Memory') + chalk.dim(`  .  showing ${chunks.length} of ${total} chunks${flags.type ? ` [${flags.type}]` : ''}`))
    console.log()

    for (const c of chunks) {
      const color = sourceColor(c.source_type)
      section(c.source_type.toUpperCase(), color)
      for (const line of c.content.split('\n').slice(0, 5)) {
        if (line.trim()) console.log('     ' + chalk.dim(line))
      }
      console.log()
    }
  }
}
