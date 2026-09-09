namespace Grocery.Api.Models.Chp;

/// <summary>
/// Everything the compare page yielded for one (address, barcode) pair.
/// </summary>
public sealed class ChpCompareResult
{
    /// <summary>Product name and contents, from the hidden input on the page.</summary>
    public string ProductName { get; init; } = string.Empty;

    /// <summary>Manufacturer/brand and barcode, from the heading.</summary>
    public string Description { get; init; } = string.Empty;

    public IReadOnlyList<ChpPriceRow> Rows { get; init; } = Array.Empty<ChpPriceRow>();

    /// <summary>
    /// True when chp served its anti-scraping variant of the page, in which every
    /// cell is shredded into decoy elements and zero-width characters that only a
    /// CSS-aware renderer can reassemble. Prices cannot be trusted (and are
    /// usually absent entirely) when this is set.
    /// </summary>
    public bool IsObfuscated { get; init; }

    public static ChpCompareResult Empty { get; } = new();
}
