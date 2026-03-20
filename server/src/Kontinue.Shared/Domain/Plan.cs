using System.Text.Json.Serialization;

namespace Kontinue.Shared.Domain;

public sealed class Plan
{
    public Guid Id { get; set; }
    public Guid ProjectId { get; set; }
    public required string Title { get; set; }
    public string? Goal { get; set; }
    public PlanStatus Status { get; set; } = PlanStatus.Draft;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [JsonIgnore] public Project Project { get; set; } = null!;
    public ICollection<PlanStep> Steps { get; set; } = [];
}

public enum PlanStatus
{
    Draft,
    Active,
    Complete,
    Archived
}

public sealed class PlanStep
{
    public Guid Id { get; set; }
    public Guid PlanId { get; set; }
    public required string Content { get; set; }
    public PlanStepStatus Status { get; set; } = PlanStepStatus.Pending;
    public int Position { get; set; }

    [JsonIgnore] public Plan Plan { get; set; } = null!;
}

public enum PlanStepStatus
{
    Pending,
    Done,
    Skipped
}
