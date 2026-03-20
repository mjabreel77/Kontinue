using Kontinue.Api.WebSockets;
using Kontinue.Shared.Data;
using Kontinue.Shared.Domain;
using Microsoft.EntityFrameworkCore;

namespace Kontinue.Api.Endpoints;

public static class DecisionEndpoints
{
    public static void MapDecisionEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/projects/{projectId:guid}/decisions").WithTags("Decisions");

        group.MapGet("/", async (Guid projectId, string? status, KontinueDbContext db) =>
        {
            var query = db.Decisions.AsNoTracking()
                .Where(d => d.ProjectId == projectId);

            if (!string.IsNullOrEmpty(status) && Enum.TryParse<DecisionStatus>(status, ignoreCase: true, out var s))
                query = query.Where(d => d.Status == s);

            return await query.OrderByDescending(d => d.CreatedAt).ToListAsync();
        });

        group.MapGet("/{id:guid}", async (Guid projectId, Guid id, KontinueDbContext db) =>
            await db.Decisions.AsNoTracking()
                .Include(d => d.Supersedes)
                .FirstOrDefaultAsync(d => d.Id == id && d.ProjectId == projectId)
                is { } decision ? Results.Ok(decision) : Results.NotFound());

        group.MapPost("/", async (Guid projectId, CreateDecisionRequest req, KontinueDbContext db, ConnectionManager ws) =>
        {
            var decision = new Decision
            {
                ProjectId = projectId,
                SessionId = req.SessionId,
                TaskId = req.TaskId,
                Summary = req.Summary,
                Rationale = req.Rationale,
                Alternatives = req.Alternatives ?? [],
                Context = req.Context,
                Files = req.Files ?? [],
                Tags = req.Tags ?? [],
                Scope = req.Scope is not null && Enum.TryParse<DecisionScope>(req.Scope, ignoreCase: true, out var scope)
                    ? scope : DecisionScope.Project,
                Confidence = req.Confidence is not null && Enum.TryParse<DecisionConfidence>(req.Confidence, ignoreCase: true, out var conf)
                    ? conf : DecisionConfidence.Confirmed,
                Branch = req.Branch,
                GitCommit = req.GitCommit
            };
            db.Decisions.Add(decision);
            await db.SaveChangesAsync();
            ws.PublishDecisionLogged(decision);
            return Results.Created($"/api/projects/{projectId}/decisions/{decision.Id}", decision);
        });

        group.MapPut("/{id:guid}/supersede", async (Guid projectId, Guid id, SupersedeDecisionRequest req, KontinueDbContext db, ConnectionManager ws) =>
        {
            var old = await db.Decisions.FirstOrDefaultAsync(d => d.Id == id && d.ProjectId == projectId);
            if (old is null) return Results.NotFound();

            var replacement = new Decision
            {
                ProjectId = projectId,
                SessionId = req.SessionId,
                Summary = req.Summary,
                Rationale = req.Rationale,
                Alternatives = req.Alternatives ?? [],
                Context = req.Context,
                Files = req.Files ?? [],
                Tags = req.Tags ?? [],
                Scope = old.Scope,
                Branch = req.Branch,
                GitCommit = req.GitCommit
            };
            db.Decisions.Add(replacement);

            old.Status = DecisionStatus.Superseded;
            old.SupersededById = replacement.Id;

            await db.SaveChangesAsync();
            ws.PublishDecisionSuperseded(old, replacement);
            return Results.Ok(replacement);
        });

        group.MapPut("/{id:guid}/archive", async (Guid projectId, Guid id, KontinueDbContext db, ConnectionManager ws) =>
        {
            var decision = await db.Decisions.FirstOrDefaultAsync(d => d.Id == id && d.ProjectId == projectId);
            if (decision is null) return Results.NotFound();
            decision.Status = DecisionStatus.Archived;
            await db.SaveChangesAsync();
            ws.PublishDecisionArchived(decision);
            return Results.Ok(decision);
        });
    }

    public record CreateDecisionRequest(
        string Summary, string? Rationale, List<string>? Alternatives, string? Context,
        List<string>? Files, List<string>? Tags, string? Scope, string? Confidence,
        Guid? SessionId, Guid? TaskId, string? Branch, string? GitCommit);

    public record SupersedeDecisionRequest(
        string Summary, string? Rationale, List<string>? Alternatives, string? Context,
        List<string>? Files, List<string>? Tags, Guid? SessionId, string? Branch, string? GitCommit);
}
