/* ── Wire types matching .NET API JSON (camelCase, GUIDs) ─── */

export interface Session {
  id: string
  projectId: string
  startedAt: string
  endedAt?: string | null
  toolCalls: number
  status: string
  branch?: string | null
  startCommit?: string | null
  endCommit?: string | null
  contextReadAt?: string | null
  filesTouched?: string[]
}

export interface Handoff {
  id: string
  projectId: string
  sessionId: string
  summary: string
  blockers?: string[]
  createdAt: string
}

export interface TaskItem {
  id: string
  content: string
  done: boolean
  position: number
}

export interface Task {
  id: string
  projectId: string
  title: string
  description?: string | null
  status: string
  outcome?: string | null
  notes?: string | null
  branch?: string | null
  createdAt: string
  updatedAt: string
  startedAt?: string | null
  endedAt?: string | null
  items: TaskItem[]
  blockedBy?: Array<{ taskId: string; blockedByTaskId: string }>
  blocks?: Array<{ taskId: string; blockedByTaskId: string }>
  externalLinks?: Array<{ id: string; provider: string; externalId: string; externalUrl?: string | null }>
}

export interface Decision {
  id: string
  summary: string
  rationale?: string | null
  alternatives?: string[]
  context?: string | null
  files?: string[]
  tags?: string[]
  status: string
  supersededById?: string | null
  scope: string
  createdAt: string
}

export interface PlanStep {
  id: string
  content: string
  status: string
  position: number
}

export interface Plan {
  id: string
  title: string
  goal?: string | null
  status: string
  createdAt: string
  steps: PlanStep[]
}

export interface Checkpoint {
  id: string
  sessionId: string
  taskId?: string | null
  progress: string
  nextStep?: string | null
  filesActive?: string[]
  gitCommit?: string | null
  createdAt: string
}

export interface Question {
  id: string
  text: string
  answer?: string | null
  resolvedAt?: string | null
  createdAt: string
}

export interface Observation {
  id: string
  content: string
  taskId?: string | null
  sessionId?: string | null
  files?: string[]
  resolvedAt?: string | null
  createdAt: string
}

export interface Signal {
  id: string
  type: string
  content: string
  source: string
  status: string
  createdAt: string
  deliveredAt?: string | null
  acknowledgedAt?: string | null
  agentResponse?: string | null
}

export interface StaleTask {
  id: string
  title: string
  updatedAt: string
}

export interface HealthInfo {
  level: 'good' | 'fair' | 'poor'
  reasons: string[]
}

/* ── DashboardData — built from .NET StateFullEvent ────────── */

export interface DashboardData {
  project: { id: string; name: string }
  git: { branch: string | null; commit: string | null }
  session: (Session & { ageMin: number }) | null
  lastHandoff: Handoff | null
  tasks: { inProgress: Task[]; todo: Task[]; done: Task[] }
  decisions: Decision[]
  plans: Plan[]
  checkpoint: (Checkpoint & { ageMin: number }) | null
  questions: Question[]
  observations: Observation[]
  signals: { recent: Signal[]; pending: Signal[] }
  activity: Array<{ type: string; summary: string; ts: string }>
  health: HealthInfo
  staleTasks: StaleTask[]
  stats: { chunks: number }
  generatedAt: string
}

/* ── StateFullEvent from WebSocket ─────────────────────────── */

export interface StateFullEvent {
  $type?: string
  projectId: string
  timestamp: string
  tasks: Task[]
  decisions: Decision[]
  observations: Observation[]
  signals: Signal[]
  plans: Plan[]
  questions: Question[]
  activeSession?: Session | null
  lastCheckpoint?: Checkpoint | null
  lastHandoff?: Handoff | null
}

/* ── Granular WebSocket events (discriminated by $type) ─────── */

interface BaseEvent {
  projectId: string
  timestamp: string
}

export interface TaskCreatedEvent extends BaseEvent {
  $type: 'task.created'
  taskId: string
  title: string
  description?: string | null
  status?: string | null
}

export interface TaskUpdatedEvent extends BaseEvent {
  $type: 'task.updated'
  taskId: string
  title?: string | null
  description?: string | null
  notes?: string | null
}

export interface TaskStatusChangedEvent extends BaseEvent {
  $type: 'task.status_changed'
  taskId: string
  oldStatus: string
  newStatus: string
  outcome?: string | null
}

export interface TaskDeletedEvent extends BaseEvent {
  $type: 'task.deleted'
  taskId: string
}

export interface DecisionLoggedEvent extends BaseEvent {
  $type: 'decision.logged'
  decisionId: string
  summary: string
  tags?: string[]
  scope?: string | null
}

export interface DecisionSupersededEvent extends BaseEvent {
  $type: 'decision.superseded'
  oldDecisionId: string
  newDecisionId: string
  newSummary: string
}

export interface DecisionArchivedEvent extends BaseEvent {
  $type: 'decision.archived'
  decisionId: string
}

export interface ObservationAddedEvent extends BaseEvent {
  $type: 'observation.added'
  observationId: string
  content: string
  files?: string[]
}

export interface ObservationResolvedEvent extends BaseEvent {
  $type: 'observation.resolved'
  observationId: string
}

export interface SignalCreatedEvent extends BaseEvent {
  $type: 'signal.created'
  signalId: string
  type: string
  content: string
  source: string
}

export interface SignalAcknowledgedEvent extends BaseEvent {
  $type: 'signal.acknowledged'
  signalId: string
  agentResponse?: string | null
}

export interface PlanCreatedEvent extends BaseEvent {
  $type: 'plan.created'
  planId: string
  title: string
  goal?: string | null
  stepCount: number
}

export interface PlanStatusChangedEvent extends BaseEvent {
  $type: 'plan.status_changed'
  planId: string
  newStatus: string
}

export interface PlanStepUpdatedEvent extends BaseEvent {
  $type: 'plan.step_updated'
  planId: string
  stepId: string
  newStatus: string
  content?: string | null
}

export interface SessionStartedEvent extends BaseEvent {
  $type: 'session.started'
  sessionId: string
  branch?: string | null
}

export interface SessionEndedEvent extends BaseEvent {
  $type: 'session.ended'
  sessionId: string
  status: string
}

export interface CheckpointCreatedEvent extends BaseEvent {
  $type: 'checkpoint.created'
  checkpointId: string
  sessionId: string
  progress: string
}

export interface HandoffCreatedEvent extends BaseEvent {
  $type: 'handoff.created'
  handoffId: string
  sessionId: string
  summary: string
}

export interface QuestionAskedEvent extends BaseEvent {
  $type: 'question.asked'
  questionId: string
  text: string
}

export interface QuestionAnsweredEvent extends BaseEvent {
  $type: 'question.answered'
  questionId: string
  answer: string
}

export interface MemoryChunkUpsertedEvent extends BaseEvent {
  $type: 'memory.upserted'
  chunkId: string
  type: string
  isUpdate: boolean
}

export type GranularEvent =
  | TaskCreatedEvent
  | TaskUpdatedEvent
  | TaskStatusChangedEvent
  | TaskDeletedEvent
  | DecisionLoggedEvent
  | DecisionSupersededEvent
  | DecisionArchivedEvent
  | ObservationAddedEvent
  | ObservationResolvedEvent
  | SignalCreatedEvent
  | SignalAcknowledgedEvent
  | PlanCreatedEvent
  | PlanStatusChangedEvent
  | PlanStepUpdatedEvent
  | SessionStartedEvent
  | SessionEndedEvent
  | CheckpointCreatedEvent
  | HandoffCreatedEvent
  | QuestionAskedEvent
  | QuestionAnsweredEvent
  | MemoryChunkUpsertedEvent

/* ── Project config persisted in localStorage ──────────────── */

export interface ProjectConfig {
  apiUrl: string
  workspaceId: string
  projectId: string
  projectName: string
  apiKey?: string
}

/* ── Auth session persisted separately ──────────────────────── */

export interface AuthSession {
  token: string
  userId: string
  email: string
  displayName?: string | null
  expiresAt: string
}

/* ── Workspace overview (from GET /api/workspaces/{id}/overview) ─ */

export interface WorkspaceProjectSummary {
  id: string
  name: string
  path?: string | null
  tasks: { todo: number; inProgress: number; done: number }
  activeSession: { id: string; startedAt: string; toolCalls: number; branch?: string | null } | null
  lastCheckpoint: { id: string; progress: string; createdAt: string } | null
  decisions: number
  observations: number
  pendingSignals: number
  health: { level: string; reasons: string[] }
}

export interface WorkspaceOverview {
  id: string
  name: string
  slug: string
  projects: WorkspaceProjectSummary[]
}
