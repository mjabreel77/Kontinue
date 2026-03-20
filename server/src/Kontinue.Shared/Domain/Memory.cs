using System.Text.Json.Serialization;
using NpgsqlTypes;

namespace Kontinue.Shared.Domain;

public sealed class MemoryChunk
{
    public Guid Id { get; set; }
    public Guid ProjectId { get; set; }
    public Guid? SessionId { get; set; }
    public required string Type { get; set; }
    public Guid? SourceId { get; set; }
    public required string Content { get; set; }
    public bool DecayExempt { get; set; }
    public bool Embedded { get; set; }
    public DateTime? StaleAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public NpgsqlTsVector SearchVector { get; set; } = null!;

    [JsonIgnore] public Project Project { get; set; } = null!;
    [JsonIgnore] public Session? Session { get; set; }
}

public sealed class Checkpoint
{
    public Guid Id { get; set; }
    public Guid ProjectId { get; set; }
    public Guid SessionId { get; set; }
    public Guid? TaskId { get; set; }
    public required string Progress { get; set; }
    public string? NextStep { get; set; }
    public List<string> FilesActive { get; set; } = [];
    public string? GitCommit { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [JsonIgnore] public Project Project { get; set; } = null!;
    [JsonIgnore] public Session Session { get; set; } = null!;
}

public sealed class Handoff
{
    public Guid Id { get; set; }
    public Guid ProjectId { get; set; }
    public Guid SessionId { get; set; }
    public required string Summary { get; set; }
    public List<string> Blockers { get; set; } = [];
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [JsonIgnore] public Project Project { get; set; } = null!;
    [JsonIgnore] public Session Session { get; set; } = null!;
}
