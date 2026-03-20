using Kontinue.Api.WebSockets;
using Kontinue.Shared.Data;
using Kontinue.Shared.Domain;
using Microsoft.EntityFrameworkCore;

namespace Kontinue.Api.Endpoints;

public static class QuestionEndpoints
{
    public static void MapQuestionEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/projects/{projectId:guid}/questions").WithTags("Questions");

        group.MapGet("/", async (Guid projectId, bool? open, KontinueDbContext db) =>
        {
            var query = db.Questions.AsNoTracking()
                .Where(q => q.ProjectId == projectId);

            if (open == true)
                query = query.Where(q => q.ResolvedAt == null);

            return await query.OrderByDescending(q => q.CreatedAt).ToListAsync();
        });

        group.MapPost("/", async (Guid projectId, CreateQuestionRequest req, KontinueDbContext db, ConnectionManager ws) =>
        {
            var question = new Question
            {
                ProjectId = projectId,
                SessionId = req.SessionId,
                TaskId = req.TaskId,
                Text = req.Text
            };
            db.Questions.Add(question);
            await db.SaveChangesAsync();
            ws.PublishQuestionAsked(question);
            return Results.Created($"/api/projects/{projectId}/questions/{question.Id}", question);
        });

        group.MapPut("/{id:guid}/answer", async (Guid projectId, Guid id, AnswerQuestionRequest req, KontinueDbContext db, ConnectionManager ws) =>
        {
            var question = await db.Questions.FirstOrDefaultAsync(q => q.Id == id && q.ProjectId == projectId);
            if (question is null) return Results.NotFound();
            question.Answer = req.Answer;
            question.ResolvedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
            ws.PublishQuestionAnswered(question);
            return Results.Ok(question);
        });
    }

    public record CreateQuestionRequest(string Text, Guid? SessionId, Guid? TaskId);
    public record AnswerQuestionRequest(string Answer);
}
