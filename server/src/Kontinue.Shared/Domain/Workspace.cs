using System.Text.Json.Serialization;

namespace Kontinue.Shared.Domain;

public sealed class Workspace
{
    public Guid Id { get; set; }
    public required string Name { get; set; }
    public required string Slug { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<Project> Projects { get; set; } = [];
    public ICollection<WorkspaceMember> Members { get; set; } = [];
}

public sealed class Project
{
    public Guid Id { get; set; }
    public Guid WorkspaceId { get; set; }
    public required string Name { get; set; }
    public string? Path { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [JsonIgnore] public Workspace Workspace { get; set; } = null!;
    public ICollection<Session> Sessions { get; set; } = [];
    public ICollection<AgentTask> Tasks { get; set; } = [];
    public ICollection<Decision> Decisions { get; set; } = [];
    public ICollection<Observation> Observations { get; set; } = [];
    public ICollection<Signal> Signals { get; set; } = [];
    public ICollection<Plan> Plans { get; set; } = [];
    public ICollection<MemoryChunk> MemoryChunks { get; set; } = [];
    public ICollection<Question> Questions { get; set; } = [];
    public ICollection<TaskTemplate> TaskTemplates { get; set; } = [];
    public ICollection<ApiKeyGrant> ApiKeyGrants { get; set; } = [];
}

public sealed class WorkspaceMember
{
    public Guid WorkspaceId { get; set; }
    public Guid UserId { get; set; }
    public MemberRole Role { get; set; } = MemberRole.Member;

    [JsonIgnore] public Workspace Workspace { get; set; } = null!;
    [JsonIgnore] public User User { get; set; } = null!;
}

public enum MemberRole
{
    Member,
    Admin,
    Owner
}

public sealed class User
{
    public Guid Id { get; set; }
    public required string Email { get; set; }
    public string? DisplayName { get; set; }
    public required string PasswordHash { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<WorkspaceMember> Memberships { get; set; } = [];
    public ICollection<UserSession> Sessions { get; set; } = [];
    public ICollection<ApiKey> ApiKeys { get; set; } = [];
}

public sealed class UserSession
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public required string TokenHash { get; set; }
    public required string TokenPrefix { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime ExpiresAt { get; set; }
    public DateTime? RevokedAt { get; set; }

    [JsonIgnore] public User User { get; set; } = null!;
}

public sealed class ApiKey
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public required string Name { get; set; }
    public required string KeyHash { get; set; }
    public required string KeyPrefix { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ExpiresAt { get; set; }
    public DateTime? RevokedAt { get; set; }

    [JsonIgnore] public User User { get; set; } = null!;
    public ICollection<ApiKeyGrant> Grants { get; set; } = [];
}

public sealed class ApiKeyGrant
{
    public Guid Id { get; set; }
    public Guid ApiKeyId { get; set; }
    public Guid ProjectId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [JsonIgnore] public ApiKey ApiKey { get; set; } = null!;
    [JsonIgnore] public Project Project { get; set; } = null!;
}
