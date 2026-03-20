using System.Text.Json.Serialization;

namespace Kontinue.Shared.Domain;

public sealed class Session
{
    public Guid Id { get; set; }
    public Guid ProjectId { get; set; }
    public DateTime StartedAt { get; set; } = DateTime.UtcNow;
    public DateTime? EndedAt { get; set; }
    public int ToolCalls { get; set; }
    public SessionStatus Status { get; set; } = SessionStatus.Active;
    public string? Branch { get; set; }
    public string? StartCommit { get; set; }
    public string? EndCommit { get; set; }
    public DateTime? ContextReadAt { get; set; }
    public List<string> FilesTouched { get; set; } = [];

    [JsonIgnore] public Project Project { get; set; } = null!;
    public ICollection<Checkpoint> Checkpoints { get; set; } = [];
    public ICollection<Handoff> Handoffs { get; set; } = [];
}

public enum SessionStatus
{
    Active,
    Ended,
    Crashed
}
