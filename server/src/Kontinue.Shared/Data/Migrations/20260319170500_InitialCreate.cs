using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Kontinue.Shared.Data.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "kontinue");

            migrationBuilder.CreateTable(
                name: "Users",
                schema: "kontinue",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Email = table.Column<string>(type: "text", nullable: false),
                    DisplayName = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Users", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Workspaces",
                schema: "kontinue",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false),
                    Slug = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Workspaces", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Projects",
                schema: "kontinue",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false),
                    Path = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Projects", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Projects_Workspaces_WorkspaceId",
                        column: x => x.WorkspaceId,
                        principalSchema: "kontinue",
                        principalTable: "Workspaces",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "WorkspaceMembers",
                schema: "kontinue",
                columns: table => new
                {
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Role = table.Column<string>(type: "varchar(50)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WorkspaceMembers", x => new { x.WorkspaceId, x.UserId });
                    table.ForeignKey(
                        name: "FK_WorkspaceMembers_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "kontinue",
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_WorkspaceMembers_Workspaces_WorkspaceId",
                        column: x => x.WorkspaceId,
                        principalSchema: "kontinue",
                        principalTable: "Workspaces",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Plans",
                schema: "kontinue",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ProjectId = table.Column<Guid>(type: "uuid", nullable: false),
                    Title = table.Column<string>(type: "text", nullable: false),
                    Goal = table.Column<string>(type: "text", nullable: true),
                    Status = table.Column<string>(type: "varchar(50)", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Plans", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Plans_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalSchema: "kontinue",
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Sessions",
                schema: "kontinue",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ProjectId = table.Column<Guid>(type: "uuid", nullable: false),
                    StartedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    EndedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ToolCalls = table.Column<int>(type: "integer", nullable: false),
                    Status = table.Column<string>(type: "varchar(50)", nullable: false),
                    Branch = table.Column<string>(type: "text", nullable: true),
                    StartCommit = table.Column<string>(type: "text", nullable: true),
                    EndCommit = table.Column<string>(type: "text", nullable: true),
                    ContextReadAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    FilesTouched = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Sessions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Sessions_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalSchema: "kontinue",
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Signals",
                schema: "kontinue",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ProjectId = table.Column<Guid>(type: "uuid", nullable: false),
                    Type = table.Column<string>(type: "varchar(50)", nullable: false),
                    Content = table.Column<string>(type: "text", nullable: false),
                    Source = table.Column<string>(type: "varchar(50)", nullable: false),
                    Status = table.Column<string>(type: "varchar(50)", nullable: false),
                    AgentResponse = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    DeliveredAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    AcknowledgedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Signals", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Signals_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalSchema: "kontinue",
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "TaskTemplates",
                schema: "kontinue",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ProjectId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false),
                    Description = table.Column<string>(type: "text", nullable: true),
                    DefaultItems = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TaskTemplates", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TaskTemplates_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalSchema: "kontinue",
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PlanSteps",
                schema: "kontinue",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PlanId = table.Column<Guid>(type: "uuid", nullable: false),
                    Content = table.Column<string>(type: "text", nullable: false),
                    Status = table.Column<string>(type: "varchar(50)", nullable: false),
                    Position = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PlanSteps", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PlanSteps_Plans_PlanId",
                        column: x => x.PlanId,
                        principalSchema: "kontinue",
                        principalTable: "Plans",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Checkpoints",
                schema: "kontinue",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ProjectId = table.Column<Guid>(type: "uuid", nullable: false),
                    SessionId = table.Column<Guid>(type: "uuid", nullable: false),
                    TaskId = table.Column<Guid>(type: "uuid", nullable: true),
                    Progress = table.Column<string>(type: "text", nullable: false),
                    NextStep = table.Column<string>(type: "text", nullable: true),
                    FilesActive = table.Column<string>(type: "text", nullable: true),
                    GitCommit = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Checkpoints", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Checkpoints_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalSchema: "kontinue",
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_Checkpoints_Sessions_SessionId",
                        column: x => x.SessionId,
                        principalSchema: "kontinue",
                        principalTable: "Sessions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Decisions",
                schema: "kontinue",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ProjectId = table.Column<Guid>(type: "uuid", nullable: false),
                    SessionId = table.Column<Guid>(type: "uuid", nullable: true),
                    TaskId = table.Column<Guid>(type: "uuid", nullable: true),
                    Summary = table.Column<string>(type: "text", nullable: false),
                    Rationale = table.Column<string>(type: "text", nullable: true),
                    Alternatives = table.Column<string>(type: "text", nullable: true),
                    Context = table.Column<string>(type: "text", nullable: true),
                    Files = table.Column<string>(type: "text", nullable: true),
                    Tags = table.Column<string>(type: "text", nullable: true),
                    Confidence = table.Column<string>(type: "varchar(50)", nullable: false),
                    Status = table.Column<string>(type: "varchar(50)", nullable: false),
                    SupersededById = table.Column<Guid>(type: "uuid", nullable: true),
                    Scope = table.Column<string>(type: "varchar(50)", nullable: false),
                    Branch = table.Column<string>(type: "text", nullable: true),
                    GitCommit = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Decisions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Decisions_Decisions_SupersededById",
                        column: x => x.SupersededById,
                        principalSchema: "kontinue",
                        principalTable: "Decisions",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_Decisions_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalSchema: "kontinue",
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_Decisions_Sessions_SessionId",
                        column: x => x.SessionId,
                        principalSchema: "kontinue",
                        principalTable: "Sessions",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "Handoffs",
                schema: "kontinue",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ProjectId = table.Column<Guid>(type: "uuid", nullable: false),
                    SessionId = table.Column<Guid>(type: "uuid", nullable: false),
                    Summary = table.Column<string>(type: "text", nullable: false),
                    Blockers = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Handoffs", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Handoffs_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalSchema: "kontinue",
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_Handoffs_Sessions_SessionId",
                        column: x => x.SessionId,
                        principalSchema: "kontinue",
                        principalTable: "Sessions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "MemoryChunks",
                schema: "kontinue",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ProjectId = table.Column<Guid>(type: "uuid", nullable: false),
                    SessionId = table.Column<Guid>(type: "uuid", nullable: true),
                    Type = table.Column<string>(type: "text", nullable: false),
                    SourceId = table.Column<Guid>(type: "uuid", nullable: true),
                    Content = table.Column<string>(type: "text", nullable: false),
                    DecayExempt = table.Column<bool>(type: "boolean", nullable: false),
                    StaleAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MemoryChunks", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MemoryChunks_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalSchema: "kontinue",
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_MemoryChunks_Sessions_SessionId",
                        column: x => x.SessionId,
                        principalSchema: "kontinue",
                        principalTable: "Sessions",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "tasks",
                schema: "kontinue",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ProjectId = table.Column<Guid>(type: "uuid", nullable: false),
                    SessionId = table.Column<Guid>(type: "uuid", nullable: true),
                    Title = table.Column<string>(type: "text", nullable: false),
                    Description = table.Column<string>(type: "text", nullable: true),
                    Status = table.Column<string>(type: "varchar(50)", nullable: false),
                    Outcome = table.Column<string>(type: "text", nullable: true),
                    Notes = table.Column<string>(type: "text", nullable: true),
                    Branch = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    StartedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    EndedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_tasks", x => x.Id);
                    table.ForeignKey(
                        name: "FK_tasks_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalSchema: "kontinue",
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_tasks_Sessions_SessionId",
                        column: x => x.SessionId,
                        principalSchema: "kontinue",
                        principalTable: "Sessions",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "ExternalLinks",
                schema: "kontinue",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TaskId = table.Column<Guid>(type: "uuid", nullable: false),
                    Provider = table.Column<string>(type: "text", nullable: false),
                    ExternalId = table.Column<string>(type: "text", nullable: false),
                    ExternalUrl = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ExternalLinks", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ExternalLinks_tasks_TaskId",
                        column: x => x.TaskId,
                        principalSchema: "kontinue",
                        principalTable: "tasks",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Observations",
                schema: "kontinue",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ProjectId = table.Column<Guid>(type: "uuid", nullable: false),
                    SessionId = table.Column<Guid>(type: "uuid", nullable: true),
                    TaskId = table.Column<Guid>(type: "uuid", nullable: true),
                    Content = table.Column<string>(type: "text", nullable: false),
                    Files = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ResolvedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Observations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Observations_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalSchema: "kontinue",
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_Observations_Sessions_SessionId",
                        column: x => x.SessionId,
                        principalSchema: "kontinue",
                        principalTable: "Sessions",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_Observations_tasks_TaskId",
                        column: x => x.TaskId,
                        principalSchema: "kontinue",
                        principalTable: "tasks",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "Questions",
                schema: "kontinue",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ProjectId = table.Column<Guid>(type: "uuid", nullable: false),
                    SessionId = table.Column<Guid>(type: "uuid", nullable: true),
                    TaskId = table.Column<Guid>(type: "uuid", nullable: true),
                    Text = table.Column<string>(type: "text", nullable: false),
                    Answer = table.Column<string>(type: "text", nullable: true),
                    ResolvedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Questions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Questions_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalSchema: "kontinue",
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_Questions_Sessions_SessionId",
                        column: x => x.SessionId,
                        principalSchema: "kontinue",
                        principalTable: "Sessions",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_Questions_tasks_TaskId",
                        column: x => x.TaskId,
                        principalSchema: "kontinue",
                        principalTable: "tasks",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "TaskDependencies",
                schema: "kontinue",
                columns: table => new
                {
                    TaskId = table.Column<Guid>(type: "uuid", nullable: false),
                    BlockedByTaskId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TaskDependencies", x => new { x.TaskId, x.BlockedByTaskId });
                    table.ForeignKey(
                        name: "FK_TaskDependencies_tasks_BlockedByTaskId",
                        column: x => x.BlockedByTaskId,
                        principalSchema: "kontinue",
                        principalTable: "tasks",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_TaskDependencies_tasks_TaskId",
                        column: x => x.TaskId,
                        principalSchema: "kontinue",
                        principalTable: "tasks",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "TaskItems",
                schema: "kontinue",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TaskId = table.Column<Guid>(type: "uuid", nullable: false),
                    Content = table.Column<string>(type: "text", nullable: false),
                    Done = table.Column<bool>(type: "boolean", nullable: false),
                    Position = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TaskItems", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TaskItems_tasks_TaskId",
                        column: x => x.TaskId,
                        principalSchema: "kontinue",
                        principalTable: "tasks",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_checkpoints_project_created",
                schema: "kontinue",
                table: "Checkpoints",
                columns: new[] { "ProjectId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "ix_checkpoints_session",
                schema: "kontinue",
                table: "Checkpoints",
                column: "SessionId");

            migrationBuilder.CreateIndex(
                name: "ix_decisions_project",
                schema: "kontinue",
                table: "Decisions",
                column: "ProjectId");

            migrationBuilder.CreateIndex(
                name: "IX_Decisions_SessionId",
                schema: "kontinue",
                table: "Decisions",
                column: "SessionId");

            migrationBuilder.CreateIndex(
                name: "IX_Decisions_SupersededById",
                schema: "kontinue",
                table: "Decisions",
                column: "SupersededById");

            migrationBuilder.CreateIndex(
                name: "ix_external_links_task",
                schema: "kontinue",
                table: "ExternalLinks",
                column: "TaskId");

            migrationBuilder.CreateIndex(
                name: "IX_Handoffs_ProjectId",
                schema: "kontinue",
                table: "Handoffs",
                column: "ProjectId");

            migrationBuilder.CreateIndex(
                name: "IX_Handoffs_SessionId",
                schema: "kontinue",
                table: "Handoffs",
                column: "SessionId");

            migrationBuilder.CreateIndex(
                name: "ix_memory_chunks_project",
                schema: "kontinue",
                table: "MemoryChunks",
                column: "ProjectId");

            migrationBuilder.CreateIndex(
                name: "ix_memory_chunks_source",
                schema: "kontinue",
                table: "MemoryChunks",
                columns: new[] { "ProjectId", "Type", "SourceId" },
                unique: true,
                filter: "\"SourceId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_MemoryChunks_SessionId",
                schema: "kontinue",
                table: "MemoryChunks",
                column: "SessionId");

            migrationBuilder.CreateIndex(
                name: "IX_Observations_ProjectId",
                schema: "kontinue",
                table: "Observations",
                column: "ProjectId");

            migrationBuilder.CreateIndex(
                name: "IX_Observations_SessionId",
                schema: "kontinue",
                table: "Observations",
                column: "SessionId");

            migrationBuilder.CreateIndex(
                name: "IX_Observations_TaskId",
                schema: "kontinue",
                table: "Observations",
                column: "TaskId");

            migrationBuilder.CreateIndex(
                name: "ix_plans_project_status",
                schema: "kontinue",
                table: "Plans",
                columns: new[] { "ProjectId", "Status" });

            migrationBuilder.CreateIndex(
                name: "ix_plan_steps_plan_position",
                schema: "kontinue",
                table: "PlanSteps",
                columns: new[] { "PlanId", "Position" });

            migrationBuilder.CreateIndex(
                name: "IX_Projects_WorkspaceId",
                schema: "kontinue",
                table: "Projects",
                column: "WorkspaceId");

            migrationBuilder.CreateIndex(
                name: "ix_questions_project_resolved",
                schema: "kontinue",
                table: "Questions",
                columns: new[] { "ProjectId", "ResolvedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_Questions_SessionId",
                schema: "kontinue",
                table: "Questions",
                column: "SessionId");

            migrationBuilder.CreateIndex(
                name: "IX_Questions_TaskId",
                schema: "kontinue",
                table: "Questions",
                column: "TaskId");

            migrationBuilder.CreateIndex(
                name: "ix_sessions_project",
                schema: "kontinue",
                table: "Sessions",
                column: "ProjectId");

            migrationBuilder.CreateIndex(
                name: "ix_signals_pending",
                schema: "kontinue",
                table: "Signals",
                columns: new[] { "ProjectId", "Status", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_TaskDependencies_BlockedByTaskId",
                schema: "kontinue",
                table: "TaskDependencies",
                column: "BlockedByTaskId");

            migrationBuilder.CreateIndex(
                name: "IX_TaskItems_TaskId",
                schema: "kontinue",
                table: "TaskItems",
                column: "TaskId");

            migrationBuilder.CreateIndex(
                name: "ix_tasks_project_status",
                schema: "kontinue",
                table: "tasks",
                columns: new[] { "ProjectId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_tasks_SessionId",
                schema: "kontinue",
                table: "tasks",
                column: "SessionId");

            migrationBuilder.CreateIndex(
                name: "IX_TaskTemplates_ProjectId_Name",
                schema: "kontinue",
                table: "TaskTemplates",
                columns: new[] { "ProjectId", "Name" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Users_Email",
                schema: "kontinue",
                table: "Users",
                column: "Email",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_WorkspaceMembers_UserId",
                schema: "kontinue",
                table: "WorkspaceMembers",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_Workspaces_Slug",
                schema: "kontinue",
                table: "Workspaces",
                column: "Slug",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Checkpoints",
                schema: "kontinue");

            migrationBuilder.DropTable(
                name: "Decisions",
                schema: "kontinue");

            migrationBuilder.DropTable(
                name: "ExternalLinks",
                schema: "kontinue");

            migrationBuilder.DropTable(
                name: "Handoffs",
                schema: "kontinue");

            migrationBuilder.DropTable(
                name: "MemoryChunks",
                schema: "kontinue");

            migrationBuilder.DropTable(
                name: "Observations",
                schema: "kontinue");

            migrationBuilder.DropTable(
                name: "PlanSteps",
                schema: "kontinue");

            migrationBuilder.DropTable(
                name: "Questions",
                schema: "kontinue");

            migrationBuilder.DropTable(
                name: "Signals",
                schema: "kontinue");

            migrationBuilder.DropTable(
                name: "TaskDependencies",
                schema: "kontinue");

            migrationBuilder.DropTable(
                name: "TaskItems",
                schema: "kontinue");

            migrationBuilder.DropTable(
                name: "TaskTemplates",
                schema: "kontinue");

            migrationBuilder.DropTable(
                name: "WorkspaceMembers",
                schema: "kontinue");

            migrationBuilder.DropTable(
                name: "Plans",
                schema: "kontinue");

            migrationBuilder.DropTable(
                name: "tasks",
                schema: "kontinue");

            migrationBuilder.DropTable(
                name: "Users",
                schema: "kontinue");

            migrationBuilder.DropTable(
                name: "Sessions",
                schema: "kontinue");

            migrationBuilder.DropTable(
                name: "Projects",
                schema: "kontinue");

            migrationBuilder.DropTable(
                name: "Workspaces",
                schema: "kontinue");
        }
    }
}
