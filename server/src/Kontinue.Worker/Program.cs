using Kontinue.Shared.Data;
using Kontinue.Worker;

var builder = Host.CreateApplicationBuilder(args);

builder.AddServiceDefaults();
builder.AddNpgsqlDbContext<KontinueDbContext>("kontinuedb");
builder.AddQdrantClient("qdrant");

builder.Services.AddHostedService<EmbeddingWorker>();

var host = builder.Build();
host.Run();
