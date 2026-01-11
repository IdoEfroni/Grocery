$ErrorActionPreference = "Stop"

# Get the script directory and root directory
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Split-Path -Parent $scriptDir

# Change to root directory so paths work correctly
Set-Location $rootDir

# Configuration
$acr = "groceryregistryef"
$image = "grocery-web"
$tag = "latest"
$rg = "rg-grocery-dev"
$app = "grocery-web"
$dockerfilePath = "grocery-web\Dockerfile"
$buildContext = "grocery-web"

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  Grocery Web Deployment Script" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# Check if Azure CLI is installed
Write-Host "Checking for Azure CLI..." -ForegroundColor Yellow

# Refresh PATH from registry to ensure we have the latest
$env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")

# Try to find az command
$azCommand = Get-Command az -ErrorAction SilentlyContinue

if (-not $azCommand) {
    Write-Host "❌ Azure CLI is not found in PATH" -ForegroundColor Red
    Write-Host "" -ForegroundColor Yellow
    Write-Host "Azure CLI appears to be installed but not accessible." -ForegroundColor Yellow
    Write-Host "Please try one of the following:" -ForegroundColor Yellow
    Write-Host "  1. Close and reopen PowerShell to refresh PATH" -ForegroundColor Cyan
    Write-Host "  2. Restart your computer" -ForegroundColor Cyan
    Write-Host "  3. Manually verify Azure CLI location:" -ForegroundColor Cyan
    Write-Host "     Usually at: C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin" -ForegroundColor Gray
    Write-Host "" -ForegroundColor Yellow
    Write-Host "Or reinstall Azure CLI:" -ForegroundColor Yellow
    Write-Host "  winget install -e --id Microsoft.AzureCLI" -ForegroundColor Cyan
    Write-Host "  Or download from: https://aka.ms/installazurecliwindows" -ForegroundColor Cyan
    exit 1
}

# Try to run az --version to verify it works
try {
    $azOutput = az --version 2>&1
    if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne $null) {
        throw "Command failed"
    }
    Write-Host "✅ Azure CLI is installed" -ForegroundColor Green
    $versionLine = ($azOutput | Select-Object -First 1)
    if ($versionLine) {
        Write-Host "   Version: $versionLine" -ForegroundColor Gray
    }
} catch {
    Write-Host "⚠️  Azure CLI found but may not be working correctly" -ForegroundColor Yellow
    Write-Host "   Continuing anyway..." -ForegroundColor Gray
}

# Check if logged in to Azure and login if not
Write-Host ""
Write-Host "Checking Azure login status..." -ForegroundColor Yellow
try {
    $account = az account show 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Not logged in"
    }
    $accountJson = $account | ConvertFrom-Json
    Write-Host "✅ Already logged in to Azure" -ForegroundColor Green
    Write-Host "   Subscription: $($accountJson.name)" -ForegroundColor Gray
    Write-Host "   Subscription ID: $($accountJson.id)" -ForegroundColor Gray
} catch {
    Write-Host "⚠️  Not logged in to Azure" -ForegroundColor Yellow
    Write-Host "Logging in to Azure..." -ForegroundColor Yellow
    az login
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Failed to login to Azure" -ForegroundColor Red
        exit 1
    }
    Write-Host "✅ Successfully logged in to Azure" -ForegroundColor Green
}

# Login to Azure Container Registry
Write-Host ""
Write-Host "Logging in to Azure Container Registry '$acr'..." -ForegroundColor Yellow
az acr login --name $acr
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to login to ACR" -ForegroundColor Red
    Write-Host "Please verify the ACR name is correct: $acr" -ForegroundColor Yellow
    exit 1
}
Write-Host "✅ Successfully logged in to ACR" -ForegroundColor Green

# Check if Dockerfile exists
Write-Host ""
Write-Host "Checking for Dockerfile..." -ForegroundColor Yellow
if (-not (Test-Path $dockerfilePath)) {
    Write-Host "❌ Dockerfile not found at: $dockerfilePath" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Dockerfile found" -ForegroundColor Green

# Build Docker image
Write-Host ""
Write-Host "Building Docker image..." -ForegroundColor Yellow
Write-Host "  Image: $image" -ForegroundColor Gray
Write-Host "  Tag: $tag" -ForegroundColor Gray
Write-Host "  Dockerfile: $dockerfilePath" -ForegroundColor Gray
Write-Host "  Build context: $buildContext" -ForegroundColor Gray
Write-Host ""

docker build -f $dockerfilePath -t "${image}:${tag}" $buildContext
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to build Docker image" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Docker image built successfully" -ForegroundColor Green

# Tag image for ACR
Write-Host ""
Write-Host "Tagging image for ACR..." -ForegroundColor Yellow
$acrImage = "${acr}.azurecr.io/${image}:${tag}"
docker tag "${image}:${tag}" $acrImage
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to tag Docker image" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Image tagged: $acrImage" -ForegroundColor Green

# Push image to ACR
Write-Host ""
Write-Host "Pushing image to ACR..." -ForegroundColor Yellow
docker push $acrImage
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to push image to ACR" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Image pushed to ACR successfully" -ForegroundColor Green

# Update Container App
Write-Host ""
Write-Host "Updating Container App..." -ForegroundColor Yellow
Write-Host "  App Name: $app" -ForegroundColor Gray
Write-Host "  Resource Group: $rg" -ForegroundColor Gray
Write-Host "  Image: $acrImage" -ForegroundColor Gray
Write-Host ""

az containerapp update `
  --name $app `
  --resource-group $rg `
  --image $acrImage

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to update Container App" -ForegroundColor Red
    Write-Host "Please verify:" -ForegroundColor Yellow
    Write-Host "  - Container App name: $app" -ForegroundColor Gray
    Write-Host "  - Resource Group: $rg" -ForegroundColor Gray
    Write-Host "  - You have proper permissions" -ForegroundColor Gray
    exit 1
}

Write-Host "✅ Container App updated successfully" -ForegroundColor Green

# Get Container App URL
Write-Host ""
Write-Host "Fetching Container App details..." -ForegroundColor Yellow
try {
    $appDetails = az containerapp show --name $app --resource-group $rg | ConvertFrom-Json
    $appUrl = $appDetails.properties.configuration.ingress.fqdn
    
    Write-Host ""
    Write-Host "=========================================" -ForegroundColor Green
    Write-Host "  Deployment finished successfully ✅" -ForegroundColor Green
    Write-Host "=========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Container App Details:" -ForegroundColor Cyan
    Write-Host "  Name: $app" -ForegroundColor Gray
    Write-Host "  Resource Group: $rg" -ForegroundColor Gray
    Write-Host "  Application URL: https://$appUrl" -ForegroundColor Gray
    Write-Host ""
} catch {
    Write-Host "⚠️  Could not fetch Container App details, but update completed" -ForegroundColor Yellow
    Write-Host "Deployment finished successfully ✅" -ForegroundColor Green
}

