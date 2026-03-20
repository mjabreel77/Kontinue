using System.Text.Json.Serialization;

namespace Kontinue.Shared.Domain;

public sealed class Question
{
    public Guid Id { get; set; }
    public Guid ProjectId { get; set; }
    public Guid? SessionId { get; set; }
    public Guid? TaskId { get; set; }
    public required string Text { get; set; }
    public string? Answer { get; set; }
    public DateTime? ResolvedAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [JsonIgnore] public Project Project { get; set; } = null!;
    [JsonIgnore] public Session? Session { get; set; }
    [JsonIgnore] public AgentTask? Task { get; set; }
}
