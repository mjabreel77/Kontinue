import { Command, Args, Flags } from '@oclif/core'
import { resolve } from 'node:path'
import { requireProject } from '../utils/project.js'
import { getActiveSession, addDecision, getRecentDecisions, upsertChunk } from '../store/queries.js'
import { writeDecision } from '../store/markdown.js'
import { ok, printDecisions } from '../utils/display.js'
import { getBranch, getCommit } from '../utils/git.js'

export default class Decision extends Command {
  static description = 'Record an architectural or implementation decision'

  static args = {
    summary: Args.string({ description: 'One-line decision summary', required: true }),
  }

  static flags = {
    rationale: Flags.string({ char: 'r', description: 'Why this decision was made' }),
    alternatives: Flags.string({ char: 'a', description: 'Alternatives that were considered' }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Decision)
    const cwd = resolve(process.cwd())
    const project = requireProject(cwd)
    const session = getActiveSession(project.id)

    const decision = addDecision(
      project.id,
      args.summary,
      flags.rationale,
      flags.alternatives,
      session?.id,
      getBranch(cwd),
      getCommit(cwd)
    )

    // Dual-write: write decision .md file
    writeDecision(decision)

    // Index into memory chunks
    const chunkContent = [
      `Decision: ${decision.summary}`,
      decision.rationale ? `Rationale: ${decision.rationale}` : '',
      decision.alternatives ? `Alternatives: ${decision.alternatives}` : '',
    ].filter(Boolean).join('\n')

    upsertChunk(project.id, 'decision', decision.id, chunkContent)

    ok(`Decision recorded: "${decision.summary}"`)
    ok(`Written to .kontinue/decisions/`)
  }
}
