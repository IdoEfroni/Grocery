using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Logging;

namespace Grocery.Api.Services;

public sealed class DuckDuckGoImageService
{
    // Multiple patterns to try - DDG may format VQD differently
    private static readonly Regex[] VqdPatterns = new[]
    {
        // Standard patterns
        new Regex(@"vqd\s*=\s*['""](?<vqd>[^'""]+)['""]", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new Regex(@"vqd['""]\s*:\s*['""](?<vqd>[^'""]+)['""]", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new Regex(@"vqd=([^&'""\s<>]+)", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new Regex(@"""vqd"":\s*""([^""]+)""", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new Regex(@"vqd['""]\s*=\s*['""]([^'""]+)['""]", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new Regex(@"vqd['""]\s*:\s*['""]([^'""]+)['""]", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        // Additional patterns for minified JS and different formats
        new Regex(@"vqd\s*:\s*['""](?<vqd>[^'""]+)['""]", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new Regex(@"vqd\s*=\s*([^&'""\s<>;]+)", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new Regex(@"vqd['""]\s*=\s*([^&'""\s<>;]+)", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        // Pattern for vqd in script tags or data attributes
        new Regex(@"(?:vqd|VQD)\s*[=:]\s*['""](?<vqd>[a-zA-Z0-9\-_]+)['""]", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        // Pattern for vqd in URL parameters within the HTML
        new Regex(@"[?&]vqd=([^&'""\s<>]+)", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        // Pattern for vqd in window object or global variables
        new Regex(@"window\.vqd\s*=\s*['""](?<vqd>[^'""]+)['""]", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new Regex(@"var\s+vqd\s*=\s*['""](?<vqd>[^'""]+)['""]", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new Regex(@"let\s+vqd\s*=\s*['""](?<vqd>[^'""]+)['""]", RegexOptions.Compiled | RegexOptions.IgnoreCase),
        new Regex(@"const\s+vqd\s*=\s*['""](?<vqd>[^'""]+)['""]", RegexOptions.Compiled | RegexOptions.IgnoreCase),
    };
    private readonly HttpClient _http;
    private readonly ILogger<DuckDuckGoImageService> _logger;

    public DuckDuckGoImageService(HttpClient http, ILogger<DuckDuckGoImageService> logger)
    {
        _http = http;
        _logger = logger;

        // DDG can be picky without headers - set comprehensive browser-like headers
        _http.DefaultRequestHeaders.UserAgent.ParseAdd(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
            "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
        _http.DefaultRequestHeaders.Accept.ParseAdd("text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7");
        _http.DefaultRequestHeaders.AcceptLanguage.ParseAdd("en-US,en;q=0.9");
        _http.DefaultRequestHeaders.AcceptEncoding.ParseAdd("gzip, deflate, br");
        _http.DefaultRequestHeaders.Add("sec-ch-ua", "\"Not_A Brand\";v=\"8\", \"Chromium\";v=\"120\", \"Google Chrome\";v=\"120\"");
        _http.DefaultRequestHeaders.Add("sec-ch-ua-mobile", "?0");
        _http.DefaultRequestHeaders.Add("sec-ch-ua-platform", "\"Windows\"");
        _http.DefaultRequestHeaders.Add("sec-fetch-dest", "document");
        _http.DefaultRequestHeaders.Add("sec-fetch-mode", "navigate");
        _http.DefaultRequestHeaders.Add("sec-fetch-site", "none");
        _http.DefaultRequestHeaders.Add("sec-fetch-user", "?1");
        _http.DefaultRequestHeaders.Add("upgrade-insecure-requests", "1");
    }

    public async Task<(byte[] Bytes, string ContentType)?> SearchAndDownloadFirstImageAsync(
        string query,
        int maxBytes = 5 * 1024 * 1024,
        CancellationToken ct = default)
    {
        _logger.LogInformation("Starting image search for query: {Query}", query);

        // 1) Get vqd token
        var vqd = await GetVqdAsync(query, ct);
        if (string.IsNullOrWhiteSpace(vqd))
        {
            _logger.LogWarning("Failed to extract VQD token for query: {Query}. Image search cannot proceed.", query);
            return null;
        }

        _logger.LogDebug("Successfully extracted VQD token for query: {Query}", query);

        // Small delay to mimic browser behavior
        await Task.Delay(100, ct);

        // 2) Call i.js JSON endpoint for image results
        var resultsUrl =
            $"https://duckduckgo.com/i.js?l=us-en&o=json&q={WebUtility.UrlEncode(query)}&vqd={WebUtility.UrlEncode(vqd)}&f=,,,&p=1";

        using var resultsReq = new HttpRequestMessage(HttpMethod.Get, resultsUrl);
        resultsReq.Headers.Referrer = new Uri("https://duckduckgo.com/");
        resultsReq.Headers.Add("Origin", "https://duckduckgo.com");
        // Override Accept header for JSON endpoint
        resultsReq.Headers.Accept.Clear();
        resultsReq.Headers.Accept.ParseAdd("application/json, text/javascript, */*; q=0.01");
        // Update sec-fetch headers for this request type (request headers override default headers)
        if (resultsReq.Headers.Contains("sec-fetch-dest"))
            resultsReq.Headers.Remove("sec-fetch-dest");
        if (resultsReq.Headers.Contains("sec-fetch-mode"))
            resultsReq.Headers.Remove("sec-fetch-mode");
        if (resultsReq.Headers.Contains("sec-fetch-site"))
            resultsReq.Headers.Remove("sec-fetch-site");
        resultsReq.Headers.Add("sec-fetch-dest", "empty");
        resultsReq.Headers.Add("sec-fetch-mode", "cors");
        resultsReq.Headers.Add("sec-fetch-site", "same-origin");

        using var resultsRes = await _http.SendAsync(resultsReq, HttpCompletionOption.ResponseHeadersRead, ct);
        if (!resultsRes.IsSuccessStatusCode)
        {
            _logger.LogWarning(
                "Image search API call failed for query: {Query}. Status: {StatusCode}, Reason: {ReasonPhrase}",
                query, (int)resultsRes.StatusCode, resultsRes.ReasonPhrase);
            return null;
        }

        _logger.LogDebug("Image search API call successful for query: {Query}", query);

        await using var jsonStream = await resultsRes.Content.ReadAsStreamAsync(ct);
        using var jsonDoc = await JsonDocument.ParseAsync(jsonStream, cancellationToken: ct);

        if (!jsonDoc.RootElement.TryGetProperty("results", out var resultsArr) ||
            resultsArr.ValueKind != JsonValueKind.Array ||
            resultsArr.GetArrayLength() == 0)
        {
            _logger.LogWarning("No image results found in API response for query: {Query}", query);
            return null;
        }

        _logger.LogDebug("Found {Count} image results for query: {Query}", resultsArr.GetArrayLength(), query);

        // Pick first image URL (field is usually "image")
        var first = resultsArr[0];
        var imageUrl = first.TryGetProperty("image", out var img) ? img.GetString() : null;
        if (string.IsNullOrWhiteSpace(imageUrl))
        {
            _logger.LogWarning("First image result does not contain a valid image URL for query: {Query}", query);
            return null;
        }

        _logger.LogDebug("Downloading image from URL: {ImageUrl} for query: {Query}", imageUrl, query);

        // 3) Download the image bytes and return as File
        return await DownloadImageAsync(imageUrl!, maxBytes, ct);
    }

    private async Task<string?> GetVqdAsync(string query, CancellationToken ct)
    {
        // Try multiple approaches to get VQD
        // Approach 1: Try the standard image search page
        var vqd = await TryGetVqdFromImageSearchPageAsync(query, ct);
        if (!string.IsNullOrWhiteSpace(vqd))
            return vqd;

        // Approach 2: Try the main search page first, then image search
        _logger.LogDebug("Trying alternative approach: visiting main page first for query: {Query}", query);
        vqd = await TryGetVqdWithSessionAsync(query, ct);
        if (!string.IsNullOrWhiteSpace(vqd))
            return vqd;

        // Approach 3: Try direct API call without VQD (some endpoints might work)
        _logger.LogWarning("All VQD extraction methods failed for query: {Query}. DuckDuckGo may require JavaScript execution.", query);
        return null;
    }

    private async Task<string?> TryGetVqdFromImageSearchPageAsync(string query, CancellationToken ct)
    {
        var htmlUrl = $"https://duckduckgo.com/?q={WebUtility.UrlEncode(query)}&iax=images&ia=images";
        _logger.LogDebug("Requesting VQD from URL: {Url} for query: {Query}", htmlUrl, query);

        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Get, htmlUrl);
            req.Headers.Referrer = new Uri("https://duckduckgo.com/");
            // Ensure proper Accept header for HTML request
            req.Headers.Accept.Clear();
            req.Headers.Accept.ParseAdd("text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8");

            using var res = await _http.SendAsync(req, HttpCompletionOption.ResponseContentRead, ct);
            
            if (!res.IsSuccessStatusCode)
            {
                _logger.LogWarning(
                    "Failed to retrieve HTML page for VQD extraction. Query: {Query}, Status: {StatusCode}, Reason: {ReasonPhrase}",
                    query, (int)res.StatusCode, res.ReasonPhrase);
                return null;
            }

            // Read as bytes first to check encoding, then convert to string
            var htmlBytes = await res.Content.ReadAsByteArrayAsync(ct);
            var contentLength = htmlBytes.Length;
            
            // Try to detect encoding from Content-Type header
            var encoding = Encoding.UTF8;
            if (res.Content.Headers.ContentType?.CharSet != null)
            {
                try
                {
                    encoding = Encoding.GetEncoding(res.Content.Headers.ContentType.CharSet);
                }
                catch
                {
                    // Fall back to UTF-8 if charset parsing fails
                }
            }
            
            // Try UTF-8 first, then fall back to other encodings if needed
            string html;
            try
            {
                html = encoding.GetString(htmlBytes);
            }
            catch
            {
                // If encoding fails, try UTF-8 with error handling
                html = Encoding.UTF8.GetString(htmlBytes);
            }
            
            _logger.LogDebug(
                "Retrieved HTML page for VQD extraction. Query: {Query}, ContentLength: {ContentLength}, Encoding: {Encoding}",
                query, contentLength, encoding.WebName);

            // Try multiple patterns to extract VQD
            for (int i = 0; i < VqdPatterns.Length; i++)
            {
                var pattern = VqdPatterns[i];
                var m = pattern.Match(html);
                if (m.Success)
                {
                    // Try named group first, then first capture group
                    var vqd = m.Groups["vqd"].Success 
                        ? m.Groups["vqd"].Value 
                        : m.Groups.Count > 1 ? m.Groups[1].Value : null;
                    
                    if (!string.IsNullOrWhiteSpace(vqd))
                    {
                        _logger.LogInformation(
                            "Successfully extracted VQD using pattern {PatternIndex} for query: {Query}",
                            i, query);
                        return vqd;
                    }
                    else
                    {
                        _logger.LogDebug(
                            "Pattern {PatternIndex} matched but extracted VQD was empty for query: {Query}",
                            i, query);
                    }
                }
            }

            // Log HTML snippet for debugging when all patterns fail
            // Use base64 encoding to avoid encoding issues in logs
            var htmlSnippet = html.Length > 2000 
                ? html.Substring(0, 2000) + "..." 
                : html;
            
            // Also search for any occurrence of "vqd" (case insensitive) to see if it exists at all
            var vqdOccurrences = Regex.Matches(html, @"vqd", RegexOptions.IgnoreCase).Count;
            
            // Convert snippet to base64 for safe logging
            var htmlSnippetBytes = Encoding.UTF8.GetBytes(htmlSnippet);
            var htmlSnippetBase64 = Convert.ToBase64String(htmlSnippetBytes);
            
            _logger.LogWarning(
                "Failed to extract VQD from HTML using any pattern. Query: {Query}, ContentLength: {ContentLength}, VQDOccurrences: {VQDOccurrences}, HTMLSnippetBase64: {HtmlSnippetBase64}",
                query, contentLength, vqdOccurrences, htmlSnippetBase64);
            
            // Also log a search for common VQD-like patterns in the HTML
            var vqdLikePattern = Regex.Match(html, @"['""]([a-zA-Z0-9\-_]{20,})['""]", RegexOptions.IgnoreCase);
            if (vqdLikePattern.Success)
            {
                _logger.LogDebug(
                    "Found potential VQD-like token in HTML (first match): {Token}",
                    vqdLikePattern.Groups[1].Value);
            }

            // Try extracting from JavaScript code in script tags
            var scriptTagPattern = new Regex(@"<script[^>]*>(.*?)</script>", RegexOptions.Compiled | RegexOptions.IgnoreCase | RegexOptions.Singleline);
            var scriptMatches = scriptTagPattern.Matches(html);
            foreach (Match scriptMatch in scriptMatches)
            {
                var scriptContent = scriptMatch.Groups[1].Value;
                // Try to find VQD in JavaScript code
                foreach (var pattern in VqdPatterns)
                {
                    var m = pattern.Match(scriptContent);
                    if (m.Success)
                    {
                        var vqd = m.Groups["vqd"].Success 
                            ? m.Groups["vqd"].Value 
                            : m.Groups.Count > 1 ? m.Groups[1].Value : null;
                        
                        if (!string.IsNullOrWhiteSpace(vqd))
                        {
                            _logger.LogInformation(
                                "Successfully extracted VQD from JavaScript code for query: {Query}",
                                query);
                            return vqd;
                        }
                    }
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex,
                "Exception occurred while attempting to extract VQD for query: {Query}",
                query);
            return null;
        }

        return null;
    }

    private async Task<string?> TryGetVqdWithSessionAsync(string query, CancellationToken ct)
    {
        try
        {
            // First, visit the main DuckDuckGo page to establish a session
            using var mainReq = new HttpRequestMessage(HttpMethod.Get, "https://duckduckgo.com/");
            mainReq.Headers.Accept.Clear();
            mainReq.Headers.Accept.ParseAdd("text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");
            
            using var mainRes = await _http.SendAsync(mainReq, HttpCompletionOption.ResponseHeadersRead, ct);
            if (mainRes.IsSuccessStatusCode)
            {
                // Small delay to mimic browser behavior
                await Task.Delay(200, ct);
                
                // Now try the image search page with the established session
                return await TryGetVqdFromImageSearchPageAsync(query, ct);
            }
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Failed to establish session before VQD extraction for query: {Query}", query);
        }
        
        return null;
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
