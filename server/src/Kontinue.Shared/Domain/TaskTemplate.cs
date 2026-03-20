using System.Text.Json.Serialization;

namespace Kontinue.Shared.Domain;

public sealed class TaskTemplate
{
    public Guid Id { get; set; }
    public Guid ProjectId { get; set; }
    public required string Name { get; set; }
    public string? Description { get; set; }
    public List<string> DefaultItems { get; set; } = [];
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [JsonIgnore] public Project Project { get; set; } = null!;
}
