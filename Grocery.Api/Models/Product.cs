namespace Grocery.Api.Models
{
    public class Product
    {
        public Guid Id { get; set; } 
        public string Name { get; set; } = default!;
        public string? Description { get; set; }
        public decimal Price { get; set; } 
        public string? Sku { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    }
}
