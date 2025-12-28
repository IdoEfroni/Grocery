using FluentAssertions;
using Grocery.Api.Models;
using Grocery.Api.Services;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Grocery.Tests
{
    public class ProductRepositoryTests
    {
        [Fact]
        public async Task Create_And_GetById_Works()
        {
            var (db, conn) = TestDbFactory.CreateContext();
            try
            {
                var repo = new ProductRepository(db);

                var p = new Product { Name = "Water 1.5L", Sku = "0001", Price = 3.90m };
                var created = await repo.CreateAsync(p, CancellationToken.None);

                created.Id.Should().NotBeEmpty();
                created.CreatedAt.Should().BeCloseTo(DateTime.UtcNow, TimeSpan.FromSeconds(5));

                var loaded = await repo.GetByIdAsync(created.Id, CancellationToken.None);
                loaded.Should().NotBeNull();
                loaded!.Name.Should().Be("Water 1.5L");
                loaded.Price.Should().Be(3.90m);
            }
            finally { conn.Dispose(); db.Dispose(); }
        }

        [Fact]
        public async Task Search_With_Query_Is_Paged_And_Uses_Like()
        {
            var (db, conn) = TestDbFactory.CreateContext();
            try
            {
                db.Products.AddRange(
                    Seed.P("0001", "Water 1.5L", 3.90m),
                    Seed.P("0002", "Milk 1L", 6.50m),
                    Seed.P("1000", "Dark Chocolate", 8.00m),
                    Seed.P("1001", "Chocolate Milk", 6.90m)
                );
                await db.SaveChangesAsync();

                var repo = new ProductRepository(db);

                var (items, total) = await repo.SearchAsync("choco", page: 1, pageSize: 1, ct: CancellationToken.None);

                total.Should().Be(2);                     // “Chocolate” and “Chocolate Milk”
                items.Should().HaveCount(1);              // pageSize = 1
                items.First().Name.Should().Be("Chocolate Milk"); // ordered by Name ascending
            }
            finally { conn.Dispose(); db.Dispose(); }
        }

        [Fact]
        public async Task GetBySku_And_SkuExists_Work()
        {
            var (db, conn) = TestDbFactory.CreateContext();
            try
            {
                var p = Seed.P("ABC123", "Snack", 4.00m);
                db.Products.Add(p);
                await db.SaveChangesAsync();

                var repo = new ProductRepository(db);

                var bySku = await repo.GetBySkuAsync("ABC123", CancellationToken.None);
                bySku.Should().NotBeNull();
                bySku!.Id.Should().Be(p.Id);

                var existsSame = await repo.SkuExistsAsync("ABC123", excludeId: null, CancellationToken.None);
                existsSame.Should().BeTrue();

                var existsExcluding = await repo.SkuExistsAsync("ABC123", excludeId: p.Id, CancellationToken.None);
                existsExcluding.Should().BeFalse();
            }
            finally { conn.Dispose(); db.Dispose(); }
        }

        [Fact]
        public async Task Update_Changes_Editable_Fields_And_Timestamps()
        {
            var (db, conn) = TestDbFactory.CreateContext();
            try
            {
                var p = Seed.P("0005", "Tea", 5.00m);
                db.Products.Add(p);
                await db.SaveChangesAsync();

                var repo = new ProductRepository(db);

                var updated = new Product
                {
                    Id = p.Id,
                    Name = "Green Tea",
                    Description = "Box",
                    Sku = "0005",
                    Price = 5.50m
                };

                var ok = await repo.UpdateAsync(updated, CancellationToken.None);
                ok.Should().BeTrue();

                var reloaded = await repo.GetByIdAsync(p.Id, CancellationToken.None);
                reloaded!.Name.Should().Be("Green Tea");
                reloaded.Price.Should().Be(5.50m);
                reloaded.UpdatedAt.Should().BeAfter(reloaded.CreatedAt);
            }
            finally { conn.Dispose(); db.Dispose(); }
        }

        //[Fact]
        //public async Task Delete_Removes_Row_And_Is_Idempotent()
        //{
        //    var (db, conn) = TestDbFactory.CreateContext();
        //    try
        //    {
        //        var p = Seed.P("D001", "ToDelete", 1.00m);
        //        db.Products.Add(p);
        //        await db.SaveChangesAsync();

        //        var res = db.Products.First();

        //        var repo = new ProductRepository(db);

        //        var first = await repo.DeleteAsync(p.Id, CancellationToken.None);
        //        first.Should().BeTrue();

        //        var second = await repo.DeleteAsync(p.Id, CancellationToken.None);
        //        second.Should().BeFalse(); // deleted already
        //    }
        //    finally { conn.Dispose(); db.Dispose(); }
        //}
    }
}
