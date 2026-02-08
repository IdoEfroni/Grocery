namespace Grocery.Api.Exceptions;

/// <summary>
/// Thrown when saving a product photo fails (validation, network, or I/O).
/// </summary>
public class PhotoSaveException : Exception
{
    /// <summary>
    /// When true, the error is considered a client fault (e.g. invalid format, size).
    /// When false, it is a server fault (e.g. I/O error).
    /// </summary>
    public bool IsClientFault { get; }

    public PhotoSaveException(string message, bool isClientFault = true)
        : base(message)
    {
        IsClientFault = isClientFault;
    }

    public PhotoSaveException(string message, Exception innerException, bool isClientFault = false)
        : base(message, innerException)
    {
        IsClientFault = isClientFault;
    }
}
