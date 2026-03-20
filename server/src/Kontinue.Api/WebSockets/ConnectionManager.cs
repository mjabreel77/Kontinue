using System.Collections.Concurrent;
using System.Text.Json;
using Kontinue.Shared.Protocol;

namespace Kontinue.Api.WebSockets;

public sealed class ConnectionManager
{
    private readonly ConcurrentDictionary<Guid, ClientConnection> _connections = new();
    private readonly ILogger<ConnectionManager> _logger;

    public ConnectionManager(ILogger<ConnectionManager> logger) => _logger = logger;

    public int ConnectionCount => _connections.Count;

    public void Add(ClientConnection connection)
    {
        _connections[connection.ConnectionId] = connection;
        _logger.LogInformation("WebSocket connected: {ConnectionId}", connection.ConnectionId);
    }

    public async Task RemoveAsync(ClientConnection connection)
    {
        if (_connections.TryRemove(connection.ConnectionId, out _))
        {
            _logger.LogInformation("WebSocket disconnected: {ConnectionId}", connection.ConnectionId);
            await connection.DisposeAsync();
        }
    }

    public void BroadcastToProject(Guid projectId, ServerEvent message)
    {
        var json = JsonSerializer.SerializeToUtf8Bytes<ServerEvent>(message, JsonConfig.Options);

        foreach (var conn in _connections.Values)
        {
            if (conn.ProjectId == projectId)
                conn.TrySendRaw(json);
        }
    }

    public void BroadcastToAll(ServerEvent message)
    {
        var json = JsonSerializer.SerializeToUtf8Bytes<ServerEvent>(message, JsonConfig.Options);

        foreach (var conn in _connections.Values)
            conn.TrySendRaw(json);
    }

    public IEnumerable<ClientConnection> GetProjectConnections(Guid projectId) =>
        _connections.Values.Where(c => c.ProjectId == projectId);
}
