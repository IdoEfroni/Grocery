using Microsoft.AspNetCore.WebUtilities;
using System.Diagnostics;
using System.Net;

namespace Grocery.Api.Services
{
    /// <summary>
    /// Thin HTTP client for the chp.co.il compare page, with outbound pacing.
    /// </summary>
    /// <remarks>
    /// <para><b>Pacing is not politeness, it is correctness.</b> chp answers rapid
    /// requests from one IP with an anti-scraping variant of the page whose prices no
    /// plain HTML parser can read. Measured over runs of five consecutive requests: at
    /// a 2s gap roughly every other response came back obfuscated, while at 4s and 6s
    /// every response was clean — hence the 4s default. The gate is instance state, so
    /// this client must stay a singleton for it to mean anything.</para>
    ///
    /// <para>The gate serialises every outbound call, so a burst of distinct barcodes
    /// queues rather than fanning out. That is the intended trade: a slow correct answer
    /// beats a fast unparseable one, and the response cache in
    /// <see cref="ChpPriceLookupService"/> keeps repeat lookups off this path entirely.</para>
    ///
    /// <para><b>num_results and from are ignored by the server.</b> Measured across
    /// values from 5 to 1000: the response is identical every time, listing every store
    /// near the address. They are still sent, matching what the site's own form submits,
    /// but no caller should expect them to change the result size.</para>
    /// </remarks>
    public class ChipApiClient
    {
        private const string CompareResultsUrl = "https://chp.co.il/main_page/compare_results";

        /// <summary>What the site's own search form submits. The server ignores it.</summary>
        private const string FormNumResults = "30";

        private readonly IHttpClientFactory _httpClientFactory;
        private readonly ILogger<ChipApiClient> _logger;
        private readonly TimeSpan _minRequestInterval;

        private readonly SemaphoreSlim _gate = new(1, 1);
        private long _lastRequestTicks;

        public ChipApiClient(
            IHttpClientFactory httpClientFactory,
            IConfiguration configuration,
            ILogger<ChipApiClient> logger)
        {
            _httpClientFactory = httpClientFactory;
            _logger = logger;

            var intervalMs = configuration.GetValue<int?>("Chp:MinRequestIntervalMs") ?? 4000;
            _minRequestInterval = TimeSpan.FromMilliseconds(Math.Clamp(intervalMs, 0, 30_000));
        }

        /// <summary>
        /// Calls the CHP compare page and returns:
        /// - IsSuccess: did the HTTP call succeed (2xx)?
        /// - StatusCode: HTTP status code
        /// - Body: response body (HTML string)
        /// </summary>
        /// <param name="shoppingCity">
        /// Shopping address. Must be in Hebrew ("חיפה"): chp cannot geocode a Latin
        /// transliteration, and answers one with the online-stores table only.
        /// </param>
        /// <param name="sku">Product barcode.</param>
        public async Task<(bool IsSuccess, HttpStatusCode StatusCode, string Body)> GetCompareResultsHtmlAsync(
            string shoppingCity,
            string sku,
            string streetId = "0",
            string cityId = "0",
            string productNameOrBarcode = "",
            string from = "0",
            CancellationToken ct = default)
        {
            var qs = new Dictionary<string, string?>
            {
                ["shopping_address"] = shoppingCity,
                ["shopping_address_street_id"] = streetId,
                ["shopping_address_city_id"] = cityId,
                ["product_name_or_barcode"] = productNameOrBarcode,
                ["product_barcode"] = sku,
                ["from"] = from,
                ["num_results"] = FormNumResults
            };

            var fullUrl = QueryHelpers.AddQueryString(CompareResultsUrl, qs!);

            await WaitForTurnAsync(ct);

            var client = _httpClientFactory.CreateClient("ChpCompare");
            using var req = new HttpRequestMessage(HttpMethod.Get, fullUrl);
            using var res = await client.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, ct);

            var body = await res.Content.ReadAsStringAsync(ct);

            return (res.IsSuccessStatusCode, res.StatusCode, body);
        }

        /// <summary>
        /// Serialises outbound calls and holds the configured gap between them.
        /// </summary>
        private async Task WaitForTurnAsync(CancellationToken ct)
        {
            if (_minRequestInterval <= TimeSpan.Zero) return;

            await _gate.WaitAsync(ct);
            try
            {
                var elapsed = Stopwatch.GetElapsedTime(_lastRequestTicks);
                if (_lastRequestTicks != 0 && elapsed < _minRequestInterval)
                {
                    var wait = _minRequestInterval - elapsed;
                    _logger.LogDebug("Pacing chp request, waiting {WaitMs}ms", (int)wait.TotalMilliseconds);
                    await Task.Delay(wait, ct);
                }

                _lastRequestTicks = Stopwatch.GetTimestamp();
            }
            finally
            {
                _gate.Release();
            }
        }
    }
}
