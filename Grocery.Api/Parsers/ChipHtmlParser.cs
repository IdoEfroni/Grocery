using System.Net;
using System.Text.RegularExpressions;
using HtmlAgilityPack;

namespace Grocery.Api.Parsers
{
    public class ChipHtmlParser
    {
        public List<Dictionary<string, string>> ParseCompareResultsHtml(string html)
        {
            var results = new List<Dictionary<string, string>>();
            if (string.IsNullOrWhiteSpace(html)) return results;

            var doc = new HtmlDocument();
            doc.LoadHtml(html);

            var table = doc.DocumentNode.SelectSingleNode(
                "//table[@id='results-table' or contains(concat(' ', normalize-space(@class), ' '), ' results-table ')]"
            ); if (table is null) return results;

            var rowNodes = table.SelectNodes(".//tbody/tr[not(contains(@class,'display_when_narrow'))]");
            if (rowNodes is null) return results;

            string Clean(string? s) =>
                Regex.Replace(WebUtility.HtmlDecode(s ?? string.Empty), @"\s+", " ").Trim();

            foreach (var tr in rowNodes)
            {
                var tds = tr.SelectNodes("./td");
                if (tds is null || tds.Count < 5) continue;

                var row = new Dictionary<string, string>
                {
                    ["רשת"] = Clean(tds[0].InnerText),
                    ["שם החנות"] = Clean(tds[1].InnerText),
                    ["כתובת החנות"] = Clean(tds[2].InnerText),
                    ["מחיר"] = Clean(tds[4].InnerText),
                };

                if (row.Values.Any(v => !string.IsNullOrWhiteSpace(v)))
                    results.Add(row);
            }

            return results;
        }

        /// <summary>
        /// Parses product-level information (name/contents and manufacturer/barcode)
        /// from the product html snippet.
        /// </summary>
        public Dictionary<string, string> ParseProductInformation(string html)
        {
            var result = new Dictionary<string, string>();
            if (string.IsNullOrWhiteSpace(html)) return result;

            var doc = new HtmlDocument();
            doc.LoadHtml(html);

            string Clean(string? s) =>
                Regex.Replace(WebUtility.HtmlDecode(s ?? string.Empty), @"\s+", " ").Trim();

            // 1) From hidden input: displayed_product_name_and_contents
            var nameInput = doc.DocumentNode.SelectSingleNode("//input[@id='displayed_product_name_and_contents']");
            if (nameInput is not null)
            {
                var rawValue = nameInput.GetAttributeValue("value", string.Empty);
                var nameAndContents = Clean(rawValue);
                if (!string.IsNullOrWhiteSpace(nameAndContents))
                {
                    // call it whatever key you like
                    result["שם המוצר ותכולה"] = nameAndContents;
                }
            }

            // 2) From the <span> inside the <h3> (contains manufacturer & barcode)
            // Example: (יצרן/מותג: שטראוס, ברקוד: 7290011194246)
            var span = doc.DocumentNode.SelectSingleNode("//h3/span");
            if (span is not null)
            {
                var details = Clean(span.InnerText);
                if (!string.IsNullOrWhiteSpace(details))
                {
                    result["יצרן/מותג וברקוד"] = details;
                }
            }

            return result;
        }
    }
}

