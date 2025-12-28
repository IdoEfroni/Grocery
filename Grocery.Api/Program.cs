using Grocery.Api.Data;
using Grocery.Api.Parsers;
using Grocery.Api.Services;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.

builder.Services.AddControllers();
// Learn more about configuring Swagger/OpenAPI at https://aka.ms/aspnetcore/swashbuckle
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

builder.Services.AddDbContext<StoreDbContext>(opt =>
    opt.UseSqlite(builder.Configuration.GetConnectionString("Default")));

builder.Services.AddScoped<IProductRepository, ProductRepository>();
builder.Services.AddHttpClient("ChpCompare");
builder.Services.AddScoped<ChipHtmlParser>();
builder.Services.AddScoped<ChipApiClient>();

var allowFrontend = "AllowFrontend";
builder.Services.AddCors(opt =>
{
    opt.AddPolicy(allowFrontend, p => p
        .WithOrigins(
            "http://localhost:5173",
            "https://localhost:5173",
            "http://127.0.0.1:5173",
            "https://127.0.0.1:5173"
        )
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
