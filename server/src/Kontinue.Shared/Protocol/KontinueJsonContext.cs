using System.Text.Json.Serialization;
using Kontinue.Shared.Domain;
using Kontinue.Shared.Protocol;

namespace Kontinue.Shared.Protocol;

[JsonSourceGenerationOptions(
    PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase,
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    WriteIndented = false)]
[JsonSerializable(typeof(ServerEvent))]
[JsonSerializable(typeof(TaskCreatedEvent))]
[JsonSerializable(typeof(TaskUpdatedEvent))]
[JsonSerializable(typeof(TaskStatusChangedEvent))]
[JsonSerializable(typeof(TaskDeletedEvent))]
[JsonSerializable(typeof(DecisionLoggedEvent))]
[JsonSerializable(typeof(DecisionSupersededEvent))]
[JsonSerializable(typeof(DecisionArchivedEvent))]
[JsonSerializable(typeof(ObservationAddedEvent))]
[JsonSerializable(typeof(ObservationResolvedEvent))]
[JsonSerializable(typeof(SignalCreatedEvent))]
[JsonSerializable(typeof(SignalAcknowledgedEvent))]
[JsonSerializable(typeof(PlanCreatedEvent))]
[JsonSerializable(typeof(PlanStatusChangedEvent))]
[JsonSerializable(typeof(PlanStepUpdatedEvent))]
[JsonSerializable(typeof(SessionStartedEvent))]
[JsonSerializable(typeof(SessionEndedEvent))]
[JsonSerializable(typeof(CheckpointCreatedEvent))]
[JsonSerializable(typeof(HandoffCreatedEvent))]
[JsonSerializable(typeof(QuestionAskedEvent))]
[JsonSerializable(typeof(QuestionAnsweredEvent))]
[JsonSerializable(typeof(MemoryChunkUpsertedEvent))]
[JsonSerializable(typeof(StateFullEvent))]
public partial class KontinueJsonContext : JsonSerializerContext;
