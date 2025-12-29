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
        public async Task<ActionResult<ProductDto>> Create([FromBody] ProductUpsertDto dto, CancellationToken ct)
        {
            if (!ModelState.IsValid) return ValidationProblem(ModelState);

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
            return CreatedAtAction(nameof(GetById), new { id = created.Id }, created.ToDto());
        }

        // PUT /api/products/{id}
        [HttpPut("{id:guid}")]
        public async Task<ActionResult<ProductDto>> Update(Guid id, [FromBody] ProductUpsertDto dto, CancellationToken ct)
        {
            if (!ModelState.IsValid) return ValidationProblem(ModelState);

            var existing = await _repo.GetByIdAsync(id, ct);
            if (existing is null) return NotFound();

            var exists = await _repo.SkuExistsAsync(dto.Sku, id, ct);
            if (exists) return Conflict($"SKU '{dto.Sku}' already exists.");

            existing.Apply(dto);
            existing.UpdatedAt = DateTime.UtcNow;

            var ok = await _repo.UpdateAsync(existing, ct);
            if (!ok) return NotFound();
            return Ok(existing.ToDto());
        }

        // DELETE /api/products/{id}
        [HttpDelete("{id:guid}")]
        public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
        {
            var ok = await _repo.DeleteAsync(id, ct);
            return ok ? NoContent() : NotFound();
        }

        [HttpGet("photo-by-sku/{sku}")]
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
