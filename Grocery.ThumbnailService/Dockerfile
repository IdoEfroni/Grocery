FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS base
WORKDIR /app

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY ["Grocery.ThumbnailService/Grocery.ThumbnailService.csproj", "Grocery.ThumbnailService/"]
COPY ["Grocery.Api/Grocery.Api.csproj", "Grocery.Api/"]
COPY ["Grocery.Data/Grocery.Data.csproj", "Grocery.Data/"]
RUN dotnet restore "Grocery.ThumbnailService/Grocery.ThumbnailService.csproj"
COPY . .
WORKDIR "/src/Grocery.ThumbnailService"
RUN dotnet build "Grocery.ThumbnailService.csproj" -c Release -o /app/build

FROM build AS publish
WORKDIR /src
RUN rm -f Grocery.Api/appsettings*.json && \
    dotnet publish "Grocery.ThumbnailService/Grocery.ThumbnailService.csproj" -c Release -o /app/publish

FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "Grocery.ThumbnailService.dll"]

