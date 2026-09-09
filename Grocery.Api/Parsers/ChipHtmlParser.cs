using System.Globalization;
using System.Net;
using System.Text.RegularExpressions;
using Grocery.Api.Models.Chp;
using HtmlAgilityPack;

namespace Grocery.Api.Parsers
{
    /// <summary>
    /// Turns a chp.co.il compare_results page into <see cref="ChpCompareResult"/>.
    /// </summary>
    /// <remarks>
    /// Two things about the source page drive the shape of this class.
    ///
    /// First, the page carries <b>two</b> result tables — physical branches near the
    /// shopping address, and online retailers — and both are worth having. An earlier
    /// version took the first table it found, which silently dropped every online
    /// store (and, when the address failed to geocode and only the online table was
    /// rendered, silently reported online prices as if they were local ones).
    ///
    /// Second, chp serves an anti-scraping variant of the page to clients that request
    /// in bursts. In it every cell is exploded into decoy &lt;span&gt;/&lt;div&gt; elements
    /// carrying random data-* attributes, with the real characters interleaved among
    /// fakes and zero-width padding, and three inline &lt;style&gt; blocks deciding which
    /// of them are visible. Reassembling that needs a CSS cascade, so this parser does
    /// not try: it detects the variant and reports it via
    /// <see cref="ChpCompareResult.IsObfuscated"/> so the caller can back off and retry.
    /// Detection matters more than it sounds — the decoys yield strings like
    /// "61.600.60", which a lenient number parser would happily turn into a price.
    /// Hence the deliberately anchored <see cref="PriceShape"/> match below.
    /// </remarks>
    public class ChipHtmlParser
    {
        /// <summary>
        /// Zero-width and joiner characters used as padding by the obfuscated page:
        /// ZWSP, ZWNJ, ZWJ, word joiner and BOM. Spelled with escapes because literal
        /// forms of these are invisible in an editor.
        /// </summary>
        private static readonly char[] ZeroWidthChars =
        {
            (char)0x200B, // ZERO WIDTH SPACE
            (char)0x200C, // ZERO WIDTH NON-JOINER
            (char)0x200D, // ZERO WIDTH JOINER
            (char)0x2060, // WORD JOINER
            (char)0xFEFF  // ZERO WIDTH NO-BREAK SPACE / BOM
        };

        /// <summary>
        /// A price cell must be exactly a number, nothing else. Anything looser would
        /// accept the digit soup the obfuscated page produces.
        /// </summary>
        private static readonly Regex PriceShape = new(@"^\d{1,6}(?:[.,]\d{1,2})?$", RegexOptions.Compiled);

        private static readonly Regex MultiBuyPattern =
            new(@"(\d+)\s*יחידות\s*ב-?\s*(\d+(?:\.\d+)?)", RegexOptions.Compiled);

        private static readonly Regex PerUnitPattern =
            new(@"(\d+(?:\.\d+)?)\s*ש""ח\s*ליחידה", RegexOptions.Compiled);

        private static readonly Regex BuyGetPattern =
            new(@"קנה\s*(\d+)\s*יחיד\S*\s*,?\s*קבל\s*(\d+)\s*יחיד", RegexOptions.Compiled);

        private static readonly Regex RedemptionLimitPattern =
            new(@"מוגבל\s*ל-?\s*(\d+)\s*מימוש", RegexOptions.Compiled);

        private static readonly Regex ExpiryPattern =
            new(@"בתוקף\s*עד\s*(\d{1,2})/(\d{1,2})/(\d{4})", RegexOptions.Compiled);

        /// <summary>
        /// Parses a compare_results page into product details plus every store row from
        /// both result tables.
        /// </summary>
        public ChpCompareResult Parse(string html)
        {
            if (string.IsNullOrWhiteSpace(html)) return ChpCompareResult.Empty;

            var doc = new HtmlDocument();
            doc.LoadHtml(html);

            var (productName, description) = ParseProductDetails(doc);

            var tables = doc.DocumentNode.SelectNodes(
                "//table[contains(concat(' ', normalize-space(@class), ' '), ' results-table ')]");

            var rows = new List<ChpPriceRow>();
            var cellsSeen = 0;
            var cellsParsed = 0;
            var cellsPadded = 0;

            if (tables is not null)
            {
                foreach (var table in tables)
                {
                    var kind = ClassifyTable(table);
                    foreach (var tr in DataRows(table))
                    {
                        var tds = tr.SelectNodes("./td");
                        if (tds is null || tds.Count < 5) continue;

                        cellsSeen++;

                        // The padding arrives as numeric entities (&#8203;), so it only
                        // becomes visible after decoding -- searching the raw markup for
                        // literal zero-width characters finds nothing.
                        if (ContainsZeroWidth(WebUtility.HtmlDecode(tds[4].InnerText)))
                            cellsPadded++;

                        var row = ParseRow(tds, kind);
                        if (row is null) continue;

                        cellsParsed++;
                        rows.Add(row);
                    }
                }
            }

            // Zero-width padding in a price cell is the direct signal; a collapse in the
            // parse rate is the backstop in case the padding scheme changes.
            var obfuscated =
                cellsPadded > 0 ||
                (cellsSeen > 0 && cellsParsed * 2 < cellsSeen);

            return new ChpCompareResult
            {
                ProductName = productName,
                Description = description,
                Rows = rows,
                IsObfuscated = obfuscated
            };
        }

        /// <summary>
        /// Product name/contents and the manufacturer-and-barcode line, read from the
        /// hidden input and the heading that chp renders above the tables.
        /// </summary>
        public Dictionary<string, string> ParseProductInformation(string html)
        {
            var result = new Dictionary<string, string>();
            if (string.IsNullOrWhiteSpace(html)) return result;

            var doc = new HtmlDocument();
            doc.LoadHtml(html);
            var (name, description) = ParseProductDetails(doc);

            if (!string.IsNullOrWhiteSpace(name)) result["שם המוצר ותכולה"] = name;
            if (!string.IsNullOrWhiteSpace(description)) result["יצרן/מותג וברקוד"] = description;

            return result;
        }

        private static (string Name, string Description) ParseProductDetails(HtmlDocument doc)
        {
            var nameInput = doc.DocumentNode.SelectSingleNode("//input[@id='displayed_product_name_and_contents']");
            var name = nameInput is null
                ? string.Empty
                : Clean(nameInput.GetAttributeValue("value", string.Empty));

            var span = doc.DocumentNode.SelectSingleNode("//h3/span");
            var description = span is null ? string.Empty : Clean(span.InnerText);

            return (name, description);
        }

        /// <summary>
        /// Tells the two result tables apart by their third column header, following the
        /// same convention as the rest of the chp integration: the Hebrew column names
        /// are load-bearing identifiers, not display text.
        /// </summary>
        private static ChpStoreKind ClassifyTable(HtmlNode table)
        {
            var headers = table.SelectNodes(".//thead//th");
            if (headers is not null && headers.Any(h => Clean(h.InnerText).Contains("אתר אינטרנט")))
                return ChpStoreKind.Online;

            return ChpStoreKind.InStore;
        }

        /// <summary>
        /// Data rows only. chp repeats each store's address as an extra row shown just
        /// on narrow screens; those carry no price and must not be counted.
        /// </summary>
        private static IEnumerable<HtmlNode> DataRows(HtmlNode table)
        {
            var rows = table.SelectNodes(".//tbody/tr[not(contains(@class,'display_when_narrow'))]");
            return rows ?? Enumerable.Empty<HtmlNode>();
        }

        /// <summary>
        /// Builds a row, or returns null when the price cell does not hold a clean
        /// number — which is what every cell looks like on the obfuscated page.
        /// </summary>
        private static ChpPriceRow? ParseRow(HtmlNodeCollection tds, ChpStoreKind kind)
        {
            var regularPrice = ParsePrice(tds[4].InnerText);
            if (regularPrice is null) return null;

            return new ChpPriceRow
            {
                Source = kind,
                Chain = Clean(tds[0].InnerText),
                StoreName = Clean(tds[1].InnerText),
                Location = Clean(tds[2].InnerText),
                RegularPrice = regularPrice.Value,
                Promotion = ParsePromotion(tds[3])
            };
        }

        /// <summary>
        /// Reads the "מבצע" cell. The button's label is the effective unit price as chp
        /// computed it; its data-discount-desc holds the mechanism, any redemption cap
        /// and the expiry date, separated by literal &lt;BR&gt; markers.
        /// </summary>
        private static ChpPromotion? ParsePromotion(HtmlNode cell)
        {
            var button = cell.SelectSingleNode(".//button[contains(@class,'btn-discount')]");
            if (button is null) return null;

            // The label is "3.00 *" -- the asterisk flags it as a promotional price.
            var unitPrice = ParsePrice(button.InnerText.Replace("*", " "));
            if (unitPrice is null) return null;

            var rawDescription = WebUtility.HtmlDecode(button.GetAttributeValue("data-discount-desc", string.Empty));
            var description = Regex.Replace(rawDescription, "<br\\s*/?>", "\n", RegexOptions.IgnoreCase);
            description = StripZeroWidth(description).Trim();

            var (kind, requiredQuantity) = ClassifyPromotion(description);

            return new ChpPromotion
            {
                UnitPrice = unitPrice.Value,
                Kind = kind,
                RequiredQuantity = requiredQuantity,
                RedemptionLimit = ParseRedemptionLimit(description),
                ExpiresOn = ParseExpiry(description),
                Description = description
            };
        }

        /// <summary>
        /// Works out whether the promotion price is reachable buying a single unit.
        /// A description can list several offers ("מבצעים נוספים על מוצר זה"); the first
        /// mechanism in the text is the one the button's price refers to, so whichever
        /// pattern matches earliest wins.
        /// </summary>
        private static (ChpPromoKind Kind, int RequiredQuantity) ClassifyPromotion(string description)
        {
            if (string.IsNullOrWhiteSpace(description))
                return (ChpPromoKind.Unknown, 2);

            var perUnit = PerUnitPattern.Match(description);
            var multiBuy = MultiBuyPattern.Match(description);
            var buyGet = BuyGetPattern.Match(description);

            var earliest = int.MaxValue;
            var kind = ChpPromoKind.Unknown;
            var quantity = 2;

            if (perUnit.Success && perUnit.Index < earliest)
            {
                earliest = perUnit.Index;
                kind = ChpPromoKind.PerUnit;
                quantity = 1;
            }

            if (multiBuy.Success && multiBuy.Index < earliest)
            {
                earliest = multiBuy.Index;
                kind = ChpPromoKind.MultiBuy;
                quantity = int.TryParse(multiBuy.Groups[1].Value, out var n) && n > 0 ? n : 2;
            }

            if (buyGet.Success && buyGet.Index < earliest)
            {
                kind = ChpPromoKind.BuyGet;
                var bought = int.TryParse(buyGet.Groups[1].Value, out var b) ? b : 1;
                var free = int.TryParse(buyGet.Groups[2].Value, out var f) ? f : 1;
                quantity = Math.Max(2, bought + free);
            }

            // An unrecognised mechanism is treated as multi-buy: assuming a deal is
            // reachable at quantity 1 when it is not would understate the real price.
            return (kind, quantity);
        }

        private static int? ParseRedemptionLimit(string description)
        {
            var match = RedemptionLimitPattern.Match(description);
            return match.Success && int.TryParse(match.Groups[1].Value, out var limit) ? limit : null;
        }

        private static DateOnly? ParseExpiry(string description)
        {
            var match = ExpiryPattern.Match(description);
            if (!match.Success) return null;

            var day = int.Parse(match.Groups[1].Value, CultureInfo.InvariantCulture);
            var month = int.Parse(match.Groups[2].Value, CultureInfo.InvariantCulture);
            var year = int.Parse(match.Groups[3].Value, CultureInfo.InvariantCulture);

            try
            {
                return new DateOnly(year, month, day);
            }
            catch (ArgumentOutOfRangeException)
            {
                return null;
            }
        }

        private static decimal? ParsePrice(string? raw)
        {
            var text = Clean(raw);
            if (!PriceShape.IsMatch(text)) return null;

            return decimal.TryParse(text.Replace(',', '.'), NumberStyles.Number, CultureInfo.InvariantCulture, out var value)
                ? value
                : null;
        }

        private static string Clean(string? s) =>
            Regex.Replace(StripZeroWidth(WebUtility.HtmlDecode(s ?? string.Empty)), @"\s+", " ").Trim();

        private static string StripZeroWidth(string s) =>
            s.IndexOfAny(ZeroWidthChars) < 0
                ? s
                : string.Concat(s.Where(c => Array.IndexOf(ZeroWidthChars, c) < 0));

        private static bool ContainsZeroWidth(string s) =>
            s.IndexOfAny(ZeroWidthChars) >= 0;
    }
}
