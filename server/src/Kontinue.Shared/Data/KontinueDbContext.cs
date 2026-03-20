using Kontinue.Shared.Domain;
using Microsoft.EntityFrameworkCore;

namespace Kontinue.Shared.Data;

public class KontinueDbContext(DbContextOptions<KontinueDbContext> options) : DbContext(options)
{
    public DbSet<Workspace> Workspaces => Set<Workspace>();
    public DbSet<Project> Projects => Set<Project>();
    public DbSet<User> Users => Set<User>();
    public DbSet<WorkspaceMember> WorkspaceMembers => Set<WorkspaceMember>();
    public DbSet<Session> Sessions => Set<Session>();
    public DbSet<AgentTask> Tasks => Set<AgentTask>();
    public DbSet<TaskItem> TaskItems => Set<TaskItem>();
    public DbSet<TaskDependency> TaskDependencies => Set<TaskDependency>();
    public DbSet<ExternalLink> ExternalLinks => Set<ExternalLink>();
    public DbSet<Decision> Decisions => Set<Decision>();
    public DbSet<Observation> Observations => Set<Observation>();
    public DbSet<Signal> Signals => Set<Signal>();
    public DbSet<Plan> Plans => Set<Plan>();
    public DbSet<PlanStep> PlanSteps => Set<PlanStep>();
    public DbSet<MemoryChunk> MemoryChunks => Set<MemoryChunk>();
    public DbSet<Checkpoint> Checkpoints => Set<Checkpoint>();
    public DbSet<Handoff> Handoffs => Set<Handoff>();
    public DbSet<Question> Questions => Set<Question>();
    public DbSet<TaskTemplate> TaskTemplates => Set<TaskTemplate>();
    public DbSet<ApiKey> ApiKeys => Set<ApiKey>();
    public DbSet<ApiKeyGrant> ApiKeyGrants => Set<ApiKeyGrant>();
    public DbSet<UserSession> UserSessions => Set<UserSession>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema("kontinue");

        // Workspace
        modelBuilder.Entity<Workspace>(e =>
        {
            e.HasIndex(w => w.Slug).IsUnique();
        });

        // Project
        modelBuilder.Entity<Project>(e =>
        {
            e.HasOne(p => p.Workspace)
             .WithMany(w => w.Projects)
             .HasForeignKey(p => p.WorkspaceId);
        });

        // WorkspaceMember — composite key
        modelBuilder.Entity<WorkspaceMember>(e =>
        {
            e.HasKey(wm => new { wm.WorkspaceId, wm.UserId });

            e.HasOne(wm => wm.Workspace)
             .WithMany(w => w.Members)
             .HasForeignKey(wm => wm.WorkspaceId);

            e.HasOne(wm => wm.User)
             .WithMany(u => u.Memberships)
             .HasForeignKey(wm => wm.UserId);

            e.Property(wm => wm.Role)
             .HasConversion<string>();
        });

        // User
        modelBuilder.Entity<User>(e =>
        {
            e.HasIndex(u => u.Email).IsUnique();
            e.Property(u => u.PasswordHash).IsRequired();
        });

        // Session
        modelBuilder.Entity<Session>(e =>
        {
            e.HasOne(s => s.Project)
             .WithMany(p => p.Sessions)
             .HasForeignKey(s => s.ProjectId);

            e.Property(s => s.Status)
             .HasConversion<string>();

            e.Property(s => s.FilesTouched)
             .HasColumnType("jsonb");

            e.HasIndex(s => s.ProjectId)
             .HasDatabaseName("ix_sessions_project");
        });

        // AgentTask (named to avoid conflict with System.Threading.Tasks.Task)
        modelBuilder.Entity<AgentTask>(e =>
        {
            e.ToTable("tasks");

            e.HasOne(t => t.Project)
             .WithMany(p => p.Tasks)
             .HasForeignKey(t => t.ProjectId);

            e.HasOne(t => t.Session)
             .WithMany()
             .HasForeignKey(t => t.SessionId);

            e.Property(t => t.Status)
             .HasConversion<string>();

            e.HasIndex(t => new { t.ProjectId, t.Status })
             .HasDatabaseName("ix_tasks_project_status");
        });
        modelBuilder.Entity<TaskItem>(e =>
        {
            e.HasOne(ti => ti.Task)
             .WithMany(t => t.Items)
             .HasForeignKey(ti => ti.TaskId);
        });

        // TaskDependency — composite key
        modelBuilder.Entity<TaskDependency>(e =>
        {
            e.HasKey(td => new { td.TaskId, td.BlockedByTaskId });

            e.HasOne(td => td.Task)
             .WithMany(t => t.BlockedBy)
             .HasForeignKey(td => td.TaskId)
             .OnDelete(DeleteBehavior.Cascade);

            e.HasOne(td => td.BlockedByTask)
             .WithMany(t => t.Blocks)
             .HasForeignKey(td => td.BlockedByTaskId)
             .OnDelete(DeleteBehavior.Cascade);
        });

        // ExternalLink
        modelBuilder.Entity<ExternalLink>(e =>
        {
            e.HasOne(el => el.Task)
             .WithMany(t => t.ExternalLinks)
             .HasForeignKey(el => el.TaskId);

            e.HasIndex(el => el.TaskId)
             .HasDatabaseName("ix_external_links_task");
        });

        // Decision — self-referential supersession
        modelBuilder.Entity<Decision>(e =>
        {
            e.HasOne(d => d.Project)
             .WithMany(p => p.Decisions)
             .HasForeignKey(d => d.ProjectId);

            e.HasOne(d => d.Session)
             .WithMany()
             .HasForeignKey(d => d.SessionId);

            e.HasOne(d => d.SupersededBy)
             .WithMany(d => d.Supersedes)
             .HasForeignKey(d => d.SupersededById);

            e.Property(d => d.Status)
             .HasConversion<string>();

            e.Property(d => d.Scope)
             .HasConversion<string>();

            e.Property(d => d.Confidence)
             .HasConversion<string>();

            e.HasIndex(d => d.ProjectId)
             .HasDatabaseName("ix_decisions_project");

            e.Property(d => d.Alternatives).HasColumnType("jsonb");
            e.Property(d => d.Files).HasColumnType("jsonb");
            e.Property(d => d.Tags).HasColumnType("jsonb");
        });

        // Observation
        modelBuilder.Entity<Observation>(e =>
        {
            e.HasOne(o => o.Project)
             .WithMany(p => p.Observations)
             .HasForeignKey(o => o.ProjectId);

            e.HasOne(o => o.Session)
             .WithMany()
             .HasForeignKey(o => o.SessionId);

            e.HasOne(o => o.Task)
             .WithMany()
             .HasForeignKey(o => o.TaskId);

            e.Property(o => o.Files).HasColumnType("jsonb");
        });

        // Signal
        modelBuilder.Entity<Signal>(e =>
        {
            e.HasOne(s => s.Project)
             .WithMany(p => p.Signals)
             .HasForeignKey(s => s.ProjectId);

            e.Property(s => s.Type)
             .HasConversion<string>();

            e.Property(s => s.Source)
             .HasConversion<string>();

            e.Property(s => s.Status)
             .HasConversion<string>();

            e.HasIndex(s => new { s.ProjectId, s.Status, s.CreatedAt })
             .HasDatabaseName("ix_signals_pending");
        });

        // Plan
        modelBuilder.Entity<Plan>(e =>
        {
            e.HasOne(p => p.Project)
             .WithMany(p => p.Plans)
             .HasForeignKey(p => p.ProjectId);

            e.Property(p => p.Status)
             .HasConversion<string>();

            e.HasIndex(p => new { p.ProjectId, p.Status })
             .HasDatabaseName("ix_plans_project_status");
        });

        // PlanStep
        modelBuilder.Entity<PlanStep>(e =>
        {
            e.HasOne(ps => ps.Plan)
             .WithMany(p => p.Steps)
             .HasForeignKey(ps => ps.PlanId);

            e.Property(ps => ps.Status)
             .HasConversion<string>();

            e.HasIndex(ps => new { ps.PlanId, ps.Position })
             .HasDatabaseName("ix_plan_steps_plan_position");
        });

        // MemoryChunk
        modelBuilder.Entity<MemoryChunk>(e =>
        {
            e.HasOne(mc => mc.Project)
             .WithMany(p => p.MemoryChunks)
             .HasForeignKey(mc => mc.ProjectId);

            e.HasOne(mc => mc.Session)
             .WithMany()
             .HasForeignKey(mc => mc.SessionId);

            e.HasIndex(mc => mc.ProjectId)
             .HasDatabaseName("ix_memory_chunks_project");

            e.HasIndex(mc => new { mc.ProjectId, mc.Type, mc.SourceId })
             .IsUnique()
             .HasFilter("\"SourceId\" IS NOT NULL")
             .HasDatabaseName("ix_memory_chunks_source");

            e.Property(mc => mc.SearchVector)
             .HasColumnType("tsvector")
             .HasComputedColumnSql(
                 """to_tsvector('english', coalesce("Content", ''))""",
                 stored: true);

            e.HasIndex(mc => mc.SearchVector)
             .HasMethod("GIN")
             .HasDatabaseName("ix_memory_chunks_search");
        });

        // Checkpoint
        modelBuilder.Entity<Checkpoint>(e =>
        {
            e.HasOne(c => c.Project)
             .WithMany()
             .HasForeignKey(c => c.ProjectId);

            e.HasOne(c => c.Session)
             .WithMany(s => s.Checkpoints)
             .HasForeignKey(c => c.SessionId);

            e.HasIndex(c => new { c.ProjectId, c.CreatedAt })
             .HasDatabaseName("ix_checkpoints_project_created");

            e.HasIndex(c => c.SessionId)
             .HasDatabaseName("ix_checkpoints_session");

            e.Property(c => c.FilesActive).HasColumnType("jsonb");
        });

        // Handoff
        modelBuilder.Entity<Handoff>(e =>
        {
            e.HasOne(h => h.Project)
             .WithMany()
             .HasForeignKey(h => h.ProjectId);

            e.HasOne(h => h.Session)
             .WithMany(s => s.Handoffs)
             .HasForeignKey(h => h.SessionId);

            e.Property(h => h.Blockers).HasColumnType("jsonb");
        });

        // Question
        modelBuilder.Entity<Question>(e =>
        {
            e.HasOne(q => q.Project)
             .WithMany(p => p.Questions)
             .HasForeignKey(q => q.ProjectId);

            e.HasOne(q => q.Session)
             .WithMany()
             .HasForeignKey(q => q.SessionId);

            e.HasOne(q => q.Task)
             .WithMany()
             .HasForeignKey(q => q.TaskId);

            e.HasIndex(q => new { q.ProjectId, q.ResolvedAt })
             .HasDatabaseName("ix_questions_project_resolved");
        });

        // TaskTemplate
        modelBuilder.Entity<TaskTemplate>(e =>
        {
            e.HasOne(tt => tt.Project)
             .WithMany(p => p.TaskTemplates)
             .HasForeignKey(tt => tt.ProjectId);

            e.HasIndex(tt => new { tt.ProjectId, tt.Name }).IsUnique();

            e.Property(tt => tt.DefaultItems).HasColumnType("jsonb");
        });

        // ApiKey — user-owned
        modelBuilder.Entity<ApiKey>(e =>
        {
            e.HasOne(ak => ak.User)
             .WithMany(u => u.ApiKeys)
             .HasForeignKey(ak => ak.UserId);

            e.HasIndex(ak => ak.KeyPrefix)
             .HasDatabaseName("ix_api_keys_prefix");

            e.HasIndex(ak => ak.UserId)
             .HasDatabaseName("ix_api_keys_user");
        });

        // ApiKeyGrant — scopes a key to a project
        modelBuilder.Entity<ApiKeyGrant>(e =>
        {
            e.HasIndex(g => new { g.ApiKeyId, g.ProjectId }).IsUnique();

            e.HasOne(g => g.ApiKey)
             .WithMany(ak => ak.Grants)
             .HasForeignKey(g => g.ApiKeyId)
             .OnDelete(DeleteBehavior.Cascade);

            e.HasOne(g => g.Project)
             .WithMany(p => p.ApiKeyGrants)
             .HasForeignKey(g => g.ProjectId)
             .OnDelete(DeleteBehavior.Cascade);
        });

        // UserSession
        modelBuilder.Entity<UserSession>(e =>
        {
            e.HasOne(s => s.User)
             .WithMany(u => u.Sessions)
             .HasForeignKey(s => s.UserId);

            e.HasIndex(s => s.TokenPrefix)
             .HasDatabaseName("ix_user_sessions_prefix");

            e.HasIndex(s => new { s.UserId, s.RevokedAt })
             .HasDatabaseName("ix_user_sessions_user_active");
        });

        // Store all enum columns as lowercase strings
        foreach (var entityType in modelBuilder.Model.GetEntityTypes())
        {
            foreach (var property in entityType.GetProperties())
            {
                if (property.ClrType.IsEnum)
                {
                    property.SetColumnType("varchar(50)");
                }
            }
        }
    }
}
