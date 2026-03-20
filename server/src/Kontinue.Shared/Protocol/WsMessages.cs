using System.Text.Json.Serialization;

namespace Kontinue.Shared.Protocol;

[JsonPolymorphic(TypeDiscriminatorPropertyName = "$type")]
[JsonDerivedType(typeof(TaskCreatedEvent), "task.created")]
[JsonDerivedType(typeof(TaskUpdatedEvent), "task.updated")]
[JsonDerivedType(typeof(TaskStatusChangedEvent), "task.status_changed")]
[JsonDerivedType(typeof(TaskDeletedEvent), "task.deleted")]
[JsonDerivedType(typeof(DecisionLoggedEvent), "decision.logged")]
[JsonDerivedType(typeof(DecisionSupersededEvent), "decision.superseded")]
[JsonDerivedType(typeof(DecisionArchivedEvent), "decision.archived")]
[JsonDerivedType(typeof(ObservationAddedEvent), "observation.added")]
[JsonDerivedType(typeof(ObservationResolvedEvent), "observation.resolved")]
[JsonDerivedType(typeof(SignalCreatedEvent), "signal.created")]
[JsonDerivedType(typeof(SignalAcknowledgedEvent), "signal.acknowledged")]
[JsonDerivedType(typeof(PlanCreatedEvent), "plan.created")]
[JsonDerivedType(typeof(PlanStatusChangedEvent), "plan.status_changed")]
[JsonDerivedType(typeof(PlanStepUpdatedEvent), "plan.step_updated")]
[JsonDerivedType(typeof(SessionStartedEvent), "session.started")]
[JsonDerivedType(typeof(SessionEndedEvent), "session.ended")]
[JsonDerivedType(typeof(CheckpointCreatedEvent), "checkpoint.created")]
[JsonDerivedType(typeof(HandoffCreatedEvent), "handoff.created")]
[JsonDerivedType(typeof(QuestionAskedEvent), "question.asked")]
[JsonDerivedType(typeof(QuestionAnsweredEvent), "question.answered")]
[JsonDerivedType(typeof(MemoryChunkUpsertedEvent), "memory.upserted")]
[JsonDerivedType(typeof(StateFullEvent), "state.full")]
public abstract class ServerEvent
{
    public Guid ProjectId { get; init; }
    public DateTime Timestamp { get; init; } = DateTime.UtcNow;
}

// Task events
public sealed class TaskCreatedEvent : ServerEvent
{
    public required Guid TaskId { get; init; }
    public required string Title { get; init; }
    public string? Description { get; init; }
    public string? Status { get; init; }
}

public sealed class TaskUpdatedEvent : ServerEvent
{
    public required Guid TaskId { get; init; }
    public string? Title { get; init; }
    public string? Description { get; init; }
    public string? Notes { get; init; }
}

public sealed class TaskStatusChangedEvent : ServerEvent
{
    public required Guid TaskId { get; init; }
    public required string OldStatus { get; init; }
    public required string NewStatus { get; init; }
    public string? Outcome { get; init; }
}

public sealed class TaskDeletedEvent : ServerEvent
{
    public required Guid TaskId { get; init; }
}

// Decision events
public sealed class DecisionLoggedEvent : ServerEvent
{
    public required Guid DecisionId { get; init; }
    public required string Summary { get; init; }
    public List<string> Tags { get; init; } = [];
    public string? Scope { get; init; }
}

public sealed class DecisionSupersededEvent : ServerEvent
{
    public required Guid OldDecisionId { get; init; }
    public required Guid NewDecisionId { get; init; }
    public required string NewSummary { get; init; }
}

public sealed class DecisionArchivedEvent : ServerEvent
{
    public required Guid DecisionId { get; init; }
}

// Observation events
public sealed class ObservationAddedEvent : ServerEvent
{
    public required Guid ObservationId { get; init; }
    public required string Content { get; init; }
    public List<string> Files { get; init; } = [];
}

public sealed class ObservationResolvedEvent : ServerEvent
{
    public required Guid ObservationId { get; init; }
}

// Signal events
public sealed class SignalCreatedEvent : ServerEvent
{
    public required Guid SignalId { get; init; }
    public required string Type { get; init; }
    public required string Content { get; init; }
    public required string Source { get; init; }
}

public sealed class SignalAcknowledgedEvent : ServerEvent
{
    public required Guid SignalId { get; init; }
    public string? AgentResponse { get; init; }
}

// Plan events
public sealed class PlanCreatedEvent : ServerEvent
{
    public required Guid PlanId { get; init; }
    public required string Title { get; init; }
    public string? Goal { get; init; }
    public int StepCount { get; init; }
}

public sealed class PlanStatusChangedEvent : ServerEvent
{
    public required Guid PlanId { get; init; }
    public required string NewStatus { get; init; }
}

public sealed class PlanStepUpdatedEvent : ServerEvent
{
    public required Guid PlanId { get; init; }
    public required Guid StepId { get; init; }
    public required string NewStatus { get; init; }
    public string? Content { get; init; }
}

// Session events
public sealed class SessionStartedEvent : ServerEvent
{
    public required Guid SessionId { get; init; }
    public string? Branch { get; init; }
}

public sealed class SessionEndedEvent : ServerEvent
{
    public required Guid SessionId { get; init; }
    public required string Status { get; init; }
}

// Checkpoint & Handoff events
public sealed class CheckpointCreatedEvent : ServerEvent
{
    public required Guid CheckpointId { get; init; }
    public required Guid SessionId { get; init; }
    public required string Progress { get; init; }
}

public sealed class HandoffCreatedEvent : ServerEvent
{
    public required Guid HandoffId { get; init; }
    public required Guid SessionId { get; init; }
    public required string Summary { get; init; }
}

// Question events
public sealed class QuestionAskedEvent : ServerEvent
{
    public required Guid QuestionId { get; init; }
    public required string Text { get; init; }
}

public sealed class QuestionAnsweredEvent : ServerEvent
{
    public required Guid QuestionId { get; init; }
    public required string Answer { get; init; }
}

// Memory events
public sealed class MemoryChunkUpsertedEvent : ServerEvent
{
    public required Guid ChunkId { get; init; }
    public required string Type { get; init; }
    public bool IsUpdate { get; init; }
}

// Full state snapshot (sent on connect)
public sealed class StateFullEvent : ServerEvent
{
    public required object Tasks { get; init; }
    public required object Decisions { get; init; }
    public required object Observations { get; init; }
    public required object Signals { get; init; }
    public required object Plans { get; init; }
    public required object Questions { get; init; }
    public object? ActiveSession { get; init; }
    public object? LastCheckpoint { get; init; }
    public object? LastHandoff { get; init; }
}
