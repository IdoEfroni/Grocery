using Grocery.Api.Mappers;
using Grocery.Api.Models;
using Grocery.Api.Models.Dto;
using Grocery.Api.Parsers;
using Grocery.Api.Services;
using HtmlAgilityPack;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.WebUtilities;
using System.Net;
using System.Net.Http;
using System.Text.RegularExpressions;


namespace Grocery.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class ProductsController : ControllerBase
    {
        private readonly IProductRepository _repo;
        private readonly ChipHtmlParser _chipParser;
        private readonly ChipApiClient _chipApiClient;
        private readonly IPhotoService _photoService;


        public ProductsController(IProductRepository repo, ChipHtmlParser chipParser, ChipApiClient chipApiClient, IPhotoService photoService)
        {
            _repo = repo;
            _chipApiClient = chipApiClient;
            _chipParser = chipParser;
            _photoService = photoService;
        }

        // GET /api/products?query=&page=&pageSize=
        [HttpGet]
        public async Task<ActionResult<PagedResult<ProductDto>>> Search(
            [FromQuery] string? query,
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 20,
            CancellationToken ct = default)
        {
            page = Math.Max(1, page);
            pageSize = Math.Clamp(pageSize, 1, 200);

            var (items, total) = await _repo.SearchAsync(query, page, pageSize, ct);
            var dtos = items.Select(x => x.ToDto()).ToList();
            return Ok(new PagedResult<ProductDto>(page, pageSize, total, dtos));
        }

        // GET /api/products/{id}
        [HttpGet("{id:guid}")]
        public async Task<ActionResult<ProductDto>> GetById(Guid id, CancellationToken ct)
        {
            var p = await _repo.GetByIdAsync(id, ct);
            if (p is null) return NotFound();
            return Ok(p.ToDto());
        }

        // GET /api/products/by-sku/{sku}
        [HttpGet("by-sku/{sku}")]
        public async Task<ActionResult<ProductDto>> GetBySku([FromRoute] string sku, CancellationToken ct)
        {
            if (string.IsNullOrWhiteSpace(sku)) return BadRequest("SKU is required.");
            var p = await _repo.GetBySkuAsync(sku, ct);
            if (p is null) return NotFound();
            return Ok(p.ToDto());
        }

        // POST /api/products
        [HttpPost]
        public async Task<ActionResult<ProductDto>> Create([FromForm] ProductUpsertDto dto, CancellationToken ct)
        {
            if (!ModelState.IsValid) return ValidationProblem(ModelState);

            // Validate that SKU is provided (required regardless of photo)
            if (string.IsNullOrWhiteSpace(dto.Sku))
            {
                return BadRequest("SKU is required.");
            }

            var hasPhoto = dto.PhotoFile != null || !string.IsNullOrWhiteSpace(dto.PhotoUrl);

            var exists = await _repo.SkuExistsAsync(dto.Sku, null, ct);
            if (exists) return Conflict($"SKU '{dto.Sku}' already exists.");

            var now = DateTime.UtcNow;
            var p = new Product
            {
                Id = Guid.NewGuid(),
                CreatedAt = now,
                UpdatedAt = now
            };
            p.Apply(dto);

            var created = await _repo.CreateAsync(p, ct);

            // Save photo if provided
            if (hasPhoto && !string.IsNullOrWhiteSpace(created.Sku))
            {
                try
                {
                    await _photoService.SavePhotoAsync(created.Sku, dto.PhotoFile, dto.PhotoUrl, ct);
                }
                catch (ArgumentException ex)
                {
                    // Photo validation failed (invalid format, size, URL format, etc.)
                    return BadRequest($"Photo upload failed: {ex.Message}");
                }
                catch (HttpRequestException ex)
                {
                    // Network/download errors (timeout, connection failure, HTTP errors)
                    return BadRequest($"Photo download failed: {ex.Message}");
                }
                catch (InvalidOperationException ex)
                {
                    // File I/O errors, directory issues, or other operational errors
                    return StatusCode(500, $"Product created but photo save failed: {ex.Message}");
                }
                catch (IOException ex)
                {
                    // File system I/O errors
                    return StatusCode(500, $"Product created but photo save failed due to I/O error: {ex.Message}");
                }
                catch (Exception ex)
                {
                    // Unexpected errors
                    return StatusCode(500, $"Product created but photo save failed: {ex.Message}");
                }
            }

            return CreatedAtAction(nameof(GetById), new { id = created.Id }, created.ToDto());
        }

        // PUT /api/products/{id}
        [HttpPut("{id:guid}")]
        public async Task<ActionResult<ProductDto>> Update(Guid id, [FromForm] ProductUpsertDto dto, CancellationToken ct)
        {
            if (!ModelState.IsValid) return ValidationProblem(ModelState);

            var existing = await _repo.GetByIdAsync(id, ct);
            if (existing is null) return NotFound();

            // Validate that SKU is provided (required regardless of photo)
            if (string.IsNullOrWhiteSpace(dto.Sku))
            {
                return BadRequest("SKU is required.");
            }

            var hasPhoto = dto.PhotoFile != null || !string.IsNullOrWhiteSpace(dto.PhotoUrl);

            var exists = await _repo.SkuExistsAsync(dto.Sku, id, ct);
            if (exists) return Conflict($"SKU '{dto.Sku}' already exists.");

            existing.Apply(dto);
            existing.UpdatedAt = DateTime.UtcNow;

            var ok = await _repo.UpdateAsync(existing, ct);
            if (!ok) return NotFound();

            // Save photo if provided
            if (hasPhoto && !string.IsNullOrWhiteSpace(existing.Sku))
            {
                try
                {
                    await _photoService.SavePhotoAsync(existing.Sku, dto.PhotoFile, dto.PhotoUrl, ct);
                }
                catch (ArgumentException ex)
                {
                    // Photo validation failed (invalid format, size, URL format, etc.)
                    return BadRequest($"Photo upload failed: {ex.Message}");
                }
                catch (HttpRequestException ex)
                {
                    // Network/download errors (timeout, connection failure, HTTP errors)
                    return BadRequest($"Photo download failed: {ex.Message}");
                }
                catch (InvalidOperationException ex)
                {
                    // File I/O errors, directory issues, or other operational errors
                    return StatusCode(500, $"Product updated but photo save failed: {ex.Message}");
                }
                catch (IOException ex)
                {
                    // File system I/O errors
                    return StatusCode(500, $"Product updated but photo save failed due to I/O error: {ex.Message}");
                }
                catch (Exception ex)
                {
                    // Unexpected errors
                    return StatusCode(500, $"Product updated but photo save failed: {ex.Message}");
                }
            }

            return Ok(existing.ToDto());
        }

        // DELETE /api/products/{id}
        [HttpDelete("{id:guid}")]
        public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
        {
            var ok = await _repo.DeleteAsync(id, ct);
            return ok ? NoContent() : NotFound();
        }

        // GET /api/products/photo/{sku}
        [HttpGet("photo/{sku}")]
        public async Task<IActionResult> GetPhoto([FromRoute] string sku, CancellationToken ct)
        {
            // Validate SKU parameter
            if (string.IsNullOrWhiteSpace(sku))
                return BadRequest("SKU is required.");

            // Check if SKU exists
            var product = await _repo.GetBySkuAsync(sku, ct);
            if (product is null)
                return NotFound($"Product with SKU '{sku}' not found.");

            // Get photo from service
            var photoResult = await _photoService.GetPhotoAsync(sku, ct);
            if (photoResult is null)
                return NotFound($"No photo found for SKU '{sku}'.");

            // Return FileResult
            return photoResult;
        }

        [HttpGet("Web-photo-by-sku/{sku}")]
        public async Task<IActionResult> PhotoBySku(
        [FromRoute] string sku,
        [FromServices] DuckDuckGoImageService ddg,
        CancellationToken ct)
        {
            if (string.IsNullOrWhiteSpace(sku))
                return BadRequest("SKU is required.");

            // Optional: use repo to enrich the query with product name/brand
            var p = await _repo.GetBySkuAsync(sku, ct);
            var query = p is null
                ? $"{sku} product photo"
                : $"{p.Name} {sku} product photo";

            var result = await ddg.SearchAndDownloadFirstImageAsync(query, ct: ct);
            if (result is null)
                return NotFound(new { message = "No image found for this SKU", sku, query });

            return File(result.Value.Bytes, result.Value.ContentType);
        }

        /// <summary>
        /// Proxies a price-compare HTML page from chp.co.il
        /// GET /api/products/compare-prices?shopping_city=&sku=&num_results=
        /// </summary>
        [HttpGet("compare-prices")]
        public async Task<ActionResult<ProductCompareResponseDto>> ComparePrices(
            [FromQuery] string shopping_city,
            [FromQuery] string sku,
            [FromQuery] int num_results = 100,
            CancellationToken ct = default)
        {
            if (string.IsNullOrWhiteSpace(shopping_city))
                return BadRequest("shopping_city is required.");
            if (string.IsNullOrWhiteSpace(sku))
                return BadRequest("sku is required.");

            var (isSuccess, statusCode, body) =
                await _chipApiClient.GetCompareResultsHtmlAsync(shopping_city, sku, num_results);

            if (!isSuccess)
                return StatusCode((int)statusCode, body);

            // Parse rows + product info
            var rows = _chipParser.ParseCompareResultsHtml(body);
            var info = _chipParser.ParseProductInformation(body);

            info.TryGetValue("שם המוצר ותכולה", out var productName);
            info.TryGetValue("יצרן/מותג וברקוד", out var description);

            var avg = CalculateAveragePrice(rows);
            string avgPriceFormatted = avg?.ToString("0.00") ?? "N/A";

            var response = new ProductCompareResponseDto
            {
                ProductName = productName ?? string.Empty,
                Description = description ?? string.Empty,
                AveragePrice = avgPriceFormatted
            };

            return Ok(response);
        }

        /**
         * 
         * helper method
         */
        private decimal? CalculateAveragePrice(List<Dictionary<string, string>> rows)
        {
            var prices = rows
                .Select(r => r.TryGetValue("מחיר", out var v) ? v : null)
                .Where(v => !string.IsNullOrWhiteSpace(v))
                .Select(v => decimal.TryParse(v, out var d) ? d : (decimal?)null)
                .Where(d => d.HasValue)
                .Select(d => d.Value)
                .ToList();

            if (prices.Count == 0)
                return null;

            return prices.Average();
        }

    }
}
