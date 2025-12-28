namespace Grocery.Api.Models.Dto
{
    public record ProductDto(
        Guid Id,
        string Name,
        string? Description,
        decimal Price,
        string? Sku,
        DateTimeOffset CreatedAt,
        DateTimeOffset UpdatedAt
    );
}
