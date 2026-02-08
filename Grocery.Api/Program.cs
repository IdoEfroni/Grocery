using Grocery.Api.Data;
using Grocery.Api.Models.Messages;
using Grocery.Api.Parsers;
using Grocery.Api.Services;
using MassTransit;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.

builder.Services.AddControllers();
// Learn more about configuring Swagger/OpenAPI at https://aka.ms/aspnetcore/swashbuckle
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// Configure database - always use SQL Server (Azure SQL)
var connectionString = builder.Configuration.GetConnectionString("Default");
builder.Services.AddDbContext<StoreDbContext>(opt => opt.UseSqlServer(connectionString, sqlServerOptions => 
    sqlServerOptions.EnableRetryOnFailure()));

builder.Services.AddScoped<IProductRepository, ProductRepository>();
builder.Services.AddScoped<IProductService, ProductService>();
builder.Services.AddHttpClient<DuckDuckGoImageService>();
builder.Services.AddHttpClient<IPhotoService, PhotoService>();
builder.Services.AddHttpClient("ChpCompare");
builder.Services.AddScoped<ChipHtmlParser>();
builder.Services.AddScoped<ChipApiClient>();

// Configure storage service based on environment
var storageType = builder.Configuration["Storage:Type"] ?? "Local";
if (builder.Environment.IsProduction() && storageType.Equals("Blob", StringComparison.OrdinalIgnoreCase))
{
    builder.Services.AddScoped<IStorageService, BlobStorageService>();
}
else
{
    builder.Services.AddScoped<IStorageService, LocalStorageService>();
}

// Configure MassTransit - always use Azure Service Bus
var serviceBusConnectionString = builder.Configuration["ServiceBus:ConnectionString"];
if (string.IsNullOrWhiteSpace(serviceBusConnectionString))
{
    throw new InvalidOperationException("ServiceBus:ConnectionString is required but not configured.");
}

var queueName = builder.Configuration["ServiceBus:QueueName"] ?? "thumbnail-request-queue";

try
{
    builder.Services.AddMassTransit(x =>
    {
        x.UsingAzureServiceBus((context, cfg) =>
        {
            cfg.Host(serviceBusConnectionString);
            
            // Configure message topology to use queue (not topic) for Basic tier
            // This allows GetSendEndpoint to work with the queue name
            cfg.Message<ThumbnailRequestMessage>(m => m.SetEntityName(queueName));
        });
    });
}
catch (Exception ex)
{
    throw new InvalidOperationException(
        $"Failed to configure MassTransit with Azure Service Bus. ConnectionString: {(string.IsNullOrEmpty(serviceBusConnectionString) ? "NOT SET" : "SET")}, QueueName: {queueName}. " +
        $"Error: {ex.Message}", ex);
}

// Configure CORS - read from configuration (supports environment variables)
var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() 
    ?? new[] { 
        "http://localhost:5173",
        "https://localhost:5173",
        "http://127.0.0.1:5173",
        "https://127.0.0.1:5173",
        "http://localhost:5174",
        "https://localhost:5174",
        "http://127.0.0.1:5174",
        "https://127.0.0.1:5174"
    };

var allowFrontend = "AllowFrontend";
builder.Services.AddCors(opt =>
{
    opt.AddPolicy(allowFrontend, p => p
        .WithOrigins(allowedOrigins)
        .AllowAnyHeader()
        .AllowAnyMethod()
    // .AllowCredentials() // only if you actually send cookies/auth
    );
});

var app = builder.Build();
app.UseCors(allowFrontend);

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();

app.UseAuthorization();

app.MapControllers();

app.Run();
