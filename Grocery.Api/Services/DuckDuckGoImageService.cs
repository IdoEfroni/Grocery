using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Grocery.Api.Services;

public sealed class DuckDuckGoImageService
{
    private static readonly Regex VqdRegex =
    new(@"vqd\s*=\s*['""](?<vqd>[^'""]+)['""]", RegexOptions.Compiled);
    private readonly HttpClient _http;

    public DuckDuckGoImageService(HttpClient http)
    {
        _http = http;

        // DDG can be picky without headers
        _http.DefaultRequestHeaders.UserAgent.ParseAdd(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
            "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
        _http.DefaultRequestHeaders.Accept.ParseAdd("text/html,application/json");
    }

    public async Task<(byte[] Bytes, string ContentType)?> SearchAndDownloadFirstImageAsync(
        string query,
        int maxBytes = 5 * 1024 * 1024,
        CancellationToken ct = default)
    {
        // 1) Get vqd token
        var vqd = await GetVqdAsync(query, ct);
        if (string.IsNullOrWhiteSpace(vqd))
            return null;

        // 2) Call i.js JSON endpoint for image results
        var resultsUrl =
            $"https://duckduckgo.com/i.js?l=us-en&o=json&q={WebUtility.UrlEncode(query)}&vqd={WebUtility.UrlEncode(vqd)}&f=,,,&p=1";

        using var resultsReq = new HttpRequestMessage(HttpMethod.Get, resultsUrl);
        resultsReq.Headers.Referrer = new Uri("https://duckduckgo.com/");

        using var resultsRes = await _http.SendAsync(resultsReq, HttpCompletionOption.ResponseHeadersRead, ct);
        if (!resultsRes.IsSuccessStatusCode)
            return null;

        await using var jsonStream = await resultsRes.Content.ReadAsStreamAsync(ct);
        using var jsonDoc = await JsonDocument.ParseAsync(jsonStream, cancellationToken: ct);

        if (!jsonDoc.RootElement.TryGetProperty("results", out var resultsArr) ||
            resultsArr.ValueKind != JsonValueKind.Array ||
            resultsArr.GetArrayLength() == 0)
        {
            return null;
        }

        // Pick first image URL (field is usually "image")
        var first = resultsArr[0];
        var imageUrl = first.TryGetProperty("image", out var img) ? img.GetString() : null;
        if (string.IsNullOrWhiteSpace(imageUrl))
            return null;

        // 3) Download the image bytes and return as File
        return await DownloadImageAsync(imageUrl!, maxBytes, ct);
    }

    private async Task<string?> GetVqdAsync(string query, CancellationToken ct)
    {
        var htmlUrl = $"https://duckduckgo.com/?q={WebUtility.UrlEncode(query)}&iax=images&ia=images";

        using var req = new HttpRequestMessage(HttpMethod.Get, htmlUrl);
        req.Headers.Referrer = new Uri("https://duckduckgo.com/");
        req.Headers.Accept.ParseAdd("text/html");

        using var res = await _http.SendAsync(req, HttpCompletionOption.ResponseContentRead, ct);
        if (!res.IsSuccessStatusCode)
            return null;

        var html = await res.Content.ReadAsStringAsync(ct);

        var m = VqdRegex.Match(html);
        return m.Success ? m.Groups["vqd"].Value : null;
    }

    private async Task<(byte[] Bytes, string ContentType)?> DownloadImageAsync(string imageUrl, int maxBytes, CancellationToken ct)
    {
        using var req = new HttpRequestMessage(HttpMethod.Get, imageUrl);
        using var res = await _http.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, ct);

        if (!res.IsSuccessStatusCode)
            return null;

        var contentType = res.Content.Headers.ContentType?.MediaType ?? "application/octet-stream";
        if (!contentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase))
            return null;

        var contentLen = res.Content.Headers.ContentLength;
        if (contentLen.HasValue && contentLen.Value > maxBytes)
            return null;

        var bytes = await res.Content.ReadAsByteArrayAsync(ct);
        if (bytes.Length > maxBytes)
            return null;

        return (bytes, contentType);
    }
}
