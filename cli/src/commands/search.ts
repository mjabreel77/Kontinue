import { Command, Args, Flags } from '@oclif/core'
import { resolve } from 'node:path'
import { requireProject } from '../utils/project.js'
import { getAllChunks, getChunkCount } from '../store/queries.js'
import { printSearchResults } from '../utils/display.js'
import chalk from 'chalk'

export default class Search extends Command {
  static description = 'Search project memory'

  static args = {
    query: Args.string({ description: 'Search query', required: true }),
  }

  static flags = {
    limit: Flags.integer({ char: 'l', description: 'Max results to show', default: 5 }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Search)
    const cwd = resolve(process.cwd())
    const project = requireProject(cwd)

    const total = getChunkCount(project.id)
    if (total === 0) {
      console.log(chalk.dim('\n  No memory indexed yet. Run: kontinue start\n'))
      return
    }

    const chunks = getAllChunks(project.id)

    // Simple text search (keyword match) for MVP — semantic search added in Phase 2
    const query = args.query.toLowerCase()
    const results = chunks
      .filter(c => c.content.toLowerCase().includes(query))
      .slice(0, flags.limit)
      .map(c => ({ content: c.content, source_type: c.source_type }))

    if (results.length === 0) {
      console.log(chalk.dim(`\n  No results for "${args.query}"\n`))
      console.log(chalk.dim('  Tip: semantic search (embedding-based) arrives in Phase 2.\n'))
      return
    }

    printSearchResults(results, args.query, total)
  }
}
