namespace Grocery.Api.Services;

/// <summary>
/// Abstraction for storage operations that supports both local file system and Azure Blob Storage.
/// </summary>
public interface IStorageService
{
    /// <summary>
    /// Saves data to storage with the specified file name.
    /// </summary>
    /// <param name="fileName">The name of the file to save</param>
    /// <param name="data">The data to save</param>
    /// <param name="contentType">The content type/MIME type of the file</param>
    /// <param name="ct">Cancellation token</param>
    /// <returns>Task representing the async operation</returns>
    Task SaveAsync(string fileName, byte[] data, string contentType, CancellationToken ct = default);

    /// <summary>
    /// Deletes a file from storage if it exists.
    /// </summary>
    /// <param name="fileName">The name of the file to delete</param>
    /// <param name="ct">Cancellation token</param>
    /// <returns>Task representing the async operation</returns>
    Task DeleteAsync(string fileName, CancellationToken ct = default);

    /// <summary>
    /// Retrieves file data from storage.
    /// </summary>
    /// <param name="fileName">The name of the file to retrieve</param>
    /// <param name="ct">Cancellation token</param>
    /// <returns>The file data as a byte array, or null if the file doesn't exist</returns>
    Task<byte[]?> GetAsync(string fileName, CancellationToken ct = default);

    /// <summary>
    /// Checks if a file exists in storage.
    /// </summary>
    /// <param name="fileName">The name of the file to check</param>
    /// <param name="ct">Cancellation token</param>
    /// <returns>True if the file exists, false otherwise</returns>
    Task<bool> ExistsAsync(string fileName, CancellationToken ct = default);

    /// <summary>
    /// Gets the URL or path for accessing a file.
    /// </summary>
    /// <param name="fileName">The name of the file</param>
    /// <returns>The URL or relative path for accessing the file</returns>
    Task<string> GetUrlAsync(string fileName);
}

