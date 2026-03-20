using System.Text.Json;
using Kontinue.Api.Auth;
using Kontinue.Shared.Data;
using Microsoft.EntityFrameworkCore;

namespace Kontinue.Api.WebSockets;

public static class WebSocketEndpoints
{
    public static void MapWebSocketEndpoints(this IEndpointRouteBuilder app)
    {
        app.Map("/ws", async (HttpContext context, ConnectionManager manager) =>
        {
            if (!context.WebSockets.IsWebSocketRequest)
            {
                context.Response.StatusCode = StatusCodes.Status400BadRequest;
                return;
            }

            var ws = await context.WebSockets.AcceptWebSocketAsync();
            var logger = context.RequestServices.GetRequiredService<ILoggerFactory>()
                .CreateLogger<ClientConnection>();

            var connection = new ClientConnection(ws, logger);

            // Subscribe to a project via query string
            if (Guid.TryParse(context.Request.Query["projectId"], out var projectId))
            {
                connection.ProjectId = projectId;

                // Validate token — accepts session tokens (kns_) or API keys (knt_)
                var token = context.Request.Query["token"].FirstOrDefault();
                using var scope = context.RequestServices.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<KontinueDbContext>();

                if (string.IsNullOrEmpty(token))
                {
                    await ws.CloseAsync(System.Net.WebSockets.WebSocketCloseStatus.PolicyViolation,
                        "Authentication required", CancellationToken.None);
                    return;
                }

                var hash = ApiKeyAuthMiddleware.HashKey(token);
                var prefix = token.Length >= 8 ? token[..8] : token;
                var valid = false;

                if (token.StartsWith("kns_"))
                {
                    // Session token — verify session is valid, then check workspace membership
                    var session = await db.UserSessions.AsNoTracking()
                        .FirstOrDefaultAsync(s => s.TokenPrefix == prefix && s.TokenHash == hash
                            && s.RevokedAt == null && s.ExpiresAt > DateTime.UtcNow);
                    if (session is not null)
                    {
                        var project = await db.Projects.AsNoTracking()
                            .FirstOrDefaultAsync(p => p.Id == projectId);
                        if (project is not null)
                        {
                            valid = await db.WorkspaceMembers.AsNoTracking()
                                .AnyAsync(wm => wm.UserId == session.UserId && wm.WorkspaceId == project.WorkspaceId);
                        }
                    }
                }
                else if (token.StartsWith("knt_"))
                {
                    // API key — check grant for this project
                    valid = await db.ApiKeys.AsNoTracking()
                        .AnyAsync(k => k.KeyPrefix == prefix && k.KeyHash == hash
                            && k.RevokedAt == null
                            && (!k.ExpiresAt.HasValue || k.ExpiresAt > DateTime.UtcNow)
                            && k.Grants.Any(g => g.ProjectId == projectId));
                }

                if (!valid)
                {
                    try
                    {
                        await ws.CloseAsync(System.Net.WebSockets.WebSocketCloseStatus.PolicyViolation,
                            "Invalid or unauthorized token", CancellationToken.None);
                    }
                    catch (System.Net.WebSockets.WebSocketException) { }
                    return;
                }

                // Send full state on connect
                await EventPublisher.SendStateFullAsync(connection, db, projectId);
            }

            manager.Add(connection);

            try
            {
                await connection.RunAsync(async (conn, message) =>
                {
                    try
                    {
                        using var doc = JsonDocument.Parse(message);
                        var root = doc.RootElement;

                        if (root.TryGetProperty("type", out var typeEl))
                        {
                            var type = typeEl.GetString();
                            switch (type)
                            {
                                case "subscribe" when root.TryGetProperty("projectId", out var pid):
                                    if (Guid.TryParse(pid.GetString(), out var subProjectId))
                                    {
                                        conn.ProjectId = subProjectId;
                                        using var scope = context.RequestServices.CreateScope();
                                        var db = scope.ServiceProvider.GetRequiredService<KontinueDbContext>();
                                        await EventPublisher.SendStateFullAsync(conn, db, subProjectId);
                                    }

                                    conn.TrySend(new { type = "subscribed", projectId = conn.ProjectId });
                                    break;

                                case "ping":
                                    conn.TrySend(new { type = "pong", timestamp = DateTime.UtcNow });
                                    break;
                            }
                        }
                    }
                    catch (JsonException) { }
                });
            }
            finally
            {
                await manager.RemoveAsync(connection);
            }
        });
    }
}
