using Microsoft.EntityFrameworkCore.Migrations;
using NpgsqlTypes;

#nullable disable

namespace Kontinue.Shared.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddMemoryChunkSearchVector : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<NpgsqlTsVector>(
                name: "SearchVector",
                schema: "kontinue",
                table: "MemoryChunks",
                type: "tsvector",
                nullable: false,
                computedColumnSql: "to_tsvector('english', coalesce(\"Content\", ''))",
                stored: true);

            migrationBuilder.CreateIndex(
                name: "ix_memory_chunks_search",
                schema: "kontinue",
                table: "MemoryChunks",
                column: "SearchVector")
                .Annotation("Npgsql:IndexMethod", "GIN");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_memory_chunks_search",
                schema: "kontinue",
                table: "MemoryChunks");

            migrationBuilder.DropColumn(
                name: "SearchVector",
                schema: "kontinue",
                table: "MemoryChunks");
        }
    }
}
