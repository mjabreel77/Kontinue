using Kontinue.Shared.Data;
using Microsoft.EntityFrameworkCore;

var builder = Host.CreateApplicationBuilder(args);

builder.AddServiceDefaults();
builder.AddNpgsqlDbContext<KontinueDbContext>("kontinuedb");

builder.Services.AddHostedService<MigrationWorker>();

var host = builder.Build();
host.Run();

/// <summary>
/// Applies pending EF Core migrations then signals healthy and exits.
/// Aspire orchestrates Api and Worker to WaitFor this service.
/// </summary>
sealed class MigrationWorker(
    IServiceScopeFactory scopeFactory,
    IHostApplicationLifetime lifetime,
    ILogger<MigrationWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        logger.LogInformation("Applying pending migrations...");

        try
        {
            using var scope = scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<KontinueDbContext>();

            var pending = await db.Database.GetPendingMigrationsAsync(stoppingToken);
            var pendingList = pending.ToList();

            if (pendingList.Count == 0)
            {
                logger.LogInformation("Database is up to date — no pending migrations");
            }
            else
            {
                logger.LogInformation("Found {Count} pending migration(s): {Migrations}",
                    pendingList.Count, string.Join(", ", pendingList));

                await db.Database.MigrateAsync(stoppingToken);

                logger.LogInformation("All migrations applied successfully");
            }
        }
        catch (Exception ex) when (!stoppingToken.IsCancellationRequested)
        {
            logger.LogCritical(ex, "Migration failed — dependent services will not start");
            throw;
        }

        // Signal that the migration service is done
        lifetime.StopApplication();
    }
}
