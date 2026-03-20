/**
 * HTTP client for Kontinue.Api REST endpoints.
 * Used by the proxy MCP server (--backend=remote) to route tool calls
 * to the .NET backend instead of local SQLite.
 */

export interface ApiClientConfig {
  baseUrl: string
  projectId: string
  apiKey?: string
}

/** Convert a string (comma/newline separated or JSON array) to string[], or pass through if already an array. */
export function toStringArray(value?: string | string[] | null): string[] {
  if (!value) return []
  if (Array.isArray(value)) return value
  // Try JSON array first
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) return parsed.map(String)
  } catch { /* not JSON */ }
  // Split by comma or newline
  return value.split(/[,\n]/).map(s => s.trim()).filter(Boolean)
}

export class KontinueApiClient {
  private readonly baseUrl: string
  private readonly projectId: string
  private readonly headers: Record<string, string>

  constructor(config: ApiClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '')
    this.projectId = config.projectId
    this.headers = {
      'Content-Type': 'application/json',
      ...(config.apiKey ? { 'Authorization': `Bearer ${config.apiKey}` } : {}),
    }
  }

  private projectUrl(path: string): string {
    return `${this.baseUrl}/api/projects/${this.projectId}${path}`
  }

  private async request<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, {
      ...init,
      headers: { ...this.headers, ...init?.headers },
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`API ${init?.method ?? 'GET'} ${url} returned ${res.status}: ${body}`)
    }
    if (res.status === 204) return undefined as T
    return res.json() as Promise<T>
  }

  private get<T>(url: string): Promise<T> {
    return this.request<T>(url)
  }

  private post<T>(url: string, body: unknown): Promise<T> {
    return this.request<T>(url, { method: 'POST', body: JSON.stringify(body) })
  }

  private put<T>(url: string, body?: unknown): Promise<T> {
    return this.request<T>(url, { method: 'PUT', body: body ? JSON.stringify(body) : undefined })
  }

  private delete(url: string): Promise<void> {
    return this.request<void>(url, { method: 'DELETE' })
  }

  // ── Sessions ──────────────────────────────────────────────────────

  async getSessions(): Promise<any[]> {
    return this.get(this.projectUrl('/sessions'))
  }

  async getActiveSession(): Promise<any | null> {
    const sessions: any[] = await this.get(this.projectUrl('/sessions'))
    return sessions.find((s: any) => s.status === 'Active') ?? null
  }

  async getLastSession(): Promise<any | null> {
    const sessions: any[] = await this.get(this.projectUrl('/sessions'))
    return sessions[0] ?? null
  }

  async startSession(branch?: string, startCommit?: string): Promise<any> {
    return this.post(this.projectUrl('/sessions'), { branch, startCommit })
  }

  async endSession(sessionId: string, endCommit?: string, filesTouched?: string[]): Promise<any> {
    return this.put(this.projectUrl(`/sessions/${sessionId}/end`), { endCommit, filesTouched })
  }

  async markContextRead(sessionId: string): Promise<any> {
    return this.put(this.projectUrl(`/sessions/${sessionId}/context-read`))
  }

  async incrementToolCalls(sessionId: string): Promise<any> {
    return this.put(this.projectUrl(`/sessions/${sessionId}/tool-call`))
  }

  // ── Tasks ─────────────────────────────────────────────────────────

  async getTasks(status?: string): Promise<any[]> {
    const qs = status ? `?status=${encodeURIComponent(status)}` : ''
    return this.get(this.projectUrl(`/tasks${qs}`))
  }

  async getTask(taskId: string): Promise<any> {
    return this.get(this.projectUrl(`/tasks/${taskId}`))
  }

  async createTask(title: string, description?: string, sessionId?: string, branch?: string, items?: string[]): Promise<any> {
    return this.post(this.projectUrl('/tasks'), { title, description, sessionId, branch, items })
  }

  async updateTask(taskId: string, data: { title?: string; description?: string; notes?: string }): Promise<any> {
    return this.put(this.projectUrl(`/tasks/${taskId}`), data)
  }

  async updateTaskStatus(taskId: string, status: string, outcome?: string): Promise<any> {
    return this.put(this.projectUrl(`/tasks/${taskId}/status`), { status, outcome })
  }

  async deleteTask(taskId: string): Promise<void> {
    return this.delete(this.projectUrl(`/tasks/${taskId}`))
  }

  async addTaskItem(taskId: string, content: string): Promise<any> {
    return this.post(this.projectUrl(`/tasks/${taskId}/items`), { content })
  }

  async toggleTaskItem(taskId: string, itemId: string): Promise<any> {
    return this.put(this.projectUrl(`/tasks/${taskId}/items/${itemId}/toggle`))
  }

  async deleteTaskItem(taskId: string, itemId: string): Promise<void> {
    return this.delete(this.projectUrl(`/tasks/${taskId}/items/${itemId}`))
  }

  async addDependency(taskId: string, blockedByTaskId: string): Promise<any> {
    return this.post(this.projectUrl(`/tasks/${taskId}/dependencies`), { blockedByTaskId })
  }

  async removeDependency(taskId: string, blockerTaskId: string): Promise<void> {
    return this.delete(this.projectUrl(`/tasks/${taskId}/dependencies/${blockerTaskId}`))
  }

  async addExternalLink(taskId: string, provider: string, externalId: string, externalUrl?: string): Promise<any> {
    return this.post(this.projectUrl(`/tasks/${taskId}/links`), { provider, externalId, externalUrl })
  }

  // ── Decisions ─────────────────────────────────────────────────────

  async getDecisions(status?: string): Promise<any[]> {
    const qs = status ? `?status=${encodeURIComponent(status)}` : ''
    return this.get(this.projectUrl(`/decisions${qs}`))
  }

  async getDecision(decisionId: string): Promise<any> {
    return this.get(this.projectUrl(`/decisions/${decisionId}`))
  }

  async createDecision(data: {
    summary: string; rationale?: string; alternatives?: string[]; context?: string;
    files?: string[]; tags?: string[]; scope?: string; confidence?: string;
    sessionId?: string; taskId?: string; branch?: string; gitCommit?: string
  }): Promise<any> {
    return this.post(this.projectUrl('/decisions'), data)
  }

  async supersedeDecision(decisionId: string, data: {
    summary: string; rationale?: string; alternatives?: string[]; context?: string;
    files?: string[]; tags?: string[]; sessionId?: string; branch?: string; gitCommit?: string
  }): Promise<any> {
    return this.put(this.projectUrl(`/decisions/${decisionId}/supersede`), data)
  }

  async archiveDecision(decisionId: string): Promise<any> {
    return this.put(this.projectUrl(`/decisions/${decisionId}/archive`))
  }

  // ── Observations ──────────────────────────────────────────────────

  async getObservations(unresolved?: boolean): Promise<any[]> {
    const qs = unresolved ? '?unresolved=true' : ''
    return this.get(this.projectUrl(`/observations${qs}`))
  }

  async createObservation(content: string, files?: string[], sessionId?: string, taskId?: string): Promise<any> {
    return this.post(this.projectUrl('/observations'), { content, files, sessionId, taskId })
  }

  async resolveObservation(observationId: string): Promise<any> {
    return this.put(this.projectUrl(`/observations/${observationId}/resolve`))
  }

  // ── Signals ───────────────────────────────────────────────────────

  async getPendingSignals(): Promise<any[]> {
    return this.get(this.projectUrl('/signals/pending'))
  }

  async getSignals(status?: string): Promise<any[]> {
    const qs = status ? `?status=${encodeURIComponent(status)}` : ''
    return this.get(this.projectUrl(`/signals${qs}`))
  }

  async createSignal(type: string, content: string, source?: string): Promise<any> {
    return this.post(this.projectUrl('/signals'), { type, content, source })
  }

  async deliverSignal(signalId: string): Promise<any> {
    return this.put(this.projectUrl(`/signals/${signalId}/deliver`))
  }

  async acknowledgeSignal(signalId: string, agentResponse?: string): Promise<any> {
    return this.put(this.projectUrl(`/signals/${signalId}/acknowledge`), { agentResponse })
  }

  // ── Plans ─────────────────────────────────────────────────────────

  async getPlans(status?: string): Promise<any[]> {
    const qs = status ? `?status=${encodeURIComponent(status)}` : ''
    return this.get(this.projectUrl(`/plans${qs}`))
  }

  async getPlan(planId: string): Promise<any> {
    return this.get(this.projectUrl(`/plans/${planId}`))
  }

  async createPlan(title: string, goal?: string, steps?: string[]): Promise<any> {
    return this.post(this.projectUrl('/plans'), { title, goal, steps })
  }

  async updatePlanStatus(planId: string, status: string): Promise<any> {
    return this.put(this.projectUrl(`/plans/${planId}/status`), { status })
  }

  async addPlanStep(planId: string, content: string, position?: number): Promise<any> {
    return this.post(this.projectUrl(`/plans/${planId}/steps`), { content, position })
  }

  async updatePlanStepStatus(planId: string, stepId: string, status: string): Promise<any> {
    return this.put(this.projectUrl(`/plans/${planId}/steps/${stepId}/status`), { status })
  }

  async deletePlanStep(planId: string, stepId: string): Promise<void> {
    return this.delete(this.projectUrl(`/plans/${planId}/steps/${stepId}`))
  }

  // ── Memory ────────────────────────────────────────────────────────

  async getMemoryChunks(type?: string): Promise<any[]> {
    const qs = type ? `?type=${encodeURIComponent(type)}` : ''
    return this.get(this.projectUrl(`/memory${qs}`))
  }

  async upsertMemoryChunk(type: string, content: string, sourceId?: string, sessionId?: string, decayExempt?: boolean): Promise<any> {
    return this.post(this.projectUrl('/memory'), { type, content, sourceId, sessionId, decayExempt: decayExempt ?? false })
  }

  async searchMemory(query: string, type?: string, limit?: number): Promise<any[]> {
    return this.post(this.projectUrl('/memory/search'), { query, type, limit })
  }

  async setDecayExempt(chunkId: string, exempt: boolean): Promise<any> {
    return this.put(this.projectUrl(`/memory/${chunkId}/decay-exempt`), { exempt })
  }

  async deleteMemoryChunk(chunkId: string): Promise<void> {
    return this.delete(this.projectUrl(`/memory/${chunkId}`))
  }

  // ── Checkpoints ───────────────────────────────────────────────────

  async getCheckpoints(sessionId?: string): Promise<any[]> {
    const qs = sessionId ? `?sessionId=${sessionId}` : ''
    return this.get(this.projectUrl(`/checkpoints${qs}`))
  }

  async getLatestCheckpoint(): Promise<any | null> {
    try {
      return await this.get(this.projectUrl('/checkpoints/latest'))
    } catch {
      return null
    }
  }

  async createCheckpoint(sessionId: string, progress: string, nextStep?: string, filesActive?: string[], gitCommit?: string, taskId?: string): Promise<any> {
    return this.post(this.projectUrl('/checkpoints'), { sessionId, progress, nextStep, filesActive, gitCommit, taskId })
  }

  // ── Handoffs ──────────────────────────────────────────────────────

  async getHandoffs(): Promise<any[]> {
    return this.get(this.projectUrl('/handoffs'))
  }

  async getLatestHandoff(): Promise<any | null> {
    try {
      return await this.get(this.projectUrl('/handoffs/latest'))
    } catch {
      return null
    }
  }

  async createHandoff(sessionId: string, summary: string, blockers?: string[]): Promise<any> {
    return this.post(this.projectUrl('/handoffs'), { sessionId, summary, blockers })
  }

  // ── Questions ─────────────────────────────────────────────────────

  async getQuestions(open?: boolean): Promise<any[]> {
    const qs = open ? '?open=true' : ''
    return this.get(this.projectUrl(`/questions${qs}`))
  }

  async createQuestion(text: string, sessionId?: string, taskId?: string): Promise<any> {
    return this.post(this.projectUrl('/questions'), { text, sessionId, taskId })
  }

  async answerQuestion(questionId: string, answer: string): Promise<any> {
    return this.put(this.projectUrl(`/questions/${questionId}/answer`), { answer })
  }

  // ── Workspace / Project provisioning (static — no projectId needed) ──

  static async listWorkspaces(baseUrl: string): Promise<any[]> {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/workspaces`)
    if (!res.ok) throw new Error(`Failed to list workspaces: ${res.status}`)
    return res.json() as Promise<any[]>
  }

  static async createWorkspace(baseUrl: string, name: string, slug: string): Promise<any> {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/workspaces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, slug }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Failed to create workspace: ${res.status} ${body}`)
    }
    return res.json()
  }

  static async listProjects(baseUrl: string, workspaceId: string, token?: string): Promise<any[]> {
    const headers: Record<string, string> = {}
    if (token) headers['Authorization'] = `Bearer ${token}`
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/workspaces/${workspaceId}/projects`, { headers })
    if (!res.ok) throw new Error(`Failed to list projects: ${res.status}`)
    return res.json() as Promise<any[]>
  }

  static async createProject(baseUrl: string, workspaceId: string, name: string, path?: string, token?: string): Promise<any> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/workspaces/${workspaceId}/projects`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name, path }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Failed to create project: ${res.status} ${body}`)
    }
    return res.json()
  }
}
