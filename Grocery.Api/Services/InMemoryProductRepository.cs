using Grocery.Api.Models;
using System.Collections.Concurrent;

namespace Grocery.Api.Services
{

    public class InMemoryProductRepository : IProductRepository
    {
        private readonly ConcurrentDictionary<Guid, Product> _store = new();
        // quick index for SKU lookups
        private readonly ConcurrentDictionary<string, Guid> _skuIndex = new(StringComparer.OrdinalIgnoreCase);

        public Task<(IReadOnlyList<Product> Items, int Total)> SearchAsync(string? query, int page, int pageSize, CancellationToken ct)
        {
            var q = (query ?? "").Trim();
            IEnumerable<Product> items = _store.Values;

            if (!string.IsNullOrWhiteSpace(q))
            {
                items = items.Where(p =>
                    (p.Name?.Contains(q, StringComparison.OrdinalIgnoreCase) ?? false) ||
                    (p.Sku?.Contains(q, StringComparison.OrdinalIgnoreCase) ?? false) ||
                    (p.Description?.Contains(q, StringComparison.OrdinalIgnoreCase) ?? false)
                );
            }

            var total = items.Count();
            var pageItems = items
                .OrderBy(p => p.Name)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .ToList()
                .AsReadOnly();

            return Task.FromResult(((IReadOnlyList<Product>)pageItems, total));
        }

        public Task<Product?> GetByIdAsync(Guid id, CancellationToken ct)
        {
            _store.TryGetValue(id, out var p);
            return Task.FromResult(p);
        }

        public Task<Product?> GetBySkuAsync(string sku, CancellationToken ct)
        {
            if (_skuIndex.TryGetValue(sku, out var id) && _store.TryGetValue(id, out var p))
                return Task.FromResult<Product?>(p);
            return Task.FromResult<Product?>(null);
        }

        public Task<bool> SkuExistsAsync(string sku, Guid? excludeId, CancellationToken ct)
        {
            var exists = _skuIndex.TryGetValue(sku, out var id) && (excludeId is null || id != excludeId.Value);
            return Task.FromResult(exists);
        }

        public Task<Product> CreateAsync(Product product, CancellationToken ct)
        {
            _store[product.Id] = product;
            if (!string.IsNullOrWhiteSpace(product.Sku))
                _skuIndex[product.Sku] = product.Id;
            return Task.FromResult(product);
        }

        public Task<bool> UpdateAsync(Product product, CancellationToken ct)
        {
            if (!_store.ContainsKey(product.Id)) return Task.FromResult(false);

            // Remove old SKU index if SKU changed
            var existing = _store[product.Id];
            if (!string.Equals(existing.Sku, product.Sku, StringComparison.OrdinalIgnoreCase))
            {
                if (!string.IsNullOrWhiteSpace(existing.Sku))
                    _skuIndex.TryRemove(existing.Sku, out _);
                if (!string.IsNullOrWhiteSpace(product.Sku))
                    _skuIndex[product.Sku] = product.Id;
            }

            _store[product.Id] = product;
            return Task.FromResult(true);
        }

        public Task<bool> DeleteAsync(Guid id, CancellationToken ct)
        {
            if (_store.TryRemove(id, out var removed))
            {
                if (!string.IsNullOrWhiteSpace(removed.Sku))
                    _skuIndex.TryRemove(removed.Sku, out _);
                return Task.FromResult(true);
            }
            return Task.FromResult(false);
        }
    }
    
}
