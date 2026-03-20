using System.Text.Json.Serialization;

namespace Kontinue.Shared.Domain;

public sealed class Decision
{
    public Guid Id { get; set; }
    public Guid ProjectId { get; set; }
    public Guid? SessionId { get; set; }
    public Guid? TaskId { get; set; }
    public required string Summary { get; set; }
    public string? Rationale { get; set; }
    public List<string> Alternatives { get; set; } = [];
    public string? Context { get; set; }
    public List<string> Files { get; set; } = [];
    public List<string> Tags { get; set; } = [];
    public DecisionConfidence Confidence { get; set; } = DecisionConfidence.Confirmed;
    public DecisionStatus Status { get; set; } = DecisionStatus.Active;
    public Guid? SupersededById { get; set; }
    public DecisionScope Scope { get; set; } = DecisionScope.Project;
    public string? Branch { get; set; }
    public string? GitCommit { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [JsonIgnore] public Project Project { get; set; } = null!;
    [JsonIgnore] public Session? Session { get; set; }
    [JsonIgnore] public Decision? SupersededBy { get; set; }
    [JsonIgnore] public ICollection<Decision> Supersedes { get; set; } = [];
}

public enum DecisionStatus
{
    Active,
    Superseded,
    Archived
}

public enum DecisionScope
{
    Project,
    Task
}

public enum DecisionConfidence
{
    Confirmed,
    Provisional,
    Revisit
}
