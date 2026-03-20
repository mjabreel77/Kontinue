using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Kontinue.Shared.Data.Migrations
{
    /// <inheritdoc />
    public partial class FixJsonbData : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Convert existing non-JSON-array values in jsonb columns to proper JSON arrays.
            // Old data may be NULL or a bare string — EF Core 10 now expects valid JSON arrays.
            migrationBuilder.Sql("""
                -- TaskTemplates.DefaultItems
                UPDATE kontinue."TaskTemplates" SET "DefaultItems" = '[]' WHERE "DefaultItems" IS NULL OR "DefaultItems" = '';
                UPDATE kontinue."TaskTemplates" SET "DefaultItems" = '["' || replace(replace("DefaultItems", '\', '\\'), '"', '\"') || '"]'
                    WHERE "DefaultItems" IS NOT NULL AND "DefaultItems" != '[]' AND LEFT("DefaultItems", 1) != '[';

                -- Sessions.FilesTouched
                UPDATE kontinue."Sessions" SET "FilesTouched" = '[]' WHERE "FilesTouched" IS NULL OR "FilesTouched" = '';
                UPDATE kontinue."Sessions" SET "FilesTouched" = '["' || replace(replace("FilesTouched", '\', '\\'), '"', '\"') || '"]'
                    WHERE "FilesTouched" IS NOT NULL AND "FilesTouched" != '[]' AND LEFT("FilesTouched", 1) != '[';

                -- Observations.Files
                UPDATE kontinue."Observations" SET "Files" = '[]' WHERE "Files" IS NULL OR "Files" = '';
                UPDATE kontinue."Observations" SET "Files" = '["' || replace(replace("Files", '\', '\\'), '"', '\"') || '"]'
                    WHERE "Files" IS NOT NULL AND "Files" != '[]' AND LEFT("Files", 1) != '[';

                -- Handoffs.Blockers
                UPDATE kontinue."Handoffs" SET "Blockers" = '[]' WHERE "Blockers" IS NULL OR "Blockers" = '';
                UPDATE kontinue."Handoffs" SET "Blockers" = '["' || replace(replace("Blockers", '\', '\\'), '"', '\"') || '"]'
                    WHERE "Blockers" IS NOT NULL AND "Blockers" != '[]' AND LEFT("Blockers", 1) != '[';

                -- Decisions.Tags
                UPDATE kontinue."Decisions" SET "Tags" = '[]' WHERE "Tags" IS NULL OR "Tags" = '';
                UPDATE kontinue."Decisions" SET "Tags" = '["' || replace(replace("Tags", '\', '\\'), '"', '\"') || '"]'
                    WHERE "Tags" IS NOT NULL AND "Tags" != '[]' AND LEFT("Tags", 1) != '[';

                -- Decisions.Files
                UPDATE kontinue."Decisions" SET "Files" = '[]' WHERE "Files" IS NULL OR "Files" = '';
                UPDATE kontinue."Decisions" SET "Files" = '["' || replace(replace("Files", '\', '\\'), '"', '\"') || '"]'
                    WHERE "Files" IS NOT NULL AND "Files" != '[]' AND LEFT("Files", 1) != '[';

                -- Decisions.Alternatives
                UPDATE kontinue."Decisions" SET "Alternatives" = '[]' WHERE "Alternatives" IS NULL OR "Alternatives" = '';
                UPDATE kontinue."Decisions" SET "Alternatives" = '["' || replace(replace("Alternatives", '\', '\\'), '"', '\"') || '"]'
                    WHERE "Alternatives" IS NOT NULL AND "Alternatives" != '[]' AND LEFT("Alternatives", 1) != '[';

                -- Checkpoints.FilesActive
                UPDATE kontinue."Checkpoints" SET "FilesActive" = '[]' WHERE "FilesActive" IS NULL OR "FilesActive" = '';
                UPDATE kontinue."Checkpoints" SET "FilesActive" = '["' || replace(replace("FilesActive", '\', '\\'), '"', '\"') || '"]'
                    WHERE "FilesActive" IS NOT NULL AND "FilesActive" != '[]' AND LEFT("FilesActive", 1) != '[';
            """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Data migration — not reversible
        }
    }
}
