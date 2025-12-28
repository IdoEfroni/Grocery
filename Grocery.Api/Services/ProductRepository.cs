using Grocery.Api.Data;
using Grocery.Api.Models;
using Microsoft.EntityFrameworkCore;
using System;

namespace Grocery.Api.Services
{
    public class ProductRepository : IProductRepository
    {
        private readonly StoreDbContext _db;

        public ProductRepository(StoreDbContext db) => _db = db;

        public async Task<(IReadOnlyList<Product> Items, int Total)> SearchAsync(
            string? query, int page, int pageSize, CancellationToken ct)
        {
            page = Math.Max(page, 1);
            pageSize = Math.Clamp(pageSize, 1, 200);

            IQueryable<Product> q = _db.Products.AsNoTracking();

            if (!string.IsNullOrWhiteSpace(query))
            {
                var term = $"%{query.Trim()}%";
                q = q.Where(p =>
                    EF.Functions.Like(p.Name!, term) ||
                    (p.Sku != null && EF.Functions.Like(p.Sku, term)) ||
                    (p.Description != null && EF.Functions.Like(p.Description, term)));
            }

            var total = await q.CountAsync(ct);

            var items = await q.OrderBy(p => p.Name)
                               .Skip((page - 1) * pageSize)
                               .Take(pageSize)
                               .ToListAsync(ct);

            return (items, total);
        }

        public async Task<Product?> GetByIdAsync(Guid id, CancellationToken ct)
        {
            return await _db.Products
                            .AsNoTracking()
                            .FirstOrDefaultAsync(p => p.Id == id, ct);
        }

        public async Task<Product?> GetBySkuAsync(string sku, CancellationToken ct)
        {
            // For case-insensitive compare across providers, normalize both sides.
            var norm = sku.Trim();
            return await _db.Products
                            .AsNoTracking()
                            .FirstOrDefaultAsync(p => p.Sku != null && p.Sku == norm, ct);
        }

        public async Task<bool> SkuExistsAsync(string sku, Guid? excludeId, CancellationToken ct)
        {
            var norm = sku.Trim();
            return await _db.Products
                            .AsNoTracking()
                            .AnyAsync(p => p.Sku == norm && (excludeId == null || p.Id != excludeId.Value), ct);
        }

        public async Task<Product> CreateAsync(Product product, CancellationToken ct)
        {
            if (product.Id == Guid.Empty)
                product.Id = Guid.NewGuid();

            product.CreatedAt = product.UpdatedAt = DateTime.UtcNow;

            _db.Products.Add(product);
            await _db.SaveChangesAsync(ct);
            return product;
        }

        public async Task<bool> UpdateAsync(Product product, CancellationToken ct)
        {
            // Safer pattern: load, update allowed fields, save
            var existing = await _db.Products.FirstOrDefaultAsync(p => p.Id == product.Id, ct);
            if (existing is null) return false;

            existing.Name = product.Name;
            existing.Description = product.Description;
            existing.Price = product.Price;
            existing.Sku = product.Sku;
            existing.UpdatedAt = DateTime.UtcNow;

            await _db.SaveChangesAsync(ct);
            return true;
        }

        public async Task<bool> DeleteAsync(Guid id, CancellationToken ct)
        {
            // Efficient delete without extra roundtrip:
            var stub = new Product { Id = id };
            _db.Entry(stub).State = EntityState.Deleted;

            try
            {
                var affected = await _db.SaveChangesAsync(ct);
                return affected > 0;
            }
            catch (DbUpdateConcurrencyException)
            {
                // Row didn’t exist
                _db.ChangeTracker.Clear();
                return false;
            }
        }
    }
}
