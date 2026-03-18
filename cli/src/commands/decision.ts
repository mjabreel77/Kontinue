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
    rationale:    Flags.string({ char: 'r', description: 'Why this decision was made' }),
    alternatives: Flags.string({ char: 'a', description: 'Alternatives that were considered' }),
    context:      Flags.string({ char: 'c', description: 'Background discussion or context that led to this decision' }),
    files:        Flags.string({ char: 'f', description: 'Comma-separated related file paths, e.g. "src/auth.ts,src/db/schema.ts"' }),
    tags:         Flags.string({ char: 't', description: 'Comma-separated tags, e.g. "architecture,security,performance"' }),
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
      getCommit(cwd),
      flags.context,
      flags.files,
      flags.tags
    )

    // Dual-write: write decision .md file
    writeDecision(cwd, decision)

    // Index into memory chunks — include all fields for full-text search
    const chunkContent = [
      `Decision: ${decision.summary}`,
      decision.rationale    ? `Rationale: ${decision.rationale}` : '',
      decision.alternatives ? `Alternatives: ${decision.alternatives}` : '',
      decision.context      ? `Context: ${decision.context}` : '',
      decision.files        ? `Files: ${decision.files}` : '',
      decision.tags         ? `Tags: ${decision.tags}` : '',
    ].filter(Boolean).join('\n')

    upsertChunk(project.id, 'decision', decision.id, chunkContent)

    ok(`Decision recorded: "${decision.summary}"`)
    ok(`Written to .kontinue/decisions/`)
  }
}
