using Microsoft.Extensions.Hosting;

namespace Grocery.Api.Services;

/// <summary>
/// Local file system implementation of IStorageService for development environment.
/// </summary>
public class LocalStorageService : IStorageService
{
    private readonly IHostEnvironment _environment;
    private readonly string _photosFolder;
    private readonly ILogger<LocalStorageService> _logger;

    public LocalStorageService(IHostEnvironment environment, ILogger<LocalStorageService> logger)
    {
        _environment = environment;
        _logger = logger;
        _photosFolder = Path.Combine(_environment.ContentRootPath, "uploads", "photos");
        
        // Ensure photos directory exists
        Directory.CreateDirectory(_photosFolder);
    }

    public async Task SaveAsync(string fileName, byte[] data, string contentType, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(fileName))
            throw new ArgumentException("File name cannot be null or empty.", nameof(fileName));

        if (data == null || data.Length == 0)
            throw new ArgumentException("Data cannot be null or empty.", nameof(data));

        var filePath = Path.Combine(_photosFolder, fileName);

        try
        {
            await File.WriteAllBytesAsync(filePath, data, ct);
            _logger.LogDebug("Saved file to local storage: {FilePath}", filePath);
        }
        catch (DirectoryNotFoundException ex)
        {
            throw new InvalidOperationException(
                $"Failed to save file: photos directory does not exist. Path: {_photosFolder}", ex);
        }
        catch (UnauthorizedAccessException ex)
        {
            throw new InvalidOperationException(
                $"Failed to save file: access denied. Path: {filePath}", ex);
        }
        catch (IOException ex)
        {
            throw new InvalidOperationException(
                $"Failed to save file due to I/O error. Path: {filePath}. Error: {ex.Message}", ex);
        }
    }

    public async Task DeleteAsync(string fileName, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(fileName))
            return;

        var filePath = Path.Combine(_photosFolder, fileName);
        
        if (File.Exists(filePath))
        {
            try
            {
                File.Delete(filePath);
                _logger.LogDebug("Deleted file from local storage: {FilePath}", filePath);
            }
            catch (Exception ex)
            {
                // Log but don't throw - file might be in use or already deleted
                _logger.LogWarning(ex, "Failed to delete file from local storage: {FilePath}", filePath);
            }
        }

        await Task.CompletedTask;
    }

    public async Task<byte[]?> GetAsync(string fileName, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(fileName))
            return null;

        var filePath = Path.Combine(_photosFolder, fileName);
        
        if (!File.Exists(filePath))
            return null;

        try
        {
            var fileBytes = await File.ReadAllBytesAsync(filePath, ct);
            _logger.LogDebug("Retrieved file from local storage: {FilePath}", filePath);
            return fileBytes;
        }
        catch (IOException ex)
        {
            throw new InvalidOperationException(
                $"Failed to read file. Path: {filePath}. Error: {ex.Message}", ex);
        }
        catch (UnauthorizedAccessException ex)
        {
            throw new InvalidOperationException(
                $"Failed to read file: access denied. Path: {filePath}", ex);
        }
    }

    public async Task<bool> ExistsAsync(string fileName, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(fileName))
            return false;

        var filePath = Path.Combine(_photosFolder, fileName);
        var exists = File.Exists(filePath);
        
        await Task.CompletedTask;
        return exists;
    }

    public async Task<string> GetUrlAsync(string fileName)
    {
        if (string.IsNullOrWhiteSpace(fileName))
            throw new ArgumentException("File name cannot be null or empty.", nameof(fileName));

        // Return relative path for local storage
        var relativePath = Path.Combine("uploads", "photos", fileName).Replace('\\', '/');
        
        await Task.CompletedTask;
        return relativePath;
    }
}

