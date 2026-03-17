import { execSync } from 'node:child_process'

function git(cmd: string, cwd: string): string | null {
  try {
    return execSync(`git ${cmd}`, {
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
  return git('rev-parse --abbrev-ref HEAD', cwd)
}

/** Short (8-char) commit hash at HEAD, or null if not a git repo. */
export function getCommit(cwd: string): string | null {
  const full = git('rev-parse HEAD', cwd)
  return full ? full.slice(0, 8) : null
}

/** Canonical repo root (resolves worktrees to their real root), or null. */
export function getGitRoot(cwd: string): string | null {
  return git('rev-parse --show-toplevel', cwd)
}

/** Last N commit messages (--oneline), or null if not a git repo. */
export function getRecentLog(cwd: string, n = 5): string | null {
  return git(`log --oneline -${n}`, cwd)
}
