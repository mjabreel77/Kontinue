using System.Security.Cryptography;
using System.Text;
using Kontinue.Shared.Data;
using Microsoft.EntityFrameworkCore;

namespace Kontinue.Api.Auth;

/// <summary>
/// Middleware that validates Bearer tokens (session tokens or API keys).
/// - Session tokens (kns_*) authenticate the user across all their authorized resources.
/// - API keys (knt_*) authenticate for specific projects via ApiKeyGrant scoping.
/// - /auth/* routes are always unauthenticated (login/register).
/// - Workspace-level routes require a valid session.
/// - Project-scoped routes accept either a session (if user is workspace member) or a scoped API key.
/// </summary>
public sealed class ApiKeyAuthMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context)
    {
        var path = context.Request.Path.Value ?? "";

        // Auth endpoints are always public
        if (path.StartsWith("/auth", StringComparison.OrdinalIgnoreCase))
        {
            await next(context);
            return;
        }

        // Health/root endpoints are public
        if (path == "/" || path.StartsWith("/health", StringComparison.OrdinalIgnoreCase))
        {
            await next(context);
            return;
        }

        // WebSocket upgrades — handled separately in WebSocketEndpoints
        if (context.WebSockets.IsWebSocketRequest)
        {
            await next(context);
            return;
        }

        // Everything under /api/ requires auth
        if (!path.StartsWith("/api/", StringComparison.OrdinalIgnoreCase))
        {
            await next(context);
            return;
        }

        var authHeader = context.Request.Headers.Authorization.FirstOrDefault();
        if (string.IsNullOrEmpty(authHeader) || !authHeader.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
        {
            context.Response.StatusCode = 401;
            await context.Response.WriteAsJsonAsync(new { error = "Missing or invalid Authorization header" });
            return;
        }

        var token = authHeader["Bearer ".Length..].Trim();
        if (string.IsNullOrEmpty(token))
        {
            context.Response.StatusCode = 401;
            await context.Response.WriteAsJsonAsync(new { error = "Empty token" });
            return;
        }

        var db = context.RequestServices.GetRequiredService<KontinueDbContext>();

        // Session token (kns_*) — user authentication
        if (token.StartsWith("kns_"))
        {
            var hash = HashKey(token);
            var prefix = token[..8];

            var session = await db.UserSessions.AsNoTracking()
                .Include(s => s.User)
                .FirstOrDefaultAsync(s =>
                    s.TokenPrefix == prefix &&
                    s.TokenHash == hash &&
                    s.RevokedAt == null);

            if (session is null)
            {
                context.Response.StatusCode = 401;
                await context.Response.WriteAsJsonAsync(new { error = "Invalid or revoked session" });
                return;
            }

            if (session.ExpiresAt < DateTime.UtcNow)
            {
                context.Response.StatusCode = 401;
                await context.Response.WriteAsJsonAsync(new { error = "Session expired" });
                return;
            }

            context.Items["AuthUserId"] = session.UserId;
            context.Items["AuthSessionId"] = session.Id;
            context.Items["AuthType"] = "session";

            // Enforce workspace membership for workspace-scoped routes
            if (TryExtractWorkspaceId(path, out var wsId))
            {
                var isMember = await db.WorkspaceMembers.AsNoTracking()
                    .AnyAsync(wm => wm.UserId == session.UserId && wm.WorkspaceId == wsId);
                if (!isMember)
                {
                    context.Response.StatusCode = 403;
                    await context.Response.WriteAsJsonAsync(new { error = "Not a member of this workspace" });
                    return;
                }
            }

            // Enforce workspace membership for project-scoped routes
            if (TryExtractProjectId(path, out var sessionProjectId))
            {
                var hasAccess = await db.Projects.AsNoTracking()
                    .Where(p => p.Id == sessionProjectId)
                    .AnyAsync(p => db.WorkspaceMembers.Any(wm =>
                        wm.UserId == session.UserId && wm.WorkspaceId == p.WorkspaceId));
                if (!hasAccess)
                {
                    context.Response.StatusCode = 403;
                    await context.Response.WriteAsJsonAsync(new { error = "No access to this project" });
                    return;
                }
            }

            await next(context);
            return;
        }

        // API key (knt_*) — scoped project access
        if (token.StartsWith("knt_"))
        {
            var hash = HashKey(token);
            var prefix = token[..8];

            var apiKey = await db.ApiKeys.AsNoTracking()
                .Include(k => k.Grants)
                .FirstOrDefaultAsync(k =>
                    k.KeyPrefix == prefix &&
                    k.KeyHash == hash &&
                    k.RevokedAt == null);

            if (apiKey is null)
            {
                context.Response.StatusCode = 403;
                await context.Response.WriteAsJsonAsync(new { error = "Invalid or revoked API key" });
                return;
            }

            if (apiKey.ExpiresAt.HasValue && apiKey.ExpiresAt.Value < DateTime.UtcNow)
            {
                context.Response.StatusCode = 403;
                await context.Response.WriteAsJsonAsync(new { error = "API key expired" });
                return;
            }

            // Check project access if this is a project-scoped route
            if (TryExtractProjectId(path, out var projectId))
            {
                var hasGrant = apiKey.Grants.Any(g => g.ProjectId == projectId);
                if (!hasGrant)
                {
                    context.Response.StatusCode = 403;
                    await context.Response.WriteAsJsonAsync(new { error = "API key does not have access to this project" });
                    return;
                }
            }

            // API keys cannot access workspace-level routes (they are project-scoped)
            if (TryExtractWorkspaceId(path, out _))
            {
                context.Response.StatusCode = 403;
                await context.Response.WriteAsJsonAsync(new { error = "API keys cannot access workspace-level routes. Use a session token." });
                return;
            }

            context.Items["AuthUserId"] = apiKey.UserId;
            context.Items["AuthApiKeyId"] = apiKey.Id;
            context.Items["AuthApiKeyName"] = apiKey.Name;
            context.Items["AuthType"] = "apikey";
            context.Items["AuthGrantedProjects"] = apiKey.Grants.Select(g => g.ProjectId).ToHashSet();
            await next(context);
            return;
        }

        // Unknown token format
        context.Response.StatusCode = 401;
        await context.Response.WriteAsJsonAsync(new { error = "Invalid token format. Use a session token (kns_) or API key (knt_)" });
    }

    private static bool TryExtractProjectId(string path, out Guid projectId)
    {
        projectId = Guid.Empty;
        const string prefix = "/api/projects/";
        if (!path.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
            return false;

        var rest = path[prefix.Length..];
        var slashIdx = rest.IndexOf('/');
        var guidStr = slashIdx >= 0 ? rest[..slashIdx] : rest;
        return Guid.TryParse(guidStr, out projectId);
    }

    private static bool TryExtractWorkspaceId(string path, out Guid workspaceId)
    {
        workspaceId = Guid.Empty;
        const string prefix = "/api/workspaces/";
        if (!path.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
            return false;

        var rest = path[prefix.Length..];
        var slashIdx = rest.IndexOf('/');
        var guidStr = slashIdx >= 0 ? rest[..slashIdx] : rest;
        return Guid.TryParse(guidStr, out workspaceId);
    }

    public static string HashKey(string key)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(key));
        return Convert.ToBase64String(bytes);
    }

    public static string GenerateKey()
    {
        var bytes = RandomNumberGenerator.GetBytes(32);
        var base64 = Convert.ToBase64String(bytes)
            .Replace("+", "-")
            .Replace("/", "_")
            .TrimEnd('=');
        return $"knt_{base64[..40]}";
    }
}
