using Grocery.Api.Models.Chp;

namespace Grocery.Api.Services;

/// <summary>A concrete price at a named store, with whatever conditions attach to it.</summary>
public sealed class ChpPriceOffer
{
    public decimal Price { get; init; }
    public string Chain { get; init; } = string.Empty;
    public string StoreName { get; init; } = string.Empty;
    public string Location { get; init; } = string.Empty;
    public ChpStoreKind Source { get; init; }

    /// <summary>Units that must be bought for <see cref="Price"/> to apply.</summary>
    public int RequiredQuantity { get; init; } = 1;

    public string? PromotionDescription { get; init; }
    public DateOnly? ExpiresOn { get; init; }

    public static ChpPriceOffer From(ChpPriceRow row, decimal price, int requiredQuantity) => new()
    {
        Price = price,
        Chain = row.Chain,
        StoreName = row.StoreName,
        Location = row.Location,
        Source = row.Source,
        RequiredQuantity = requiredQuantity,
        PromotionDescription = row.Promotion?.Description,
        ExpiresOn = row.Promotion?.ExpiresOn
    };
}

/// <summary>The numbers derived from one set of store rows.</summary>
public sealed class ChpPriceSummary
{
    public int ResultCount { get; init; }
    public int InStoreCount { get; init; }
    public int OnlineCount { get; init; }

    /// <summary>Plain mean of every shelf price. Kept for backwards compatibility; prefer <see cref="TypicalPrice"/>.</summary>
    public decimal? AverageRegularPrice { get; init; }

    /// <summary>Median shelf price, excluding listings judged to be inflated-then-discounted.</summary>
    public decimal? TypicalPrice { get; init; }

    public decimal? LowestRegularPrice { get; init; }
    public decimal? HighestRegularPrice { get; init; }

    /// <summary>Cheapest price obtainable buying a single unit.</summary>
    public ChpPriceOffer? BestSingleUnit { get; init; }

    /// <summary>
    /// The dearest genuine shelf price, with inflated-then-discounted listings excluded.
    /// </summary>
    /// <remarks>
    /// The counterpart to <see cref="BestSingleUnit"/>, and the reason it is not simply
    /// <see cref="HighestRegularPrice"/>: the highest number on the page is usually the
    /// padded one. For Bamba in Haifa the raw maximum is yellow's ₪9.90, which nobody
    /// pays because yellow always discounts it to ₪3.00 — quoting that as the top of the
    /// range would be repeating the very trick this analyzer exists to expose.
    /// </remarks>
    public ChpPriceOffer? HighestRealOffer { get; init; }

    /// <summary>Cheapest per-unit price when buying the quantity a multi-buy requires, when that beats buying one.</summary>
    public ChpPriceOffer? BestBulk { get; init; }

    /// <summary>Listings whose shelf price is out of line with the market and whose standing promotion brings it back to normal.</summary>
    public IReadOnlyList<ChpPriceOffer> InflatedOffers { get; init; } = Array.Empty<ChpPriceOffer>();

    public static ChpPriceSummary Empty { get; } = new();
}

/// <summary>
/// Derives a reference price and buying recommendations from chp store rows.
/// </summary>
/// <remarks>
/// Two decisions here are deliberate and worth not undoing.
///
/// <para><b>The reference price is a median, not a mean.</b> Chains price the same
/// item anywhere from ₪3.90 to ₪9.90 in one city, and some carry a permanently
/// inflated shelf price purely so a standing promotion reads as a large discount.
/// A mean lets a dozen branches of one such chain drag the number; a median barely
/// notices them.</para>
///
/// <para><b>Promotional prices are never blended into the reference price.</b> Folding
/// them into an average would make the inflate-then-discount tactic move the number
/// in both directions instead of one, which rewards it rather than exposing it.
/// Promotions are reported separately, as offers with their conditions attached.</para>
/// </remarks>
public static class ChpPriceAnalyzer
{
    /// <summary>
    /// How far above the market median a shelf price must sit before a standing
    /// promotion against it looks like inflate-then-discount rather than a real sale.
    /// </summary>
    private const decimal InflatedShelfFactor = 1.25m;

    /// <summary>
    /// How far below the median the promotional price must land to complete that
    /// pattern: the "discount" merely restores an ordinary market price.
    /// </summary>
    private const decimal RestoredPriceFactor = 0.85m;

    public static ChpPriceSummary Summarize(IReadOnlyList<ChpPriceRow> rows, DateOnly? today = null)
    {
        if (rows is null || rows.Count == 0) return ChpPriceSummary.Empty;

        var asOf = today ?? DateOnly.FromDateTime(DateTime.UtcNow);
        var live = rows.Select(r => WithoutExpiredPromotion(r, asOf)).ToList();

        var regularPrices = live.Select(r => r.RegularPrice).ToList();
        var marketMedian = Median(regularPrices);

        var inflated = live
            .Where(r => IsInflatedThenDiscounted(r, marketMedian))
            .ToList();

        var honest = live.Except(inflated).ToList();
        if (honest.Count == 0) honest = live;

        return new ChpPriceSummary
        {
            ResultCount = live.Count,
            InStoreCount = live.Count(r => r.Source == ChpStoreKind.InStore),
            OnlineCount = live.Count(r => r.Source == ChpStoreKind.Online),
            AverageRegularPrice = regularPrices.Average(),
            TypicalPrice = Median(honest.Select(r => r.RegularPrice).ToList()),
            LowestRegularPrice = regularPrices.Min(),
            HighestRegularPrice = regularPrices.Max(),
            BestSingleUnit = FindBestSingleUnit(live),
            HighestRealOffer = FindHighestReal(honest),
            BestBulk = FindBestBulk(live),
            InflatedOffers = inflated
                .Select(r => ChpPriceOffer.From(r, r.Promotion!.UnitPrice, r.Promotion!.RequiredQuantity))
                .ToList()
        };
    }

    /// <summary>
    /// An expired promotion is not a price anyone can pay, so it is dropped rather
    /// than allowed to win a "best deal" comparison.
    /// </summary>
    private static ChpPriceRow WithoutExpiredPromotion(ChpPriceRow row, DateOnly asOf)
    {
        if (row.Promotion is null || row.Promotion.ExpiresOn is null || row.Promotion.ExpiresOn >= asOf)
            return row;

        return new ChpPriceRow
        {
            Source = row.Source,
            Chain = row.Chain,
            StoreName = row.StoreName,
            Location = row.Location,
            RegularPrice = row.RegularPrice,
            Promotion = null
        };
    }

    private static bool IsInflatedThenDiscounted(ChpPriceRow row, decimal? marketMedian)
    {
        if (row.Promotion is null || marketMedian is not { } median || median <= 0) return false;

        return row.RegularPrice >= median * InflatedShelfFactor
            && row.Promotion.UnitPrice <= median * RestoredPriceFactor;
    }

    /// <summary>
    /// The cheapest a shopper can get one unit for. Multi-buy promotions are excluded:
    /// "10 units for ₪30" is not a price you can pay for a single item, and quoting it
    /// as one would understate what the customer actually hands over.
    /// </summary>
    private static ChpPriceOffer? FindBestSingleUnit(IReadOnlyList<ChpPriceRow> rows)
    {
        var best = rows.OrderBy(r => r.SingleUnitPrice).FirstOrDefault();
        if (best is null) return null;

        var usesPromotion = best.Promotion is { IsReachableAtQuantityOne: true }
            && best.Promotion.UnitPrice < best.RegularPrice;

        return new ChpPriceOffer
        {
            Price = best.SingleUnitPrice,
            Chain = best.Chain,
            StoreName = best.StoreName,
            Location = best.Location,
            Source = best.Source,
            RequiredQuantity = 1,
            PromotionDescription = usesPromotion ? best.Promotion!.Description : null,
            ExpiresOn = usesPromotion ? best.Promotion!.ExpiresOn : null
        };
    }

    /// <summary>
    /// The dearest shelf price among listings that are not inflated-then-discounted.
    /// Reported at the shelf price, never a promotional one — the question it answers is
    /// "what would I pay at the worst genuine shop near me", so a promotion is irrelevant.
    /// </summary>
    private static ChpPriceOffer? FindHighestReal(IReadOnlyList<ChpPriceRow> honest)
    {
        var dearest = honest.OrderByDescending(r => r.RegularPrice).FirstOrDefault();
        if (dearest is null) return null;

        return new ChpPriceOffer
        {
            Price = dearest.RegularPrice,
            Chain = dearest.Chain,
            StoreName = dearest.StoreName,
            Location = dearest.Location,
            Source = dearest.Source,
            RequiredQuantity = 1
        };
    }

    /// <summary>
    /// The cheapest per-unit price once multi-buy deals are allowed, reported only when
    /// it actually beats what a single unit costs.
    /// </summary>
    private static ChpPriceOffer? FindBestBulk(IReadOnlyList<ChpPriceRow> rows)
    {
        var best = rows
            .Where(r => r.Promotion is { IsReachableAtQuantityOne: false })
            .OrderBy(r => r.Promotion!.UnitPrice)
            .FirstOrDefault();

        if (best is null) return null;

        var singleUnitFloor = rows.Min(r => r.SingleUnitPrice);
        if (best.Promotion!.UnitPrice >= singleUnitFloor) return null;

        return ChpPriceOffer.From(best, best.Promotion.UnitPrice, best.Promotion.RequiredQuantity);
    }

    private static decimal? Median(IReadOnlyList<decimal> values)
    {
        if (values.Count == 0) return null;

        var sorted = values.OrderBy(v => v).ToList();
        var middle = sorted.Count / 2;

        return sorted.Count % 2 == 1
            ? sorted[middle]
            : (sorted[middle - 1] + sorted[middle]) / 2m;
    }
}
