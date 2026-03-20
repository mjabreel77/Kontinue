using Kontinue.Api.WebSockets;
using Kontinue.Shared.Data;
using Kontinue.Shared.Domain;
using Microsoft.EntityFrameworkCore;

namespace Kontinue.Api.Endpoints;

public static class CheckpointEndpoints
{
    public static void MapCheckpointEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/projects/{projectId:guid}/checkpoints").WithTags("Checkpoints");

        group.MapGet("/", async (Guid projectId, Guid? sessionId, KontinueDbContext db) =>
        {
            var query = db.Checkpoints.AsNoTracking()
                .Where(c => c.ProjectId == projectId);

            if (sessionId.HasValue)
                query = query.Where(c => c.SessionId == sessionId.Value);

            return await query.OrderByDescending(c => c.CreatedAt).ToListAsync();
        });

        group.MapGet("/latest", async (Guid projectId, KontinueDbContext db) =>
            await db.Checkpoints.AsNoTracking()
                .Where(c => c.ProjectId == projectId)
                .OrderByDescending(c => c.CreatedAt)
                .FirstOrDefaultAsync()
                is { } cp ? Results.Ok(cp) : Results.NotFound());

        group.MapPost("/", async (Guid projectId, CreateCheckpointRequest req, KontinueDbContext db, ConnectionManager ws) =>
        {
            var checkpoint = new Checkpoint
            {
                ProjectId = projectId,
                SessionId = req.SessionId,
                TaskId = req.TaskId,
                Progress = req.Progress,
                NextStep = req.NextStep,
                FilesActive = req.FilesActive ?? [],
                GitCommit = req.GitCommit
            };
            db.Checkpoints.Add(checkpoint);
            await db.SaveChangesAsync();
            ws.PublishCheckpointCreated(checkpoint);
            return Results.Created($"/api/projects/{projectId}/checkpoints/{checkpoint.Id}", checkpoint);
        });
    }

    public record CreateCheckpointRequest(
        Guid SessionId, string Progress, string? NextStep,
        List<string>? FilesActive, string? GitCommit, Guid? TaskId);
}
