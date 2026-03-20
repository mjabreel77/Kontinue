using Kontinue.Api.WebSockets;
using Kontinue.Shared.Data;
using Kontinue.Shared.Domain;
using Microsoft.EntityFrameworkCore;

namespace Kontinue.Api.Endpoints;

public static class ObservationEndpoints
{
    public static void MapObservationEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/projects/{projectId:guid}/observations").WithTags("Observations");

        group.MapGet("/", async (Guid projectId, bool? unresolved, KontinueDbContext db) =>
        {
            var query = db.Observations.AsNoTracking()
                .Where(o => o.ProjectId == projectId);

            if (unresolved == true)
                query = query.Where(o => o.ResolvedAt == null);

            return await query.OrderByDescending(o => o.CreatedAt).ToListAsync();
        });

        group.MapGet("/{id:guid}", async (Guid projectId, Guid id, KontinueDbContext db) =>
            await db.Observations.AsNoTracking()
                .FirstOrDefaultAsync(o => o.Id == id && o.ProjectId == projectId)
                is { } obs ? Results.Ok(obs) : Results.NotFound());

        group.MapPost("/", async (Guid projectId, CreateObservationRequest req, KontinueDbContext db, ConnectionManager ws) =>
        {
            var obs = new Observation
            {
                ProjectId = projectId,
                SessionId = req.SessionId,
                TaskId = req.TaskId,
                Content = req.Content,
                Files = req.Files ?? []
            };
            db.Observations.Add(obs);
            await db.SaveChangesAsync();
            ws.PublishObservationAdded(obs);
            return Results.Created($"/api/projects/{projectId}/observations/{obs.Id}", obs);
        });

        group.MapPut("/{id:guid}/resolve", async (Guid projectId, Guid id, KontinueDbContext db, ConnectionManager ws) =>
        {
            var obs = await db.Observations.FirstOrDefaultAsync(o => o.Id == id && o.ProjectId == projectId);
            if (obs is null) return Results.NotFound();
            obs.ResolvedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
            ws.PublishObservationResolved(obs);
            return Results.Ok(obs);
        });

        group.MapDelete("/{id:guid}", async (Guid projectId, Guid id, KontinueDbContext db, ConnectionManager ws) =>
        {
            var obs = await db.Observations.FirstOrDefaultAsync(o => o.Id == id && o.ProjectId == projectId);
            if (obs is null) return Results.NotFound();
            db.Observations.Remove(obs);
            await db.SaveChangesAsync();
            ws.PublishObservationResolved(obs);
            return Results.NoContent();
        });
    }

    public record CreateObservationRequest(string Content, List<string>? Files, Guid? SessionId, Guid? TaskId);
}
