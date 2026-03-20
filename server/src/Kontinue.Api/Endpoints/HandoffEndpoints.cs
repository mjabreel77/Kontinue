using Kontinue.Api.WebSockets;
using Kontinue.Shared.Data;
using Kontinue.Shared.Domain;
using Microsoft.EntityFrameworkCore;

namespace Kontinue.Api.Endpoints;

public static class HandoffEndpoints
{
    public static void MapHandoffEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/projects/{projectId:guid}/handoffs").WithTags("Handoffs");

        group.MapGet("/", async (Guid projectId, KontinueDbContext db) =>
            await db.Handoffs.AsNoTracking()
                .Where(h => h.ProjectId == projectId)
                .OrderByDescending(h => h.CreatedAt)
                .ToListAsync());

        group.MapGet("/latest", async (Guid projectId, KontinueDbContext db) =>
            await db.Handoffs.AsNoTracking()
                .Where(h => h.ProjectId == projectId)
                .OrderByDescending(h => h.CreatedAt)
                .FirstOrDefaultAsync()
                is { } handoff ? Results.Ok(handoff) : Results.NotFound());

        group.MapPost("/", async (Guid projectId, CreateHandoffRequest req, KontinueDbContext db, ConnectionManager ws) =>
        {
            var handoff = new Handoff
            {
                ProjectId = projectId,
                SessionId = req.SessionId,
                Summary = req.Summary,
                Blockers = req.Blockers ?? []
            };
            db.Handoffs.Add(handoff);
            await db.SaveChangesAsync();
            ws.PublishHandoffCreated(handoff);
            return Results.Created($"/api/projects/{projectId}/handoffs/{handoff.Id}", handoff);
        });
    }

    public record CreateHandoffRequest(Guid SessionId, string Summary, List<string>? Blockers);
}
