# ThumbnailMetricsService - Complete Beginner's Guide

## What is Prometheus?

**Prometheus** is a monitoring system that collects metrics (measurements) from your application. Think of it like a dashboard that shows:
- How many times something happened (counters)
- How long things take (histograms)
- Current values that go up and down (gauges)

These metrics are exposed at a `/metrics` endpoint that Prometheus can scrape (collect) periodically.

---

## Understanding Metric Types

Before diving into the code, let's understand the three main metric types:

### 1. **Counter** 📈
- **What it does**: Counts things that only go up (never down)
- **Example**: Total number of requests, total errors
- **Use case**: "How many thumbnails have we processed?"

### 2. **Histogram** 📊
- **What it does**: Measures how values are distributed (like a bar chart)
- **Example**: Processing time, file sizes
- **Use case**: "How long does thumbnail processing take?" or "What are the image file sizes?"
- **Special feature**: Uses "buckets" to group similar values together

### 3. **Gauge** 📉
- **What it does**: Measures a value that can go up or down
- **Example**: Current temperature, queue size, memory usage
- **Use case**: "How many items are waiting in the queue right now?"

---

## Line-by-Line Code Explanation

### Lines 1-3: Imports and Namespace

```csharp
using Prometheus;

namespace Grocery.ThumbnailService.Services;
```

- **Line 1**: `using Prometheus;` - This brings in the Prometheus library so we can use `Counter`, `Histogram`, `Gauge`, and `Metrics`
- **Line 3**: `namespace Grocery.ThumbnailService.Services;` - This organizes our code. It's like putting files in folders

---

### Lines 5-8: Class Declaration

```csharp
/// <summary>
/// Service for tracking Prometheus metrics related to thumbnail processing.
/// </summary>
public class ThumbnailMetricsService
{
```

- **Lines 5-7**: XML documentation comment (the `///` lines) - This is documentation that explains what the class does
- **Line 8**: `public class ThumbnailMetricsService` - Creates a public class that other parts of the code can use

---

### Metric 1: ThumbnailProcessingTotal (Counter) - Lines 10-20

```csharp
/// <summary>
/// Counter tracking total thumbnail processing attempts with status label (success/failure).
/// </summary>
public readonly Counter ThumbnailProcessingTotal = Metrics
    .CreateCounter(
        "thumbnail_processing_total",
        "Total number of thumbnail processing attempts",
        new CounterConfiguration
        {
            LabelNames = new[] { "status" }
        });
```

**Breaking it down:**

- **`public readonly Counter`**: 
  - `public` - Other classes can access this
  - `readonly` - Once set, it can't be changed (safety feature)
  - `Counter` - This is a Prometheus Counter type

- **`Metrics.CreateCounter(...)`**: 
  - `Metrics` is a static class from Prometheus that creates metrics
  - `CreateCounter` creates a new counter metric

- **`"thumbnail_processing_total"`**: 
  - The metric name (must be lowercase with underscores)
  - This is what appears in Prometheus: `thumbnail_processing_total{status="success"}`

- **`"Total number of thumbnail processing attempts"`**: 
  - Human-readable description
  - Shows up in Prometheus UI as help text

- **`new CounterConfiguration { LabelNames = new[] { "status" } }`**: 
  - **Labels** are like tags that let you split the counter into categories
  - `LabelNames = new[] { "status" }` means this counter has one label called "status"
  - You can then track: `thumbnail_processing_total{status="success"}` and `thumbnail_processing_total{status="failure"}` separately
  - Think of it like: "How many succeeded?" vs "How many failed?"

**Example usage:**
```csharp
ThumbnailProcessingTotal.WithLabels("success").Inc();  // Increment success counter
ThumbnailProcessingTotal.WithLabels("failure").Inc();  // Increment failure counter
```

---

### Metric 2: ThumbnailProcessingDurationSeconds (Histogram) - Lines 22-32

```csharp
/// <summary>
/// Histogram tracking thumbnail processing duration in seconds.
/// </summary>
public readonly Histogram ThumbnailProcessingDurationSeconds = Metrics
    .CreateHistogram(
        "thumbnail_processing_duration_seconds",
        "Duration of thumbnail processing in seconds",
        new HistogramConfiguration
        {
            Buckets = Histogram.ExponentialBuckets(0.1, 2, 10) // 0.1s, 0.2s, 0.4s, 0.8s, 1.6s, 3.2s, 6.4s, 12.8s, 25.6s, 51.2s
        });
```

**Breaking it down:**

- **`Histogram`**: Tracks how values are distributed (like a bar chart showing ranges)

- **`"thumbnail_processing_duration_seconds"`**: Metric name for processing time

- **`Buckets = Histogram.ExponentialBuckets(0.1, 2, 10)`**: 
  - **Buckets** are like bins in a histogram - they group similar values together
  - `ExponentialBuckets(0.1, 2, 10)` creates 10 buckets that double in size:
    - Start at 0.1 seconds
    - Multiply by 2 each time
    - Creates: 0.1s, 0.2s, 0.4s, 0.8s, 1.6s, 3.2s, 6.4s, 12.8s, 25.6s, 51.2s
  - **Why exponential?** Most operations are fast (0.1-1s), but some are slow. Exponential buckets give you fine detail for fast operations and still capture slow ones.

**How it works:**
- If processing takes 0.15 seconds, it goes in the "≤0.2s" bucket
- If processing takes 2.5 seconds, it goes in the "≤3.2s" bucket
- Prometheus then shows: "50 operations took ≤0.2s, 120 took ≤0.4s, etc."

**Example usage:**
```csharp
ThumbnailProcessingDurationSeconds.Observe(0.25);  // Record that processing took 0.25 seconds
```

---

### Metric 3: ThumbnailProcessingQueueSize (Gauge) - Lines 34-40

```csharp
/// <summary>
/// Gauge tracking the queue size (if available).
/// </summary>
public readonly Gauge ThumbnailProcessingQueueSize = Metrics
    .CreateGauge(
        "thumbnail_processing_queue_size",
        "Current size of the thumbnail processing queue");
```

**Breaking it down:**

- **`Gauge`**: A value that can go up or down (unlike Counter which only goes up)

- **`"thumbnail_processing_queue_size"`**: Metric name

- **No labels or buckets**: Simple gauge - just one number

**Example usage:**
```csharp
ThumbnailProcessingQueueSize.Set(42);  // Set queue size to 42
ThumbnailProcessingQueueSize.Inc();    // Increase by 1
ThumbnailProcessingQueueSize.Dec();    // Decrease by 1
```

**Why use a Gauge?**
- Queue size changes: sometimes 0, sometimes 100, sometimes 50
- A Counter would only go up (1, 2, 3, 4...), but we need the current value

---

### Metric 4: ThumbnailImageSizeBytes (Histogram) - Lines 42-53

```csharp
/// <summary>
/// Histogram tracking image sizes (original and thumbnail) in bytes.
/// </summary>
public readonly Histogram ThumbnailImageSizeBytes = Metrics
    .CreateHistogram(
        "thumbnail_image_size_bytes",
        "Image size in bytes (original and thumbnail)",
        new HistogramConfiguration
        {
            LabelNames = new[] { "type" }, // "original" or "thumbnail"
            Buckets = Histogram.ExponentialBuckets(1024, 2, 12) // 1KB, 2KB, 4KB, 8KB, 16KB, 32KB, 64KB, 128KB, 256KB, 512KB, 1MB, 2MB
        });
```

**Breaking it down:**

- **`LabelNames = new[] { "type" }`**: 
  - This histogram has a label called "type"
  - We can track original images and thumbnails separately
  - `thumbnail_image_size_bytes{type="original"}` vs `thumbnail_image_size_bytes{type="thumbnail"}`

- **`Buckets = Histogram.ExponentialBuckets(1024, 2, 12)`**: 
  - Starts at 1024 bytes (1 KB)
  - Doubles each time: 1KB, 2KB, 4KB, 8KB, 16KB, 32KB, 64KB, 128KB, 256KB, 512KB, 1MB, 2MB
  - 12 buckets total
  - **Why 1024?** File sizes are typically measured in KB/MB, so starting at 1KB makes sense

**Example usage:**
```csharp
ThumbnailImageSizeBytes.WithLabels("original").Observe(50000);   // Original image is 50KB
ThumbnailImageSizeBytes.WithLabels("thumbnail").Observe(5000);   // Thumbnail is 5KB
```

---

### Metric 5: ThumbnailStorageOperationsTotal (Counter) - Lines 55-65

```csharp
/// <summary>
/// Counter tracking storage operations with operation type and status labels.
/// </summary>
public readonly Counter ThumbnailStorageOperationsTotal = Metrics
    .CreateCounter(
        "thumbnail_storage_operations_total",
        "Total number of storage operations",
        new CounterConfiguration
        {
            LabelNames = new[] { "operation", "status" } // operation: "get", "save", "exists"; status: "success", "failure"
        });
```

**Breaking it down:**

- **`LabelNames = new[] { "operation", "status" }`**: 
  - **Two labels!** This gives us more granular tracking
  - We can track: `get` vs `save` vs `exists` operations
  - AND: `success` vs `failure` for each operation
  - This creates combinations like:
    - `thumbnail_storage_operations_total{operation="get", status="success"}`
    - `thumbnail_storage_operations_total{operation="get", status="failure"}`
    - `thumbnail_storage_operations_total{operation="save", status="success"}`
    - etc.

**Example usage:**
```csharp
ThumbnailStorageOperationsTotal.WithLabels("get", "success").Inc();
ThumbnailStorageOperationsTotal.WithLabels("save", "failure").Inc();
```

**Why two labels?**
- We want to know: "Are 'get' operations failing more than 'save' operations?"
- Or: "How many successful 'save' operations have we done?"

---

## Helper Methods Explained

### Method 1: RecordProcessingSuccess (Lines 67-76)

```csharp
/// <summary>
/// Records a successful thumbnail processing operation.
/// </summary>
public void RecordProcessingSuccess(TimeSpan duration, long originalImageSizeBytes, long thumbnailImageSizeBytes)
{
    ThumbnailProcessingTotal.WithLabels("success").Inc();
    ThumbnailProcessingDurationSeconds.Observe(duration.TotalSeconds);
    ThumbnailImageSizeBytes.WithLabels("original").Observe(originalImageSizeBytes);
    ThumbnailImageSizeBytes.WithLabels("thumbnail").Observe(thumbnailImageSizeBytes);
}
```

**What it does:**
This is a convenience method that records multiple metrics at once when processing succeeds.

**Parameters:**
- `TimeSpan duration` - How long the processing took (e.g., 0.5 seconds)
- `long originalImageSizeBytes` - Size of the original image in bytes
- `long thumbnailImageSizeBytes` - Size of the generated thumbnail in bytes

**Line-by-line:**
1. **`ThumbnailProcessingTotal.WithLabels("success").Inc();`**
   - Gets the counter with label "success"
   - `.Inc()` increments it by 1
   - "We just processed one more thumbnail successfully!"

2. **`ThumbnailProcessingDurationSeconds.Observe(duration.TotalSeconds);`**
   - Records how long it took
   - `duration.TotalSeconds` converts TimeSpan to seconds (e.g., 0.5)
   - This goes into one of the histogram buckets

3. **`ThumbnailImageSizeBytes.WithLabels("original").Observe(originalImageSizeBytes);`**
   - Records the original image size
   - Goes into histogram bucket for "original" type

4. **`ThumbnailImageSizeBytes.WithLabels("thumbnail").Observe(thumbnailImageSizeBytes);`**
   - Records the thumbnail size
   - Goes into histogram bucket for "thumbnail" type

**Why use this method?**
Instead of writing 4 lines of code every time, you just call:
```csharp
metricsService.RecordProcessingSuccess(duration, originalSize, thumbnailSize);
```

---

### Method 2: RecordProcessingFailure (Lines 78-85)

```csharp
/// <summary>
/// Records a failed thumbnail processing operation.
/// </summary>
public void RecordProcessingFailure(TimeSpan duration)
{
    ThumbnailProcessingTotal.WithLabels("failure").Inc();
    ThumbnailProcessingDurationSeconds.Observe(duration.TotalSeconds);
}
```

**What it does:**
Records metrics when processing fails.

**Why no image sizes?**
- If processing fails, we might not have generated a thumbnail
- We still want to know how long it took before failing (maybe it's timing out?)

**Line-by-line:**
1. Increment the failure counter
2. Record how long it took before failing (useful for debugging timeouts)

---

### Method 3: RecordStorageOperation (Lines 87-96)

```csharp
/// <summary>
/// Records a storage operation.
/// </summary>
/// <param name="operation">The operation type: "get", "save", or "exists"</param>
/// <param name="success">Whether the operation succeeded</param>
public void RecordStorageOperation(string operation, bool success)
{
    var status = success ? "success" : "failure";
    ThumbnailStorageOperationsTotal.WithLabels(operation, status).Inc();
}
```

**What it does:**
Records storage operations (reading, writing, checking if files exist).

**Parameters:**
- `string operation` - The type: "get", "save", or "exists"
- `bool success` - Did it work? (true/false)

**Line-by-line:**
1. **`var status = success ? "success" : "failure";`**
   - This is a ternary operator (short if-else)
   - If `success` is `true`, `status` = "success"
   - If `success` is `false`, `status` = "failure"
   - Equivalent to:
     ```csharp
     string status;
     if (success)
         status = "success";
     else
         status = "failure";
     ```

2. **`ThumbnailStorageOperationsTotal.WithLabels(operation, status).Inc();`**
   - Uses both labels: operation type AND success/failure
   - Increments the appropriate counter

**Example usage:**
```csharp
// When we successfully get a file:
metricsService.RecordStorageOperation("get", true);

// When saving fails:
metricsService.RecordStorageOperation("save", false);
```

---

### Method 4: UpdateQueueSize (Lines 98-104)

```csharp
/// <summary>
/// Updates the queue size gauge.
/// </summary>
public void UpdateQueueSize(long size)
{
    ThumbnailProcessingQueueSize.Set(size);
}
```

**What it does:**
Updates the current queue size.

**Parameters:**
- `long size` - The current number of items waiting in the queue

**Line-by-line:**
- **`ThumbnailProcessingQueueSize.Set(size);`**
  - Sets the gauge to the exact value
  - Unlike Counter (which increments), Gauge can be set to any value

**Example usage:**
```csharp
// Check how many items are in the queue
int queueSize = GetQueueSizeFromServiceBus();
metricsService.UpdateQueueSize(queueSize);
```

---

## Real-World Example: How It All Works Together

Here's how you'd use this service in the `ThumbnailConsumer`:

```csharp
public class ThumbnailConsumer : IConsumer<ThumbnailRequestMessage>
{
    private readonly ThumbnailMetricsService _metrics;
    private readonly IStorageService _storageService;
    
    public async Task Consume(ConsumeContext<ThumbnailRequestMessage> context)
    {
        var stopwatch = Stopwatch.StartNew(); // Start timing
        long originalSize = 0;
        long thumbnailSize = 0;
        
        try
        {
            // Get original image
            var originalBytes = await _storageService.GetAsync(fileName);
            _metrics.RecordStorageOperation("get", originalBytes != null);
            originalSize = originalBytes?.Length ?? 0;
            
            // Generate thumbnail
            var thumbnailBytes = GenerateThumbnail(originalBytes);
            thumbnailSize = thumbnailBytes.Length;
            
            // Save thumbnail
            await _storageService.SaveAsync(thumbnailFileName, thumbnailBytes);
            _metrics.RecordStorageOperation("save", true);
            
            // Record success
            stopwatch.Stop();
            _metrics.RecordProcessingSuccess(stopwatch.Elapsed, originalSize, thumbnailSize);
        }
        catch (Exception ex)
        {
            // Record failure
            stopwatch.Stop();
            _metrics.RecordProcessingFailure(stopwatch.Elapsed);
            throw;
        }
    }
}
```

---

## Summary: What Each Metric Tells Us

| Metric | Type | What It Answers |
|--------|------|----------------|
| `thumbnail_processing_total` | Counter | "How many thumbnails have we processed? How many succeeded vs failed?" |
| `thumbnail_processing_duration_seconds` | Histogram | "How long does processing take? Are we getting slower?" |
| `thumbnail_processing_queue_size` | Gauge | "How many items are waiting right now? Is the queue backing up?" |
| `thumbnail_image_size_bytes` | Histogram | "What are the file sizes? Are images getting larger?" |
| `thumbnail_storage_operations_total` | Counter | "Are storage operations failing? Which operations (get/save/exists)?" |

---

## Key Concepts Recap

1. **Labels** = Tags that let you split metrics into categories
2. **Buckets** = Ranges that group similar values together (for histograms)
3. **Counter** = Only goes up (counts events)
4. **Histogram** = Shows distribution of values (with buckets)
5. **Gauge** = Can go up or down (current value)
6. **Helper methods** = Convenience functions that record multiple metrics at once

This service makes it easy to monitor your thumbnail processing system and identify problems like:
- High failure rates
- Slow processing times
- Storage operation failures
- Queue backups
