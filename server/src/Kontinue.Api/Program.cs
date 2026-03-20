using System.Text.Json;
using System.Text.Json.Serialization;
using Kontinue.Api.Auth;
using Kontinue.Api.Endpoints;
using Kontinue.Api.Search;
using Kontinue.Api.WebSockets;
using Kontinue.Shared.Data;

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();
builder.AddNpgsqlDbContext<KontinueDbContext>("kontinuedb");
builder.AddQdrantClient("qdrant");

builder.Services.AddSingleton<ConnectionManager>();
builder.Services.AddScoped<HybridSearchService>();

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
        policy.SetIsOriginAllowed(_ => true).AllowAnyMethod().AllowAnyHeader().AllowCredentials());
});

builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
    options.SerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.CamelCase));
});

var app = builder.Build();

app.MapDefaultEndpoints();
app.UseCors();
app.UseWebSockets();
app.UseMiddleware<ApiKeyAuthMiddleware>();

app.MapGet("/", () => Results.Ok(new { service = "Kontinue.Api", status = "running" }));

app.MapAuthEndpoints();
app.MapWorkspaceEndpoints();
app.MapProjectEndpoints();
app.MapSessionEndpoints();
app.MapTaskEndpoints();
app.MapDecisionEndpoints();
app.MapObservationEndpoints();
app.MapSignalEndpoints();
app.MapPlanEndpoints();
app.MapMemoryEndpoints();
app.MapCheckpointEndpoints();
app.MapHandoffEndpoints();
app.MapQuestionEndpoints();
app.MapApiKeyEndpoints();
app.MapWebSocketEndpoints();

app.Run();
