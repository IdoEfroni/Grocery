using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using Microsoft.Extensions.Configuration;

namespace Grocery.Api.Services;

/// <summary>
/// Azure Blob Storage implementation of IStorageService for production environment.
/// </summary>
public class BlobStorageService : IStorageService
{
    private readonly BlobServiceClient _blobServiceClient;
    private readonly BlobContainerClient _containerClient;
    private readonly string _containerName;
    private readonly ILogger<BlobStorageService> _logger;

    public BlobStorageService(IConfiguration configuration, ILogger<BlobStorageService> logger)
    {
        _logger = logger;
        
        var connectionString = configuration["Storage:BlobStorage:ConnectionString"];
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            throw new InvalidOperationException(
                "Azure Blob Storage connection string is not configured. " +
                "Please set 'Storage:BlobStorage:ConnectionString' in appsettings.");
        }

        _containerName = configuration["Storage:BlobStorage:ContainerName"] ?? "blobphotosgrocery";
        
        _blobServiceClient = new BlobServiceClient(connectionString);
        _containerClient = _blobServiceClient.GetBlobContainerClient(_containerName);
        
        // Ensure container exists
        EnsureContainerExistsAsync().GetAwaiter().GetResult();
    }

    private async Task EnsureContainerExistsAsync()
    {
        try
        {
            await _containerClient.CreateIfNotExistsAsync(PublicAccessType.None);
            _logger.LogInformation("Blob container '{ContainerName}' is ready", _containerName);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to create or verify blob container '{ContainerName}'", _containerName);
            throw new InvalidOperationException(
                $"Failed to create or verify blob container '{_containerName}'. Error: {ex.Message}", ex);
        }
    }

    public async Task SaveAsync(string fileName, byte[] data, string contentType, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(fileName))
            throw new ArgumentException("File name cannot be null or empty.", nameof(fileName));

        if (data == null || data.Length == 0)
            throw new ArgumentException("Data cannot be null or empty.", nameof(data));

        var blobClient = _containerClient.GetBlobClient(fileName);

        try
        {
            var blobHttpHeaders = new BlobHttpHeaders
            {
                ContentType = contentType ?? "application/octet-stream"
            };

            using var stream = new MemoryStream(data);
            await blobClient.UploadAsync(stream, new BlobUploadOptions
            {
                HttpHeaders = blobHttpHeaders
            }, ct);

            _logger.LogDebug("Saved file to blob storage: {FileName} in container {ContainerName}", fileName, _containerName);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to save file to blob storage: {FileName}", fileName);
            throw new InvalidOperationException(
                $"Failed to save file to blob storage. File: {fileName}. Error: {ex.Message}", ex);
        }
    }

    public async Task DeleteAsync(string fileName, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(fileName))
            return;

        var blobClient = _containerClient.GetBlobClient(fileName);

        try
        {
            var deleted = await blobClient.DeleteIfExistsAsync(DeleteSnapshotsOption.None, cancellationToken: ct);
            if (deleted.Value)
            {
                _logger.LogDebug("Deleted file from blob storage: {FileName} in container {ContainerName}", fileName, _containerName);
            }
        }
        catch (Exception ex)
        {
            // Log but don't throw - blob might not exist or might be in use
            _logger.LogWarning(ex, "Failed to delete file from blob storage: {FileName}", fileName);
        }
    }

    public async Task<byte[]?> GetAsync(string fileName, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(fileName))
            return null;

        var blobClient = _containerClient.GetBlobClient(fileName);

        try
        {
            if (!await blobClient.ExistsAsync(ct))
            {
                return null;
            }

            using var memoryStream = new MemoryStream();
            await blobClient.DownloadToAsync(memoryStream, ct);
            var fileBytes = memoryStream.ToArray();
            
            _logger.LogDebug("Retrieved file from blob storage: {FileName} in container {ContainerName}", fileName, _containerName);
            return fileBytes;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to read file from blob storage: {FileName}", fileName);
            throw new InvalidOperationException(
                $"Failed to read file from blob storage. File: {fileName}. Error: {ex.Message}", ex);
        }
    }

    public async Task<bool> ExistsAsync(string fileName, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(fileName))
            return false;

        var blobClient = _containerClient.GetBlobClient(fileName);

        try
        {
            var exists = await blobClient.ExistsAsync(ct);
            return exists.Value;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to check existence of file in blob storage: {FileName}", fileName);
            return false;
        }
    }

    public async Task<string> GetUrlAsync(string fileName)
    {
        if (string.IsNullOrWhiteSpace(fileName))
            throw new ArgumentException("File name cannot be null or empty.", nameof(fileName));

        var blobClient = _containerClient.GetBlobClient(fileName);
        
        // Return the blob URL
        var url = blobClient.Uri.ToString();
        
        await Task.CompletedTask;
        return url;
    }
}

