using Grocery.Api.Models;

namespace Grocery.Api.Services
{
    public interface IProductRepository
    {
        Task<(IReadOnlyList<Product> Items, int Total)> SearchAsync(string? query, int page, int pageSize, CancellationToken ct);
        Task<Product?> GetByIdAsync(Guid id, CancellationToken ct);
        Task<Product?> GetBySkuAsync(string sku, CancellationToken ct);
        Task<Product> CreateAsync(Product product, CancellationToken ct);
        Task<bool> UpdateAsync(Product product, CancellationToken ct);
        Task<bool> DeleteAsync(Guid id, CancellationToken ct);
        Task<bool> SkuExistsAsync(string sku, Guid? excludeId, CancellationToken ct);
    }
}
