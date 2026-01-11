using Grocery.Api.Models.Messages;
using Grocery.Api.Services;
using Grocery.ThumbnailService.Consumers;
using MassTransit;

var builder = Host.CreateApplicationBuilder(args);

// Configure Azure Service Bus
var serviceBusConnectionString = builder.Configuration["ServiceBus:ConnectionString"];
if (string.IsNullOrWhiteSpace(serviceBusConnectionString))
{
    throw new InvalidOperationException("ServiceBus:ConnectionString is required but not configured.");
}

var queueName = builder.Configuration["ServiceBus:QueueName"] ?? "thumbnail-request-queue";

// Configure storage service based on environment
// Development: LocalStorageService
// Production: BlobStorageService (when Storage:Type is set to "Blob")
var storageType = builder.Configuration["Storage:Type"] ?? "Local";
if (builder.Environment.IsProduction() && storageType.Equals("Blob", StringComparison.OrdinalIgnoreCase))
{
    builder.Services.AddScoped<IStorageService, BlobStorageService>();
}
else
{
    builder.Services.AddScoped<IStorageService, LocalStorageService>();
}

try
{
    builder.Services.AddMassTransit(x =>
    {
        x.AddConsumer<ThumbnailConsumer>();
        
        x.UsingAzureServiceBus((context, cfg) =>
        {
            cfg.Host(serviceBusConnectionString);
            
            // Configure message topology to use queue (not topic) for Basic tier
            // This prevents MassTransit from trying to create a topic
            cfg.Message<ThumbnailRequestMessage>(m => m.SetEntityName(queueName));
            
            // Configure receive endpoint to use queue (Basic tier only supports queues)
            cfg.ReceiveEndpoint(queueName, e =>
            {
                // Disable consume topology to prevent topic creation (Basic tier doesn't support topics)
                e.ConfigureConsumeTopology = false;
                
                // Disable fault publishing (requires topics)
                e.PublishFaults = false;
                
                e.ConfigureConsumer<ThumbnailConsumer>(context);
                e.UseMessageRetry(r => r.Interval(3, TimeSpan.FromSeconds(5)));
            });
        });
    });
}
catch (Exception ex)
{
    throw new InvalidOperationException(
        $"Failed to configure MassTransit with Azure Service Bus. ConnectionString: {(string.IsNullOrEmpty(serviceBusConnectionString) ? "NOT SET" : "SET")}, QueueName: {queueName}. " +
        $"Error: {ex.Message}", ex);
}

var host = builder.Build();
host.Run();
