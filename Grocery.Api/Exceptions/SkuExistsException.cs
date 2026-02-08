namespace Grocery.Api.Exceptions;

/// <summary>
/// Thrown when attempting to create or update a product with a SKU that already exists.
/// </summary>
public class SkuExistsException : Exception
{
    public string Sku { get; }

    public SkuExistsException(string sku)
        : base($"SKU '{sku}' already exists.")
    {
        Sku = sku;
    }
}
