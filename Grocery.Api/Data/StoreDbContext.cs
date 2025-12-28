using Grocery.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace Grocery.Api.Data
{
    public class StoreDbContext: DbContext
    {
        public StoreDbContext(DbContextOptions<StoreDbContext> options) : base(options) { }
        public DbSet<Product> Products => Set<Product>();

        protected override void OnModelCreating(ModelBuilder b)
        {
            b.Entity<Product>(e =>
            {
                e.HasKey(p => p.Id);
                e.HasIndex(p => p.Sku).IsUnique();
                e.HasIndex(p => p.Name);
                e.Property(p => p.Price).HasPrecision(18, 2);
            });
        }
    }
}
