using Kontinue.Api.Auth;
using Kontinue.Shared.Data;
using Kontinue.Shared.Domain;
using Microsoft.EntityFrameworkCore;

namespace Kontinue.Api.Endpoints;

public static class ApiKeyEndpoints
{
    public static void MapApiKeyEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/keys").WithTags("API Keys");

        // List current user's keys
        group.MapGet("/", async (HttpContext context, KontinueDbContext db) =>
        {
            var userId = context.Items["AuthUserId"] as Guid?;
            if (userId is null) return Results.Unauthorized();

            var keys = await db.ApiKeys.AsNoTracking()
                .Include(k => k.Grants).ThenInclude(g => g.Project)
                .Where(k => k.UserId == userId && k.RevokedAt == null)
                .OrderByDescending(k => k.CreatedAt)
                .Select(k => new
                {
                    k.Id,
                    k.Name,
                    k.KeyPrefix,
                    k.CreatedAt,
                    k.ExpiresAt,
                    Grants = k.Grants.Select(g => new { g.ProjectId, ProjectName = g.Project.Name }),
                })
                .ToListAsync();

            return Results.Ok(keys);
        });

        // Create a new key with project grants — returns the full key ONCE
        group.MapPost("/", async (HttpContext context, CreateApiKeyRequest req, KontinueDbContext db) =>
        {
            var userId = context.Items["AuthUserId"] as Guid?;
            if (userId is null) return Results.Unauthorized();

            if (string.IsNullOrWhiteSpace(req.Name))
                return Results.BadRequest(new { error = "Name is required" });

            if (req.ProjectIds is null || req.ProjectIds.Count == 0)
                return Results.BadRequest(new { error = "At least one project grant is required" });

            // Verify user has access to all requested projects (via workspace membership)
            var userProjects = await db.WorkspaceMembers.AsNoTracking()
                .Where(wm => wm.UserId == userId)
                .SelectMany(wm => wm.Workspace.Projects.Select(p => p.Id))
                .ToHashSetAsync();

            var unauthorized = req.ProjectIds.Where(pid => !userProjects.Contains(pid)).ToList();
            if (unauthorized.Count > 0)
                return Results.Json(new { error = "Access denied to one or more projects" }, statusCode: 403);

            var rawKey = ApiKeyAuthMiddleware.GenerateKey();
            var apiKey = new ApiKey
            {
                UserId = userId.Value,
                Name = req.Name,
                KeyHash = ApiKeyAuthMiddleware.HashKey(rawKey),
                KeyPrefix = rawKey[..8],
                ExpiresAt = req.ExpiresInDays.HasValue
                    ? DateTime.UtcNow.AddDays(req.ExpiresInDays.Value)
                    : null,
            };

            foreach (var projectId in req.ProjectIds.Distinct())
            {
                apiKey.Grants.Add(new ApiKeyGrant { ProjectId = projectId });
            }

            db.ApiKeys.Add(apiKey);
            await db.SaveChangesAsync();

            return Results.Created($"/api/keys/{apiKey.Id}", new
            {
                apiKey.Id,
                apiKey.Name,
                apiKey.KeyPrefix,
                apiKey.CreatedAt,
                apiKey.ExpiresAt,
                Grants = apiKey.Grants.Select(g => g.ProjectId),
                Key = rawKey, // Only returned on creation
            });
        });

        // Update grants on an existing key
        group.MapPut("/{keyId:guid}/grants", async (HttpContext context, Guid keyId, UpdateGrantsRequest req, KontinueDbContext db) =>
        {
            var userId = context.Items["AuthUserId"] as Guid?;
            if (userId is null) return Results.Unauthorized();

            var apiKey = await db.ApiKeys
                .Include(k => k.Grants)
                .FirstOrDefaultAsync(k => k.Id == keyId && k.UserId == userId && k.RevokedAt == null);
            if (apiKey is null) return Results.NotFound();

            // Verify user has access to all requested projects
            var userProjects = await db.WorkspaceMembers.AsNoTracking()
                .Where(wm => wm.UserId == userId)
                .SelectMany(wm => wm.Workspace.Projects.Select(p => p.Id))
                .ToHashSetAsync();

            var unauthorized = req.ProjectIds.Where(pid => !userProjects.Contains(pid)).ToList();
            if (unauthorized.Count > 0)
                return Results.Json(new { error = "Access denied to one or more projects" }, statusCode: 403);

            // Replace grants
            apiKey.Grants.Clear();
            foreach (var projectId in req.ProjectIds.Distinct())
            {
                apiKey.Grants.Add(new ApiKeyGrant { ProjectId = projectId });
            }
            await db.SaveChangesAsync();

            return Results.Ok(new { apiKey.Id, Grants = req.ProjectIds });
        });

        // Revoke a key
        group.MapDelete("/{keyId:guid}", async (HttpContext context, Guid keyId, KontinueDbContext db) =>
        {
            var userId = context.Items["AuthUserId"] as Guid?;
            if (userId is null) return Results.Unauthorized();

            var apiKey = await db.ApiKeys
                .FirstOrDefaultAsync(k => k.Id == keyId && k.UserId == userId);
            if (apiKey is null) return Results.NotFound();

            apiKey.RevokedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        // Validate a key
        group.MapPost("/validate", async (ValidateKeyRequest req, KontinueDbContext db) =>
        {
            if (string.IsNullOrEmpty(req.Key)) return Results.BadRequest(new { error = "Key is required" });

            var hash = ApiKeyAuthMiddleware.HashKey(req.Key);
            var prefix = req.Key.Length >= 8 ? req.Key[..8] : req.Key;

            var apiKey = await db.ApiKeys.AsNoTracking()
                .Include(k => k.Grants)
                .FirstOrDefaultAsync(k =>
                    k.KeyPrefix == prefix &&
                    k.KeyHash == hash &&
                    k.RevokedAt == null);

            if (apiKey is null)
                return Results.Ok(new { valid = false, reason = "Key not found or revoked" });

            if (apiKey.ExpiresAt.HasValue && apiKey.ExpiresAt.Value < DateTime.UtcNow)
                return Results.Ok(new { valid = false, reason = "Key expired" });

            return Results.Ok(new
            {
                valid = true,
                name = apiKey.Name,
                keyPrefix = apiKey.KeyPrefix,
                expiresAt = apiKey.ExpiresAt,
                grants = apiKey.Grants.Select(g => g.ProjectId),
            });
        });
    }

    public record CreateApiKeyRequest(string Name, int? ExpiresInDays, List<Guid> ProjectIds);
    public record UpdateGrantsRequest(List<Guid> ProjectIds);
    public record ValidateKeyRequest(string Key);
}
