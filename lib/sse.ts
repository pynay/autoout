export type SseSender = (event: string, data: unknown) => void;

export function createSseStream(
  produce: (send: SseSender) => Promise<void>,
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send: SseSender = (event, data) => {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(payload));
      };
      try {
        await produce(send);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        send("error", { message });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function consumeSse(
  response: Response,
  onEvent: (event: string, data: unknown) => void,
): Promise<void> {
  if (!response.body) throw new Error("Response has no body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const lines = frame.split("\n");
      let event = "message";
      const dataLines: string[] = [];
      for (const line of lines) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
      }
      if (dataLines.length === 0) continue;
      const rawData = dataLines.join("\n");
      let parsedData: unknown;
      try {
        parsedData = JSON.parse(rawData);
      } catch {
        parsedData = rawData;
      }
      onEvent(event, parsedData);
    }
  }
}
