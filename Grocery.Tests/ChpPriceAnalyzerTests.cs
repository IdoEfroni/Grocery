using FluentAssertions;
using Grocery.Api.Models.Chp;
using Grocery.Api.Services;

namespace Grocery.Tests;

public class ChpPriceAnalyzerTests
{
    private static readonly DateOnly Today = new(2026, 09, 08);

    private static ChpPriceRow Row(
        decimal regular,
        decimal? promo = null,
        ChpPromoKind kind = ChpPromoKind.PerUnit,
        int requiredQuantity = 1,
        DateOnly? expires = null,
        string chain = "chain",
        ChpStoreKind source = ChpStoreKind.InStore) => new()
        {
            Source = source,
            Chain = chain,
            StoreName = "branch",
            Location = "somewhere",
            RegularPrice = regular,
            Promotion = promo is null ? null : new ChpPromotion
            {
                UnitPrice = promo.Value,
                Kind = kind,
                RequiredQuantity = requiredQuantity,
                ExpiresOn = expires,
                Description = "promo"
            }
        };

    [Fact]
    public void Empty_input_summarizes_to_nothing()
    {
        var summary = ChpPriceAnalyzer.Summarize(Array.Empty<ChpPriceRow>());

        summary.ResultCount.Should().Be(0);
        summary.TypicalPrice.Should().BeNull();
        summary.BestSingleUnit.Should().BeNull();
    }

    [Fact]
    public void Typical_price_is_the_median_not_the_mean()
    {
        // One absurd outlier. The mean chases it; the median does not.
        var rows = new[] { Row(5m), Row(5m), Row(6m), Row(6m), Row(60m) };

        var summary = ChpPriceAnalyzer.Summarize(rows, Today);

        summary.TypicalPrice.Should().Be(6m);
        summary.AverageRegularPrice.Should().Be(16.4m);
    }

    [Fact]
    public void Median_of_an_even_count_averages_the_middle_pair()
    {
        var summary = ChpPriceAnalyzer.Summarize(new[] { Row(4m), Row(5m), Row(6m), Row(7m) }, Today);

        summary.TypicalPrice.Should().Be(5.5m);
    }

    [Fact]
    public void Flags_a_chain_that_inflates_its_shelf_price_to_discount_from_it()
    {
        // The pattern from the real data: a chain lists at 9.90 where the market sits
        // at 6.90, then "discounts" to the 3.00 everyone else already charges.
        var rows = new[]
        {
            Row(6.90m, chain: "market"),
            Row(6.90m, chain: "market"),
            Row(6.90m, chain: "market"),
            Row(3.90m, promo: 3.00m, chain: "honest"),
            Row(9.90m, promo: 3.00m, chain: "yellow"),
        };

        var summary = ChpPriceAnalyzer.Summarize(rows, Today);

        summary.InflatedOffers.Should().ContainSingle();
        summary.InflatedOffers[0].Chain.Should().Be("yellow");
    }

    [Fact]
    public void A_deep_discount_from_a_normal_shelf_price_is_not_flagged()
    {
        // Below-median shelf price plus a big promotion is a genuine deal, not the
        // inflate-then-discount tactic. Only an out-of-line shelf price qualifies.
        var rows = new[]
        {
            Row(6.90m), Row(6.90m), Row(6.90m),
            Row(5.90m, promo: 3.00m, chain: "carrefour"),
        };

        ChpPriceAnalyzer.Summarize(rows, Today).InflatedOffers.Should().BeEmpty();
    }

    [Fact]
    public void Typical_price_excludes_inflated_listings()
    {
        var rows = new[]
        {
            Row(6m), Row(6m), Row(6m), Row(6m), Row(6m),
            Row(20m, promo: 4m, chain: "inflater"),
            Row(20m, promo: 4m, chain: "inflater"),
            Row(20m, promo: 4m, chain: "inflater"),
        };

        var summary = ChpPriceAnalyzer.Summarize(rows, Today);

        summary.InflatedOffers.Should().HaveCount(3);
        summary.TypicalPrice.Should().Be(6m);
    }

    [Fact]
    public void Inflated_listings_are_only_detectable_while_they_are_the_minority()
    {
        // "Out of line with the market" is measured against the median, so when the
        // inflated listings outnumber the honest ones they become the market and
        // nothing is flagged. Inherent to the approach, recorded so it is not mistaken
        // for a bug -- the median still keeps the reference price sane.
        var rows = new[]
        {
            Row(6m), Row(6m),
            Row(20m, promo: 4m, chain: "inflater"),
            Row(20m, promo: 4m, chain: "inflater"),
            Row(20m, promo: 4m, chain: "inflater"),
        };

        ChpPriceAnalyzer.Summarize(rows, Today).InflatedOffers.Should().BeEmpty();
    }

    [Fact]
    public void Best_single_unit_ignores_multi_buy_deals()
    {
        var rows = new[]
        {
            Row(8m, promo: 2m, kind: ChpPromoKind.MultiBuy, requiredQuantity: 10, chain: "bulk"),
            Row(5m, chain: "plain"),
        };

        var summary = ChpPriceAnalyzer.Summarize(rows, Today);

        // ₪2 needs ten items. Someone buying one pays ₪5 at the other store.
        summary.BestSingleUnit!.Price.Should().Be(5m);
        summary.BestSingleUnit.Chain.Should().Be("plain");
        summary.BestSingleUnit.RequiredQuantity.Should().Be(1);
    }

    [Fact]
    public void Best_single_unit_uses_a_per_unit_promotion_when_there_is_one()
    {
        var rows = new[]
        {
            Row(9m, promo: 4m, kind: ChpPromoKind.PerUnit, chain: "promo"),
            Row(5m, chain: "plain"),
        };

        var summary = ChpPriceAnalyzer.Summarize(rows, Today);

        summary.BestSingleUnit!.Price.Should().Be(4m);
        summary.BestSingleUnit.Chain.Should().Be("promo");
        summary.BestSingleUnit.PromotionDescription.Should().NotBeNull();
    }

    [Fact]
    public void Highest_real_price_excludes_the_inflated_sticker_price()
    {
        // The shape of the real Bamba data: yellow's ₪9.90 is the largest number on
        // the page and is exactly the one nobody pays. Reporting it as the top of the
        // range would repeat the trick rather than expose it.
        var rows = new[]
        {
            Row(6.90m, chain: "market"),
            Row(6.90m, chain: "market"),
            Row(6.90m, chain: "market"),
            Row(7.90m, chain: "pricey"),
            Row(9.90m, promo: 3.00m, chain: "yellow"),
        };

        var summary = ChpPriceAnalyzer.Summarize(rows, Today);

        summary.HighestRegularPrice.Should().Be(9.90m, "the raw maximum is still reported");
        summary.HighestRealOffer!.Price.Should().Be(7.90m);
        summary.HighestRealOffer.Chain.Should().Be("pricey");
    }

    [Fact]
    public void Highest_real_price_is_a_shelf_price_never_a_promotional_one()
    {
        var rows = new[]
        {
            Row(5m), Row(5m),
            Row(6m, promo: 4m, kind: ChpPromoKind.PerUnit, chain: "dearest"),
        };

        var summary = ChpPriceAnalyzer.Summarize(rows, Today);

        // "What would I pay at the worst genuine shop" is a shelf-price question.
        summary.HighestRealOffer!.Price.Should().Be(6m);
        summary.HighestRealOffer.Chain.Should().Be("dearest");
    }

    [Fact]
    public void Highest_real_price_is_null_when_there_are_no_rows()
    {
        ChpPriceAnalyzer.Summarize(Array.Empty<ChpPriceRow>()).HighestRealOffer.Should().BeNull();
    }

    [Fact]
    public void Best_bulk_reports_the_quantity_the_deal_requires()
    {
        var rows = new[]
        {
            Row(8m, promo: 3m, kind: ChpPromoKind.MultiBuy, requiredQuantity: 10, chain: "bulk"),
            Row(5m, chain: "plain"),
        };

        var summary = ChpPriceAnalyzer.Summarize(rows, Today);

        summary.BestBulk!.Price.Should().Be(3m);
        summary.BestBulk.RequiredQuantity.Should().Be(10);
    }

    [Fact]
    public void Best_bulk_is_omitted_when_it_does_not_beat_buying_one()
    {
        var rows = new[]
        {
            Row(8m, promo: 6m, kind: ChpPromoKind.MultiBuy, requiredQuantity: 6, chain: "bulk"),
            Row(5m, chain: "plain"),
        };

        // Buying six to pay ₪6 each is worse than buying one for ₪5. Don't suggest it.
        ChpPriceAnalyzer.Summarize(rows, Today).BestBulk.Should().BeNull();
    }

    [Fact]
    public void Expired_promotions_are_ignored()
    {
        var rows = new[]
        {
            Row(9m, promo: 1m, expires: Today.AddDays(-1), chain: "expired"),
            Row(5m, chain: "plain"),
        };

        var summary = ChpPriceAnalyzer.Summarize(rows, Today);

        summary.BestSingleUnit!.Price.Should().Be(5m);
        summary.BestSingleUnit.Chain.Should().Be("plain");
    }

    [Fact]
    public void A_promotion_expiring_today_still_counts()
    {
        var rows = new[]
        {
            Row(9m, promo: 1m, expires: Today, chain: "today"),
            Row(5m, chain: "plain"),
        };

        ChpPriceAnalyzer.Summarize(rows, Today).BestSingleUnit!.Price.Should().Be(1m);
    }

    [Fact]
    public void Counts_in_store_and_online_rows_separately()
    {
        var rows = new[]
        {
            Row(5m, source: ChpStoreKind.InStore),
            Row(6m, source: ChpStoreKind.InStore),
            Row(7m, source: ChpStoreKind.Online),
        };

        var summary = ChpPriceAnalyzer.Summarize(rows, Today);

        summary.ResultCount.Should().Be(3);
        summary.InStoreCount.Should().Be(2);
        summary.OnlineCount.Should().Be(1);
    }

    [Fact]
    public void Falls_back_to_all_rows_when_every_listing_looks_inflated()
    {
        // Degenerate input: two rows, both matching the pattern against their own
        // median. The reference price must still be a number.
        var rows = new[]
        {
            Row(20m, promo: 1m, chain: "a"),
            Row(20m, promo: 1m, chain: "b"),
        };

        ChpPriceAnalyzer.Summarize(rows, Today).TypicalPrice.Should().Be(20m);
    }
}
