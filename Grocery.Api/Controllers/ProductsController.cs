using Grocery.Api.Exceptions;
using Grocery.Api.Models.Dto;
using Grocery.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace Grocery.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ProductsController : ControllerBase
{
    private readonly IProductService _productService;
    private readonly ILogger<ProductsController> _logger;

    public ProductsController(IProductService productService, ILogger<ProductsController> logger)
    {
        _productService = productService;
        _logger = logger;
    }

    /// <summary>GET /api/products?query=&amp;page=&amp;pageSize=</summary>
    [HttpGet]
    public async Task<ActionResult<PagedResult<ProductDto>>> Search(
        [FromQuery] string? query,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken ct = default)
    {
        var result = await _productService.SearchAsync(query, page, pageSize, ct);
        return Ok(result);
    }

    /// <summary>GET /api/products/{id}</summary>
    [HttpGet("{id:guid}")]
    public async Task<ActionResult<ProductDto>> GetById(Guid id, CancellationToken ct)
    {
        try
        {
            var dto = await _productService.GetByIdAsync(id, ct);
            return Ok(dto);
        }
        catch (ProductNotFoundException)
        {
            return NotFound();
        }
    }

    /// <summary>GET /api/products/by-sku/{sku}</summary>
    [HttpGet("by-sku/{sku}")]
    public async Task<ActionResult<ProductDto>> GetBySku([FromRoute] string sku, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(sku))
            return BadRequest("SKU is required.");

        try
        {
            var dto = await _productService.GetBySkuAsync(sku, ct);
            return Ok(dto);
        }
        catch (ProductNotFoundException)
        {
            return NotFound();
        }
        catch (ArgumentException)
        {
            return BadRequest("SKU is required.");
        }
    }

    /// <summary>POST /api/products</summary>
    [HttpPost]
    public async Task<ActionResult<ProductDto>> Create([FromForm] ProductUpsertDto dto, CancellationToken ct)
    {
        if (!ModelState.IsValid)
            return ValidationProblem(ModelState);

        if (string.IsNullOrWhiteSpace(dto.Sku))
            return BadRequest("SKU is required.");

        try
        {
            var created = await _productService.CreateAsync(dto, ct);
            return CreatedAtAction(nameof(GetById), new { id = created.Id }, created);
        }
        catch (SkuExistsException ex)
        {
            return Conflict(ex.Message);
        }
        catch (PhotoSaveException ex)
        {
            return ex.IsClientFault ? BadRequest(ex.Message) : StatusCode(500, ex.Message);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(ex.Message);
        }
    }

    /// <summary>PUT /api/products/{id}</summary>
    [HttpPut("{id:guid}")]
    public async Task<ActionResult<ProductDto>> Update(Guid id, [FromForm] ProductUpsertDto dto, CancellationToken ct)
    {
        if (!ModelState.IsValid)
            return ValidationProblem(ModelState);

        if (string.IsNullOrWhiteSpace(dto.Sku))
            return BadRequest("SKU is required.");

        try
        {
            var updated = await _productService.UpdateAsync(id, dto, ct);
            return Ok(updated);
        }
        catch (ProductNotFoundException)
        {
            return NotFound();
        }
        catch (SkuExistsException ex)
        {
            return Conflict(ex.Message);
        }
        catch (PhotoSaveException ex)
        {
            return ex.IsClientFault ? BadRequest(ex.Message) : StatusCode(500, ex.Message);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(ex.Message);
        }
    }

    /// <summary>DELETE /api/products/{id}</summary>
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        try
        {
            await _productService.DeleteAsync(id, ct);
            return NoContent();
        }
        catch (ProductNotFoundException)
        {
            return NotFound();
        }
    }

    /// <summary>GET /api/products/photo/{sku}</summary>
    [HttpGet("photo/{sku}")]
    public async Task<IActionResult> GetPhoto([FromRoute] string sku, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(sku))
            return BadRequest("SKU is required.");

        try
        {
            var photoResult = await _productService.GetPhotoAsync(sku, ct);
            if (photoResult is null)
                return NotFound($"No photo found for SKU '{sku}'.");
            return photoResult;
        }
        catch (ProductNotFoundException ex)
        {
            return NotFound(ex.Message);
        }
        catch (ArgumentException)
        {
            return BadRequest("SKU is required.");
        }
    }

    /// <summary>GET /api/products/Web-photo-by-sku/{sku}</summary>
    [HttpGet("Web-photo-by-sku/{sku}")]
    public async Task<IActionResult> PhotoBySku([FromRoute] string sku, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(sku))
            return BadRequest("SKU is required.");

        try
        {
            var result = await _productService.GetWebPhotoBySkuAsync(sku, ct);
            if (result is null)
                return NotFound(new { message = "No image found for this SKU", sku });
            return File(result.Value.Bytes, result.Value.ContentType);
        }
        catch (ProductNotFoundException)
        {
            return NotFound(new { message = "Product not found", sku });
        }
        catch (ArgumentException)
        {
            return BadRequest("SKU is required.");
        }
    }

    /// <summary>GET /api/products/compare-prices?shopping_city=&amp;sku=&amp;num_results=</summary>
    [HttpGet("compare-prices")]
    public async Task<ActionResult<ProductCompareResponseDto>> ComparePrices(
        [FromQuery] string shopping_city,
        [FromQuery] string sku,
        [FromQuery] int num_results = 100,
        CancellationToken ct = default)
    {
        try
        {
            var response = await _productService.ComparePricesAsync(shopping_city, sku, num_results, ct);
            return Ok(response);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(ex.Message);
        }
        catch (ComparePricesException ex)
        {
            return StatusCode((int)ex.StatusCode, ex.ResponseBody);
        }
    }
}
