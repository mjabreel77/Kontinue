using Kontinue.Api.WebSockets;
using Kontinue.Shared.Data;
using Kontinue.Shared.Domain;
using Microsoft.EntityFrameworkCore;

namespace Kontinue.Api.Endpoints;

public static class PlanEndpoints
{
    public static void MapPlanEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/projects/{projectId:guid}/plans").WithTags("Plans");

        group.MapGet("/", async (Guid projectId, string? status, KontinueDbContext db) =>
        {
            var query = db.Plans.AsNoTracking()
                .Where(p => p.ProjectId == projectId);

            if (!string.IsNullOrEmpty(status) && Enum.TryParse<PlanStatus>(status, ignoreCase: true, out var s))
                query = query.Where(p => p.Status == s);

            return await query
                .Include(p => p.Steps.OrderBy(s => s.Position))
                .OrderByDescending(p => p.CreatedAt)
                .ToListAsync();
        });

        group.MapGet("/{id:guid}", async (Guid projectId, Guid id, KontinueDbContext db) =>
            await db.Plans.AsNoTracking()
                .Include(p => p.Steps.OrderBy(s => s.Position))
                .FirstOrDefaultAsync(p => p.Id == id && p.ProjectId == projectId)
                is { } plan ? Results.Ok(plan) : Results.NotFound());

        group.MapPost("/", async (Guid projectId, CreatePlanRequest req, KontinueDbContext db, ConnectionManager ws) =>
        {
            var plan = new Plan
            {
                ProjectId = projectId,
                Title = req.Title,
                Goal = req.Goal,
                Status = PlanStatus.Active
            };

            if (req.Steps is { Count: > 0 })
            {
                for (int i = 0; i < req.Steps.Count; i++)
                    plan.Steps.Add(new PlanStep { Content = req.Steps[i], Position = i });
            }

            db.Plans.Add(plan);
            await db.SaveChangesAsync();
            ws.PublishPlanCreated(plan);
            return Results.Created($"/api/projects/{projectId}/plans/{plan.Id}", plan);
        });

        group.MapPut("/{id:guid}/status", async (Guid projectId, Guid id, UpdatePlanStatusRequest req, KontinueDbContext db, ConnectionManager ws) =>
        {
            var plan = await db.Plans.FirstOrDefaultAsync(p => p.Id == id && p.ProjectId == projectId);
            if (plan is null) return Results.NotFound();

            if (!Enum.TryParse<PlanStatus>(req.Status, ignoreCase: true, out var newStatus))
                return Results.BadRequest("Invalid status");

            plan.Status = newStatus;
            await db.SaveChangesAsync();
            ws.PublishPlanStatusChanged(plan);
            return Results.Ok(plan);
        });

        // Plan Steps
        group.MapPost("/{id:guid}/steps", async (Guid projectId, Guid id, CreatePlanStepRequest req, KontinueDbContext db, ConnectionManager ws) =>
        {
            var plan = await db.Plans.Include(p => p.Steps).FirstOrDefaultAsync(p => p.Id == id && p.ProjectId == projectId);
            if (plan is null) return Results.NotFound();

            var maxPos = plan.Steps.Count > 0 ? plan.Steps.Max(s => s.Position) + 1 : 0;
            var step = new PlanStep { PlanId = id, Content = req.Content, Position = req.Position ?? maxPos };
            db.PlanSteps.Add(step);
            await db.SaveChangesAsync();
            ws.PublishPlanStepUpdated(projectId, step);
            return Results.Created($"/api/projects/{projectId}/plans/{id}/steps/{step.Id}", step);
        });

        group.MapPut("/{planId:guid}/steps/{stepId:guid}/status", async (Guid projectId, Guid planId, Guid stepId, UpdateStepStatusRequest req, KontinueDbContext db, ConnectionManager ws) =>
        {
            var step = await db.PlanSteps.FirstOrDefaultAsync(s => s.Id == stepId && s.PlanId == planId);
            if (step is null) return Results.NotFound();

            if (!Enum.TryParse<PlanStepStatus>(req.Status, ignoreCase: true, out var newStatus))
                return Results.BadRequest("Invalid status");

            step.Status = newStatus;
            await db.SaveChangesAsync();
            ws.PublishPlanStepUpdated(projectId, step);
            return Results.Ok(step);
        });

        group.MapDelete("/{planId:guid}/steps/{stepId:guid}", async (Guid projectId, Guid planId, Guid stepId, KontinueDbContext db, ConnectionManager ws) =>
        {
            var step = await db.PlanSteps.FirstOrDefaultAsync(s => s.Id == stepId && s.PlanId == planId);
            if (step is null) return Results.NotFound();
            db.PlanSteps.Remove(step);
            await db.SaveChangesAsync();
            ws.PublishPlanStepUpdated(projectId, step);
            return Results.NoContent();
        });
    }

    public record CreatePlanRequest(string Title, string? Goal, List<string>? Steps);
    public record UpdatePlanStatusRequest(string Status);
    public record CreatePlanStepRequest(string Content, int? Position);
    public record UpdateStepStatusRequest(string Status);
}
