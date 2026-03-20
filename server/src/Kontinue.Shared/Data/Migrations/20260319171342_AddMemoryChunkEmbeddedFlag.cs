using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Kontinue.Shared.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddMemoryChunkEmbeddedFlag : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "Embedded",
                schema: "kontinue",
                table: "MemoryChunks",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Embedded",
                schema: "kontinue",
                table: "MemoryChunks");
        }
    }
}
