# Kontinue v2 — .NET Backend Engineering Guide

> **Stack:** .NET 10 · ASP.NET Core · EF Core 10 · PostgreSQL · Qdrant · Aspire  
> **Principle:** Maximum compile-time safety, zero-reflection hot paths, allocation-conscious code.

---

## Table of Contents

1. [Project Structure](#1-project-structure)
2. [JSON Source Generators](#2-json-source-generators)
3. [Logging Source Generators](#3-logging-source-generators)
4. [Compiled EF Core Queries](#4-compiled-ef-core-queries)
5. [Minimal API Typed Results](#5-minimal-api-typed-results)
6. [Dependency Injection Best Practices](#6-dependency-injection-best-practices)
7. [Value Types and Allocation Discipline](#7-value-types-and-allocation-discipline)
8. [Interceptors and Code Generation](#8-interceptors-and-code-generation)
9. [Configuration and Options Pattern](#9-configuration-and-options-pattern)
10. [Error Handling Strategy](#10-error-handling-strategy)
11. [Testing Strategy](#11-testing-strategy)
12. [Performance Guidelines](#12-performance-guidelines)
13. [Security Practices](#13-security-practices)
14. [Observability and Telemetry](#14-observability-and-telemetry)
15. [Database Conventions](#15-database-conventions)
16. [Coding Standards](#16-coding-standards)

---

## 1. Project Structure

### Solution Layout

```
server/
├── Kontinue.slnx                              # Solution file
└── src/
    ├── Kontinue.AppHost/                       # Aspire orchestrator
    │   ├── AppHost.cs                          # Resource graph (Postgres, Qdrant, services)
    │   └── Kontinue.AppHost.csproj
    │
    ├── Kontinue.Api/                           # ASP.NET Core Web API
    │   ├── Program.cs                          # Host builder, DI, middleware pipeline
    │   ├── Auth/
    │   │   ├── AuthEndpoints.cs                # /auth/* (register, login, logout, device flow)
    │   │   └── ApiKeyAuthMiddleware.cs         # Token validation + access control
    │   ├── Endpoints/
    │   │   ├── WorkspaceEndpoints.cs           # /api/workspaces/*
    │   │   ├── ProjectEndpoints.cs             # /api/workspaces/{wId}/projects/*
    │   │   ├── TaskEndpoints.cs                # /api/projects/{pId}/tasks/*
    │   │   ├── DecisionEndpoints.cs            # /api/projects/{pId}/decisions/*
    │   │   ├── ObservationEndpoints.cs         # /api/projects/{pId}/observations/*
    │   │   ├── SignalEndpoints.cs              # /api/projects/{pId}/signals/*
    │   │   ├── PlanEndpoints.cs                # /api/projects/{pId}/plans/*
    │   │   ├── MemoryEndpoints.cs              # /api/projects/{pId}/memory/*
    │   │   ├── CheckpointEndpoints.cs          # /api/projects/{pId}/checkpoints/*
    │   │   ├── HandoffEndpoints.cs             # /api/projects/{pId}/handoffs/*
    │   │   ├── QuestionEndpoints.cs            # /api/projects/{pId}/questions/*
    │   │   ├── ApiKeyEndpoints.cs              # /api/keys/*
    │   │   └── OverviewEndpoints.cs            # /api/projects/{pId}/overview
    │   ├── WebSockets/
    │   │   ├── WebSocketEndpoints.cs           # /ws handler
    │   │   └── ConnectionManager.cs            # Client tracking + broadcast
    │   ├── Services/
    │   │   └── HybridSearchService.cs          # Vector + full-text search
    │   └── Kontinue.Api.csproj
    │
    ├── Kontinue.Worker/                        # Background processing
    │   ├── Program.cs                          # Host builder
    │   ├── Worker.cs                           # Embedding pipeline + decay job
    │   └── Kontinue.Worker.csproj
    │
    ├── Kontinue.MigrationService/              # DB migration runner
    │   ├── Program.cs                          # Applies pending EF migrations on startup
    │   └── Kontinue.MigrationService.csproj
    │
    ├── Kontinue.Shared/                        # Shared kernel (domain + data)
    │   ├── Domain/
    │   │   ├── Workspace.cs
    │   │   ├── Project.cs
    │   │   ├── User.cs, WorkspaceMember.cs
    │   │   ├── UserSession.cs, ApiKey.cs, ApiKeyGrant.cs
    │   │   ├── Session.cs
    │   │   ├── AgentTask.cs, TaskItem.cs, TaskDependency.cs
    │   │   ├── Decision.cs
    │   │   ├── Observation.cs
    │   │   ├── Signal.cs
    │   │   ├── Plan.cs, PlanStep.cs
    │   │   ├── MemoryChunk.cs
    │   │   ├── Checkpoint.cs, Handoff.cs
    │   │   ├── Question.cs
    │   │   ├── TaskTemplate.cs, ExternalLink.cs
    │   │   └── Enums.cs                        # All enum types
    │   ├── Data/
    │   │   ├── KontinueDbContext.cs             # 24 DbSets, OnModelCreating
    │   │   └── Migrations/                     # EF Core migrations
    │   ├── Protocol/
    │   │   ├── JsonConfig.cs                   # System.Text.Json options
    │   │   ├── WsMessages.cs                   # WebSocket event types (polymorphic)
    │   │   └── KontinueJsonContext.cs           # ★ JSON source generator context
    │   └── Kontinue.Shared.csproj
    │
    └── Kontinue.ServiceDefaults/               # Aspire shared config
        ├── Extensions.cs                       # OpenTelemetry, resilience, health checks
        └── Kontinue.ServiceDefaults.csproj
```

### Project Dependency Graph

```
Kontinue.AppHost (orchestrator)
  ├── references → Kontinue.Api
  ├── references → Kontinue.Worker
  └── references → Kontinue.MigrationService

Kontinue.Api
  ├── references → Kontinue.Shared
  └── references → Kontinue.ServiceDefaults

Kontinue.Worker
  ├── references → Kontinue.Shared
  └── references → Kontinue.ServiceDefaults

Kontinue.MigrationService
  ├── references → Kontinue.Shared
  └── references → Kontinue.ServiceDefaults

Kontinue.Shared (no project references — leaf)
Kontinue.ServiceDefaults (no project references — leaf)
```

### Key Principle: Shared Contains No Business Logic

`Kontinue.Shared` contains **only**:
- Domain entities (POCOs)
- `KontinueDbContext` (schema definition)
- Protocol definitions (JSON, WebSocket messages)
- Enums

Business logic resides in `Kontinue.Api` (endpoints, middleware, services) and `Kontinue.Worker` (background jobs). This keeps `Shared` a pure data contract.

---

## 2. JSON Source Generators

**Goal:** Zero reflection-based serialization at runtime. All JSON (de)serialization uses compile-time generated code.

### Source Generator Context

```csharp
// Kontinue.Shared/Protocol/KontinueJsonContext.cs

[JsonSourceGenerationOptions(
    PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase,
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    UseStringEnumConverter = true,
    GenerationMode = JsonSourceGenerationMode.Default)]
[JsonSerializable(typeof(Workspace))]
[JsonSerializable(typeof(Project))]
[JsonSerializable(typeof(User))]
[JsonSerializable(typeof(AgentTask))]
[JsonSerializable(typeof(Decision))]
[JsonSerializable(typeof(Observation))]
[JsonSerializable(typeof(Signal))]
[JsonSerializable(typeof(Plan))]
[JsonSerializable(typeof(PlanStep))]
[JsonSerializable(typeof(MemoryChunk))]
[JsonSerializable(typeof(Checkpoint))]
[JsonSerializable(typeof(Handoff))]
[JsonSerializable(typeof(Question))]
[JsonSerializable(typeof(Session))]
[JsonSerializable(typeof(ApiKey))]
[JsonSerializable(typeof(TaskItem))]
[JsonSerializable(typeof(ExternalLink))]
[JsonSerializable(typeof(TaskTemplate))]
// Collections
[JsonSerializable(typeof(List<Workspace>))]
[JsonSerializable(typeof(List<Project>))]
[JsonSerializable(typeof(List<AgentTask>))]
[JsonSerializable(typeof(List<Decision>))]
[JsonSerializable(typeof(List<Observation>))]
[JsonSerializable(typeof(List<Signal>))]
[JsonSerializable(typeof(List<Plan>))]
[JsonSerializable(typeof(List<MemoryChunk>))]
[JsonSerializable(typeof(List<Checkpoint>))]
[JsonSerializable(typeof(List<Handoff>))]
[JsonSerializable(typeof(List<Question>))]
[JsonSerializable(typeof(List<Session>))]
[JsonSerializable(typeof(List<ApiKey>))]
// WebSocket events (polymorphic base)
[JsonSerializable(typeof(ServerEvent))]
// Request/Response DTOs
[JsonSerializable(typeof(ErrorResponse))]
[JsonSerializable(typeof(LoginRequest))]
[JsonSerializable(typeof(RegisterRequest))]
[JsonSerializable(typeof(AuthResponse))]
[JsonSerializable(typeof(OverviewResponse))]
// Primitives used in results
[JsonSerializable(typeof(Dictionary<string, object>))]
public partial class KontinueJsonContext : JsonSerializerContext;
```

### Registration in Program.cs

```csharp
// Replace reflection-based options with source-generated context
builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.TypeInfoResolverChain.Insert(0, KontinueJsonContext.Default);
});

// WebSocket serialization uses the same context
var json = JsonSerializer.Serialize(serverEvent, KontinueJsonContext.Default.ServerEvent);
```

### Rules

| Rule | Rationale |
|---|---|
| Every type that crosses an HTTP boundary must be in `KontinueJsonContext` | Compile-time verification, no runtime reflection |
| DTOs use `record` types with `init` properties | Immutable, source-gen friendly |
| No `object` or `dynamic` in serialized types | Source generators can't handle untyped data |
| Polymorphic types use `[JsonPolymorphic]` + `[JsonDerivedType]` | Already in place for WebSocket events |
| All enums serialize as camelCase strings | `UseStringEnumConverter = true` in source gen options |

### DTO Pattern

```csharp
// Shared/Protocol/Dtos.cs — thin request/response types

public sealed record LoginRequest(string Email, string Password);

public sealed record AuthResponse(string Token, DateTime ExpiresAt);

public sealed record ErrorResponse(string Error, string? Detail = null);

public sealed record CreateTaskRequest(
    string Title,
    string? Description = null,
    List<string>? Items = null);

public sealed record OverviewResponse(
    int TotalTasks,
    int ActiveTasks,
    int TotalDecisions,
    int UnresolvedObservations,
    Session? ActiveSession);
```

---

## 3. Logging Source Generators

**Goal:** Zero-allocation, compile-time verified structured logging via `[LoggerMessage]`.

### Pattern

```csharp
// Every class that logs defines a nested static extension class on ILogger

public static partial class TaskEndpoints
{
    public static void MapTaskEndpoints(this WebApplication app) { /* ... */ }

    private static partial class Log
    {
        [LoggerMessage(Level = LogLevel.Information,
            Message = "Task created: {Title} in project {ProjectId}")]
        public static partial void TaskCreated(this ILogger logger, string title, Guid projectId);

        [LoggerMessage(Level = LogLevel.Information,
            Message = "Task {TaskId} status changed: {OldStatus} → {NewStatus}")]
        public static partial void TaskStatusChanged(
            this ILogger logger, Guid taskId, string oldStatus, string newStatus);

        [LoggerMessage(Level = LogLevel.Warning,
            Message = "Task {TaskId} not found in project {ProjectId}")]
        public static partial void TaskNotFound(this ILogger logger, Guid taskId, Guid projectId);

        [LoggerMessage(Level = LogLevel.Error,
            Message = "Failed to create task in project {ProjectId}")]
        public static partial void TaskCreateFailed(
            this ILogger logger, Exception exception, Guid projectId);
    }
}
```

### Usage

```csharp
// Extension method syntax — clean call site
logger.TaskCreated(request.Title, projectId);
logger.TaskNotFound(taskId, projectId);
logger.TaskCreateFailed(ex, projectId);
```

### Rules

| Rule | Rationale |
|---|---|
| **Never** use string interpolation in log calls (`$"..."`) | Allocates even when log level is disabled |
| **Never** use `logger.LogInformation(...)` raw in hot paths | No compile-time validation, possible boxing |
| **Always** use `[LoggerMessage]` extension methods | Zero-allocation, compile-time verified, natural call syntax |
| Use `EventId` for log correlation when needed | `[LoggerMessage(EventId = 1001, ...)]` |
| Log classes are `private static partial class Log` with extension methods | Scoped to the containing class, invoked as `logger.Method()` |
| Exception parameter is always first (after `this ILogger`) | Convention for structured logging |
| First parameter is always `this ILogger logger` | Makes the method an extension on ILogger |

### Naming Convention

```
{Entity}{Action}         → TaskCreated, DecisionLogged, SessionStarted
{Entity}{Action}Failed   → TaskCreateFailed, SignalDeliveryFailed
{Entity}NotFound         → TaskNotFound, ProjectNotFound
{Action}Completed        → MigrationCompleted, EmbeddingCompleted
{Action}Skipped          → DecaySkipped, EmbeddingSkipped
```

---

## 4. Compiled EF Core Queries

**Goal:** Eliminate per-request query compilation overhead for frequent queries.

### Pattern: `EF.CompileAsyncQuery`

```csharp
// Kontinue.Shared/Data/CompiledQueries.cs

public static class CompiledQueries
{
    // ── Tasks ──

    public static readonly Func<KontinueDbContext, Guid, IAsyncEnumerable<AgentTask>>
        GetTasksByProject = EF.CompileAsyncQuery(
            (KontinueDbContext db, Guid projectId) =>
                db.Tasks
                    .Where(t => t.ProjectId == projectId)
                    .OrderByDescending(t => t.UpdatedAt)
                    .Include(t => t.Items.OrderBy(i => i.Position)));

    public static readonly Func<KontinueDbContext, Guid, Guid, Task<AgentTask?>>
        GetTaskById = EF.CompileAsyncQuery(
            (KontinueDbContext db, Guid projectId, Guid taskId) =>
                db.Tasks
                    .Include(t => t.Items.OrderBy(i => i.Position))
                    .FirstOrDefaultAsync(t => t.ProjectId == projectId && t.Id == taskId));

    public static readonly Func<KontinueDbContext, Guid, IAsyncEnumerable<AgentTask>>
        GetActiveTasksByProject = EF.CompileAsyncQuery(
            (KontinueDbContext db, Guid projectId) =>
                db.Tasks
                    .Where(t => t.ProjectId == projectId
                        && (t.Status == AgentTaskStatus.Todo || t.Status == AgentTaskStatus.InProgress))
                    .OrderByDescending(t => t.UpdatedAt));

    // ── Decisions ──

    public static readonly Func<KontinueDbContext, Guid, IAsyncEnumerable<Decision>>
        GetActiveDecisionsByProject = EF.CompileAsyncQuery(
            (KontinueDbContext db, Guid projectId) =>
                db.Decisions
                    .Where(d => d.ProjectId == projectId && d.Status == DecisionStatus.Active)
                    .OrderByDescending(d => d.CreatedAt));

    // ── Signals ──

    public static readonly Func<KontinueDbContext, Guid, IAsyncEnumerable<Signal>>
        GetPendingSignals = EF.CompileAsyncQuery(
            (KontinueDbContext db, Guid projectId) =>
                db.Signals
                    .Where(s => s.ProjectId == projectId && s.Status == SignalStatus.Pending)
                    .OrderBy(s => s.CreatedAt));

    // ── Observations ──

    public static readonly Func<KontinueDbContext, Guid, IAsyncEnumerable<Observation>>
        GetUnresolvedObservations = EF.CompileAsyncQuery(
            (KontinueDbContext db, Guid projectId) =>
                db.Observations
                    .Where(o => o.ProjectId == projectId && o.ResolvedAt == null)
                    .OrderByDescending(o => o.CreatedAt));

    // ── Checkpoints ──

    public static readonly Func<KontinueDbContext, Guid, Task<Checkpoint?>>
        GetLatestCheckpoint = EF.CompileAsyncQuery(
            (KontinueDbContext db, Guid sessionId) =>
                db.Checkpoints
                    .Where(c => c.SessionId == sessionId)
                    .OrderByDescending(c => c.CreatedAt)
                    .FirstOrDefaultAsync());

    // ── Handoffs ──

    public static readonly Func<KontinueDbContext, Guid, Task<Handoff?>>
        GetLatestHandoff = EF.CompileAsyncQuery(
            (KontinueDbContext db, Guid projectId) =>
                db.Handoffs
                    .Where(h => h.ProjectId == projectId)
                    .OrderByDescending(h => h.CreatedAt)
                    .FirstOrDefaultAsync());

    // ── Memory ──

    public static readonly Func<KontinueDbContext, Guid, IAsyncEnumerable<MemoryChunk>>
        GetUnembeddedChunks = EF.CompileAsyncQuery(
            (KontinueDbContext db, Guid projectId) =>
                db.MemoryChunks
                    .Where(m => m.ProjectId == projectId && !m.Embedded)
                    .OrderBy(m => m.CreatedAt)
                    .Take(50));
}
```

### Usage in Endpoints

```csharp
// Instead of:
var tasks = await db.Tasks.Where(t => t.ProjectId == projectId).ToListAsync();

// Use:
var tasks = new List<AgentTask>();
await foreach (var task in CompiledQueries.GetTasksByProject(db, projectId))
{
    tasks.Add(task);
}
```

### When to Use Compiled Queries

| Use Case | Use Compiled? | Rationale |
|---|---|---|
| Queries called on every request (list, get-by-id) | **Yes** | Eliminates expression tree compilation |
| Queries with dynamic filters (search, pagination) | **No** | Filter shape varies per call |
| One-time queries (migration, setup) | **No** | Compilation cost amortized over zero repeat calls |
| Queries in background worker loops | **Yes** | Called repeatedly every tick |

---

## 5. Minimal API Typed Results

**Goal:** Compile-time route metadata, OpenAPI spec generation, and strongly-typed responses.

### Pattern: `TypedResults`

```csharp
// ❌ Avoid: Results.Ok() — returns IResult, no compile-time type info
group.MapGet("/", async (KontinueDbContext db, Guid projectId) =>
{
    var tasks = await db.Tasks.Where(t => t.ProjectId == projectId).ToListAsync();
    return Results.Ok(tasks);
});

// ✅ Prefer: TypedResults — return type is Results<Ok<List<AgentTask>>, NotFound>
group.MapGet("/", async Task<Results<Ok<List<AgentTask>>, NotFound>>
    (KontinueDbContext db, Guid projectId) =>
{
    var project = await db.Projects.FindAsync(projectId);
    if (project is null)
        return TypedResults.NotFound();

    var tasks = await db.Tasks
        .Where(t => t.ProjectId == projectId)
        .ToListAsync();

    return TypedResults.Ok(tasks);
});
```

### Response Type Unions

```csharp
// Endpoint return types encode all possible outcomes:

// GET /tasks/{id}
Task<Results<Ok<AgentTask>, NotFound>>

// POST /tasks
Task<Results<Created<AgentTask>, BadRequest<ErrorResponse>, NotFound>>

// PUT /tasks/{id}
Task<Results<Ok<AgentTask>, NotFound, BadRequest<ErrorResponse>>>

// DELETE /tasks/{id}
Task<Results<NoContent, NotFound, StatusCodeHttpResult>>  // 403 via StatusCodeHttpResult
```

### Rules

| Rule | Rationale |
|---|---|
| All endpoints return `TypedResults.*` | Compile-time verified, OpenAPI accurate |
| Return types use `Results<T1, T2, ...>` union | Documents all outcomes in the signature |
| Error responses use `ErrorResponse` record | Consistent error shape across API |
| Never return `Results.Forbid()` | Requires `IAuthenticationService` — use `TypedResults.Json(new ErrorResponse(...), statusCode: 403)` |
| Use `Created<T>` with location header for POST | RESTful convention |

---

## 6. Dependency Injection Best Practices

### Service Lifetimes

| Service | Lifetime | Rationale |
|---|---|---|
| `KontinueDbContext` | **Scoped** | One context per request (Aspire default) |
| `ConnectionManager` | **Singleton** | Shared WebSocket state across all requests |
| `HybridSearchService` | **Scoped** | Uses scoped DbContext + Qdrant client |
| `QdrantClient` | **Singleton** | Thread-safe, connection pooled (Aspire default) |
| `ILogger<T>` | **Singleton** | Framework-managed, always singleton |
| Background workers | **Singleton** | `IHostedService` is singleton by design |

### Keyed Services (for strategy pattern)

```csharp
// Register multiple implementations with keys
builder.Services.AddKeyedScoped<ISearchStrategy, VectorSearchStrategy>("vector");
builder.Services.AddKeyedScoped<ISearchStrategy, KeywordSearchStrategy>("keyword");
builder.Services.AddKeyedScoped<ISearchStrategy, HybridSearchStrategy>("hybrid");

// Resolve by key
app.MapGet("/search", async (
    [FromKeyedServices("hybrid")] ISearchStrategy search,
    string query) =>
{
    return TypedResults.Ok(await search.SearchAsync(query));
});
```

### Constructor Injection Only

```csharp
// ❌ Never: service locator pattern
var service = app.Services.GetRequiredService<MyService>();

// ✅ Always: constructor or parameter injection
app.MapGet("/tasks", async (KontinueDbContext db, ILogger<Program> logger) => { });
```

---

## 7. Value Types and Allocation Discipline

### Prefer Value Types for Small Data

```csharp
// ❌ Class for simple data carriers
public class SearchResult
{
    public Guid Id { get; set; }
    public float Score { get; set; }
    public string Content { get; set; }
}

// ✅ Readonly record struct — stack-allocated, no GC pressure
public readonly record struct SearchResult(Guid Id, float Score, string Content);
```

### Span-Based String Operations

```csharp
// ❌ Allocating string operations
public static string ExtractPrefix(string token)
{
    var parts = token.Split('_');
    return parts[0] + "_" + parts[1].Substring(0, 8);
}

// ✅ Span-based — zero allocations for validation
public static bool IsValidTokenPrefix(ReadOnlySpan<char> token)
{
    // "kns_" or "knt_" prefix check
    return token.Length >= 4
        && (token.StartsWith("kns_") || token.StartsWith("knt_"));
}
```

### Collection Patterns

```csharp
// ❌ LINQ chains that allocate intermediate collections
var ids = tasks.Select(t => t.Id).Where(id => id != Guid.Empty).ToList();

// ✅ Use List<T> capacity hint when size is known
var ids = new List<Guid>(tasks.Count);
foreach (var task in tasks)
{
    if (task.Id != Guid.Empty)
        ids.Add(task.Id);
}

// ✅ For small fixed collections, use stackalloc or array pool
Span<Guid> buffer = stackalloc Guid[8];  // stack-allocated for small sizes

// ✅ Use ArrayPool for larger temporary buffers
var pool = ArrayPool<byte>.Shared;
var buffer = pool.Rent(4096);
try { /* use buffer */ }
finally { pool.Return(buffer); }
```

### Frozen Collections for Static Data

```csharp
// ❌ Regular dictionary for route-permission mapping
private static readonly Dictionary<string, string[]> PublicRoutes = new()
{
    ["/auth/login"] = ["POST"],
    ["/auth/register"] = ["POST"],
    ["/health"] = ["GET"],
};

// ✅ FrozenDictionary — optimized for read-heavy, never-mutated lookups
private static readonly FrozenDictionary<string, string[]> PublicRoutes =
    new Dictionary<string, string[]>
    {
        ["/auth/login"] = ["POST"],
        ["/auth/register"] = ["POST"],
        ["/health"] = ["GET"],
    }.ToFrozenDictionary();
```

---

## 8. Interceptors and Code Generation

### EF Core Interceptors

```csharp
// Automatically set CreatedAt/UpdatedAt timestamps
public sealed class AuditInterceptor : SaveChangesInterceptor
{
    public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData,
        InterceptionResult<int> result,
        CancellationToken ct = default)
    {
        if (eventData.Context is not KontinueDbContext db)
            return ValueTask.FromResult(result);

        var now = DateTime.UtcNow;

        foreach (var entry in db.ChangeTracker.Entries())
        {
            if (entry.State == EntityState.Added
                && entry.Entity is IHasCreatedAt created)
            {
                created.CreatedAt = now;
            }

            if (entry.State == EntityState.Modified
                && entry.Entity is IHasUpdatedAt updated)
            {
                updated.UpdatedAt = now;
            }
        }

        return ValueTask.FromResult(result);
    }
}

// Register:
builder.Services.AddDbContext<KontinueDbContext>((sp, options) =>
{
    options.AddInterceptors(new AuditInterceptor());
});
```

### Marker Interfaces for Audit

```csharp
public interface IHasCreatedAt
{
    DateTime CreatedAt { get; set; }
}

public interface IHasUpdatedAt
{
    DateTime UpdatedAt { get; set; }
}

// Entities implement both:
public sealed class AgentTask : IHasCreatedAt, IHasUpdatedAt
{
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
```

### Request Pipeline Source Generation (future — .NET 10+)

```csharp
// .NET 10 request delegate generator — compile-time route handler generation
// Enabled via:
builder.Services.AddRouteDiagnostics();  // opt-in for AOT-compatible endpoint gen
```

---

## 9. Configuration and Options Pattern

### Strongly-Typed Configuration

```csharp
// Shared/Configuration/KontinueOptions.cs
public sealed class KontinueOptions
{
    public const string Section = "Kontinue";

    public required int EmbeddingBatchSize { get; init; } = 50;
    public required int MemoryDecayDays { get; init; } = 30;
    public required int SignalPollIntervalSeconds { get; init; } = 5;
    public required int MaxWebSocketConnections { get; init; } = 100;
}

// Registration with validation:
builder.Services.AddOptions<KontinueOptions>()
    .BindConfiguration(KontinueOptions.Section)
    .ValidateDataAnnotations()
    .ValidateOnStart();  // Fail fast on misconfiguration
```

### appsettings.json

```json
{
  "Kontinue": {
    "EmbeddingBatchSize": 50,
    "MemoryDecayDays": 30,
    "SignalPollIntervalSeconds": 5,
    "MaxWebSocketConnections": 100
  }
}
```

### Usage via `IOptions<T>`

```csharp
// In services (singleton-safe):
public sealed class EmbeddingWorker(
    IOptions<KontinueOptions> options,
    ILogger<EmbeddingWorker> logger) : BackgroundService
{
    private readonly int _batchSize = options.Value.EmbeddingBatchSize;
}

// In scoped services (supports reloading):
public sealed class SignalService(IOptionsMonitor<KontinueOptions> options)
{
    public int PollInterval => options.CurrentValue.SignalPollIntervalSeconds;
}
```

---

## 10. Error Handling Strategy

### Endpoint Error Pattern

```csharp
// Consistent error responses — never throw from endpoints

// ✅ Return typed error results
group.MapPost("/", async Task<Results<Created<AgentTask>, BadRequest<ErrorResponse>, NotFound>>
    (CreateTaskRequest request, KontinueDbContext db, Guid projectId) =>
{
    if (string.IsNullOrWhiteSpace(request.Title))
        return TypedResults.BadRequest(new ErrorResponse("Title is required"));

    var project = await db.Projects.FindAsync(projectId);
    if (project is null)
        return TypedResults.NotFound();

    var task = new AgentTask { Title = request.Title, ProjectId = projectId };
    db.Tasks.Add(task);
    await db.SaveChangesAsync();

    return TypedResults.Created($"/api/projects/{projectId}/tasks/{task.Id}", task);
});
```

### Global Exception Handler

```csharp
// Program.cs — catch unhandled exceptions
app.UseExceptionHandler(error =>
{
    error.Run(async context =>
    {
        context.Response.StatusCode = 500;
        context.Response.ContentType = "application/json";

        var response = new ErrorResponse(
            "An internal error occurred",
            context.RequestServices.GetRequiredService<IHostEnvironment>().IsDevelopment()
                ? context.Features.Get<IExceptionHandlerFeature>()?.Error.Message
                : null);

        await context.Response.WriteAsJsonAsync(response, KontinueJsonContext.Default.ErrorResponse);
    });
});
```

### No Exception-Driven Flow

```csharp
// ❌ Never: throw for business logic
if (task is null) throw new NotFoundException("Task not found");

// ✅ Always: return result types
if (task is null) return TypedResults.NotFound();
```

---

## 11. Testing Strategy

### Test Project Structure

```
tests/
├── Kontinue.Api.Tests/                  # Integration tests
│   ├── Endpoints/
│   │   ├── TaskEndpointsTests.cs
│   │   ├── DecisionEndpointsTests.cs
│   │   └── ...
│   ├── Auth/
│   │   └── AuthMiddlewareTests.cs
│   └── Fixtures/
│       └── ApiFixture.cs               # WebApplicationFactory + test DB
│
├── Kontinue.Shared.Tests/              # Unit tests
│   ├── Domain/
│   │   └── EntityTests.cs
│   └── Protocol/
│       └── JsonSerializationTests.cs   # Verify source gen produces correct output
│
└── Kontinue.Worker.Tests/              # Worker integration tests
    └── EmbeddingWorkerTests.cs
```

### Test Database Strategy

```csharp
// Use Testcontainers for real PostgreSQL in integration tests
public sealed class ApiFixture : IAsyncLifetime
{
    private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder()
        .WithImage("postgres:17")
        .Build();

    public HttpClient Client { get; private set; } = null!;

    public async Task InitializeAsync()
    {
        await _postgres.StartAsync();

        var factory = new WebApplicationFactory<Program>()
            .WithWebHostBuilder(builder =>
            {
                builder.ConfigureServices(services =>
                {
                    // Replace DB connection with test container
                    services.RemoveAll<DbContextOptions<KontinueDbContext>>();
                    services.AddDbContext<KontinueDbContext>(options =>
                        options.UseNpgsql(_postgres.GetConnectionString()));
                });
            });

        Client = factory.CreateClient();

        // Apply migrations
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<KontinueDbContext>();
        await db.Database.MigrateAsync();
    }

    public async Task DisposeAsync() => await _postgres.DisposeAsync();
}
```

### JSON Source Generator Tests

```csharp
// Verify that source-generated serialization matches expected output
[Fact]
public void AgentTask_RoundTrips_ViaSourceGenerator()
{
    var task = new AgentTask
    {
        Id = Guid.NewGuid(),
        Title = "Test task",
        Status = AgentTaskStatus.InProgress,
    };

    var json = JsonSerializer.Serialize(task, KontinueJsonContext.Default.AgentTask);
    var deserialized = JsonSerializer.Deserialize(json, KontinueJsonContext.Default.AgentTask);

    Assert.Equal(task.Title, deserialized!.Title);
    Assert.Equal("inProgress", JsonDocument.Parse(json).RootElement.GetProperty("status").GetString());
}
```

---

## 12. Performance Guidelines

### Hot Path Checklist

Every request-handling path must satisfy:

| Check | Technique |
|---|---|
| No reflection | JSON source generators, `[LoggerMessage]` |
| No unnecessary allocations | `ReadOnlySpan<T>`, `stackalloc`, value types |
| No repeated query compilation | `EF.CompileAsyncQuery` for frequent queries |
| No unbounded result sets | Always `Take(limit)` on queries, paginate |
| No string concatenation in loops | `StringBuilder` or `string.Create` |
| No blocking async calls | `await` everything, never `.Result` or `.Wait()` |
| No `Task.Run` in request handlers | ASP.NET already runs on thread pool |

### Connection Pooling

```csharp
// PostgreSQL — managed by Npgsql connection pool (Aspire-configured)
// Default: min 0, max 100 connections
// Aspire AddNpgsqlDbContext handles this automatically

// Qdrant — gRPC channel reuse (Aspire-configured singleton)
// No manual connection management needed
```

### Response Compression

```csharp
// Program.cs — compress JSON responses
builder.Services.AddResponseCompression(options =>
{
    options.EnableForHttps = true;
    options.Providers.Add<BrotliCompressionProvider>();
    options.Providers.Add<GzipCompressionProvider>();
    options.MimeTypes = ResponseCompressionDefaults.MimeTypes.Concat(["application/json"]);
});

app.UseResponseCompression();
```

### Cancellation Token Propagation

```csharp
// ✅ Always propagate CancellationToken through the call chain
group.MapGet("/", async (
    KontinueDbContext db,
    Guid projectId,
    CancellationToken ct) =>
{
    var tasks = await db.Tasks
        .Where(t => t.ProjectId == projectId)
        .ToListAsync(ct);  // ← pass ct to every async call

    return TypedResults.Ok(tasks);
});
```

---

## 13. Security Practices

### Input Validation

```csharp
// Validate at the API boundary — trust internal code

// ❌ Validate deep in domain logic
public sealed class AgentTask
{
    private string _title = null!;
    public string Title
    {
        get => _title;
        set => _title = string.IsNullOrWhiteSpace(value)
            ? throw new ArgumentException("Title required")
            : value;
    }
}

// ✅ Validate in endpoint, domain entities are trusted
group.MapPost("/", async Task<Results<Created<AgentTask>, BadRequest<ErrorResponse>>>
    (CreateTaskRequest request, KontinueDbContext db, Guid projectId) =>
{
    if (string.IsNullOrWhiteSpace(request.Title))
        return TypedResults.BadRequest(new ErrorResponse("Title is required"));

    if (request.Title.Length > 500)
        return TypedResults.BadRequest(new ErrorResponse("Title too long"));

    // Entity creation — no validation, already checked
    var task = new AgentTask { Title = request.Title.Trim(), ProjectId = projectId };
    // ...
});
```

### SQL Injection Prevention

```csharp
// EF Core parameterizes all queries automatically.
// For raw SQL, always use parameterized queries:

// ❌ Never: string concatenation
db.Database.ExecuteSqlRaw($"SELECT * FROM tasks WHERE title = '{title}'");

// ✅ Always: parameterized
db.Database.ExecuteSqlInterpolated($"SELECT * FROM tasks WHERE title = {title}");

// ✅ Or EF.Functions for PostgreSQL-specific features
db.MemoryChunks.Where(m =>
    m.SearchVector.Matches(EF.Functions.PlainToTsQuery("english", searchTerm)));
```

### Password Hashing

```csharp
// Use ASP.NET Core Identity's PasswordHasher (PBKDF2 with automatic iteration updates)
var hasher = new PasswordHasher<User>();
user.PasswordHash = hasher.HashPassword(user, password);

// Verify:
var result = hasher.VerifyHashedPassword(user, user.PasswordHash, password);
if (result == PasswordVerificationResult.Failed)
    return TypedResults.BadRequest(new ErrorResponse("Invalid credentials"));
```

### Token Generation

```csharp
// Cryptographically secure random tokens
using var rng = RandomNumberGenerator.Create();
var bytes = new byte[32];
rng.GetBytes(bytes);
var token = $"kns_{Convert.ToBase64String(bytes).Replace("+", "-").Replace("/", "_").TrimEnd('=')}";

// Store hash only — never store raw token
var hash = SHA256.HashData(Encoding.UTF8.GetBytes(token));
session.TokenHash = Convert.ToBase64String(hash);
session.TokenPrefix = token[..12];  // For identification without revealing token
```

---

## 14. Observability and Telemetry

### OpenTelemetry Setup (via ServiceDefaults)

Already configured by Aspire `ServiceDefaults`:
- **Traces**: ASP.NET Core, HTTP client, EF Core (via `Npgsql.OpenTelemetry`)
- **Metrics**: Runtime metrics, ASP.NET Core metrics, custom counters
- **Logs**: Structured logging exported via OTLP

### Custom Metrics (per Worker/Service)

```csharp
// Define metrics at class level
private static readonly Meter Meter = new("Kontinue.Api.Endpoints");
private static readonly Counter<long> TasksCreated = Meter.CreateCounter<long>(
    "kontinue.tasks.created", description: "Total tasks created");
private static readonly Histogram<double> RequestDuration = Meter.CreateHistogram<double>(
    "kontinue.request.duration_ms", unit: "ms");

// Emit in endpoint:
TasksCreated.Add(1, new KeyValuePair<string, object?>("project", projectId.ToString()));
```

### Custom Activity Spans

```csharp
private static readonly ActivitySource ActivitySource = new("Kontinue.Api");

// Wrap significant operations in spans
using var activity = ActivitySource.StartActivity("ProcessEmbeddingBatch");
activity?.SetTag("batch.size", chunks.Count);
activity?.SetTag("project.id", projectId.ToString());
// ... work ...
activity?.SetStatus(ActivityStatusCode.Ok);
```

### Health Checks

```csharp
// Aspire auto-configures health endpoints:
// /health       — aggregated health
// /alive        — liveness probe (is process running?)

// Custom health checks:
builder.Services.AddHealthChecks()
    .AddNpgSql(name: "postgres")
    .AddCheck<QdrantHealthCheck>("qdrant");
```

---

## 15. Database Conventions

### Naming

| Item | Convention | Example |
|---|---|---|
| Tables | PascalCase plural | `Tasks`, `Decisions`, `MemoryChunks` |
| Columns | PascalCase | `ProjectId`, `CreatedAt`, `TokenHash` |
| Indexes | `ix_{table}_{columns}` | `ix_tasks_project_status` |
| Foreign keys | `fk_{table}_{ref}` | Auto-generated by EF |
| Composite keys | Defined in `OnModelCreating` | `HasKey(wm => new { wm.WorkspaceId, wm.UserId })` |

### JSONB Columns

Use for arrays that don't need individual querying:

```csharp
// In entity:
public List<string> Files { get; set; } = [];
public List<string> Tags { get; set; } = [];
public List<string> Alternatives { get; set; } = [];

// EF maps List<string> to jsonb automatically with PrimitiveCollection
// In OnModelCreating if needed:
builder.Entity<Decision>()
    .PrimitiveCollection(d => d.Alternatives)
    .ElementType()
    .HasMaxLength(1000);
```

### Indexes

```csharp
// Always index:
// 1. Foreign keys used in WHERE clauses
// 2. Status columns used in filters
// 3. Composite indexes for common query patterns

builder.Entity<AgentTask>()
    .HasIndex(t => new { t.ProjectId, t.Status })
    .HasDatabaseName("ix_tasks_project_status");

builder.Entity<Signal>()
    .HasIndex(s => new { s.ProjectId, s.Status, s.CreatedAt })
    .HasDatabaseName("ix_signals_pending");
```

### Migration Discipline

| Rule | Rationale |
|---|---|
| One migration per feature/task | Clean history, easy rollback |
| Migration names: `YYYYMMDDHHMMSS_{Description}` | Chronological ordering |
| Never edit a migration after it's been applied | Snapshot drift |
| Data migrations in separate migration from schema migrations | Separation of concerns |
| Always include `Down()` method | Rollback capability |
| Test migrations against a copy of production data | Catch data issues before deploy |

---

## 16. Coding Standards

### File Organization

```csharp
// Order within a file:
// 1. Using statements
// 2. Namespace
// 3. Type declaration
// 4. Constants / static fields
// 5. Instance fields
// 6. Constructors (primary preferred)
// 7. Public methods
// 8. Private methods
// 9. Nested types (e.g., Log class)
```

### Naming

| Item | Convention | Example |
|---|---|---|
| Classes | PascalCase, sealed where possible | `sealed class TaskEndpoints` |
| Interfaces | `I` prefix + PascalCase | `ISearchStrategy` |
| Methods | PascalCase, verb-first | `GetTasksByProject`, `MapTaskEndpoints` |
| Async methods | `*Async` suffix | `SearchAsync`, `SaveChangesAsync` |
| Constants | PascalCase | `MaxBatchSize` |
| Private fields | `_camelCase` | `_connectionManager` |
| Parameters | camelCase | `projectId`, `cancellationToken` |
| DTOs | `{Action}{Entity}Request/Response` | `CreateTaskRequest`, `AuthResponse` |

### Sealed by Default

```csharp
// ✅ All non-abstract classes are sealed
public sealed class ConnectionManager { }
public sealed class HybridSearchService { }
public sealed record ErrorResponse(string Error, string? Detail = null);

// Rationale: sealed classes enable JIT devirtualization optimizations
// and communicate intent ("this is not designed for inheritance")
```

### Primary Constructors

```csharp
// ✅ Prefer primary constructors for DI
public sealed class HybridSearchService(
    KontinueDbContext db,
    QdrantClient qdrant,
    ILogger<HybridSearchService> logger)
{
    public async Task<List<SearchResult>> SearchAsync(string query, Guid projectId)
    {
        logger.LogInformation("Searching for {Query}", query);
        // use db, qdrant directly
    }
}
```

### Record Types for DTOs

```csharp
// ✅ Records for immutable data transfer
public sealed record CreateTaskRequest(string Title, string? Description = null);
public sealed record AuthResponse(string Token, DateTime ExpiresAt);

// ✅ Readonly record struct for small value-type carriers
public readonly record struct SearchHit(Guid Id, float Score);
```

### Nullable Reference Types

```csharp
// Enabled project-wide: <Nullable>enable</Nullable>
// All reference types are non-nullable by default.

// ✅ Mark nullable explicitly
public string? Description { get; set; }      // optional
public required string Title { get; set; }     // required, never null

// ✅ Use 'required' keyword for mandatory properties
public sealed class AgentTask
{
    public required string Title { get; set; }
    public required Guid ProjectId { get; set; }
    public string? Description { get; set; }   // genuinely optional
}
```

---

## Summary: Engineering Checklist

Before merging any backend code, verify:

- [ ] **Serialization**: All new types added to `KontinueJsonContext`
- [ ] **Logging**: All log calls use `[LoggerMessage]` partial methods
- [ ] **Queries**: Frequent queries use `EF.CompileAsyncQuery`
- [ ] **Endpoints**: Return `TypedResults.*` with `Results<>` union types
- [ ] **Validation**: Input validated at endpoint boundary only
- [ ] **Cancellation**: `CancellationToken` propagated through all async chains
- [ ] **Allocations**: No unnecessary allocations in hot paths
- [ ] **Security**: No raw SQL, tokens hashed, secrets not logged
- [ ] **Indexes**: New query patterns have supporting database indexes
- [ ] **Tests**: Integration test with Testcontainers covers the endpoint
- [ ] **Sealed**: New classes are `sealed` unless designed for inheritance
- [ ] **Observability**: Metrics/traces added for significant operations
