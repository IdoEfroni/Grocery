using Grocery.Api.Models.Messages;
using Grocery.Api.Services;
using ImageMagick;
using MassTransit;

namespace Grocery.ThumbnailService.Consumers;

public class ThumbnailConsumer : IConsumer<ThumbnailRequestMessage>
{
    private readonly ILogger<ThumbnailConsumer> _logger;
    private readonly IStorageService _storageService;

    public ThumbnailConsumer(ILogger<ThumbnailConsumer> logger, IStorageService storageService)
    {
        _logger = logger;
        _storageService = storageService;
    }

    public async Task Consume(ConsumeContext<ThumbnailRequestMessage> context)
    {
        var sku = context.Message.Sku;
        _logger.LogInformation("Processing thumbnail request for SKU: {Sku}", sku);

        if (string.IsNullOrWhiteSpace(sku))
        {
            _logger.LogWarning("Received thumbnail request with empty SKU");
            return;
        }

        // Find the original photo file
        var allowedExtensions = new[] { ".jpg", ".jpeg", ".png", ".gif", ".webp" };
        byte[]? originalPhotoBytes = null;
        string? foundExtension = null;

        foreach (var ext in allowedExtensions)
        {
            var fileName = $"{sku}{ext}";
            originalPhotoBytes = await _storageService.GetAsync(fileName, context.CancellationToken);
            if (originalPhotoBytes != null)
            {
                foundExtension = ext;
                break;
            }
        }

        if (originalPhotoBytes == null)
        {
            _logger.LogWarning("Original photo not found for SKU: {Sku}", sku);
            throw new FileNotFoundException($"Original photo not found for SKU: {sku}");
        }

        // Check if thumbnail already exists
        var thumbnailFileName = $"{sku}_thumb.webp";
        if (await _storageService.ExistsAsync(thumbnailFileName, context.CancellationToken))
        {
            _logger.LogInformation("Thumbnail already exists for SKU: {Sku}, skipping generation", sku);
            return;
        }

        try
        {
            // Generate thumbnail using ImageMagick (from byte array)
            using var image = new MagickImage(originalPhotoBytes);
            
            // Resize to 300x300, maintaining aspect ratio and cropping if needed
            var geometry = new MagickGeometry(300, 300)
            {
                FillArea = true
            };
            image.Resize(geometry);
            image.Crop(300, 300, Gravity.Center);
            
            // Convert to WebP format
            image.Format = MagickFormat.WebP;
            
            // Set quality (optional, WebP default is good)
            image.Quality = 85;

            // Get thumbnail bytes
            var thumbnailBytes = image.ToByteArray();

            // Save thumbnail using storage service
            await _storageService.SaveAsync(thumbnailFileName, thumbnailBytes, "image/webp", context.CancellationToken);
            
            _logger.LogInformation("Successfully generated thumbnail for SKU: {Sku}", sku);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to generate thumbnail for SKU: {Sku}", sku);
            throw;
        }
    }
}

