using System.Diagnostics;
using System.Diagnostics.Metrics;
using Kontinue.Shared.Data;
using Kontinue.Shared.Domain;
using Microsoft.EntityFrameworkCore;
using Qdrant.Client;
using Qdrant.Client.Grpc;

namespace Kontinue.Worker;

public sealed partial class EmbeddingWorker(
    IServiceScopeFactory scopeFactory,
    QdrantClient qdrantClient,
    ILogger<EmbeddingWorker> logger) : BackgroundService
{
    private const string CollectionName = "kontinue_memory";
    private const int EmbeddingDimension = 384; // placeholder dimension — matches typical sentence-transformer models
    private const int BatchSize = 50;

    private static readonly ActivitySource ActivitySource = new("Kontinue.Worker.Embedding");
    private static readonly Meter Meter = new("Kontinue.Worker.Embedding");

    private static readonly Counter<long> ChunksProcessed = Meter.CreateCounter<long>(
        "kontinue.embedding.chunks_processed",
        description: "Total memory chunks processed for embedding");

    private static readonly Histogram<double> EmbeddingDuration = Meter.CreateHistogram<double>(
        "kontinue.embedding.duration_ms",
        unit: "ms",
        description: "Time to embed a batch of memory chunks");

    private static readonly Counter<long> ChunksDecayed = Meter.CreateCounter<long>(
        "kontinue.embedding.chunks_decayed",
        description: "Total memory chunks marked stale by decay job");

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        Log.Started(logger);

        await EnsureCollectionExists(stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await ProcessPendingEmbeddings(stoppingToken);
                await RunDecayJob(stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                Log.PipelineError(logger, ex);
            }

            await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
        }
    }

    private async Task EnsureCollectionExists(CancellationToken ct)
    {
        try
        {
            var collections = await qdrantClient.ListCollectionsAsync(ct);
            if (collections.Any(c => c == CollectionName))
                return;

            await qdrantClient.CreateCollectionAsync(
                CollectionName,
                new VectorParams { Size = EmbeddingDimension, Distance = Distance.Cosine },
                cancellationToken: ct);

            Log.CollectionCreated(logger, CollectionName);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            Log.CollectionError(logger, ex);
        }
    }

    private async Task ProcessPendingEmbeddings(CancellationToken ct)
    {
        using var activity = ActivitySource.StartActivity("ProcessEmbeddings");

        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<KontinueDbContext>();

        var pendingChunks = await db.MemoryChunks
            .Where(mc => !mc.Embedded)
            .OrderBy(mc => mc.CreatedAt)
            .Take(BatchSize)
            .ToListAsync(ct);

        if (pendingChunks.Count == 0)
            return;

        Log.FoundPendingChunks(logger, pendingChunks.Count);
        activity?.SetTag("chunks.pending", pendingChunks.Count);

        var sw = Stopwatch.StartNew();

        var points = new List<PointStruct>(pendingChunks.Count);

        foreach (var chunk in pendingChunks)
        {
            // Generate a deterministic placeholder embedding from content hash
            // TODO: Replace with real embedding model (e.g., ONNX sentence-transformers)
            var embedding = GeneratePlaceholderEmbedding(chunk.Content);

            var point = new PointStruct
            {
                Id = new PointId { Uuid = chunk.Id.ToString() },
                Vectors = embedding
            };
            point.Payload.Add("project_id", chunk.ProjectId.ToString());
            point.Payload.Add("type", chunk.Type);
            point.Payload.Add("content", chunk.Content);
            if (chunk.SourceId.HasValue)
                point.Payload.Add("source_id", chunk.SourceId.Value.ToString());

            points.Add(point);
        }

        try
        {
            await qdrantClient.UpsertAsync(CollectionName, points, cancellationToken: ct);

            foreach (var chunk in pendingChunks)
                chunk.Embedded = true;

            await db.SaveChangesAsync(ct);

            sw.Stop();
            ChunksProcessed.Add(pendingChunks.Count);
            EmbeddingDuration.Record(sw.ElapsedMilliseconds);

            Log.BatchProcessed(logger, pendingChunks.Count, sw.ElapsedMilliseconds);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            Log.UpsertError(logger, ex);
        }
    }

    private async Task RunDecayJob(CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<KontinueDbContext>();

        var decayThreshold = DateTime.UtcNow.AddDays(-30);
        var staleChunks = await db.MemoryChunks
            .Where(mc => !mc.DecayExempt && mc.StaleAt == null && mc.CreatedAt < decayThreshold)
            .Take(100)
            .ToListAsync(ct);

        if (staleChunks.Count == 0)
            return;

        foreach (var chunk in staleChunks)
            chunk.StaleAt = DateTime.UtcNow;

        await db.SaveChangesAsync(ct);
        ChunksDecayed.Add(staleChunks.Count);
        Log.DecayProcessed(logger, staleChunks.Count);
    }

    private static float[] GeneratePlaceholderEmbedding(string content)
    {
        // Deterministic placeholder: hash-based embedding for development
        // Production should use an actual model (ONNX, OpenAI, etc.)
        var embedding = new float[EmbeddingDimension];
        var hash = System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(content));
        var rng = new Random(BitConverter.ToInt32(hash, 0));
        for (int i = 0; i < EmbeddingDimension; i++)
            embedding[i] = (float)(rng.NextDouble() * 2 - 1);

        // Normalize to unit vector
        var magnitude = MathF.Sqrt(embedding.Sum(x => x * x));
        if (magnitude > 0)
            for (int i = 0; i < embedding.Length; i++)
                embedding[i] /= magnitude;

        return embedding;
    }

    private static partial class Log
    {
        [LoggerMessage(Level = LogLevel.Information, Message = "EmbeddingWorker started — polling for new memory chunks")]
        public static partial void Started(ILogger logger);

        [LoggerMessage(Level = LogLevel.Debug, Message = "Found {Count} memory chunks to process")]
        public static partial void FoundPendingChunks(ILogger logger, int count);

        [LoggerMessage(Level = LogLevel.Information, Message = "Processed batch of {Count} chunks in {DurationMs}ms")]
        public static partial void BatchProcessed(ILogger logger, int count, long durationMs);

        [LoggerMessage(Level = LogLevel.Information, Message = "Decay job marked {Count} chunks as stale")]
        public static partial void DecayProcessed(ILogger logger, int count);

        [LoggerMessage(Level = LogLevel.Information, Message = "Created Qdrant collection: {Name}")]
        public static partial void CollectionCreated(ILogger logger, string name);

        [LoggerMessage(Level = LogLevel.Warning, Message = "Failed to ensure Qdrant collection exists")]
        public static partial void CollectionError(ILogger logger, Exception ex);

        [LoggerMessage(Level = LogLevel.Error, Message = "Error upserting embeddings to Qdrant")]
        public static partial void UpsertError(ILogger logger, Exception ex);

        [LoggerMessage(Level = LogLevel.Error, Message = "Error in embedding pipeline")]
        public static partial void PipelineError(ILogger logger, Exception ex);
    }
}
