import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs'
import { join } from 'node:path'

function git(args: string[], cwd: string): string | null {
  try {
    return execFileSync('git', args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 3000,
    }).toString().trim() || null
  } catch {
    return null
  }
}

/** Current branch name, or null if not a git repo / detached HEAD. */
export function getBranch(cwd: string): string | null {
  return git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd)
}

/** Short (8-char) commit hash at HEAD, or null if not a git repo. */
export function getCommit(cwd: string): string | null {
  const full = git(['rev-parse', 'HEAD'], cwd)
  return full ? full.slice(0, 8) : null
}

/** Canonical repo root (resolves worktrees to their real root), or null. */
export function getGitRoot(cwd: string): string | null {
  return git(['rev-parse', '--show-toplevel'], cwd)
}

/** Last N commit messages (--oneline), or null if not a git repo. */
export function getRecentLog(cwd: string, n = 5): string | null {
  return git(['log', '--oneline', `-${n}`], cwd)
}

/** Files changed between fromCommit and toCommit (default HEAD), newline-separated. */
export function getDiffFiles(cwd: string, fromCommit: string, toCommit = 'HEAD'): string | null {
  return git(['diff', '--name-only', `${fromCommit}..${toCommit}`], cwd)
}

/** Last commit message (single line). */
export function getLastCommitMessage(cwd: string): string | null {
  return git(['log', '-1', '--pretty=%s'], cwd)
}

const HOOK_MARKER = '# kontinue-hook'
const HOOK_LINE   = 'kontinue commit-hook 2>/dev/null || true'

/**
 * Install a post-commit git hook that calls `kontinue commit-hook`.
 * Idempotent — safe to call on every `kontinue init`.
 * Returns the hook path if written, null if not a git repo or already installed.
 */
export function installPostCommitHook(cwd: string): string | null {
  const root = getGitRoot(cwd)
  if (!root) return null

  const hooksDir = join(root, '.git', 'hooks')
  const hookPath = join(hooksDir, 'post-commit')

  if (!existsSync(hooksDir)) mkdirSync(hooksDir, { recursive: true })

  let existing = ''
  if (existsSync(hookPath)) {
    existing = readFileSync(hookPath, 'utf8')
    if (existing.includes(HOOK_MARKER)) return null  // already installed
  }

  const header = existing.startsWith('#!/') ? '' : '#!/bin/sh\n'
  const hook = `${header}${existing}\n${HOOK_MARKER}\n${HOOK_LINE}\n`
  writeFileSync(hookPath, hook, 'utf8')
  try { chmodSync(hookPath, 0o755) } catch { /* Windows — no chmod needed */ }

  return hookPath
}

