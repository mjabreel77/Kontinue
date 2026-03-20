using System.Text.Json.Serialization;

namespace Kontinue.Shared.Domain;

public sealed class Observation
{
    public Guid Id { get; set; }
    public Guid ProjectId { get; set; }
    public Guid? SessionId { get; set; }
    public Guid? TaskId { get; set; }
    public required string Content { get; set; }
    public List<string> Files { get; set; } = [];
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ResolvedAt { get; set; }

    [JsonIgnore] public Project Project { get; set; } = null!;
    [JsonIgnore] public Session? Session { get; set; }
    [JsonIgnore] public AgentTask? Task { get; set; }
}

public sealed class Signal
{
    public Guid Id { get; set; }
    public Guid ProjectId { get; set; }
    public required SignalType Type { get; set; }
    public required string Content { get; set; }
    public required SignalSource Source { get; set; }
    public SignalStatus Status { get; set; } = SignalStatus.Pending;
    public string? AgentResponse { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? DeliveredAt { get; set; }
    public DateTime? AcknowledgedAt { get; set; }

    [JsonIgnore] public Project Project { get; set; } = null!;
}

public enum SignalType
{
    Message,
    Priority,
    Abort,
    Answer
}

public enum SignalSource
{
    Cli,
    Web
}

public enum SignalStatus
{
    Pending,
    Delivered,
    Acknowledged
}
