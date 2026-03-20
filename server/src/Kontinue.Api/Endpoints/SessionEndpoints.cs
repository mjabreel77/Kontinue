using Kontinue.Api.WebSockets;
using Kontinue.Shared.Data;
using Kontinue.Shared.Domain;
using Microsoft.EntityFrameworkCore;

namespace Kontinue.Api.Endpoints;

public static class SessionEndpoints
{
    public static void MapSessionEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/projects/{projectId:guid}/sessions").WithTags("Sessions");

        group.MapGet("/", async (Guid projectId, KontinueDbContext db) =>
            await db.Sessions.AsNoTracking()
                .Where(s => s.ProjectId == projectId)
                .OrderByDescending(s => s.StartedAt)
                .ToListAsync());

        group.MapGet("/{id:guid}", async (Guid projectId, Guid id, KontinueDbContext db) =>
            await db.Sessions.AsNoTracking()
                .Include(s => s.Checkpoints.OrderByDescending(c => c.CreatedAt))
                .Include(s => s.Handoffs)
                .FirstOrDefaultAsync(s => s.Id == id && s.ProjectId == projectId)
                is { } session ? Results.Ok(session) : Results.NotFound());

        group.MapPost("/", async (Guid projectId, CreateSessionRequest req, KontinueDbContext db, ConnectionManager ws) =>
        {
            // Close any stale active sessions (>2h old)
            var staleThreshold = DateTime.UtcNow.AddHours(-2);
            var staleSessions = await db.Sessions
                .Where(s => s.ProjectId == projectId && s.Status == SessionStatus.Active && s.StartedAt < staleThreshold)
                .ToListAsync();
            foreach (var stale in staleSessions)
            {
                stale.Status = SessionStatus.Crashed;
                stale.EndedAt = DateTime.UtcNow;
            }

            var session = new Session
            {
                ProjectId = projectId,
                Branch = req.Branch,
                StartCommit = req.StartCommit
            };
            db.Sessions.Add(session);
            await db.SaveChangesAsync();
            ws.PublishSessionStarted(session);
            return Results.Created($"/api/projects/{projectId}/sessions/{session.Id}", session);
        });

        group.MapPut("/{id:guid}/end", async (Guid projectId, Guid id, EndSessionRequest req, KontinueDbContext db, ConnectionManager ws) =>
        {
            var session = await db.Sessions.FirstOrDefaultAsync(s => s.Id == id && s.ProjectId == projectId);
            if (session is null) return Results.NotFound();
            session.EndedAt = DateTime.UtcNow;
            session.Status = SessionStatus.Ended;
            session.EndCommit = req.EndCommit;
            session.FilesTouched = req.FilesTouched ?? [];
            await db.SaveChangesAsync();
            ws.PublishSessionEnded(session);
            return Results.Ok(session);
        });

        group.MapPut("/{id:guid}/context-read", async (Guid projectId, Guid id, KontinueDbContext db) =>
        {
            var session = await db.Sessions.FirstOrDefaultAsync(s => s.Id == id && s.ProjectId == projectId);
            if (session is null) return Results.NotFound();
            session.ContextReadAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
            return Results.Ok(session);
        });

        group.MapPut("/{id:guid}/tool-call", async (Guid projectId, Guid id, KontinueDbContext db) =>
        {
            var session = await db.Sessions.FirstOrDefaultAsync(s => s.Id == id && s.ProjectId == projectId);
            if (session is null) return Results.NotFound();
            session.ToolCalls++;
            await db.SaveChangesAsync();
            return Results.Ok(session);
        });
    }

    public record CreateSessionRequest(string? Branch, string? StartCommit);
    public record EndSessionRequest(string? EndCommit, List<string>? FilesTouched);
}
