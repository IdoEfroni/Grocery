using Grocery.Api.Exceptions;
using Grocery.Api.Mappers;
using Grocery.Api.Models;
using Grocery.Api.Models.Dto;
using Grocery.Api.Parsers;
using Microsoft.AspNetCore.Mvc;

namespace Grocery.Api.Services;

/// <summary>
/// Product application service. Contains business logic and coordinates repository and external services.
/// </summary>
public class ProductService : IProductService
{
    private readonly IProductRepository _repository;
    private readonly IPhotoService _photoService;
    private readonly ChipHtmlParser _chipParser;
    private readonly ChipApiClient _chipApiClient;
    private readonly DuckDuckGoImageService _duckDuckGoImageService;
    private readonly ILogger<ProductService> _logger;

    public ProductService(
        IProductRepository repository,
        IPhotoService photoService,
        ChipHtmlParser chipParser,
        ChipApiClient chipApiClient,
        DuckDuckGoImageService duckDuckGoImageService,
        ILogger<ProductService> logger)
    {
        _repository = repository;
        _photoService = photoService;
        _chipParser = chipParser;
        _chipApiClient = chipApiClient;
        _duckDuckGoImageService = duckDuckGoImageService;
        _logger = logger;
    }

    /// <summary>
    /// Searches products by optional query with paging. Page and page size are normalized (page at least 1, page size between 1 and 200).
    /// </summary>
    /// <param name="query">Optional search term; null or empty returns all products.</param>
    /// <param name="page">1-based page number.</param>
    /// <param name="pageSize">Number of items per page (clamped to 1–200).</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>Paged result with product DTOs and total count.</returns>
    public async Task<PagedResult<ProductDto>> SearchAsync(string? query, int page, int pageSize, CancellationToken ct = default)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 200);

        var (items, total) = await _repository.SearchAsync(query, page, pageSize, ct);
        var dtos = items.Select(x => x.ToDto()).ToList();
        _logger.LogDebug("Search products: query={Query}, page={Page}, pageSize={PageSize}, total={Total}", query, page, pageSize, total);
        return new PagedResult<ProductDto>(page, pageSize, total, dtos);
    }

    /// <summary>
    /// Gets a product by its unique identifier.
    /// </summary>
    /// <param name="id">Product id.</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>The product DTO.</returns>
    /// <exception cref="ProductNotFoundException">Thrown when no product exists with the given id.</exception>
    public async Task<ProductDto> GetByIdAsync(Guid id, CancellationToken ct = default)
    {
        var product = await _repository.GetByIdAsync(id, ct);
        if (product is null)
        {
            _logger.LogDebug("Product not found: id={Id}", id);
            throw new ProductNotFoundException(id);
        }
        return product.ToDto();
    }

    /// <summary>
    /// Gets a product by its SKU (stock-keeping unit).
    /// </summary>
    /// <param name="sku">Product SKU; must not be null or whitespace.</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>The product DTO.</returns>
    /// <exception cref="ArgumentException">Thrown when <paramref name="sku"/> is null or whitespace.</exception>
    /// <exception cref="ProductNotFoundException">Thrown when no product exists with the given SKU.</exception>
    public async Task<ProductDto> GetBySkuAsync(string sku, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(sku))
            throw new ArgumentException("SKU is required.", nameof(sku));

        var product = await _repository.GetBySkuAsync(sku, ct);
        if (product is null)
        {
            _logger.LogDebug("Product not found: sku={Sku}", sku);
            throw new ProductNotFoundException(sku);
        }
        return product.ToDto();
    }

    /// <summary>
    /// Creates a new product. If a photo is provided (file or URL), it is saved after the product is created.
    /// </summary>
    /// <param name="dto">Product data; SKU is required and must be unique.</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>The created product DTO.</returns>
    /// <exception cref="ArgumentException">Thrown when <paramref name="dto"/> has no SKU.</exception>
    /// <exception cref="SkuExistsException">Thrown when a product with the same SKU already exists.</exception>
    /// <exception cref="PhotoSaveException">Thrown when photo save fails (e.g. invalid format, I/O error).</exception>
    public async Task<ProductDto> CreateAsync(ProductUpsertDto dto, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(dto.Sku))
            throw new ArgumentException("SKU is required.", nameof(dto));

        var exists = await _repository.SkuExistsAsync(dto.Sku, null, ct);
        if (exists)
        {
            _logger.LogWarning("Create product failed: SKU already exists. Sku={Sku}", dto.Sku);
            throw new SkuExistsException(dto.Sku);
        }

        var now = DateTime.UtcNow;
        var product = new Product
        {
            Id = Guid.NewGuid(),
            CreatedAt = now,
            UpdatedAt = now
        };
        product.Apply(dto);

        var created = await _repository.CreateAsync(product, ct);
        _logger.LogInformation("Product created: id={Id}, sku={Sku}", created.Id, created.Sku);

        await SavePhotoIfProvidedAsync(created.Sku, dto.PhotoFile, dto.PhotoUrl, isCreate: true, ct);

        return created.ToDto();
    }

    /// <summary>
    /// Updates an existing product by id. If a photo is provided, it is saved after the update.
    /// </summary>
    /// <param name="id">Product id to update.</param>
    /// <param name="dto">Updated product data; SKU is required and must be unique (excluding current product).</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>The updated product DTO.</returns>
    /// <exception cref="ArgumentException">Thrown when <paramref name="dto"/> has no SKU.</exception>
    /// <exception cref="ProductNotFoundException">Thrown when no product exists with the given id.</exception>
    /// <exception cref="SkuExistsException">Thrown when another product already has the given SKU.</exception>
    /// <exception cref="PhotoSaveException">Thrown when photo save fails.</exception>
    public async Task<ProductDto> UpdateAsync(Guid id, ProductUpsertDto dto, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(dto.Sku))
            throw new ArgumentException("SKU is required.", nameof(dto));

        var existing = await _repository.GetByIdAsync(id, ct);
        if (existing is null)
        {
            _logger.LogDebug("Update failed: product not found. Id={Id}", id);
            throw new ProductNotFoundException(id);
        }

        var exists = await _repository.SkuExistsAsync(dto.Sku, id, ct);
        if (exists)
        {
            _logger.LogWarning("Update product failed: SKU already exists. Sku={Sku}, id={Id}", dto.Sku, id);
            throw new SkuExistsException(dto.Sku);
        }

        existing.Apply(dto);
        existing.UpdatedAt = DateTime.UtcNow;

        var ok = await _repository.UpdateAsync(existing, ct);
        if (!ok)
        {
            _logger.LogWarning("Update failed: repository returned false. Id={Id}", id);
            throw new ProductNotFoundException(id);
        }

        _logger.LogInformation("Product updated: id={Id}, sku={Sku}", id, existing.Sku);
        await SavePhotoIfProvidedAsync(existing.Sku, dto.PhotoFile, dto.PhotoUrl, isCreate: false, ct);

        return existing.ToDto();
    }

    /// <summary>
    /// Deletes a product by id.
    /// </summary>
    /// <param name="id">Product id to delete.</param>
    /// <param name="ct">Cancellation token.</param>
    /// <exception cref="ProductNotFoundException">Thrown when no product exists with the given id.</exception>
    public async Task DeleteAsync(Guid id, CancellationToken ct = default)
    {
        var ok = await _repository.DeleteAsync(id, ct);
        if (!ok)
        {
            _logger.LogDebug("Delete failed: product not found. Id={Id}", id);
            throw new ProductNotFoundException(id);
        }
        _logger.LogInformation("Product deleted: id={Id}", id);
    }

    /// <summary>
    /// Gets the stored photo for a product by SKU. Verifies the product exists before returning the photo.
    /// </summary>
    /// <param name="sku">Product SKU; must not be null or whitespace.</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>File result with the photo, or null if no photo is stored.</returns>
    /// <exception cref="ArgumentException">Thrown when <paramref name="sku"/> is null or whitespace.</exception>
    /// <exception cref="ProductNotFoundException">Thrown when no product or no photo exists for the SKU.</exception>
    public async Task<FileResult?> GetPhotoAsync(string sku, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(sku))
            throw new ArgumentException("SKU is required.", nameof(sku));

        var product = await _repository.GetBySkuAsync(sku, ct);
        if (product is null)
        {
            _logger.LogDebug("Get photo failed: product not found. Sku={Sku}", sku);
            throw new ProductNotFoundException(sku);
        }

        var photoResult = await _photoService.GetPhotoAsync(sku, ct);
        if (photoResult is null)
        {
            _logger.LogDebug("No photo found for SKU. Sku={Sku}", sku);
            throw new ProductNotFoundException($"No photo found for SKU '{sku}'.");
        }

        return photoResult;
    }

    /// <summary>
    /// Searches the web (e.g. DuckDuckGo) for an image by product SKU, optionally using the product name to improve the search.
    /// </summary>
    /// <param name="sku">Product SKU; must not be null or whitespace.</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>Image bytes and content type if found; null if no image was found.</returns>
    /// <exception cref="ArgumentException">Thrown when <paramref name="sku"/> is null or whitespace.</exception>
    public async Task<(byte[] Bytes, string ContentType)?> GetWebPhotoBySkuAsync(string sku, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(sku))
            throw new ArgumentException("SKU is required.", nameof(sku));

        var product = await _repository.GetBySkuAsync(sku, ct);
        var query = product is null
            ? $"{sku} product photo"
            : $"{product.Name} {sku} product photo";

        var result = await _duckDuckGoImageService.SearchAndDownloadFirstImageAsync(query, ct: ct);
        if (result is null)
            _logger.LogDebug("No web image found for SKU. Sku={Sku}, query={Query}", sku, query);

        return result;
    }

    /// <summary>
    /// Fetches price comparison data from the external service (chp.co.il) for the given shopping city and product SKU, and returns product name, description, and average price.
    /// </summary>
    /// <param name="shoppingCity">Shopping city/address for the comparison.</param>
    /// <param name="sku">Product barcode/SKU.</param>
    /// <param name="numResults">Maximum number of results to consider (clamped by the external API).</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>DTO with product name, description, and formatted average price.</returns>
    /// <exception cref="ArgumentException">Thrown when <paramref name="shoppingCity"/> or <paramref name="sku"/> is null or whitespace.</exception>
    /// <exception cref="ComparePricesException">Thrown when the external comparison service returns a non-success response.</exception>
    public async Task<ProductCompareResponseDto> ComparePricesAsync(string shoppingCity, string sku, int numResults, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(shoppingCity))
            throw new ArgumentException("shopping_city is required.", nameof(shoppingCity));
        if (string.IsNullOrWhiteSpace(sku))
            throw new ArgumentException("sku is required.", nameof(sku));

        var (isSuccess, statusCode, body) = await _chipApiClient.GetCompareResultsHtmlAsync(shoppingCity, sku, numResults);
        if (!isSuccess)
        {
            _logger.LogWarning("Compare prices failed: status={StatusCode}, sku={Sku}", statusCode, sku);
            throw new ComparePricesException(statusCode, body);
        }

        var rows = _chipParser.ParseCompareResultsHtml(body);
        var info = _chipParser.ParseProductInformation(body);
        info.TryGetValue("שם המוצר ותכולה", out var productName);
        info.TryGetValue("יצרן/מותג וברקוד", out var description);

        var avg = CalculateAveragePrice(rows);
        var avgPriceFormatted = avg?.ToString("0.00") ?? "N/A";

        return new ProductCompareResponseDto
        {
            ProductName = productName ?? string.Empty,
            Description = description ?? string.Empty,
            AveragePrice = avgPriceFormatted
        };
    }

    /// <summary>
    /// Saves a photo from file or URL when provided; no-op when neither is set or SKU is missing. Wraps photo service errors in <see cref="PhotoSaveException"/>.
    /// </summary>
    private async Task SavePhotoIfProvidedAsync(string? sku, IFormFile? photoFile, string? photoUrl, bool isCreate, CancellationToken ct)
    {
        var hasPhoto = photoFile != null || !string.IsNullOrWhiteSpace(photoUrl);
        if (!hasPhoto || string.IsNullOrWhiteSpace(sku))
            return;

        try
        {
            await _photoService.SavePhotoAsync(sku, photoFile, photoUrl, ct);
            _logger.LogDebug("Photo saved for SKU. Sku={Sku}", sku);
        }
        catch (ArgumentException ex)
        {
            throw new PhotoSaveException($"Photo upload failed: {ex.Message}", isClientFault: true);
        }
        catch (HttpRequestException ex)
        {
            throw new PhotoSaveException($"Photo download failed: {ex.Message}", isClientFault: true);
        }
        catch (InvalidOperationException ex)
        {
            throw new PhotoSaveException(
                $"Product {(isCreate ? "created" : "updated")} but photo save failed: {ex.Message}",
                isClientFault: false);
        }
        catch (IOException ex)
        {
            throw new PhotoSaveException(
                $"Product {(isCreate ? "created" : "updated")} but photo save failed due to I/O error: {ex.Message}",
                isClientFault: false);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected error saving photo for SKU. Sku={Sku}", sku);
            throw new PhotoSaveException(
                $"Product {(isCreate ? "created" : "updated")} but photo save failed: {ex.Message}",
                ex,
                isClientFault: false);
        }
    }

    /// <summary>
    /// Extracts price values from the "מחיר" key in each row and returns their average, or null if no valid prices.
    /// </summary>
    private static decimal? CalculateAveragePrice(List<Dictionary<string, string>> rows)
    {
        var prices = rows
            .Select(r => r.TryGetValue("מחיר", out var v) ? v : null)
            .Where(v => !string.IsNullOrWhiteSpace(v))
            .Select(v => decimal.TryParse(v, out var d) ? d : (decimal?)null)
            .Where(d => d.HasValue)
            .Select(d => d!.Value)
            .ToList();

        if (prices.Count == 0)
            return null;

        return prices.Average();
    }
}
