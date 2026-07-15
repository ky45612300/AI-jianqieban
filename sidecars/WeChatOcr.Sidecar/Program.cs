using System.Text;
using System.Text.Json;
using WeChatOcr;

Console.OutputEncoding = new UTF8Encoding(false);
DataLocation.SetBaseDirectory(AppContext.BaseDirectory);
Environment.CurrentDirectory = AppContext.BaseDirectory;

var request = OcrRequest.FromArgs(args);
if (request is null)
{
    WriteJson(SidecarResponse.Fail("缺少图片路径。"));
    return 0;
}

try
{
    if (!File.Exists(request.ImagePath))
    {
        WriteJson(SidecarResponse.Fail($"图片文件不存在：{request.ImagePath}"));
        return 0;
    }

    var text = await RecognizeAsync(request.ImagePath, request.TimeoutMs);
    WriteJson(SidecarResponse.Success(text));
}
catch (Exception error)
{
    WriteJson(SidecarResponse.Fail(error.Message));
}

return 0;

static async Task<string> RecognizeAsync(string imagePath, int timeoutMs)
{
    using var ocr = new ImageOcr();
    var completion = new TaskCompletionSource<string>(
        TaskCreationOptions.RunContinuationsAsynchronously
    );

    ocr.Run(
        imagePath,
        (_, result) =>
        {
            try
            {
                var lines = result?.OcrResult?.SingleResult
                    ?.Select(item => item?.SingleStrUtf8)
                    .Where(text => !string.IsNullOrWhiteSpace(text))
                    .Select(text => text!.Trim())
                    .ToArray();

                completion.TrySetResult(
                    lines is { Length: > 0 } ? string.Join(Environment.NewLine, lines) : ""
                );
            }
            catch (Exception error)
            {
                completion.TrySetException(error);
            }
        }
    );

    var completed = await Task.WhenAny(completion.Task, Task.Delay(timeoutMs));
    if (completed != completion.Task)
    {
        throw new TimeoutException("WeChat OCR 操作超时。");
    }

    return await completion.Task;
}

static void WriteJson(SidecarResponse response)
{
    Console.Write(
        JsonSerializer.Serialize(
            response,
            new JsonSerializerOptions
            {
                PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            }
        )
    );
}

internal sealed record OcrRequest(string ImagePath, int TimeoutMs)
{
    public static OcrRequest? FromArgs(string[] args)
    {
        string? imagePath = null;
        var timeoutMs = 10000;

        for (var index = 0; index < args.Length; index++)
        {
            var arg = args[index];

            if (arg == "--image" && index + 1 < args.Length)
            {
                imagePath = args[++index];
                continue;
            }

            if (arg == "--timeout" && index + 1 < args.Length)
            {
                if (int.TryParse(args[++index], out var parsedTimeout))
                {
                    timeoutMs = Math.Clamp(parsedTimeout, 1000, 120000);
                }

                continue;
            }

            if (!arg.StartsWith("--", StringComparison.Ordinal) && imagePath is null)
            {
                imagePath = arg;
            }
        }

        return string.IsNullOrWhiteSpace(imagePath)
            ? null
            : new OcrRequest(Path.GetFullPath(imagePath), timeoutMs);
    }
}

internal sealed record SidecarResponse(bool Ok, string Text, string? Error)
{
    public static SidecarResponse Success(string text) => new(true, text, null);

    public static SidecarResponse Fail(string error) => new(false, "", error);
}
