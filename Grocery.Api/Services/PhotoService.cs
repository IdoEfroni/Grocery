using System.Net;
using System.Net.Http.Headers;
using Grocery.Api.Models.Messages;
using MassTransit;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;

namespace Grocery.Api.Services;

public class PhotoService : IPhotoService
{
    private readonly HttpClient _httpClient;
    private readonly ISendEndpointProvider _sendEndpointProvider;
    private readonly IConfiguration _configuration;
    private readonly ILogger<PhotoService> _logger;
    private readonly IStorageService _storageService;
    private const int MaxFileSizeBytes = 5 * 1024 * 1024; // 5MB
    private static readonly string[] AllowedExtensions = { ".jpg", ".jpeg", ".png", ".gif", ".webp" };

    public PhotoService(HttpClient httpClient, ISendEndpointProvider sendEndpointProvider, IConfiguration configuration, ILogger<PhotoService> logger, IStorageService storageService)
    {
        _httpClient = httpClient;
        _sendEndpointProvider = sendEndpointProvider;
        _configuration = configuration;
        _logger = logger;
        _storageService = storageService;
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
            {
                var fileSizeMB = file.Length / (1024.0 * 1024.0);
                throw new ArgumentException(
                    $"File size ({fileSizeMB:F2}MB) exceeds maximum allowed size of {MaxFileSizeBytes / (1024 * 1024)}MB. " +
                    $"File: {file.FileName}");
            }

            extension = GetExtensionFromFilename(file.FileName);
            if (!IsValidImageExtension(extension))
            {
                throw new ArgumentException(
                    $"Invalid image format '{extension}'. Allowed formats: {string.Join(", ", AllowedExtensions)}. " +
                    $"File: {file.FileName}");
            }

            try
            {
                using var stream = file.OpenReadStream();
                imageBytes = new byte[file.Length];
                await stream.ReadAsync(imageBytes, 0, (int)file.Length, ct);
            }
            catch (IOException ex)
            {
                throw new InvalidOperationException($"Failed to read uploaded file: {file.FileName}. Error: {ex.Message}", ex);
            }
        }
        else
        {
            // Handle URL download
            if (!Uri.TryCreate(photoUrl, UriKind.Absolute, out var uri))
                throw new ArgumentException($"Invalid photo URL format: {photoUrl}");

            var result = await DownloadImageFromUrlAsync(photoUrl!, ct);
            if (result == null)
                throw new InvalidOperationException($"Failed to download image from URL: {photoUrl}");

            imageBytes = result.Value.Bytes;
            extension = GetExtensionFromContentType(result.Value.ContentType) ?? ".jpg";
            
            // Validate downloaded image extension
            if (!IsValidImageExtension(extension))
            {
                throw new ArgumentException(
                    $"Downloaded image has unsupported format '{result.Value.ContentType}'. " +
                    $"Allowed formats: {string.Join(", ", AllowedExtensions)}. URL: {photoUrl}");
            }
        }

        // Save file with SKU as filename
        var fileName = $"{sanitizedSku}{extension}";
        var contentType = GetContentTypeFromExtension(extension);

        try
        {
            await _storageService.SaveAsync(fileName, imageBytes, contentType, ct);
        }
        catch (InvalidOperationException)
        {
            // Re-throw InvalidOperationException from storage service
            throw;
        }
        catch (Exception ex)
        {
            throw new InvalidOperationException(
                $"Failed to save photo. File: {fileName}. Error: {ex.Message}", ex);
        }

        // Send Service Bus message to queue for thumbnail generation (using Send instead of Publish for Basic tier)
        try
        {
            var queueName = _configuration["ServiceBus:QueueName"] ?? "thumbnail-request-queue";
            if (string.IsNullOrWhiteSpace(queueName))
            {
                _logger.LogWarning("Queue name is not configured. Skipping thumbnail request message for SKU: {Sku}", sanitizedSku);
            }
            else
            {
                // For Azure Service Bus, use the queue name directly (message topology is configured in Program.cs)
                var endpoint = await _sendEndpointProvider.GetSendEndpoint(new Uri($"queue:{queueName}"));
                var message = new ThumbnailRequestMessage { Sku = sanitizedSku };
                await endpoint.Send(message, ct);
                _logger.LogInformation("Sent thumbnail request message to queue for SKU: {Sku}", sanitizedSku);
            }
        }
        catch (Exception ex)
        {
            // Log but don't fail the photo save if message sending fails
            _logger.LogWarning(ex, "Failed to send thumbnail request message for SKU: {Sku}. Photo was saved successfully.", sanitizedSku);
        }

        // Return URL/path from storage service
        return await _storageService.GetUrlAsync(fileName);
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
            
            if (await _storageService.ExistsAsync(fileName, ct))
            {
                await _storageService.DeleteAsync(fileName, ct);
            }
        }
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
            
            if (await _storageService.ExistsAsync(fileName, ct))
            {
                // Return URL/path from storage service
                return await _storageService.GetUrlAsync(fileName);
            }
        }

        return null;
    }

    public async Task<FileResult?> GetPhotoAsync(string sku, CancellationToken ct = default)
    {
        // Validate SKU parameter
        if (string.IsNullOrWhiteSpace(sku))
            throw new ArgumentException("SKU is required to get a photo.");

        // Sanitize SKU for filename
        var sanitizedSku = SanitizeSkuForFilename(sku);

        // First, check if thumbnail exists
        var thumbnailFileName = $"{sanitizedSku}_thumb.webp";
        
        var thumbnailBytes = await _storageService.GetAsync(thumbnailFileName, ct);
        if (thumbnailBytes != null)
        {
            // Return thumbnail as WebP
            return new FileContentResult(thumbnailBytes, "image/webp")
            {
                FileDownloadName = thumbnailFileName
            };
        }

        // If thumbnail doesn't exist, fallback to original photo
        // Check if photo exists with any of the allowed extensions
        foreach (var ext in AllowedExtensions)
        {
            var fileName = $"{sanitizedSku}{ext}";
            
            var fileBytes = await _storageService.GetAsync(fileName, ct);
            if (fileBytes != null)
            {
                // Determine content type from file extension
                var contentType = GetContentTypeFromExtension(ext);

                // Return FileResult
                return new FileContentResult(fileBytes, contentType)
                {
                    FileDownloadName = fileName
                };
            }
        }

        // No photo found
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
            {
                throw new HttpRequestException(
                    $"Failed to download image from URL. HTTP status: {(int)res.StatusCode} {res.StatusCode}. URL: {url}");
            }

            var contentType = res.Content.Headers.ContentType?.MediaType ?? "application/octet-stream";
            if (!contentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase))
            {
                throw new ArgumentException(
                    $"URL does not point to a valid image. Content-Type: {contentType}. URL: {url}");
            }

            var contentLen = res.Content.Headers.ContentLength;
            if (contentLen.HasValue && contentLen.Value > MaxFileSizeBytes)
            {
                throw new ArgumentException(
                    $"Image from URL exceeds maximum allowed size of {MaxFileSizeBytes / (1024 * 1024)}MB. " +
                    $"Size: {contentLen.Value / (1024.0 * 1024.0):F2}MB. URL: {url}");
            }

            var bytes = await res.Content.ReadAsByteArrayAsync(ct);
            if (bytes.Length > MaxFileSizeBytes)
            {
                throw new ArgumentException(
                    $"Image from URL exceeds maximum allowed size of {MaxFileSizeBytes / (1024 * 1024)}MB. " +
                    $"Size: {bytes.Length / (1024.0 * 1024.0):F2}MB. URL: {url}");
            }

            return (bytes, contentType);
        }
        catch (HttpRequestException)
        {
            // Re-throw HTTP exceptions with context
            throw;
        }
        catch (TaskCanceledException ex) when (ex.InnerException is TimeoutException)
        {
            throw new HttpRequestException($"Timeout while downloading image from URL: {url}", ex);
        }
        catch (TaskCanceledException)
        {
            throw new HttpRequestException($"Request cancelled while downloading image from URL: {url}");
        }
        catch (ArgumentException)
        {
            // Re-throw argument exceptions (size, content type validation)
            throw;
        }
        catch (Exception ex)
        {
            throw new HttpRequestException($"Failed to download image from URL: {url}. Error: {ex.Message}", ex);
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
    /// Gets the MIME content type from a file extension.
    /// </summary>
    private static string GetContentTypeFromExtension(string extension)
    {
        return extension.ToLowerInvariant() switch
        {
            ".jpg" or ".jpeg" => "image/jpeg",
            ".png" => "image/png",
            ".gif" => "image/gif",
            ".webp" => "image/webp",
            _ => "image/jpeg"
        };
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

