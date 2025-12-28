using Grocery.Api.Models;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Grocery.Tests
{
    public static class Seed
    {
        public static Product P(string sku, string name, decimal price) => new()
        {
            Id = Guid.NewGuid(),
            Sku = sku,
            Name = name,
            Description = null,
            Price = price,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };
    }
}
