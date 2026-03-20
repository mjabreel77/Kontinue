using System.Security.Cryptography;
using Kontinue.Shared.Data;
using Kontinue.Shared.Domain;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Kontinue.Api.Auth;

public static class AuthEndpoints
{
    public static void MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/auth").WithTags("Auth");

        // Register
        group.MapPost("/register", async (RegisterRequest req, KontinueDbContext db) =>
        {
            if (string.IsNullOrWhiteSpace(req.Email) || string.IsNullOrWhiteSpace(req.Password))
                return Results.BadRequest(new { error = "Email and password are required" });

            if (req.Password.Length < 8)
                return Results.BadRequest(new { error = "Password must be at least 8 characters" });

            var normalizedEmail = req.Email.Trim().ToLowerInvariant();
            var exists = await db.Users.AnyAsync(u => u.Email == normalizedEmail);
            if (exists)
                return Results.Conflict(new { error = "Email already registered" });

            var hasher = new PasswordHasher<User>();
            var user = new User
            {
                Email = normalizedEmail,
                DisplayName = req.DisplayName?.Trim(),
                PasswordHash = "",
            };
            user.PasswordHash = hasher.HashPassword(user, req.Password);

            db.Users.Add(user);
            await db.SaveChangesAsync();

            // Auto-add to all existing workspaces as Member
            var workspaceIds = await db.Workspaces.Select(w => w.Id).ToListAsync();
            foreach (var wsId in workspaceIds)
            {
                db.WorkspaceMembers.Add(new WorkspaceMember
                {
                    WorkspaceId = wsId,
                    UserId = user.Id,
                    Role = MemberRole.Member,
                });
            }

            // Auto-create session token
            var (token, session) = CreateSession(user.Id);
            db.UserSessions.Add(session);
            await db.SaveChangesAsync();

            return Results.Ok(new AuthResponse(user.Id, user.Email, user.DisplayName, token, session.ExpiresAt));
        });

        // Login
        group.MapPost("/login", async (LoginRequest req, KontinueDbContext db) =>
        {
            if (string.IsNullOrWhiteSpace(req.Email) || string.IsNullOrWhiteSpace(req.Password))
                return Results.BadRequest(new { error = "Email and password are required" });

            var normalizedEmail = req.Email.Trim().ToLowerInvariant();
            var user = await db.Users.FirstOrDefaultAsync(u => u.Email == normalizedEmail);
            if (user is null)
                return Results.Unauthorized();

            var hasher = new PasswordHasher<User>();
            var result = hasher.VerifyHashedPassword(user, user.PasswordHash, req.Password);
            if (result == PasswordVerificationResult.Failed)
                return Results.Unauthorized();

            // Rehash if needed (password hasher upgrade)
            if (result == PasswordVerificationResult.SuccessRehashNeeded)
            {
                user.PasswordHash = hasher.HashPassword(user, req.Password);
            }

            var (token, session) = CreateSession(user.Id);
            db.UserSessions.Add(session);

            // Backfill workspace memberships for users who registered before auto-membership
            var existingWsIds = await db.WorkspaceMembers
                .Where(wm => wm.UserId == user.Id)
                .Select(wm => wm.WorkspaceId)
                .ToHashSetAsync();
            var allWsIds = await db.Workspaces.Select(w => w.Id).ToListAsync();
            foreach (var wsId in allWsIds.Where(id => !existingWsIds.Contains(id)))
            {
                db.WorkspaceMembers.Add(new WorkspaceMember
                {
                    WorkspaceId = wsId,
                    UserId = user.Id,
                    Role = MemberRole.Member,
                });
            }

            await db.SaveChangesAsync();

            return Results.Ok(new AuthResponse(user.Id, user.Email, user.DisplayName, token, session.ExpiresAt));
        });

        // Get current user
        group.MapGet("/me", async (HttpContext context, KontinueDbContext db) =>
        {
            var userId = context.Items["AuthUserId"] as Guid?;
            if (userId is null) return Results.Unauthorized();

            var user = await db.Users.AsNoTracking()
                .Where(u => u.Id == userId)
                .Select(u => new { u.Id, u.Email, u.DisplayName, u.CreatedAt })
                .FirstOrDefaultAsync();

            return user is null ? Results.Unauthorized() : Results.Ok(user);
        });

        // Logout — revoke current session
        group.MapPost("/logout", async (HttpContext context, KontinueDbContext db) =>
        {
            var sessionId = context.Items["AuthSessionId"] as Guid?;
            if (sessionId is null) return Results.Unauthorized();

            var session = await db.UserSessions.FindAsync(sessionId);
            if (session is not null)
            {
                session.RevokedAt = DateTime.UtcNow;
                await db.SaveChangesAsync();
            }

            return Results.Ok(new { message = "Logged out" });
        });

        // CLI device auth — serves a minimal login page
        group.MapGet("/cli", (HttpContext context) =>
        {
            var port = context.Request.Query["port"].FirstOrDefault();
            if (string.IsNullOrEmpty(port) || !int.TryParse(port, out _))
                return Results.BadRequest(new { error = "port query parameter is required" });

            var html = CliLoginPage(context.Request, port);
            return Results.Content(html, "text/html");
        });

        // CLI device auth — handles the login form submission
        group.MapPost("/cli/callback", async (CliLoginRequest req, KontinueDbContext db) =>
        {
            if (string.IsNullOrWhiteSpace(req.Email) || string.IsNullOrWhiteSpace(req.Password))
                return Results.BadRequest(new { error = "Email and password are required" });

            var normalizedEmail = req.Email.Trim().ToLowerInvariant();
            var user = await db.Users.FirstOrDefaultAsync(u => u.Email == normalizedEmail);
            if (user is null)
                return Results.Json(new { error = "Invalid credentials" }, statusCode: 401);

            var hasher = new PasswordHasher<User>();
            var result = hasher.VerifyHashedPassword(user, user.PasswordHash, req.Password);
            if (result == PasswordVerificationResult.Failed)
                return Results.Json(new { error = "Invalid credentials" }, statusCode: 401);

            var (token, session) = CreateSession(user.Id);
            db.UserSessions.Add(session);
            await db.SaveChangesAsync();

            return Results.Ok(new
            {
                token,
                userId = user.Id,
                email = user.Email,
                displayName = user.DisplayName,
                expiresAt = session.ExpiresAt
            });
        });
    }

    private static (string token, UserSession session) CreateSession(Guid userId)
    {
        var tokenBytes = RandomNumberGenerator.GetBytes(32);
        var token = $"kns_{Convert.ToBase64String(tokenBytes).Replace("+", "-").Replace("/", "_").TrimEnd('=')[..40]}";
        var hash = ApiKeyAuthMiddleware.HashKey(token);
        var prefix = token[..8];

        var session = new UserSession
        {
            UserId = userId,
            TokenHash = hash,
            TokenPrefix = prefix,
            ExpiresAt = DateTime.UtcNow.AddDays(30),
        };

        return (token, session);
    }

    private static string CliLoginPage(HttpRequest request, string port)
    {
        var baseUrl = $"{request.Scheme}://{request.Host}";
        return $$"""
        <!DOCTYPE html>
        <html lang="en"><head><meta charset="utf-8"><title>Kontinue CLI Login</title>
        <style>
            body { font-family: system-ui; max-width: 400px; margin: 80px auto; padding: 0 20px; }
            input { display: block; width: 100%; padding: 10px; margin: 8px 0; box-sizing: border-box; border: 1px solid #ccc; border-radius: 4px; }
            button { width: 100%; padding: 12px; background: #2563eb; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; }
            button:hover { background: #1d4ed8; }
            .error { color: #dc2626; margin-top: 12px; }
            .success { color: #16a34a; margin-top: 12px; }
        </style></head>
        <body>
            <h2>Kontinue CLI Login</h2>
            <p>Sign in to authorize the CLI.</p>
            <form id="f">
                <input name="email" type="email" placeholder="Email" required>
                <input name="password" type="password" placeholder="Password" required>
                <button type="submit">Sign In</button>
            </form>
            <div id="msg"></div>
            <script>
            document.getElementById('f').addEventListener('submit', async e => {
                e.preventDefault();
                const msg = document.getElementById('msg');
                msg.textContent = 'Signing in...';
                msg.className = '';
                try {
                    const r = await fetch('{{baseUrl}}/auth/cli/callback', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            email: e.target.email.value,
                            password: e.target.password.value
                        })
                    });
                    const data = await r.json();
                    if (!r.ok) { msg.textContent = data.error || 'Login failed'; msg.className = 'error'; return; }
                    // Send token to CLI's local server
                    const cb = await fetch('http://localhost:{{port}}/callback', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(data)
                    });
                    if (cb.ok) {
                        msg.textContent = 'Authenticated! You can close this tab.';
                        msg.className = 'success';
                        document.getElementById('f').style.display = 'none';
                    } else {
                        msg.textContent = 'Failed to send token to CLI';
                        msg.className = 'error';
                    }
                } catch (err) {
                    msg.textContent = 'Error: ' + err.message;
                    msg.className = 'error';
                }
            });
            </script>
        </body></html>
        """;
    }

    public record RegisterRequest(string Email, string Password, string? DisplayName);
    public record LoginRequest(string Email, string Password);
    public record CliLoginRequest(string Email, string Password);
    public record AuthResponse(Guid UserId, string Email, string? DisplayName, string Token, DateTime ExpiresAt);
}
