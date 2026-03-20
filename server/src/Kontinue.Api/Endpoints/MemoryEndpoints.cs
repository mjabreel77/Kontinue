using Kontinue.Api.Search;
using Kontinue.Api.WebSockets;
using Kontinue.Shared.Data;
using Kontinue.Shared.Domain;
using Microsoft.EntityFrameworkCore;

namespace Kontinue.Api.Endpoints;

public static class MemoryEndpoints
{
    public static void MapMemoryEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/projects/{projectId:guid}/memory").WithTags("Memory");

        group.MapGet("/", async (Guid projectId, string? type, KontinueDbContext db) =>
        {
            var query = db.MemoryChunks.AsNoTracking()
                .Where(mc => mc.ProjectId == projectId);

            if (!string.IsNullOrEmpty(type))
                query = query.Where(mc => mc.Type == type);

            return await query.OrderByDescending(mc => mc.CreatedAt).ToListAsync();
        });

        group.MapGet("/{id:guid}", async (Guid projectId, Guid id, KontinueDbContext db) =>
            await db.MemoryChunks.AsNoTracking()
                .FirstOrDefaultAsync(mc => mc.Id == id && mc.ProjectId == projectId)
                is { } chunk ? Results.Ok(chunk) : Results.NotFound());

        group.MapPost("/", async (Guid projectId, UpsertMemoryChunkRequest req, KontinueDbContext db, ConnectionManager ws) =>
        {
            // Upsert by type + source_id if provided
            MemoryChunk? existing = null;
            if (req.SourceId.HasValue)
            {
                existing = await db.MemoryChunks.FirstOrDefaultAsync(mc =>
                    mc.ProjectId == projectId && mc.Type == req.Type && mc.SourceId == req.SourceId);
            }

            if (existing is not null)
            {
                existing.Content = req.Content;
                existing.SessionId = req.SessionId ?? existing.SessionId;
                await db.SaveChangesAsync();
                ws.PublishMemoryChunkUpserted(existing, isUpdate: true);
                return Results.Ok(existing);
            }

            var chunk = new MemoryChunk
            {
                ProjectId = projectId,
                SessionId = req.SessionId,
                Type = req.Type,
                SourceId = req.SourceId,
                Content = req.Content,
                DecayExempt = req.DecayExempt
            };
            db.MemoryChunks.Add(chunk);
            await db.SaveChangesAsync();
            ws.PublishMemoryChunkUpserted(chunk, isUpdate: false);
            return Results.Created($"/api/projects/{projectId}/memory/{chunk.Id}", chunk);
        });

        group.MapPut("/{id:guid}/decay-exempt", async (Guid projectId, Guid id, SetDecayExemptRequest req, KontinueDbContext db, ConnectionManager ws) =>
        {
            var chunk = await db.MemoryChunks.FirstOrDefaultAsync(mc => mc.Id == id && mc.ProjectId == projectId);
            if (chunk is null) return Results.NotFound();
            chunk.DecayExempt = req.Exempt;
            await db.SaveChangesAsync();
            ws.PublishMemoryChunkUpserted(chunk, isUpdate: true);
            return Results.Ok(chunk);
        });

        group.MapDelete("/{id:guid}", async (Guid projectId, Guid id, KontinueDbContext db, ConnectionManager ws) =>
        {
            var chunk = await db.MemoryChunks.FirstOrDefaultAsync(mc => mc.Id == id && mc.ProjectId == projectId);
            if (chunk is null) return Results.NotFound();
            ws.PublishMemoryChunkUpserted(chunk, isUpdate: true);
            db.MemoryChunks.Remove(chunk);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        group.MapPost("/search", async (Guid projectId, SearchMemoryRequest req, HybridSearchService search) =>
        {
            var results = await search.SearchAsync(projectId, req.Query, req.Type, req.Limit ?? 10);
            return results;
        });
    }

    public record UpsertMemoryChunkRequest(string Type, string Content, Guid? SourceId, Guid? SessionId, bool DecayExempt = false);
    public record SetDecayExemptRequest(bool Exempt);
    public record SearchMemoryRequest(string Query, string? Type, int? Limit);
}
