using Kontinue.Shared.Data;
using Kontinue.Shared.Domain;
using Microsoft.EntityFrameworkCore;

namespace Kontinue.Api.Endpoints;

public static class WorkspaceEndpoints
{
    public static void MapWorkspaceEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/workspaces").WithTags("Workspaces");

        group.MapGet("/", async (HttpContext context, KontinueDbContext db) =>
        {
            var userId = context.Items["AuthUserId"] as Guid?;
            if (userId is null) return Results.Unauthorized();

            var workspaces = await db.Workspaces.AsNoTracking()
                .Where(w => db.WorkspaceMembers.Any(wm => wm.WorkspaceId == w.Id && wm.UserId == userId))
                .ToListAsync();
            return Results.Ok(workspaces);
        });

        group.MapGet("/{id:guid}", async (Guid id, KontinueDbContext db) =>
            await db.Workspaces.AsNoTracking()
                .Include(w => w.Projects)
                .FirstOrDefaultAsync(w => w.Id == id)
                is { } workspace ? Results.Ok(workspace) : Results.NotFound());

        // Workspace overview: aggregate stats per project
        group.MapGet("/{id:guid}/overview", async (Guid id, KontinueDbContext db) =>
        {
            var workspace = await db.Workspaces.AsNoTracking()
                .Include(w => w.Projects)
                .FirstOrDefaultAsync(w => w.Id == id);
            if (workspace is null) return Results.NotFound();

            var projectIds = workspace.Projects.Select(p => p.Id).ToList();

            // Task counts per project
            var taskCounts = await db.Tasks.AsNoTracking()
                .Where(t => projectIds.Contains(t.ProjectId))
                .GroupBy(t => new { t.ProjectId, t.Status })
                .Select(g => new { g.Key.ProjectId, g.Key.Status, Count = g.Count() })
                .ToListAsync();

            // Active sessions per project
            var activeSessions = await db.Sessions.AsNoTracking()
                .Where(s => projectIds.Contains(s.ProjectId) && s.Status == SessionStatus.Active)
                .Select(s => new { s.ProjectId, s.Id, s.StartedAt, s.ToolCalls, s.Branch })
                .ToListAsync();

            // Latest checkpoint per project
            var latestCheckpoints = await db.Checkpoints.AsNoTracking()
                .Where(c => projectIds.Contains(c.ProjectId))
                .GroupBy(c => c.ProjectId)
                .Select(g => g.OrderByDescending(c => c.CreatedAt).First())
                .ToListAsync();

            // Decision counts per project
            var decisionCounts = await db.Decisions.AsNoTracking()
                .Where(d => projectIds.Contains(d.ProjectId) && d.Status == DecisionStatus.Active)
                .GroupBy(d => d.ProjectId)
                .Select(g => new { ProjectId = g.Key, Count = g.Count() })
                .ToListAsync();

            // Observation counts per project (unresolved)
            var observationCounts = await db.Observations.AsNoTracking()
                .Where(o => projectIds.Contains(o.ProjectId) && o.ResolvedAt == null)
                .GroupBy(o => o.ProjectId)
                .Select(g => new { ProjectId = g.Key, Count = g.Count() })
                .ToListAsync();

            // Pending signals per project
            var pendingSignals = await db.Signals.AsNoTracking()
                .Where(s => projectIds.Contains(s.ProjectId) && s.Status == SignalStatus.Pending)
                .GroupBy(s => s.ProjectId)
                .Select(g => new { ProjectId = g.Key, Count = g.Count() })
                .ToListAsync();

            var projects = workspace.Projects.Select(p =>
            {
                var tasks = taskCounts.Where(t => t.ProjectId == p.Id).ToList();
                var session = activeSessions.FirstOrDefault(s => s.ProjectId == p.Id);
                var checkpoint = latestCheckpoints.FirstOrDefault(c => c.ProjectId == p.Id);
                var decisions = decisionCounts.FirstOrDefault(d => d.ProjectId == p.Id)?.Count ?? 0;
                var observations = observationCounts.FirstOrDefault(o => o.ProjectId == p.Id)?.Count ?? 0;
                var signals = pendingSignals.FirstOrDefault(s => s.ProjectId == p.Id)?.Count ?? 0;

                var todo = tasks.FirstOrDefault(t => t.Status == AgentTaskStatus.Todo)?.Count ?? 0;
                var inProgress = tasks.FirstOrDefault(t => t.Status == AgentTaskStatus.InProgress)?.Count ?? 0;
                var done = tasks.FirstOrDefault(t => t.Status == AgentTaskStatus.Done)?.Count ?? 0;

                // Health
                var reasons = new List<string>();
                if (session is null) reasons.Add("No active session");
                if (checkpoint is not null && (DateTime.UtcNow - checkpoint.CreatedAt).TotalMinutes > 30)
                    reasons.Add($"Checkpoint {(int)(DateTime.UtcNow - checkpoint.CreatedAt).TotalMinutes}m stale");
                if (inProgress > 0)
                {
                    // check for stale in-progress tasks
                    var twoHoursAgo = DateTime.UtcNow.AddHours(-2);
                    var staleCount = taskCounts.Count(t => t.ProjectId == p.Id && t.Status == AgentTaskStatus.InProgress);
                    // simplified: we don't have updatedAt in the grouped query, so skip stale task check
                }
                var healthLevel = reasons.Count == 0 ? "good" : reasons.Count == 1 ? "fair" : "poor";

                return new
                {
                    p.Id,
                    p.Name,
                    p.Path,
                    Tasks = new { todo, inProgress, done },
                    ActiveSession = session is not null ? new
                    {
                        session.Id,
                        session.StartedAt,
                        session.ToolCalls,
                        session.Branch,
                    } : (object?)null,
                    LastCheckpoint = checkpoint is not null ? new
                    {
                        checkpoint.Id,
                        checkpoint.Progress,
                        checkpoint.CreatedAt,
                    } : (object?)null,
                    Decisions = decisions,
                    Observations = observations,
                    PendingSignals = signals,
                    Health = new { Level = healthLevel, Reasons = reasons },
                };
            }).ToList();

            return Results.Ok(new
            {
                workspace.Id,
                workspace.Name,
                workspace.Slug,
                Projects = projects,
            });
        });

        group.MapPost("/", async (CreateWorkspaceRequest req, KontinueDbContext db) =>
        {
            var workspace = new Workspace { Name = req.Name, Slug = req.Slug };
            db.Workspaces.Add(workspace);
            await db.SaveChangesAsync();
            return Results.Created($"/api/workspaces/{workspace.Id}", workspace);
        });

        group.MapPut("/{id:guid}", async (Guid id, UpdateWorkspaceRequest req, KontinueDbContext db) =>
        {
            var workspace = await db.Workspaces.FindAsync(id);
            if (workspace is null) return Results.NotFound();
            workspace.Name = req.Name;
            await db.SaveChangesAsync();
            return Results.Ok(workspace);
        });

        group.MapDelete("/{id:guid}", async (Guid id, KontinueDbContext db) =>
        {
            var workspace = await db.Workspaces.FindAsync(id);
            if (workspace is null) return Results.NotFound();
            db.Workspaces.Remove(workspace);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });
    }

    public record CreateWorkspaceRequest(string Name, string Slug);
    public record UpdateWorkspaceRequest(string Name);
}
