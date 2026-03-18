import { Command } from '@oclif/core'
import { resolve } from 'node:path'
import { findProjectByPath, getActiveSession, addCheckpoint, getAllOpenTasks, updateSessionFilesTouched } from '../store/queries.js'
import { getCommit, getLastCommitMessage, getDiffFiles } from '../utils/git.js'

/**
 * Called automatically by the git post-commit hook installed by `kontinue init`.
 * Not intended for direct user invocation.
 *
 * On every commit:
 *  1. Records a checkpoint with the commit message as progress note
 *  2. Lists changed files and stores them on the active session
 */
export default class CommitHook extends Command {
  static description = 'Called by git post-commit hook — records commit as a checkpoint'
  static hidden = true  // Not shown in help

  async run(): Promise<void> {
    const cwd = resolve(process.cwd())
    const project = findProjectByPath(cwd)
    if (!project) return  // Silent exit — not a kontinue project

    const session = getActiveSession(project.id)
    const commit  = getCommit(cwd)
    const message = getLastCommitMessage(cwd) ?? 'Commit'

    // Find which in-progress task this commit most likely belongs to
    const inProgress = getAllOpenTasks(project.id).filter(t => t.status === 'in-progress')
    const task = inProgress[0] ?? null  // Use first in-progress task

    // Get files changed in this commit
    const changedFiles = getDiffFiles(cwd, 'HEAD~1', 'HEAD')

    addCheckpoint(
      project.id,
      `[commit] ${message}`,
      task ? `Continue: ${task.title}` : null,
      changedFiles,
      session?.id ?? null,
      task?.id ?? null,
      commit
    )

    // Accumulate files_touched on the session
    if (session && changedFiles) {
      const existing = session.files_touched ?? ''
      const merged = [...new Set([...existing.split('\n'), ...changedFiles.split('\n')].filter(Boolean))].join('\n')
      updateSessionFilesTouched(session.id, merged)
    }
  }
}
