using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Grocery.Api.Services;

public interface IPhotoService
{
    /// <summary>
    /// Saves a photo from either a file upload or a web URL.
    /// Returns the relative path to the saved photo, or null if no photo was provided.
    /// Throws ArgumentException if SKU is null or empty.
    /// </summary>
    Task<string?> SavePhotoAsync(string sku, IFormFile? file, string? photoUrl, CancellationToken ct = default);

    /// <summary>
    /// Deletes the photo file(s) for a product if they exist.
    /// </summary>
    Task DeletePhotoAsync(string sku, CancellationToken ct = default);

    /// <summary>
    /// Gets the photo path if a photo file exists for the product.
    /// Returns null if no photo file is found or if SKU is null/empty.
    /// </summary>
    Task<string?> GetPhotoPathAsync(string? sku, CancellationToken ct = default);

    /// <summary>
    /// Gets the photo file for a product by SKU.
    /// Returns a FileResult with the photo file, or null if no photo file is found.
    /// Throws ArgumentException if SKU is null or empty.
    /// </summary>
    Task<FileResult?> GetPhotoAsync(string sku, CancellationToken ct = default);
}

