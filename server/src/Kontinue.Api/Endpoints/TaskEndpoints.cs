using Kontinue.Api.WebSockets;
using Kontinue.Shared.Data;
using Kontinue.Shared.Domain;
using Microsoft.EntityFrameworkCore;

namespace Kontinue.Api.Endpoints;

public static class TaskEndpoints
{
    public static void MapTaskEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/projects/{projectId:guid}/tasks").WithTags("Tasks");

        group.MapGet("/", async (Guid projectId, string? status, KontinueDbContext db) =>
        {
            var query = db.Tasks.AsNoTracking()
                .Where(t => t.ProjectId == projectId);

            if (!string.IsNullOrEmpty(status) && Enum.TryParse<AgentTaskStatus>(status, ignoreCase: true, out var s))
                query = query.Where(t => t.Status == s);

            return await query
                .OrderByDescending(t => t.UpdatedAt)
                .Include(t => t.Items.OrderBy(i => i.Position))
                .ToListAsync();
        });

        group.MapGet("/{id:guid}", async (Guid projectId, Guid id, KontinueDbContext db) =>
            await db.Tasks.AsNoTracking()
                .Include(t => t.Items.OrderBy(i => i.Position))
                .Include(t => t.ExternalLinks)
                .Include(t => t.BlockedBy)
                .Include(t => t.Blocks)
                .FirstOrDefaultAsync(t => t.Id == id && t.ProjectId == projectId)
                is { } task ? Results.Ok(task) : Results.NotFound());

        group.MapPost("/", async (Guid projectId, CreateTaskRequest req, KontinueDbContext db, ConnectionManager ws) =>
        {
            var task = new AgentTask
            {
                ProjectId = projectId,
                SessionId = req.SessionId,
                Title = req.Title,
                Description = req.Description,
                Branch = req.Branch
            };

            if (req.Items is { Count: > 0 })
            {
                for (int i = 0; i < req.Items.Count; i++)
                    task.Items.Add(new TaskItem { Content = req.Items[i], Position = i });
            }

            db.Tasks.Add(task);
            await db.SaveChangesAsync();
            ws.PublishTaskCreated(task);
            return Results.Created($"/api/projects/{projectId}/tasks/{task.Id}", task);
        });

        group.MapPut("/{id:guid}", async (Guid projectId, Guid id, UpdateTaskRequest req, KontinueDbContext db, ConnectionManager ws) =>
        {
            var task = await db.Tasks.FirstOrDefaultAsync(t => t.Id == id && t.ProjectId == projectId);
            if (task is null) return Results.NotFound();

            if (req.Title is not null) task.Title = req.Title;
            if (req.Description is not null) task.Description = req.Description;
            if (req.Notes is not null) task.Notes = req.Notes;
            task.UpdatedAt = DateTime.UtcNow;

            await db.SaveChangesAsync();
            ws.PublishTaskUpdated(task);
            return Results.Ok(task);
        });

        group.MapPut("/{id:guid}/status", async (Guid projectId, Guid id, UpdateTaskStatusRequest req, KontinueDbContext db, ConnectionManager ws) =>
        {
            var task = await db.Tasks.FirstOrDefaultAsync(t => t.Id == id && t.ProjectId == projectId);
            if (task is null) return Results.NotFound();

            if (!Enum.TryParse<AgentTaskStatus>(req.Status, ignoreCase: true, out var newStatus))
                return Results.BadRequest("Invalid status");

            var oldStatus = task.Status.ToString();

            task.Status = newStatus;
            task.UpdatedAt = DateTime.UtcNow;

            if (newStatus == AgentTaskStatus.InProgress)
                task.StartedAt = DateTime.UtcNow;
            else if (newStatus is AgentTaskStatus.Done or AgentTaskStatus.Abandoned)
            {
                task.EndedAt = DateTime.UtcNow;
                if (req.Outcome is not null) task.Outcome = req.Outcome;
            }

            await db.SaveChangesAsync();
            ws.PublishTaskStatusChanged(task, oldStatus);
            return Results.Ok(task);
        });

        group.MapDelete("/{id:guid}", async (Guid projectId, Guid id, KontinueDbContext db, ConnectionManager ws) =>
        {
            var task = await db.Tasks.FirstOrDefaultAsync(t => t.Id == id && t.ProjectId == projectId);
            if (task is null) return Results.NotFound();
            db.Tasks.Remove(task);
            await db.SaveChangesAsync();
            ws.PublishTaskDeleted(projectId, id);
            return Results.NoContent();
        });

        // Task Items
        group.MapPost("/{id:guid}/items", async (Guid projectId, Guid id, CreateTaskItemRequest req, KontinueDbContext db, ConnectionManager ws) =>
        {
            var task = await db.Tasks.Include(t => t.Items).FirstOrDefaultAsync(t => t.Id == id && t.ProjectId == projectId);
            if (task is null) return Results.NotFound();

            var maxPos = task.Items.Count > 0 ? task.Items.Max(i => i.Position) + 1 : 0;
            var item = new TaskItem { TaskId = id, Content = req.Content, Position = maxPos };
            db.TaskItems.Add(item);
            await db.SaveChangesAsync();
            ws.PublishTaskUpdated(task);
            return Results.Created($"/api/projects/{projectId}/tasks/{id}/items/{item.Id}", item);
        });

        group.MapPut("/{taskId:guid}/items/{itemId:guid}/toggle", async (Guid projectId, Guid taskId, Guid itemId, KontinueDbContext db, ConnectionManager ws) =>
        {
            var item = await db.TaskItems.FirstOrDefaultAsync(i => i.Id == itemId && i.TaskId == taskId);
            if (item is null) return Results.NotFound();
            item.Done = !item.Done;
            await db.SaveChangesAsync();
            var task = await db.Tasks.FirstOrDefaultAsync(t => t.Id == taskId && t.ProjectId == projectId);
            if (task is not null) ws.PublishTaskUpdated(task);
            return Results.Ok(item);
        });

        group.MapDelete("/{taskId:guid}/items/{itemId:guid}", async (Guid projectId, Guid taskId, Guid itemId, KontinueDbContext db, ConnectionManager ws) =>
        {
            var item = await db.TaskItems.FirstOrDefaultAsync(i => i.Id == itemId && i.TaskId == taskId);
            if (item is null) return Results.NotFound();
            db.TaskItems.Remove(item);
            await db.SaveChangesAsync();
            var task = await db.Tasks.FirstOrDefaultAsync(t => t.Id == taskId && t.ProjectId == projectId);
            if (task is not null) ws.PublishTaskUpdated(task);
            return Results.NoContent();
        });

        // Task Dependencies
        group.MapPost("/{id:guid}/dependencies", async (Guid projectId, Guid id, CreateDependencyRequest req, KontinueDbContext db, ConnectionManager ws) =>
        {
            var dep = new TaskDependency { TaskId = id, BlockedByTaskId = req.BlockedByTaskId };
            db.TaskDependencies.Add(dep);
            await db.SaveChangesAsync();
            var task = await db.Tasks.FirstOrDefaultAsync(t => t.Id == id && t.ProjectId == projectId);
            if (task is not null) ws.PublishTaskUpdated(task);
            return Results.Created($"/api/projects/{projectId}/tasks/{id}/dependencies", dep);
        });

        group.MapDelete("/{id:guid}/dependencies/{blockerTaskId:guid}", async (Guid projectId, Guid id, Guid blockerTaskId, KontinueDbContext db, ConnectionManager ws) =>
        {
            var dep = await db.TaskDependencies.FindAsync(id, blockerTaskId);
            if (dep is null) return Results.NotFound();
            db.TaskDependencies.Remove(dep);
            await db.SaveChangesAsync();
            var task = await db.Tasks.FirstOrDefaultAsync(t => t.Id == id && t.ProjectId == projectId);
            if (task is not null) ws.PublishTaskUpdated(task);
            return Results.NoContent();
        });

        // External Links
        group.MapPost("/{id:guid}/links", async (Guid projectId, Guid id, CreateExternalLinkRequest req, KontinueDbContext db, ConnectionManager ws) =>
        {
            var link = new ExternalLink
            {
                TaskId = id,
                Provider = req.Provider,
                ExternalId = req.ExternalId,
                ExternalUrl = req.ExternalUrl
            };
            db.ExternalLinks.Add(link);
            await db.SaveChangesAsync();
            var task = await db.Tasks.FirstOrDefaultAsync(t => t.Id == id && t.ProjectId == projectId);
            if (task is not null) ws.PublishTaskUpdated(task);
            return Results.Created($"/api/projects/{projectId}/tasks/{id}/links/{link.Id}", link);
        });
    }

    public record CreateTaskRequest(string Title, string? Description, Guid? SessionId, string? Branch, List<string>? Items);
    public record UpdateTaskRequest(string? Title, string? Description, string? Notes);
    public record UpdateTaskStatusRequest(string Status, string? Outcome);
    public record CreateTaskItemRequest(string Content);
    public record CreateDependencyRequest(Guid BlockedByTaskId);
    public record CreateExternalLinkRequest(string Provider, string ExternalId, string? ExternalUrl);
}
