// Store types shared across the codebase

export interface Project {
  id: number
  name: string
  path: string
  description: string | null
  tech_stack: string | null
  created_at: string
}

export interface Session {
  id: number
  project_id: number
  started_at: string
  ended_at: string | null
  handoff_note: string | null
  blockers: string | null
  branch: string | null
  start_commit: string | null
  end_commit: string | null
}

export interface Task {
  id: number
  project_id: number
  title: string
  status: 'todo' | 'in-progress' | 'done' | 'abandoned'
  created_at: string
  updated_at: string
  session_id: number | null
  notes: string | null
  branch: string | null
}

export interface Decision {
  id: number
  project_id: number
  session_id: number | null
  summary: string
  rationale: string | null
  alternatives: string | null
  created_at: string
  branch: string | null
  git_commit: string | null
}

export interface Note {
  id: number
  project_id: number
  session_id: number | null
  content: string
  created_at: string
}

export interface MemoryChunk {
  id: number
  project_id: number
  source_type: 'task' | 'decision' | 'note' | 'session' | 'architecture' | 'identity'
  source_id: number
  content: string
  embedding: Buffer | null
  created_at: string
}
