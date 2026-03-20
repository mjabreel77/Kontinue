using Kontinue.Shared.Data;
using Kontinue.Shared.Domain;
using Microsoft.EntityFrameworkCore;

namespace Kontinue.Api.Endpoints;

public static class ProjectEndpoints
{
    public static void MapProjectEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/workspaces/{workspaceId:guid}/projects").WithTags("Projects");

        group.MapGet("/", async (Guid workspaceId, KontinueDbContext db) =>
            await db.Projects.AsNoTracking()
                .Where(p => p.WorkspaceId == workspaceId)
                .ToListAsync());

        group.MapGet("/{id:guid}", async (Guid workspaceId, Guid id, KontinueDbContext db) =>
            await db.Projects.AsNoTracking()
                .FirstOrDefaultAsync(p => p.Id == id && p.WorkspaceId == workspaceId)
                is { } project ? Results.Ok(project) : Results.NotFound());

        group.MapPost("/", async (Guid workspaceId, CreateProjectRequest req, KontinueDbContext db) =>
        {
            var project = new Project
            {
                WorkspaceId = workspaceId,
                Name = req.Name,
                Path = req.Path
            };
            db.Projects.Add(project);
            await db.SaveChangesAsync();
            return Results.Created($"/api/workspaces/{workspaceId}/projects/{project.Id}", project);
        });

        group.MapDelete("/{id:guid}", async (Guid workspaceId, Guid id, KontinueDbContext db) =>
        {
            var project = await db.Projects.FirstOrDefaultAsync(p => p.Id == id && p.WorkspaceId == workspaceId);
            if (project is null) return Results.NotFound();
            db.Projects.Remove(project);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });
    }

    public record CreateProjectRequest(string Name, string? Path);
}
