using System.Text.Json;
using Kontinue.Shared.Data;
using Kontinue.Shared.Domain;
using Kontinue.Shared.Protocol;
using Microsoft.EntityFrameworkCore;

namespace Kontinue.Api.WebSockets;

public static class EventPublisher
{
    private static string CamelCase(string value) => JsonNamingPolicy.CamelCase.ConvertName(value);

    public static void PublishTaskCreated(this ConnectionManager manager, AgentTask task) =>
        manager.BroadcastToProject(task.ProjectId, new TaskCreatedEvent
        {
            ProjectId = task.ProjectId,
            TaskId = task.Id,
            Title = task.Title,
            Description = task.Description,
            Status = CamelCase(task.Status.ToString())
        });

    public static void PublishTaskUpdated(this ConnectionManager manager, AgentTask task) =>
        manager.BroadcastToProject(task.ProjectId, new TaskUpdatedEvent
        {
            ProjectId = task.ProjectId,
            TaskId = task.Id,
            Title = task.Title,
            Description = task.Description,
            Notes = task.Notes
        });

    public static void PublishTaskStatusChanged(this ConnectionManager manager, AgentTask task, string oldStatus) =>
        manager.BroadcastToProject(task.ProjectId, new TaskStatusChangedEvent
        {
            ProjectId = task.ProjectId,
            TaskId = task.Id,
            OldStatus = CamelCase(oldStatus),
            NewStatus = CamelCase(task.Status.ToString()),
            Outcome = task.Outcome
        });

    public static void PublishTaskDeleted(this ConnectionManager manager, Guid projectId, Guid taskId) =>
        manager.BroadcastToProject(projectId, new TaskDeletedEvent
        {
            ProjectId = projectId,
            TaskId = taskId
        });

    public static void PublishDecisionLogged(this ConnectionManager manager, Decision decision) =>
        manager.BroadcastToProject(decision.ProjectId, new DecisionLoggedEvent
        {
            ProjectId = decision.ProjectId,
            DecisionId = decision.Id,
            Summary = decision.Summary,
            Tags = decision.Tags,
            Scope = CamelCase(decision.Scope.ToString())
        });

    public static void PublishDecisionSuperseded(this ConnectionManager manager, Decision old, Decision replacement) =>
        manager.BroadcastToProject(old.ProjectId, new DecisionSupersededEvent
        {
            ProjectId = old.ProjectId,
            OldDecisionId = old.Id,
            NewDecisionId = replacement.Id,
            NewSummary = replacement.Summary
        });

    public static void PublishDecisionArchived(this ConnectionManager manager, Decision decision) =>
        manager.BroadcastToProject(decision.ProjectId, new DecisionArchivedEvent
        {
            ProjectId = decision.ProjectId,
            DecisionId = decision.Id
        });

    public static void PublishObservationAdded(this ConnectionManager manager, Observation obs) =>
        manager.BroadcastToProject(obs.ProjectId, new ObservationAddedEvent
        {
            ProjectId = obs.ProjectId,
            ObservationId = obs.Id,
            Content = obs.Content,
            Files = obs.Files
        });

    public static void PublishObservationResolved(this ConnectionManager manager, Observation obs) =>
        manager.BroadcastToProject(obs.ProjectId, new ObservationResolvedEvent
        {
            ProjectId = obs.ProjectId,
            ObservationId = obs.Id
        });

    public static void PublishSignalCreated(this ConnectionManager manager, Signal signal) =>
        manager.BroadcastToProject(signal.ProjectId, new SignalCreatedEvent
        {
            ProjectId = signal.ProjectId,
            SignalId = signal.Id,
            Type = CamelCase(signal.Type.ToString()),
            Content = signal.Content,
            Source = CamelCase(signal.Source.ToString())
        });

    public static void PublishSignalAcknowledged(this ConnectionManager manager, Signal signal) =>
        manager.BroadcastToProject(signal.ProjectId, new SignalAcknowledgedEvent
        {
            ProjectId = signal.ProjectId,
            SignalId = signal.Id,
            AgentResponse = signal.AgentResponse
        });

    public static void PublishPlanCreated(this ConnectionManager manager, Plan plan) =>
        manager.BroadcastToProject(plan.ProjectId, new PlanCreatedEvent
        {
            ProjectId = plan.ProjectId,
            PlanId = plan.Id,
            Title = plan.Title,
            Goal = plan.Goal,
            StepCount = plan.Steps.Count
        });

    public static void PublishPlanStatusChanged(this ConnectionManager manager, Plan plan) =>
        manager.BroadcastToProject(plan.ProjectId, new PlanStatusChangedEvent
        {
            ProjectId = plan.ProjectId,
            PlanId = plan.Id,
            NewStatus = CamelCase(plan.Status.ToString())
        });

    public static void PublishPlanStepUpdated(this ConnectionManager manager, Guid projectId, PlanStep step) =>
        manager.BroadcastToProject(projectId, new PlanStepUpdatedEvent
        {
            ProjectId = projectId,
            PlanId = step.PlanId,
            StepId = step.Id,
            NewStatus = CamelCase(step.Status.ToString()),
            Content = step.Content
        });

    public static void PublishSessionStarted(this ConnectionManager manager, Session session) =>
        manager.BroadcastToProject(session.ProjectId, new SessionStartedEvent
        {
            ProjectId = session.ProjectId,
            SessionId = session.Id,
            Branch = session.Branch
        });

    public static void PublishSessionEnded(this ConnectionManager manager, Session session) =>
        manager.BroadcastToProject(session.ProjectId, new SessionEndedEvent
        {
            ProjectId = session.ProjectId,
            SessionId = session.Id,
            Status = CamelCase(session.Status.ToString())
        });

    public static void PublishCheckpointCreated(this ConnectionManager manager, Checkpoint cp) =>
        manager.BroadcastToProject(cp.ProjectId, new CheckpointCreatedEvent
        {
            ProjectId = cp.ProjectId,
            CheckpointId = cp.Id,
            SessionId = cp.SessionId,
            Progress = cp.Progress
        });

    public static void PublishHandoffCreated(this ConnectionManager manager, Handoff handoff) =>
        manager.BroadcastToProject(handoff.ProjectId, new HandoffCreatedEvent
        {
            ProjectId = handoff.ProjectId,
            HandoffId = handoff.Id,
            SessionId = handoff.SessionId,
            Summary = handoff.Summary
        });

    public static void PublishQuestionAsked(this ConnectionManager manager, Question question) =>
        manager.BroadcastToProject(question.ProjectId, new QuestionAskedEvent
        {
            ProjectId = question.ProjectId,
            QuestionId = question.Id,
            Text = question.Text
        });

    public static void PublishQuestionAnswered(this ConnectionManager manager, Question question) =>
        manager.BroadcastToProject(question.ProjectId, new QuestionAnsweredEvent
        {
            ProjectId = question.ProjectId,
            QuestionId = question.Id,
            Answer = question.Answer!
        });

    public static void PublishMemoryChunkUpserted(this ConnectionManager manager, MemoryChunk chunk, bool isUpdate) =>
        manager.BroadcastToProject(chunk.ProjectId, new MemoryChunkUpsertedEvent
        {
            ProjectId = chunk.ProjectId,
            ChunkId = chunk.Id,
            Type = chunk.Type,
            IsUpdate = isUpdate
        });

    public static async Task SendStateFullAsync(ClientConnection connection, KontinueDbContext db, Guid projectId)
    {
        var state = new StateFullEvent
        {
            ProjectId = projectId,
            Tasks = await db.Tasks.AsNoTracking()
                .Where(t => t.ProjectId == projectId && t.Status != AgentTaskStatus.Abandoned)
                .Include(t => t.Items.OrderBy(i => i.Position))
                .OrderByDescending(t => t.UpdatedAt)
                .ToListAsync(),
            Decisions = await db.Decisions.AsNoTracking()
                .Where(d => d.ProjectId == projectId && d.Status == DecisionStatus.Active)
                .OrderByDescending(d => d.CreatedAt)
                .ToListAsync(),
            Observations = await db.Observations.AsNoTracking()
                .Where(o => o.ProjectId == projectId && o.ResolvedAt == null)
                .OrderByDescending(o => o.CreatedAt)
                .ToListAsync(),
            Signals = await db.Signals.AsNoTracking()
                .Where(s => s.ProjectId == projectId)
                .OrderByDescending(s => s.CreatedAt)
                .Take(50)
                .ToListAsync(),
            Plans = await db.Plans.AsNoTracking()
                .Where(p => p.ProjectId == projectId && p.Status != PlanStatus.Archived)
                .Include(p => p.Steps.OrderBy(s => s.Position))
                .OrderByDescending(p => p.CreatedAt)
                .ToListAsync(),
            Questions = await db.Questions.AsNoTracking()
                .Where(q => q.ProjectId == projectId && q.ResolvedAt == null)
                .OrderByDescending(q => q.CreatedAt)
                .ToListAsync(),
            ActiveSession = await db.Sessions.AsNoTracking()
                .Where(s => s.ProjectId == projectId && s.Status == SessionStatus.Active)
                .OrderByDescending(s => s.StartedAt)
                .FirstOrDefaultAsync(),
            LastCheckpoint = await db.Checkpoints.AsNoTracking()
                .Where(c => c.ProjectId == projectId)
                .OrderByDescending(c => c.CreatedAt)
                .FirstOrDefaultAsync(),
            LastHandoff = await db.Handoffs.AsNoTracking()
                .Where(h => h.ProjectId == projectId)
                .OrderByDescending(h => h.CreatedAt)
                .FirstOrDefaultAsync()
        };

        connection.TrySend(state);
    }
}
