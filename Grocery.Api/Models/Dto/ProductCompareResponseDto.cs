namespace Grocery.Api.Models.Dto
{
    /// <summary>A price at a named store, with the conditions that make it obtainable.</summary>
    public class PriceOfferDto
    {
        /// <summary>Price per unit, formatted to two decimals.</summary>
        public string Price { get; set; } = string.Empty;

        public string Chain { get; set; } = string.Empty;
        public string StoreName { get; set; } = string.Empty;
        public string Location { get; set; } = string.Empty;

        /// <summary>"InStore" for a nearby branch, "Online" for a web retailer.</summary>
        public string Source { get; set; } = string.Empty;

        /// <summary>Units that must be bought for <see cref="Price"/> to apply. 1 for a single item.</summary>
        public int RequiredQuantity { get; set; } = 1;

        /// <summary>The promotion's own wording, when this price comes from one.</summary>
        public string? PromotionDescription { get; set; }

        /// <summary>Promotion expiry as yyyy-MM-dd, when it has one.</summary>
        public string? ExpiresOn { get; set; }
    }

    public class ProductCompareResponseDto
    {
        public string ProductName { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;

        /// <summary>
        /// Mean of every shelf price, or "N/A".
        /// </summary>
        /// <remarks>
        /// Retained so existing clients keep working. Prefer <see cref="TypicalPrice"/>:
        /// a mean is pulled around by chains that carry an inflated shelf price to make a
        /// standing promotion look like a deep discount.
        /// </remarks>
        public string AveragePrice { get; set; } = string.Empty;

        /// <summary>
        /// Median shelf price with inflated-then-discounted listings excluded, or "N/A".
        /// This is the honest "what does this normally cost" figure.
        /// </summary>
        public string TypicalPrice { get; set; } = string.Empty;

        /// <summary>Cheapest price obtainable buying a single unit.</summary>
        public PriceOfferDto? BestSingleUnit { get; set; }

        /// <summary>
        /// The dearest genuine shelf price, with inflated-then-discounted listings left
        /// out — so it is a real top of the range, not a padded sticker price.
        /// </summary>
        public PriceOfferDto? HighestRealPrice { get; set; }

        /// <summary>Cheapest per-unit price via a multi-buy deal, when it beats buying one.</summary>
        public PriceOfferDto? BestBulk { get; set; }

        /// <summary>Listings whose high shelf price plus standing promotion looks like inflate-then-discount.</summary>
        public List<PriceOfferDto> InflatedOffers { get; set; } = new();

        public int ResultCount { get; set; }
        public int InStoreCount { get; set; }
        public int OnlineCount { get; set; }

        /// <summary>
        /// True when chp served its anti-scraping page and no prices could be read.
        /// The price fields will be "N/A"; this distinguishes that from a barcode that
        /// genuinely has no listings.
        /// </summary>
        public bool Degraded { get; set; }
    }
}
