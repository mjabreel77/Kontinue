import { Command, Args } from '@oclif/core'
import { resolve } from 'node:path'
import { requireProject } from '../utils/project.js'
import { getActiveSession, addNote, upsertChunk } from '../store/queries.js'
import { writeNote } from '../store/markdown.js'
import { ok } from '../utils/display.js'

export default class Note extends Command {
  static description = 'Add a free-form note to project memory'

  static args = {
    content: Args.string({ description: 'Note content', required: true }),
  }

  async run(): Promise<void> {
    const { args } = await this.parse(Note)
    const cwd = resolve(process.cwd())
    const project = requireProject(cwd)
    const session = getActiveSession(project.id)

    const note = addNote(project.id, args.content, session?.id)

    // Dual-write: write note .md file
    writeNote(cwd, args.content, note.created_at)

    // Index into memory chunks
    upsertChunk(project.id, 'note', note.id, args.content)

    ok('Note saved to .kontinue/notes/')
  }
}
