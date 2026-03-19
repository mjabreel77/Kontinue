export interface Project {
  id: number
  name: string
  description: string | null
}

export interface GitInfo {
  branch: string | null
  commit: string | null
}

export interface Session {
  id: number
  started_at: string
  branch: string | null
  context_read_at: string | null
  ageMin: number
  toolCalls: number
}

export interface Handoff {
  ended_at: string
  handoff_note: string | null
  files_touched: string | null
}

export interface TaskItem {
  id: number
  content: string
  done: boolean
}

export interface TaskDep {
  id: number
  title: string
  status: string
}

export interface Task {
  id: number
  title: string
  description: string | null
  status: 'todo' | 'in-progress' | 'done' | 'abandoned'
  outcome: string | null
  created_at: string
  updated_at: string
  items: TaskItem[]
  blockers?: TaskDep[]
  blocking?: TaskDep[]
  external_url?: string | null
  external_ref?: string | null
}

export interface Decision {
  id: number
  summary: string
  rationale: string | null
  alternatives: string | null
  context: string | null
  files: string | null
  tags: string | null
  created_at: string
  superseded_by: number | null
}

export interface PlanStep {
  id: number
  content: string
  status: 'pending' | 'done' | 'skipped'
  step_order: number
}

export interface Plan {
  id: number
  title: string
  goal: string | null
  status: 'active' | 'complete' | 'paused' | 'abandoned'
  created_at: string
  updated_at: string
  steps: PlanStep[]
}

export interface Checkpoint {
  id: number
  progress: string
  files_active: string | null
  next_step: string | null
  task_title: string | null
  created_at: string
  ageMin: number
}

export interface Question {
  id: number
  question: string
  context: string | null
  answer: string | null
  status: 'open' | 'answered'
  created_at: string
}

export interface Observation {
  id: number
  content: string
  task_id: number | null
  session_id: number | null
  resolved_at: string | null
  created_at: string
}

export interface Signal {
  id: number
  type: 'message' | 'priority' | 'abort' | 'answer'
  content: string
  source: 'cli' | 'web'
  status: 'pending' | 'delivered' | 'acknowledged'
  created_at: string
  delivered_at: string | null
  acknowledged_at: string | null
  agent_response: string | null
}

export interface StaleTask {
  id: number
  title: string
  updated_at: string
}

export interface HealthInfo {
  level: 'good' | 'fair' | 'poor'
  reasons: string[]
}

export interface DashboardData {
  project: Project
  git: GitInfo
  session: Session | null
  lastHandoff: Handoff | null
  tasks: {
    inProgress: Task[]
    todo: Task[]
    done: Task[]
  }
  decisions: Decision[]
  plans: Plan[]
  checkpoint: Checkpoint | null
  questions: Question[]
  observations: Observation[]
  signals: {
    recent: Signal[]
    pending: Signal[]
  }
  activity: Array<{ type: string; summary: string; ts: string }>
  health: HealthInfo
  staleTasks: StaleTask[]
  stats: { chunks: number }
  generatedAt: string
}
