FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS base
WORKDIR /app
EXPOSE 8080

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY ["Grocery.Api/Grocery.Api.csproj", "Grocery.Api/"]
COPY ["Grocery.Data/Grocery.Data.csproj", "Grocery.Data/"]
RUN dotnet restore "Grocery.Api/Grocery.Api.csproj"
COPY . .
WORKDIR "/src/Grocery.Api"
RUN dotnet build "Grocery.Api.csproj" -c Release -o /app/build

FROM build AS publish
RUN dotnet publish "Grocery.Api.csproj" -c Release -o /app/publish

FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "Grocery.Api.dll"]

