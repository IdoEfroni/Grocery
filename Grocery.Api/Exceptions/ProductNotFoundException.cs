namespace Grocery.Api.Exceptions;

/// <summary>
/// Thrown when a product is not found by id or sku.
/// </summary>
public class ProductNotFoundException : Exception
{
    public Guid? Id { get; }
    public string? Sku { get; }

    public ProductNotFoundException(string message, Guid? id = null, string? sku = null)
        : base(message)
    {
        Id = id;
        Sku = sku;
    }

    public ProductNotFoundException(Guid id)
        : base($"Product with id '{id}' was not found.")
    {
        Id = id;
    }

    public ProductNotFoundException(string sku)
        : base($"Product with SKU '{sku}' was not found.")
    {
        Sku = sku;
    }
}
