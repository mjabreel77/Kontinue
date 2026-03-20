using System.Text.Json.Serialization;

namespace Kontinue.Shared.Domain;

public sealed class AgentTask
{
    public Guid Id { get; set; }
    public Guid ProjectId { get; set; }
    public Guid? SessionId { get; set; }
    public required string Title { get; set; }
    public string? Description { get; set; }
    public AgentTaskStatus Status { get; set; } = AgentTaskStatus.Todo;
    public string? Outcome { get; set; }
    public string? Notes { get; set; }
    public string? Branch { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? StartedAt { get; set; }
    public DateTime? EndedAt { get; set; }

    [JsonIgnore] public Project Project { get; set; } = null!;
    [JsonIgnore] public Session? Session { get; set; }
    public ICollection<TaskItem> Items { get; set; } = [];
    public ICollection<TaskDependency> BlockedBy { get; set; } = [];
    public ICollection<TaskDependency> Blocks { get; set; } = [];
    public ICollection<ExternalLink> ExternalLinks { get; set; } = [];
}

public enum AgentTaskStatus
{
    Todo,
    InProgress,
    Done,
    Abandoned
}

public sealed class TaskItem
{
    public Guid Id { get; set; }
    public Guid TaskId { get; set; }
    public required string Content { get; set; }
    public bool Done { get; set; }
    public int Position { get; set; }

    [JsonIgnore] public AgentTask Task { get; set; } = null!;
}

public sealed class TaskDependency
{
    public Guid TaskId { get; set; }
    public Guid BlockedByTaskId { get; set; }

    [JsonIgnore] public AgentTask Task { get; set; } = null!;
    [JsonIgnore] public AgentTask BlockedByTask { get; set; } = null!;
}

public sealed class ExternalLink
{
    public Guid Id { get; set; }
    public Guid TaskId { get; set; }
    public required string Provider { get; set; }
    public required string ExternalId { get; set; }
    public string? ExternalUrl { get; set; }

    [JsonIgnore] public AgentTask Task { get; set; } = null!;
}
