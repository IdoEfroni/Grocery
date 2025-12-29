using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Http;

namespace Grocery.Api.Models.Dto
{
    public class ProductUpsertDto
    {
        [Required, StringLength(200)]
        public string Name { get; set; } = default!;

        [StringLength(1000)]
        public string? Description { get; set; }

        [Range(0, 9999999)]
        public decimal Price { get; set; }

        [Required, StringLength(128)]
        public string Sku { get; set; } = default!;

        public IFormFile? PhotoFile { get; set; }

        public string? PhotoUrl { get; set; }
    }
}
