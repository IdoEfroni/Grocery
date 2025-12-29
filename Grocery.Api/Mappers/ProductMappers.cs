using Grocery.Api.Models;
using Grocery.Api.Models.Dto;

namespace Grocery.Api.Mappers
{
    public static class ProductMappers
    {
        public static ProductDto ToDto(this Product p) =>
            new(p.Id, p.Name, p.Description, p.Price, p.Sku, p.CreatedAt, p.UpdatedAt);

        public static void Apply(this Product p, ProductUpsertDto dto)
        {
            p.Name = dto.Name.Trim();
            p.Description = string.IsNullOrWhiteSpace(dto.Description) ? null : dto.Description.Trim();
            p.Price = dto.Price;
            p.Sku = dto.Sku.Trim();
        }
    }
}
