using Kontinue.Shared.Data;
using Kontinue.Shared.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Qdrant.Client;
using Qdrant.Client.Grpc;

namespace Kontinue.Api.Search;

public sealed record HybridSearchResult(Guid Id, string Type, string Content, Guid? SourceId, double Score, DateTime CreatedAt);

public sealed partial class HybridSearchService(
    KontinueDbContext db,
    QdrantClient qdrantClient,
    ILogger<HybridSearchService> logger)
{
    private const string CollectionName = "kontinue_memory";
    private const int EmbeddingDimension = 384;
    private const double K = 60.0; // RRF constant

    /// <summary>
    /// Runs Qdrant vector search and PostgreSQL tsvector search in parallel,
    /// then merges results using Reciprocal Rank Fusion.
    /// </summary>
    public async Task<List<HybridSearchResult>> SearchAsync(
        Guid projectId,
        string query,
        string? type = null,
        int limit = 10,
        CancellationToken ct = default)
    {
        // Run both searches in parallel
        var vectorTask = VectorSearchAsync(projectId, query, type, limit * 2, ct);
        var keywordTask = KeywordSearchAsync(projectId, query, type, limit * 2, ct);

        await Task.WhenAll(vectorTask, keywordTask);

        var vectorResults = await vectorTask;
        var keywordResults = await keywordTask;

        // Merge with RRF
        var merged = MergeWithRrf(vectorResults, keywordResults, limit);

        Log.SearchCompleted(logger, query, vectorResults.Count, keywordResults.Count, merged.Count);

        return merged;
    }

    private async Task<List<(Guid id, double score)>> VectorSearchAsync(
        Guid projectId,
        string query,
        string? type,
        int limit,
        CancellationToken ct)
    {
        try
        {
            var queryEmbedding = GenerateQueryEmbedding(query);

            var filter = new Filter();
            filter.Must.Add(new Condition
            {
                Field = new FieldCondition
                {
                    Key = "project_id",
                    Match = new Match { Text = projectId.ToString() }
                }
            });

            if (!string.IsNullOrEmpty(type))
            {
                filter.Must.Add(new Condition
                {
                    Field = new FieldCondition
                    {
                        Key = "type",
                        Match = new Match { Text = type }
                    }
                });
            }

            var results = await qdrantClient.SearchAsync(
                CollectionName,
                queryEmbedding,
                filter: filter,
                limit: (ulong)limit,
                cancellationToken: ct);

            return results
                .Where(r => Guid.TryParse(r.Id.Uuid, out _))
                .Select(r => (Guid.Parse(r.Id.Uuid), (double)r.Score))
                .ToList();
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            Log.VectorSearchFailed(logger, ex);
            return [];
        }
    }

    private async Task<List<(Guid id, double rank)>> KeywordSearchAsync(
        Guid projectId,
        string query,
        string? type,
        int limit,
        CancellationToken ct)
    {
        try
        {
            var tsQuery = string.Join(" & ", query.Split(' ', StringSplitOptions.RemoveEmptyEntries));

            var baseQuery = db.MemoryChunks.AsNoTracking()
                .Where(mc => mc.ProjectId == projectId);

            if (!string.IsNullOrEmpty(type))
                baseQuery = baseQuery.Where(mc => mc.Type == type);

            // Use ts_rank for ordering
            var results = await baseQuery
                .Where(mc => mc.SearchVector.Matches(EF.Functions.PlainToTsQuery("english", query)))
                .OrderByDescending(mc => mc.SearchVector.Rank(EF.Functions.PlainToTsQuery("english", query)))
                .Take(limit)
                .Select(mc => new
                {
                    mc.Id,
                    Rank = mc.SearchVector.Rank(EF.Functions.PlainToTsQuery("english", query))
                })
                .ToListAsync(ct);

            return results.Select(r => (r.Id, (double)r.Rank)).ToList();
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            Log.KeywordSearchFailed(logger, ex);
            return [];
        }
    }

    private List<HybridSearchResult> MergeWithRrf(
        List<(Guid id, double score)> vectorResults,
        List<(Guid id, double rank)> keywordResults,
        int limit)
    {
        // Build rank maps (position-based)
        var rrfScores = new Dictionary<Guid, double>();

        for (int i = 0; i < vectorResults.Count; i++)
        {
            var id = vectorResults[i].id;
            rrfScores[id] = 1.0 / (K + i + 1);
        }

        for (int i = 0; i < keywordResults.Count; i++)
        {
            var id = keywordResults[i].id;
            rrfScores.TryGetValue(id, out var existing);
            rrfScores[id] = existing + 1.0 / (K + i + 1);
        }

        // Get top IDs by RRF score
        var topIds = rrfScores
            .OrderByDescending(kv => kv.Value)
            .Take(limit)
            .ToList();

        if (topIds.Count == 0)
            return [];

        // Fetch full chunks from DB
        var idSet = topIds.Select(kv => kv.Key).ToHashSet();
        var chunks = db.MemoryChunks.AsNoTracking()
            .Where(mc => idSet.Contains(mc.Id))
            .ToList()
            .ToDictionary(mc => mc.Id);

        return topIds
            .Where(kv => chunks.ContainsKey(kv.Key))
            .Select(kv =>
            {
                var chunk = chunks[kv.Key];
                return new HybridSearchResult(
                    chunk.Id,
                    chunk.Type,
                    chunk.Content,
                    chunk.SourceId,
                    kv.Value,
                    chunk.CreatedAt);
            })
            .ToList();
    }

    /// <summary>
    /// Placeholder embedding generator — must match the Worker's algorithm.
    /// TODO: Replace with real embedding model.
    /// </summary>
    private static float[] GenerateQueryEmbedding(string content)
    {
        var embedding = new float[EmbeddingDimension];
        var hash = System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(content));
        var rng = new Random(BitConverter.ToInt32(hash, 0));
        for (int i = 0; i < EmbeddingDimension; i++)
            embedding[i] = (float)(rng.NextDouble() * 2 - 1);

        var magnitude = MathF.Sqrt(embedding.Sum(x => x * x));
        if (magnitude > 0)
            for (int i = 0; i < embedding.Length; i++)
                embedding[i] /= magnitude;

        return embedding;
    }

    private static partial class Log
    {
        [LoggerMessage(Level = LogLevel.Information, Message = "Hybrid search for \"{Query}\": {VectorCount} vector + {KeywordCount} keyword → {MergedCount} results")]
        public static partial void SearchCompleted(ILogger logger, string query, int vectorCount, int keywordCount, int mergedCount);

        [LoggerMessage(Level = LogLevel.Warning, Message = "Vector search failed, falling back to keyword only")]
        public static partial void VectorSearchFailed(ILogger logger, Exception ex);

        [LoggerMessage(Level = LogLevel.Warning, Message = "Keyword search failed, falling back to vector only")]
        public static partial void KeywordSearchFailed(ILogger logger, Exception ex);
    }
}
