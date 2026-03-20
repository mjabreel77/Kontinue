using System.Buffers;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Threading.Channels;
using Kontinue.Shared.Protocol;

namespace Kontinue.Api.WebSockets;

public sealed class ClientConnection : IAsyncDisposable
{
    private readonly WebSocket _socket;
    private readonly Channel<byte[]> _outbound;
    private readonly CancellationTokenSource _cts = new();
    private readonly ILogger _logger;

    public Guid ConnectionId { get; } = Guid.NewGuid();
    public Guid? ProjectId { get; set; }
    public DateTime ConnectedAt { get; } = DateTime.UtcNow;

    public ClientConnection(WebSocket socket, ILogger logger, int boundedCapacity = 256)
    {
        _socket = socket;
        _logger = logger;
        _outbound = Channel.CreateBounded<byte[]>(new BoundedChannelOptions(boundedCapacity)
        {
            FullMode = BoundedChannelFullMode.DropOldest,
            SingleReader = true,
            SingleWriter = false
        });
    }

    public async Task RunAsync(Func<ClientConnection, string, Task> onMessage)
    {
        var writeTask = WriteLoopAsync(_cts.Token);
        var readTask = ReadLoopAsync(onMessage, _cts.Token);

        await Task.WhenAny(readTask, writeTask);
        await _cts.CancelAsync();

        try { await Task.WhenAll(readTask, writeTask); }
        catch (OperationCanceledException) { }
        catch (WebSocketException) { }
    }

    public bool TrySend(object message)
    {
        var json = JsonSerializer.SerializeToUtf8Bytes(message, JsonConfig.Options);
        return _outbound.Writer.TryWrite(json);
    }

    public bool TrySendRaw(byte[] data) => _outbound.Writer.TryWrite(data);

    private async Task ReadLoopAsync(Func<ClientConnection, string, Task> onMessage, CancellationToken ct)
    {
        var buffer = ArrayPool<byte>.Shared.Rent(4096);
        try
        {
            while (!ct.IsCancellationRequested && _socket.State == WebSocketState.Open)
            {
                using var ms = new MemoryStream();
                ValueWebSocketReceiveResult result;

                do
                {
                    result = await _socket.ReceiveAsync(buffer.AsMemory(), ct);
                    if (result.MessageType == WebSocketMessageType.Close)
                        return;

                    ms.Write(buffer, 0, result.Count);
                } while (!result.EndOfMessage);

                if (result.MessageType == WebSocketMessageType.Text && ms.Length > 0)
                {
                    var text = Encoding.UTF8.GetString(ms.GetBuffer(), 0, (int)ms.Length);
                    await onMessage(this, text);
                }
            }
        }
        catch (WebSocketException ex)
        {
            _logger.LogDebug(ex, "WebSocket read ended for {ConnectionId}", ConnectionId);
        }
        finally
        {
            ArrayPool<byte>.Shared.Return(buffer);
        }
    }

    private async Task WriteLoopAsync(CancellationToken ct)
    {
        await foreach (var data in _outbound.Reader.ReadAllAsync(ct))
        {
            if (_socket.State != WebSocketState.Open)
                break;

            try
            {
                await _socket.SendAsync(data.AsMemory(), WebSocketMessageType.Text, true, ct);
            }
            catch (WebSocketException)
            {
                break;
            }
        }
    }

    public async ValueTask DisposeAsync()
    {
        await _cts.CancelAsync();
        _outbound.Writer.TryComplete();

        if (_socket.State is WebSocketState.Open or WebSocketState.CloseReceived)
        {
            try
            {
                using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(2));
                await _socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Connection closed", timeout.Token);
            }
            catch { }
        }

        _socket.Dispose();
        _cts.Dispose();
    }
}
