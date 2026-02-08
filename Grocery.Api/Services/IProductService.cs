using Grocery.Api.Models.Dto;
using Microsoft.AspNetCore.Mvc;

namespace Grocery.Api.Services;

/// <summary>
/// Application service for product operations. Orchestrates repository, photo, and external services.
/// </summary>
public interface IProductService
{
    Task<PagedResult<ProductDto>> SearchAsync(string? query, int page, int pageSize, CancellationToken ct = default);

    Task<ProductDto> GetByIdAsync(Guid id, CancellationToken ct = default);

    Task<ProductDto> GetBySkuAsync(string sku, CancellationToken ct = default);

    Task<ProductDto> CreateAsync(ProductUpsertDto dto, CancellationToken ct = default);

    Task<ProductDto> UpdateAsync(Guid id, ProductUpsertDto dto, CancellationToken ct = default);

    Task DeleteAsync(Guid id, CancellationToken ct = default);

    Task<FileResult?> GetPhotoAsync(string sku, CancellationToken ct = default);

    Task<(byte[] Bytes, string ContentType)?> GetWebPhotoBySkuAsync(string sku, CancellationToken ct = default);

    Task<ProductCompareResponseDto> ComparePricesAsync(string shoppingCity, string sku, int numResults, CancellationToken ct = default);
}
