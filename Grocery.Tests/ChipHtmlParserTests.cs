using FluentAssertions;
using Grocery.Api.Models.Chp;
using Grocery.Api.Parsers;

namespace Grocery.Tests;

/// <summary>
/// Exercises the chp parser against pages captured verbatim from chp.co.il.
///
/// Both fixtures are for barcode 7290000066318 ("חטיף במבה, 80 גרם") near תל אביב.
/// chp-compare-clean.html is the ordinary page. chp-compare-obfuscated.html is the
/// anti-scraping variant the site serves to clients that request in bursts, trimmed
/// to a few rows but otherwise untouched — including its three &lt;style&gt; blocks.
/// </summary>
public class ChipHtmlParserTests
{
    private readonly ChipHtmlParser _parser = new();

    private static string Fixture(string name) =>
        File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", name));

    private ChpCompareResult ParseClean() => _parser.Parse(Fixture("chp-compare-clean.html"));

    [Fact]
    public void Reads_product_details()
    {
        var result = ParseClean();

        result.ProductName.Should().Be("חטיף במבה, 80 גרם");
        result.Description.Should().Contain("7290000066318");
    }

    [Fact]
    public void Reads_both_result_tables()
    {
        var result = ParseClean();

        // The page carries a nearby-branches table and an online-retailers table.
        // Taking only the first would drop every online store.
        result.Rows.Should().HaveCountGreaterThan(150);
        result.Rows.Count(r => r.Source == ChpStoreKind.InStore).Should().Be(152);
        result.Rows.Count(r => r.Source == ChpStoreKind.Online).Should().Be(11);
    }

    [Fact]
    public void Skips_the_narrow_screen_duplicate_rows()
    {
        var result = ParseClean();

        // chp repeats each store's address in an extra row shown only on narrow
        // screens. Those carry no price and must not become listings.
        result.Rows.Should().OnlyContain(r => r.RegularPrice > 0);
    }

    [Fact]
    public void Reads_the_shelf_price_and_the_promotion_as_separate_numbers()
    {
        var result = ParseClean();

        var osherAd = result.Rows.First(r => r.Chain == "אושר עד" && r.StoreName == "תל אביב");

        osherAd.RegularPrice.Should().Be(3.90m);
        osherAd.Promotion.Should().NotBeNull();
        osherAd.Promotion!.UnitPrice.Should().Be(3.00m);
    }

    [Fact]
    public void Classifies_a_multi_buy_promotion_with_its_required_quantity()
    {
        var result = ParseClean();

        // "10 יחידות ב- 30.00 ש"ח (מחיר ליחידה 3.00 ש"ח)"
        var multiBuy = result.Rows.First(r =>
            r.Promotion is not null && r.Promotion.Description.Contains("10 יחידות"));

        multiBuy.Promotion!.Kind.Should().Be(ChpPromoKind.MultiBuy);
        multiBuy.Promotion.RequiredQuantity.Should().Be(10);
        multiBuy.Promotion.IsReachableAtQuantityOne.Should().BeFalse();

        // A multi-buy price is not what a single item costs.
        multiBuy.SingleUnitPrice.Should().Be(multiBuy.RegularPrice);
    }

    [Fact]
    public void Classifies_a_per_unit_promotion_as_reachable_when_buying_one()
    {
        var result = ParseClean();

        // "3.00 ש"ח ליחידה / מוגבל ל-2 מימושים"
        var perUnit = result.Rows.First(r =>
            r.Promotion is { Kind: ChpPromoKind.PerUnit } && r.Promotion.RedemptionLimit == 2);

        perUnit.Promotion!.RequiredQuantity.Should().Be(1);
        perUnit.Promotion.IsReachableAtQuantityOne.Should().BeTrue();
        perUnit.SingleUnitPrice.Should().Be(perUnit.Promotion.UnitPrice);
    }

    [Fact]
    public void Reads_promotion_expiry_dates()
    {
        var result = ParseClean();

        var withExpiry = result.Rows.Where(r => r.Promotion?.ExpiresOn is not null).ToList();

        withExpiry.Should().NotBeEmpty();
        withExpiry.Should().OnlyContain(r => r.Promotion!.ExpiresOn!.Value.Year == 2026);
    }

    [Fact]
    public void Rows_without_a_promotion_have_none()
    {
        var result = ParseClean();

        var plain = result.Rows.Where(r => r.Promotion is null).ToList();

        plain.Should().NotBeEmpty("some stores list the item at its shelf price only");
        plain.Should().OnlyContain(r => r.EffectiveUnitPrice == r.RegularPrice);
    }

    [Fact]
    public void Clean_page_is_not_flagged_as_obfuscated()
    {
        ParseClean().IsObfuscated.Should().BeFalse();
    }

    [Fact]
    public void Detects_the_anti_scraping_page_and_reports_no_prices()
    {
        var result = _parser.Parse(Fixture("chp-compare-obfuscated.html"));

        // The decoys yield digit soup like "61.600.60". The danger is not failing to
        // parse it, it is parsing it into a plausible-looking wrong price, so the
        // parser must both reject the rows and say why.
        result.IsObfuscated.Should().BeTrue();
        result.Rows.Should().BeEmpty();
    }

    [Fact]
    public void Empty_input_is_handled()
    {
        _parser.Parse("").Rows.Should().BeEmpty();
        _parser.Parse("<html><body>nothing here</body></html>").Rows.Should().BeEmpty();
    }
}
