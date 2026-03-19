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
  context_read_at: string | null
  files_touched: string | null
  tool_calls: number
}

export interface Task {
  id: number
  project_id: number
  title: string
  status: 'todo' | 'in-progress' | 'done' | 'abandoned'
  description: string | null
  outcome: string | null
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
  task_id: number | null
  summary: string
  rationale: string | null
  alternatives: string | null
  context: string | null
  files: string | null
  tags: string | null
  confidence: 'confirmed' | 'provisional' | 'revisit'
  status: 'active' | 'superseded' | 'archived'
  scope: 'project' | 'task'
  superseded_by: number | null
  created_at: string
  branch: string | null
  git_commit: string | null
}

export interface Note {
  id: number
  project_id: number
  session_id: number | null
  task_id: number | null
  content: string
  resolved_at: string | null
  created_at: string
}

export interface TaskItem {
  id: number
  task_id: number
  content: string
  done: number  // 0 | 1 (SQLite boolean)
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

export interface Checkpoint {
  id: number
  project_id: number
  session_id: number | null
  task_id: number | null
  progress: string
  next_step: string | null
  files_active: string | null
  git_commit: string | null
  created_at: string
}

export interface Question {
  id: number
  project_id: number
  session_id: number | null
  task_id: number | null
  question: string
  answer: string | null
  resolved_at: string | null
  created_at: string
}

export interface Plan {
  id: number
  project_id: number
  title: string
  goal: string | null
  status: 'draft' | 'active' | 'complete' | 'archived'
  created_at: string
  updated_at: string
}

export interface PlanStep {
  id: number
  plan_id: number
  content: string
  status: 'pending' | 'in-progress' | 'done' | 'skipped'
  position: number
  created_at: string
}

export interface Signal {
  id: number
  project_id: number
  source: string
  type: string
  content: string
  metadata: string | null
  status: string
  created_at: string
  delivered_at: string | null
  acknowledged_at: string | null
  agent_response: string | null
}
