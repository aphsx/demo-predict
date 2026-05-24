const enc = new TextEncoder();

export function sseFrame(event: string, data: string): Uint8Array {
  return enc.encode(`event: ${event}\ndata: ${data}\n\n`);
}
