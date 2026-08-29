# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

Four .NET 8 projects in `Grocery.sln` plus a separate Vite/React app:

| Project | Type | Role |
|---|---|---|
| `Grocery.Api` | ASP.NET Core Web API | Product CRUD, photo upload/retrieval, price comparison. Owns the EF Core model, DTOs, storage abstraction, and the Service Bus message contract. |
| `Grocery.ThumbnailService` | Worker Service | MassTransit consumer that generates WebP thumbnails. **References `Grocery.Api`** to reuse `IStorageService`, `LocalStorageService`/`BlobStorageService`, and `ThumbnailRequestMessage`. |
| `Grocery.Data` | Class library | Empty placeholder (`Class1.cs`). All data code actually lives in `Grocery.Api/Data` and `Grocery.Api/Services`. |
| `Grocery.Tests` | xUnit + FluentAssertions | **Both `ProductRepositoryTests.cs` and `TestDbFactory.cs` are entirely commented out** — the suite runs zero tests. Restoring them needs a `Microsoft.Data.Sqlite` package reference, which the csproj no longer has. |
| `grocery-web` | React 19 + Vite + react-bootstrap | SPA client. Not part of the solution. Mixed JS/TS — see below. |

The `Grocery.ThumbnailService` → `Grocery.Api` project reference is deliberate but leaky: its Dockerfile does `rm -f Grocery.Api/appsettings*.json` before publish so the API's settings don't shadow the worker's.

## Commands

```powershell
# .NET (from repo root)
dotnet build Grocery.sln
dotnet test Grocery.Tests/Grocery.Tests.csproj
dotnet test Grocery.Tests/Grocery.Tests.csproj --filter "FullyQualifiedName~<TestName>"  # single test

dotnet run --project Grocery.Api            # http://localhost:8080, Swagger at /swagger
dotnet run --project Grocery.ThumbnailService  # Prometheus /metrics on port 9090

# EF Core migrations (Grocery.Api holds the DbContext)
dotnet ef migrations add <Name> --project Grocery.Api
dotnet ef database update --project Grocery.Api

# Frontend (from grocery-web/)
npm run dev         # http://localhost:5173
npm run dev:device  # https://<lan-ip>:5173 — required to test the camera on a phone
npm run build
npm run lint
npm run typecheck   # tsc --noEmit
npm run test        # vitest run
npx vitest run src/hooks/useBarcodeScanner.test.tsx   # single test file

# Full stack — requires a .env at repo root (see .env.example)
docker compose up --build
```

Deployment: pushing to `main` triggers `.github/workflows/deploy.yml`, which builds all three images and deploys to Azure Container Apps in `rg-grocery-dev`. `azure/deploy-*.ps1` do the same manually for one service each.

## Configuration

`appsettings.Example.json` in both service projects is the template — the real `appsettings.*.json` hold secrets and are not templates to copy blindly. Key knobs:

- `ConnectionStrings:Default` — **always SQL Server**, even in Development (`Program.cs` hardcodes `UseSqlServer`). The `app.db*` files in `Grocery.Api/` are stale SQLite leftovers and are not used at runtime.
- `ServiceBus:ConnectionString` — **required**; both services throw at startup if it's missing. `ServiceBus:QueueName` defaults to `thumbnail-request-queue`.
- `Storage:Type` — `Blob` selects `BlobStorageService`, but **only when the environment is Production**; every other combination falls back to `LocalStorageService` (writes to `{ContentRoot}/uploads/photos`).
- `Cors:AllowedOrigins` — array; falls back to localhost 5173/5174 when unset.
- `Metrics:Port` (thumbnail service) — defaults to 9090.
- Frontend reads `VITE_API_BASE_URL` from `.env.development` / `.env.production`; it is baked in at build time, including as a Docker `ARG` in `grocery-web/Dockerfile`.

The Service Bus is on the **Basic tier**, which supports queues but not topics. Both `Program.cs` files therefore call `cfg.Message<ThumbnailRequestMessage>(m => m.SetEntityName(queueName))`, and the consumer sets `ConfigureConsumeTopology = false` and `PublishFaults = false`. Don't reintroduce publish/topic-based MassTransit patterns.

## Architecture

### API request pipeline

`ProductsController` → `IProductService` (`ProductService`) → `IProductRepository` (`ProductRepository` over `StoreDbContext`). Photo work is delegated to `IPhotoService`, which in turn uses `IStorageService`.

Error handling convention: **services throw typed exceptions from `Grocery.Api/Exceptions`** (`ProductNotFoundException`, `SkuExistsException`, `PhotoSaveException`, `ComparePricesException`), and the controller is the only layer that translates them to status codes. There is no exception middleware — a new exception type needs a `catch` in the controller action. `PhotoSaveException.IsClientFault` decides 400 vs 500.

Mapping is via extension methods in `Mappers/ProductMappers.cs` (`ToDto`, `Apply`) — not AutoMapper. `InMemoryProductRepository` exists but is not registered in DI.

Products are keyed by `Id` (Guid) for CRUD, but **SKU is the identity for everything photo-related**: files are stored as `{sku}.{ext}` and thumbnails as `{sku}_thumb.webp`.

### Async thumbnail flow

This is the core cross-service design, documented in detail with sequence/flow diagrams in [docs/thumbnail-flow-diagrams.md](docs/thumbnail-flow-diagrams.md):

1. `POST /api/products` (multipart form) → `PhotoService.SavePhotoAsync` validates (5 MB max; `.jpg .jpeg .png .gif .webp`) or downloads from `PhotoUrl`, saves the original via `IStorageService`, then sends a `ThumbnailRequestMessage(sku)` to the queue.
2. `ThumbnailConsumer` probes the allowed extensions to find the original, short-circuits if `{sku}_thumb.webp` already exists, else resizes to 300×300 (fill + center crop) with ImageMagick, converts to WebP at quality 85, and saves.
3. `GET /api/products/photo/{sku}` returns the thumbnail if present, otherwise falls back to the original by probing extensions, otherwise 404.

Failures throw out of `Consume` so MassTransit retries (`r.Interval(3, TimeSpan.FromSeconds(5))`).

### Metrics

`ThumbnailMetricsService` (singleton) owns all Prometheus metrics; `MetricsHostService` (a `BackgroundService`) runs a `KestrelMetricServer` so `/metrics` is scrapable from the worker, which otherwise has no HTTP surface. Record through the helper methods (`RecordProcessingSuccess/Failure`, `RecordStorageOperation`, `UpdateQueueSize`) rather than touching the metric fields directly. [docs/ThumbnailMetricsService-Explanation.md](docs/ThumbnailMetricsService-Explanation.md) explains each metric and its labels.

### External integrations

- `ChipApiClient` + `ChipHtmlParser` scrape chp.co.il for price comparison. The parser keys off **Hebrew column names** (`"מחיר"`, `"שם המוצר ותכולה"`, `"יצרן/מותג וברקוד"`) — these string literals are load-bearing, not display text.
- `DuckDuckGoImageService` backs `GET /api/products/Web-photo-by-sku/{sku}`, which searches the web for a product image rather than reading stored files.

### Frontend

TypeScript is being adopted incrementally: `tsconfig.json` sets `allowJs` with `checkJs: false`, so the remaining `.jsx` files (`App.jsx`, `main.jsx`, `LanguageToggle`) still build but are not type-checked. **Write new and rewritten files as `.ts`/`.tsx`.** Never leave a `.jsx` and a `.tsx` with the same basename — Vite's resolution between them is ambiguous.

Routes are declared in `src/App.jsx` (`/`, `/view`, `/create`, `/products/:id`). API access goes through `src/api/products.ts` over the `http()` helper in `src/api/http.ts`. That helper throws a typed **`ApiError` carrying a numeric `status`** — check `err instanceof ApiError && err.isNotFound`, never string-match the message. It also supports `signal` and `timeoutMs`, and omits `Content-Type` for `FormData` so the browser sets the multipart boundary.

i18n is a hand-rolled `LanguageContext` over `src/translations/{en,he}.json`, using dot-path keys (`t('browsePage.searchPlaceholder')`) with English fallback. **Hebrew is the default and the provider syncs `lang`/`dir` onto `<html>`** — so native dialogs, `<select>` pickers and validation bubbles inherit RTL. New UI must work in RTL, and every new string goes in both translation files.

#### Barcode scanning

`useBarcodeScanner` (`src/hooks/useBarcodeScanner.ts`) owns the camera and the decode loop; `BarcodeScanner.tsx` is presentational. Decoding uses the `barcode-detector` package: the **native `BarcodeDetector` on Android Chrome**, falling back to **ZXing-C++ WASM** on iOS, where WebKit still does not implement the Shape Detection API. The WASM binary is self-hosted via a Vite `?url` import and lazy-loaded, so Android never downloads it.

Two invariants that are easy to break and were the cause of the previous implementation's bugs:

- **Guard async camera work with the generation ref, never with state.** React 19 StrictMode runs effect → cleanup → effect synchronously in one commit, so a state-based guard reads its pre-cleanup value and you end up with two streams, one of which is never stopped (the camera indicator stays lit until reload). `CameraCapture.tsx` follows the same pattern.
- **Decode from a native-resolution crop.** The ROI is drawn 1:1 into a canvas sized in *video* pixels. Downsampling to a CSS-pixel-sized canvas is what made EAN-13 unreadable before; an EAN-13 is 95 modules wide and needs several pixels per module.

Formats are restricted to linear retail symbologies (`RETAIL_FORMATS`) — adding 2D matrix formats like QR makes every frame markedly more expensive for no benefit here.

**Camera work requires a secure context.** A LAN IP over plain HTTP is not one, so `navigator.mediaDevices` is `undefined` there. Use `npm run dev:device`, which serves HTTPS and binds to the LAN; `.env.device` points the API at the deployed HTTPS endpoint to avoid mixed-content blocking. Emulators do not reproduce lens selection or autofocus — verify scanner changes on a real phone.
