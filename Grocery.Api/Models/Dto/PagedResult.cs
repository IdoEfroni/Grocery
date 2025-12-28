namespace Grocery.Api.Models.Dto
{
    public record PagedResult<T>(
        int Page,
        int PageSize,
        int Total,
        IReadOnlyList<T> Items
    );
}
