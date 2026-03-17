import { findProjectByPath } from '../store/queries.js'
import type { Project } from '../types.js'

export function requireProject(cwd: string): Project {
  const project = findProjectByPath(cwd)
  if (!project) {
    console.error('No Kontinue project found in this directory. Run: kontinue init')
    process.exit(1)
  }
  return project
}
