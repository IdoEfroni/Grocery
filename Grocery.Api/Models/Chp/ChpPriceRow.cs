namespace Grocery.Api.Models.Chp;

/// <summary>Which of the two chp result tables a row came from.</summary>
public enum ChpStoreKind
{
    /// <summary>A physical branch near the shopping address ("מחירים בקרבת …").</summary>
    InStore,

    /// <summary>An online retailer ("תוצאות מחנויות באינטרנט").</summary>
    Online
}

/// <summary>
/// The shape of a promotion, which decides whether its unit price is reachable
/// for a shopper buying a single item.
/// </summary>
public enum ChpPromoKind
{
    /// <summary>A straight per-unit discount ("3.00 ש\"ח ליחידה"). Reachable at quantity 1.</summary>
    PerUnit,

    /// <summary>A multi-buy ("10 יחידות ב- 30.00 ש\"ח"). Only reachable at <see cref="ChpPromotion.RequiredQuantity"/>.</summary>
    MultiBuy,

    /// <summary>A buy-one-get-one variant ("קנה 1 יחידה, קבל 1 יחידה ב- 5.00 ש\"ח").</summary>
    BuyGet,

    /// <summary>The mechanism could not be recognised; treat as multi-buy (i.e. not guaranteed at quantity 1).</summary>
    Unknown
}

/// <summary>
/// A promotion attached to one store's listing, parsed from the "מבצע" cell.
/// </summary>
public sealed class ChpPromotion
{
    /// <summary>Effective price per unit under the promotion, as chp itself computed it (the button label).</summary>
    public decimal UnitPrice { get; init; }

    public ChpPromoKind Kind { get; init; } = ChpPromoKind.Unknown;

    /// <summary>Units that must be bought for <see cref="UnitPrice"/> to apply. 1 for a plain per-unit discount.</summary>
    public int RequiredQuantity { get; init; } = 1;

    /// <summary>"מוגבל ל-N מימושים", when the promotion caps how many times it can be redeemed.</summary>
    public int? RedemptionLimit { get; init; }

    /// <summary>"בתוקף עד dd/MM/yyyy", when present.</summary>
    public DateOnly? ExpiresOn { get; init; }

    /// <summary>The full human-readable description, newline separated.</summary>
    public string Description { get; init; } = string.Empty;

    /// <summary>True when a shopper buying exactly one unit gets this price.</summary>
    public bool IsReachableAtQuantityOne => RequiredQuantity <= 1;
}

/// <summary>
/// One store's listing for a product: its shelf price and, optionally, a promotion.
/// </summary>
/// <remarks>
/// The shelf price and the promotion price are kept apart on purpose. Some chains
/// carry a permanently inflated shelf price so that a standing promotion reads as a
/// large discount, so blending the two into a single number rewards exactly the
/// behaviour it should be exposing. Callers decide which one they want.
/// </remarks>
public sealed class ChpPriceRow
{
    public ChpStoreKind Source { get; init; }

    /// <summary>Retail chain ("רמי לוי", "שופרסל דיל").</summary>
    public string Chain { get; init; } = string.Empty;

    /// <summary>Branch name, or the online store's name.</summary>
    public string StoreName { get; init; } = string.Empty;

    /// <summary>Street address for a branch, or the site URL for an online store.</summary>
    public string Location { get; init; } = string.Empty;

    /// <summary>The shelf price from the "מחיר" column. Always present.</summary>
    public decimal RegularPrice { get; init; }

    public ChpPromotion? Promotion { get; init; }

    /// <summary>The promotion's unit price when there is one, otherwise the shelf price.</summary>
    public decimal EffectiveUnitPrice => Promotion?.UnitPrice ?? RegularPrice;

    /// <summary>The lowest price obtainable when buying a single unit.</summary>
    public decimal SingleUnitPrice =>
        Promotion is { IsReachableAtQuantityOne: true } p && p.UnitPrice < RegularPrice
            ? p.UnitPrice
            : RegularPrice;
}
