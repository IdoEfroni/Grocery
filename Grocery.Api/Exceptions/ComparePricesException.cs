using System.Net;

namespace Grocery.Api.Exceptions;

/// <summary>
/// Thrown when the external price-comparison service (e.g. chp.co.il) fails.
/// </summary>
public class ComparePricesException : Exception
{
    public HttpStatusCode StatusCode { get; }
    public string ResponseBody { get; }

    public ComparePricesException(HttpStatusCode statusCode, string responseBody)
        : base($"Compare prices request failed with status {(int)statusCode}.")
    {
        StatusCode = statusCode;
        ResponseBody = responseBody;
    }
}
