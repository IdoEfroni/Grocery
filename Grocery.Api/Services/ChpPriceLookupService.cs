using Grocery.Api.Exceptions;
using Grocery.Api.Models.Chp;
using Grocery.Api.Parsers;
using Microsoft.Extensions.Caching.Memory;

namespace Grocery.Api.Services;

public interface IChpPriceLookup
{
    /// <summary>
    /// Fetches and parses chp's price rows for a barcode near a shopping address,
    /// retrying past chp's anti-scraping page and caching what comes back.
    /// </summary>
    /// <exception cref="ComparePricesException">The upstream call returned a non-success status.</exception>
    Task<ChpCompareResult> LookupAsync(string shoppingCity, string sku, CancellationToken ct = default);
}

/// <summary>
/// Fetch-parse-retry-cache around <see cref="ChipApiClient"/>.
/// </summary>
/// <remarks>
/// chp serves an unparseable anti-scraping page to clients that request in bursts.
/// <see cref="ChipApiClient"/> paces requests to avoid provoking it; this class handles
/// the case where one slips through anyway, by retrying — the pacing gate supplies the
/// gap that makes the retry work. Results are cached because grocery prices move daily
/// at most, and every cache hit is one less request chp has to serve.
/// </remarks>
public sealed class ChpPriceLookupService : IChpPriceLookup
{
    private readonly ChipApiClient _client;
    private readonly ChipHtmlParser _parser;
    private readonly IMemoryCache _cache;
    private readonly ILogger<ChpPriceLookupService> _logger;
    private readonly int _maxAttempts;
    private readonly TimeSpan _cacheDuration;
    private readonly TimeSpan _retryBackoff;

    public ChpPriceLookupService(
        ChipApiClient client,
        ChipHtmlParser parser,
        IMemoryCache cache,
        IConfiguration configuration,
        ILogger<ChpPriceLookupService> logger)
    {
        _client = client;
        _parser = parser;
        _cache = cache;
        _logger = logger;

        _maxAttempts = Math.Clamp(configuration.GetValue<int?>("Chp:MaxAttempts") ?? 3, 1, 5);
        _cacheDuration = TimeSpan.FromMinutes(
            Math.Clamp(configuration.GetValue<int?>("Chp:CacheMinutes") ?? 30, 0, 24 * 60));
        _retryBackoff = TimeSpan.FromMilliseconds(
            Math.Clamp(configuration.GetValue<int?>("Chp:RetryBackoffMs") ?? 4000, 0, 30_000));
    }

    public async Task<ChpCompareResult> LookupAsync(string shoppingCity, string sku, CancellationToken ct = default)
    {
        var cacheKey = $"chp:{shoppingCity}:{sku}";
        if (_cacheDuration > TimeSpan.Zero && _cache.TryGetValue<ChpCompareResult>(cacheKey, out var cached) && cached is not null)
        {
            _logger.LogDebug("Compare prices cache hit. Sku={Sku}, City={City}", sku, shoppingCity);
            return cached;
        }

        ChpCompareResult result = ChpCompareResult.Empty;

        for (var attempt = 1; attempt <= _maxAttempts; attempt++)
        {
            var (isSuccess, statusCode, body) = await _client.GetCompareResultsHtmlAsync(shoppingCity, sku, ct: ct);
            if (!isSuccess)
            {
                _logger.LogWarning("Compare prices failed: status={StatusCode}, sku={Sku}", statusCode, sku);
                throw new ComparePricesException(statusCode, body);
            }

            result = _parser.Parse(body);
            if (!result.IsObfuscated)
            {
                if (_cacheDuration > TimeSpan.Zero)
                    _cache.Set(cacheKey, result, _cacheDuration);

                return result;
            }

            _logger.LogInformation(
                "chp returned its anti-scraping page (attempt {Attempt}/{MaxAttempts}). Sku={Sku}",
                attempt, _maxAttempts, sku);

            // Back off on top of the client's own pacing. Getting the obfuscated page at
            // all means the rate that request went out at was already too high for the
            // window chp is currently applying, so repeating at that same rate tends to
            // keep failing.
            if (attempt < _maxAttempts)
                await Task.Delay(_retryBackoff * attempt, ct);
        }

        // Deliberately not cached: a degraded result should not be pinned for the next
        // half hour when the very next request is likely to succeed.
        _logger.LogWarning(
            "Giving up on chp after {MaxAttempts} obfuscated responses. Sku={Sku}", _maxAttempts, sku);

        return result;
    }
}
