using Kontinue.Api.WebSockets;
using Kontinue.Shared.Data;
using Kontinue.Shared.Domain;
using Microsoft.EntityFrameworkCore;

namespace Kontinue.Api.Endpoints;

public static class SignalEndpoints
{
    public static void MapSignalEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/projects/{projectId:guid}/signals").WithTags("Signals");

        group.MapGet("/", async (Guid projectId, string? status, KontinueDbContext db) =>
        {
            var query = db.Signals.AsNoTracking()
                .Where(s => s.ProjectId == projectId);

            if (!string.IsNullOrEmpty(status) && Enum.TryParse<SignalStatus>(status, ignoreCase: true, out var s))
                query = query.Where(sig => sig.Status == s);

            return await query.OrderByDescending(sig => sig.CreatedAt).ToListAsync();
        });

        group.MapGet("/pending", async (Guid projectId, KontinueDbContext db) =>
            await db.Signals.AsNoTracking()
                .Where(s => s.ProjectId == projectId && s.Status == SignalStatus.Pending)
                .OrderBy(s => s.CreatedAt)
                .ToListAsync());

        group.MapPost("/", async (Guid projectId, CreateSignalRequest req, KontinueDbContext db, ConnectionManager ws) =>
        {
            if (!Enum.TryParse<SignalType>(req.Type, ignoreCase: true, out var signalType))
                return Results.BadRequest("Invalid signal type");

            var source = req.Source is not null && Enum.TryParse<SignalSource>(req.Source, ignoreCase: true, out var src)
                ? src : SignalSource.Cli;

            var signal = new Signal
            {
                ProjectId = projectId,
                Type = signalType,
                Content = req.Content,
                Source = source
            };
            db.Signals.Add(signal);
            await db.SaveChangesAsync();
            ws.PublishSignalCreated(signal);
            return Results.Created($"/api/projects/{projectId}/signals/{signal.Id}", signal);
        });

        group.MapPut("/{id:guid}/deliver", async (Guid projectId, Guid id, KontinueDbContext db, ConnectionManager ws) =>
        {
            var signal = await db.Signals.FirstOrDefaultAsync(s => s.Id == id && s.ProjectId == projectId);
            if (signal is null) return Results.NotFound();
            signal.Status = SignalStatus.Delivered;
            signal.DeliveredAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
            ws.PublishSignalCreated(signal);
            return Results.Ok(signal);
        });

        group.MapPut("/{id:guid}/acknowledge", async (Guid projectId, Guid id, AcknowledgeSignalRequest req, KontinueDbContext db, ConnectionManager ws) =>
        {
            var signal = await db.Signals.FirstOrDefaultAsync(s => s.Id == id && s.ProjectId == projectId);
            if (signal is null) return Results.NotFound();
            signal.Status = SignalStatus.Acknowledged;
            signal.AcknowledgedAt = DateTime.UtcNow;
            signal.AgentResponse = req.AgentResponse;
            await db.SaveChangesAsync();
            ws.PublishSignalAcknowledged(signal);
            return Results.Ok(signal);
        });
    }

    public record CreateSignalRequest(string Type, string Content, string? Source);
    public record AcknowledgeSignalRequest(string? AgentResponse);
}
