var builder = DistributedApplication.CreateBuilder(args);

var postgres = builder.AddPostgres("postgres")
    .WithPgAdmin()
    .WithLifetime(ContainerLifetime.Persistent);

var kontinueDb = postgres.AddDatabase("kontinuedb");

var qdrant = builder.AddQdrant("qdrant")
    .WithLifetime(ContainerLifetime.Persistent);

var migrations = builder.AddProject<Projects.Kontinue_MigrationService>("migrations")
    .WithReference(kontinueDb)
    .WaitFor(kontinueDb);

var api = builder.AddProject<Projects.Kontinue_Api>("api")
    .WithReference(kontinueDb)
    .WithReference(qdrant)
    .WaitFor(migrations)
    .WaitFor(qdrant)
    .WithExternalHttpEndpoints();

builder.AddProject<Projects.Kontinue_Worker>("worker")
    .WithReference(kontinueDb)
    .WithReference(qdrant)
    .WaitFor(migrations)
    .WaitFor(qdrant);

builder.AddViteApp("dashboard", "../../../dashboard")
    .WithNpm()
    .WithReference(api)
    .WithEnvironment("VITE_API_URL", api.GetEndpoint("https"))
    //.WithHttpEndpoint(port: 5173, env: "PORT")
    .WithExternalHttpEndpoints();

builder.Build().Run();
