using System.Net;
using System.Net.Http.Headers;
using Microsoft.AspNetCore.Http;

namespace Grocery.Api.Services;

public class PhotoService : IPhotoService
{
    private readonly HttpClient _httpClient;
    private readonly IWebHostEnvironment _environment;
    private readonly string _photosFolder;
    private const int MaxFileSizeBytes = 5 * 1024 * 1024; // 5MB
    private static readonly string[] AllowedExtensions = { ".jpg", ".jpeg", ".png", ".gif", ".webp" };

    public PhotoService(HttpClient httpClient, IWebHostEnvironment environment)
    {
        _httpClient = httpClient;
        _environment = environment;
        _photosFolder = Path.Combine(_environment.ContentRootPath, "uploads", "photos");
        
        // Ensure photos directory exists
        Directory.CreateDirectory(_photosFolder);
    }

    public async Task<string?> SavePhotoAsync(string sku, IFormFile? file, string? photoUrl, CancellationToken ct = default)
    {
        // Validate SKU
        if (string.IsNullOrWhiteSpace(sku))
            throw new ArgumentException("SKU is required to save a photo.");

        // If no photo provided, return null
        if (file == null && string.IsNullOrWhiteSpace(photoUrl))
            return null;

        // Sanitize SKU for filename (remove invalid characters)
        var sanitizedSku = SanitizeSkuForFilename(sku);

        // Delete old photo if it exists
        await DeletePhotoAsync(sanitizedSku, ct);

        byte[] imageBytes;
        string extension;

        if (file != null)
        {
            // Handle file upload
            if (file.Length == 0)
                throw new ArgumentException("File is empty.");

            if (file.Length > MaxFileSizeBytes)
                throw new ArgumentException($"File size exceeds maximum allowed size of {MaxFileSizeBytes / (1024 * 1024)}MB.");

            extension = GetExtensionFromFilename(file.FileName);
            if (!IsValidImageExtension(extension))
                throw new ArgumentException($"Invalid image format. Allowed formats: {string.Join(", ", AllowedExtensions)}");

            using var stream = file.OpenReadStream();
            imageBytes = new byte[file.Length];
            await stream.ReadAsync(imageBytes, 0, (int)file.Length, ct);
        }
        else
        {
            // Handle URL download
            if (!Uri.TryCreate(photoUrl, UriKind.Absolute, out var uri))
                throw new ArgumentException("Invalid photo URL.");

            var result = await DownloadImageFromUrlAsync(photoUrl!, ct);
            if (result == null)
                throw new InvalidOperationException("Failed to download image from URL.");

            imageBytes = result.Value.Bytes;
            extension = GetExtensionFromContentType(result.Value.ContentType) ?? ".jpg";
        }

        // Save file with SKU as filename
        var fileName = $"{sanitizedSku}{extension}";
        var filePath = Path.Combine(_photosFolder, fileName);

        await File.WriteAllBytesAsync(filePath, imageBytes, ct);

        // Return relative path
        return Path.Combine("uploads", "photos", fileName).Replace('\\', '/');
    }

    public async Task DeletePhotoAsync(string sku, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(sku))
            return;

        var sanitizedSku = SanitizeSkuForFilename(sku);

        // Try to delete photo with any of the allowed extensions
        foreach (var ext in AllowedExtensions)
        {
            var fileName = $"{sanitizedSku}{ext}";
            var filePath = Path.Combine(_photosFolder, fileName);
            
            if (File.Exists(filePath))
            {
                try
                {
                    File.Delete(filePath);
                }
                catch
                {
                    // Ignore deletion errors (file might be in use)
                }
            }
        }

        await Task.CompletedTask;
    }

    public async Task<string?> GetPhotoPathAsync(string? sku, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(sku))
            return null;

        var sanitizedSku = SanitizeSkuForFilename(sku);

        // Check if photo exists with any of the allowed extensions
        foreach (var ext in AllowedExtensions)
        {
            var fileName = $"{sanitizedSku}{ext}";
            var filePath = Path.Combine(_photosFolder, fileName);
            
            if (File.Exists(filePath))
            {
                // Return relative path
                return Path.Combine("uploads", "photos", fileName).Replace('\\', '/');
            }
        }

        return null;
    }

    private async Task<(byte[] Bytes, string ContentType)?> DownloadImageFromUrlAsync(string url, CancellationToken ct = default)
    {
        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Get, url);
            req.Headers.UserAgent.ParseAdd(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
                "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
            req.Headers.Accept.ParseAdd("image/*");

            using var res = await _httpClient.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, ct);

            if (!res.IsSuccessStatusCode)
                return null;

            var contentType = res.Content.Headers.ContentType?.MediaType ?? "application/octet-stream";
            if (!contentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase))
                return null;

            var contentLen = res.Content.Headers.ContentLength;
            if (contentLen.HasValue && contentLen.Value > MaxFileSizeBytes)
                return null;

            var bytes = await res.Content.ReadAsByteArrayAsync(ct);
            if (bytes.Length > MaxFileSizeBytes)
                return null;

            return (bytes, contentType);
        }
        catch
        {
            return null;
        }
    }

    private static string GetExtensionFromFilename(string filename)
    {
        var ext = Path.GetExtension(filename).ToLowerInvariant();
        return string.IsNullOrEmpty(ext) ? ".jpg" : ext;
    }

    private static string? GetExtensionFromContentType(string contentType)
    {
        return contentType.ToLowerInvariant() switch
        {
            "image/jpeg" or "image/jpg" => ".jpg",
            "image/png" => ".png",
            "image/gif" => ".gif",
            "image/webp" => ".webp",
            _ => null
        };
    }

    private static bool IsValidImageExtension(string extension)
    {
        return AllowedExtensions.Contains(extension.ToLowerInvariant());
    }

    /// <summary>
    /// Sanitizes SKU for use as a filename by removing invalid characters.
    /// </summary>
    private static string SanitizeSkuForFilename(string sku)
    {
        // Remove invalid filename characters: / \ : * ? " < > |
        var invalidChars = Path.GetInvalidFileNameChars();
        var sanitized = new string(sku.Where(c => !invalidChars.Contains(c)).ToArray());
        
        // Trim whitespace and ensure it's not empty
        sanitized = sanitized.Trim();
        if (string.IsNullOrEmpty(sanitized))
            throw new ArgumentException("SKU contains only invalid characters for filename.");

        return sanitized;
    }
}

