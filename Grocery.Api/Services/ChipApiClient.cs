using Microsoft.AspNetCore.WebUtilities;
using System.Net;

namespace Grocery.Api.Services
{
    public class ChipApiClient
    {
        private readonly IHttpClientFactory _httpClientFactory;
        private const string CompareResultsUrl = "https://chp.co.il/main_page/compare_results"; 

        public ChipApiClient(IHttpClientFactory httpClientFactory)
        {
            _httpClientFactory = httpClientFactory;
        }

        /// <summary>
        /// Calls the CHP compare page and returns:
        /// - IsSuccess: did the HTTP call succeed (2xx)?
        /// - StatusCode: HTTP status code
        /// - Body: response body (HTML string)
        /// </summary>
        public async Task<(bool IsSuccess, HttpStatusCode StatusCode, string Body)> GetCompareResultsHtmlAsync(
            string shoppingCity,
            string sku,
            int numResults,
            string streetId = "0",
            string cityId = "0",
            string productNameOrBarcode = "",
            string from = "0")
        {
            // Clamp to avoid abuse
            numResults = Math.Clamp(numResults, 1, 500);

            var qs = new Dictionary<string, string?>
            {
                ["shopping_address"] = shoppingCity,   // maps from shopping_city
                ["shopping_address_street_id"] = streetId,
                ["shopping_address_city_id"] = cityId,
                ["product_name_or_barcode"] = productNameOrBarcode,      // empty by default
                ["product_barcode"] = sku,             // maps from sku
                ["from"] = from,
                ["num_results"] = numResults.ToString()
            };

            var fullUrl = QueryHelpers.AddQueryString(CompareResultsUrl, qs!);

            var client = _httpClientFactory.CreateClient("ChpCompare");
            using var req = new HttpRequestMessage(HttpMethod.Get, fullUrl);
            using var res = await client.SendAsync(
                req,
                HttpCompletionOption.ResponseHeadersRead
            );

            var body = await res.Content.ReadAsStringAsync(); // no CT overload

            return (res.IsSuccessStatusCode, res.StatusCode, body);
        }
    }
}
