using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Kontinue.Shared.Data.Migrations
{
    /// <inheritdoc />
    public partial class UserAuth : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // 0. Make List<string> jsonb columns non-nullable (were nullable string, now required List<string>)
            migrationBuilder.AlterColumn<string>(
                name: "DefaultItems", schema: "kontinue", table: "TaskTemplates",
                type: "jsonb", nullable: false, defaultValue: "[]",
                oldClrType: typeof(string), oldType: "jsonb", oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "FilesTouched", schema: "kontinue", table: "Sessions",
                type: "jsonb", nullable: false, defaultValue: "[]",
                oldClrType: typeof(string), oldType: "jsonb", oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "Files", schema: "kontinue", table: "Observations",
                type: "jsonb", nullable: false, defaultValue: "[]",
                oldClrType: typeof(string), oldType: "jsonb", oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "Blockers", schema: "kontinue", table: "Handoffs",
                type: "jsonb", nullable: false, defaultValue: "[]",
                oldClrType: typeof(string), oldType: "jsonb", oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "Tags", schema: "kontinue", table: "Decisions",
                type: "jsonb", nullable: false, defaultValue: "[]",
                oldClrType: typeof(string), oldType: "jsonb", oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "Files", schema: "kontinue", table: "Decisions",
                type: "jsonb", nullable: false, defaultValue: "[]",
                oldClrType: typeof(string), oldType: "jsonb", oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "Alternatives", schema: "kontinue", table: "Decisions",
                type: "jsonb", nullable: false, defaultValue: "[]",
                oldClrType: typeof(string), oldType: "jsonb", oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "FilesActive", schema: "kontinue", table: "Checkpoints",
                type: "jsonb", nullable: false, defaultValue: "[]",
                oldClrType: typeof(string), oldType: "jsonb", oldNullable: true);

            // 1. Add PasswordHash to Users (default empty string for existing rows, then make required)
            migrationBuilder.AddColumn<string>(
                name: "PasswordHash",
                schema: "kontinue",
                table: "Users",
                type: "text",
                nullable: false,
                defaultValue: "");

            // 2. Create UserSessions table
            migrationBuilder.CreateTable(
                name: "UserSessions",
                schema: "kontinue",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    TokenHash = table.Column<string>(type: "text", nullable: false),
                    TokenPrefix = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ExpiresAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    RevokedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserSessions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_UserSessions_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "kontinue",
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_user_sessions_prefix",
                schema: "kontinue",
                table: "UserSessions",
                column: "TokenPrefix");

            migrationBuilder.CreateIndex(
                name: "ix_user_sessions_user_active",
                schema: "kontinue",
                table: "UserSessions",
                columns: new[] { "UserId", "RevokedAt" });

            // 3. Create ApiKeyGrants table
            migrationBuilder.CreateTable(
                name: "ApiKeyGrants",
                schema: "kontinue",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ApiKeyId = table.Column<Guid>(type: "uuid", nullable: false),
                    ProjectId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ApiKeyGrants", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ApiKeyGrants_ApiKeys_ApiKeyId",
                        column: x => x.ApiKeyId,
                        principalSchema: "kontinue",
                        principalTable: "ApiKeys",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ApiKeyGrants_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalSchema: "kontinue",
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ApiKeyGrants_ApiKeyId_ProjectId",
                schema: "kontinue",
                table: "ApiKeyGrants",
                columns: new[] { "ApiKeyId", "ProjectId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ApiKeyGrants_ProjectId",
                schema: "kontinue",
                table: "ApiKeyGrants",
                column: "ProjectId");

            // 4. Migrate ApiKeys: add UserId column first (nullable for migration)
            migrationBuilder.AddColumn<Guid>(
                name: "UserId",
                schema: "kontinue",
                table: "ApiKeys",
                type: "uuid",
                nullable: true);

            // Migrate existing data: create grants for existing keys, assign keys to workspace owner
            migrationBuilder.Sql("""
                -- For each existing API key, create an ApiKeyGrant linking it to its current ProjectId
                INSERT INTO kontinue."ApiKeyGrants" ("Id", "ApiKeyId", "ProjectId", "CreatedAt")
                SELECT gen_random_uuid(), ak."Id", ak."ProjectId", ak."CreatedAt"
                FROM kontinue."ApiKeys" ak
                WHERE ak."ProjectId" IS NOT NULL;

                -- Assign existing API keys to the first workspace member of the project's workspace
                UPDATE kontinue."ApiKeys" ak
                SET "UserId" = wm."UserId"
                FROM kontinue."Projects" p
                JOIN kontinue."WorkspaceMembers" wm ON wm."WorkspaceId" = p."WorkspaceId"
                WHERE p."Id" = ak."ProjectId"
                  AND wm."UserId" = (
                      SELECT wm2."UserId"
                      FROM kontinue."WorkspaceMembers" wm2
                      WHERE wm2."WorkspaceId" = p."WorkspaceId"
                      ORDER BY wm2."UserId"
                      LIMIT 1
                  );

                -- Delete any API keys that couldn't be assigned (orphaned)
                DELETE FROM kontinue."ApiKeys" WHERE "UserId" IS NULL;
            """);

            // Make UserId non-nullable
            migrationBuilder.AlterColumn<Guid>(
                name: "UserId",
                schema: "kontinue",
                table: "ApiKeys",
                type: "uuid",
                nullable: false,
                oldClrType: typeof(Guid),
                oldType: "uuid",
                oldNullable: true);

            // Drop the old ProjectId FK, index, and column
            migrationBuilder.DropForeignKey(
                name: "FK_ApiKeys_Projects_ProjectId",
                schema: "kontinue",
                table: "ApiKeys");

            migrationBuilder.DropIndex(
                name: "ix_api_keys_project",
                schema: "kontinue",
                table: "ApiKeys");

            migrationBuilder.DropColumn(
                name: "ProjectId",
                schema: "kontinue",
                table: "ApiKeys");

            // Create index and FK on UserId
            migrationBuilder.CreateIndex(
                name: "ix_api_keys_user",
                schema: "kontinue",
                table: "ApiKeys",
                column: "UserId");

            migrationBuilder.AddForeignKey(
                name: "FK_ApiKeys_Users_UserId",
                schema: "kontinue",
                table: "ApiKeys",
                column: "UserId",
                principalSchema: "kontinue",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Drop UserSessions
            migrationBuilder.DropTable(
                name: "UserSessions",
                schema: "kontinue");

            // Drop ApiKeyGrants
            migrationBuilder.DropTable(
                name: "ApiKeyGrants",
                schema: "kontinue");

            // Restore ApiKeys.ProjectId
            migrationBuilder.DropForeignKey(
                name: "FK_ApiKeys_Users_UserId",
                schema: "kontinue",
                table: "ApiKeys");

            migrationBuilder.DropIndex(
                name: "ix_api_keys_user",
                schema: "kontinue",
                table: "ApiKeys");

            migrationBuilder.DropColumn(
                name: "UserId",
                schema: "kontinue",
                table: "ApiKeys");

            migrationBuilder.AddColumn<Guid>(
                name: "ProjectId",
                schema: "kontinue",
                table: "ApiKeys",
                type: "uuid",
                nullable: false);

            migrationBuilder.CreateIndex(
                name: "ix_api_keys_project",
                schema: "kontinue",
                table: "ApiKeys",
                column: "ProjectId");

            migrationBuilder.AddForeignKey(
                name: "FK_ApiKeys_Projects_ProjectId",
                schema: "kontinue",
                table: "ApiKeys",
                column: "ProjectId",
                principalSchema: "kontinue",
                principalTable: "Projects",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            // Drop PasswordHash from Users
            migrationBuilder.DropColumn(
                name: "PasswordHash",
                schema: "kontinue",
                table: "Users");

            // Revert jsonb columns back to nullable
            migrationBuilder.AlterColumn<string>(
                name: "DefaultItems", schema: "kontinue", table: "TaskTemplates",
                type: "jsonb", nullable: true,
                oldClrType: typeof(string), oldType: "jsonb");

            migrationBuilder.AlterColumn<string>(
                name: "FilesTouched", schema: "kontinue", table: "Sessions",
                type: "jsonb", nullable: true,
                oldClrType: typeof(string), oldType: "jsonb");

            migrationBuilder.AlterColumn<string>(
                name: "Files", schema: "kontinue", table: "Observations",
                type: "jsonb", nullable: true,
                oldClrType: typeof(string), oldType: "jsonb");

            migrationBuilder.AlterColumn<string>(
                name: "Blockers", schema: "kontinue", table: "Handoffs",
                type: "jsonb", nullable: true,
                oldClrType: typeof(string), oldType: "jsonb");

            migrationBuilder.AlterColumn<string>(
                name: "Tags", schema: "kontinue", table: "Decisions",
                type: "jsonb", nullable: true,
                oldClrType: typeof(string), oldType: "jsonb");

            migrationBuilder.AlterColumn<string>(
                name: "Files", schema: "kontinue", table: "Decisions",
                type: "jsonb", nullable: true,
                oldClrType: typeof(string), oldType: "jsonb");

            migrationBuilder.AlterColumn<string>(
                name: "Alternatives", schema: "kontinue", table: "Decisions",
                type: "jsonb", nullable: true,
                oldClrType: typeof(string), oldType: "jsonb");

            migrationBuilder.AlterColumn<string>(
                name: "FilesActive", schema: "kontinue", table: "Checkpoints",
                type: "jsonb", nullable: true,
                oldClrType: typeof(string), oldType: "jsonb");
        }
    }
}
