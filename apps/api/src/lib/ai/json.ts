/**
 * Robust JSON-object extraction from LLM output.
 *
 * Models sometimes wrap JSON in markdown fences or add prose around it.
 * This finds the first balanced `{...}` object (respecting string escaping)
 * and parses it. Throws if no complete object is present.
 */
export function extractJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced ?? text;
  const start = candidate.indexOf("{");
  if (start < 0) {
    throw new Error("Model did not return a JSON object.");
  }

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < candidate.length; index += 1) {
    const char = candidate[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }
    if (char === "\"") {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return JSON.parse(candidate.slice(start, index + 1)) as unknown;
      }
    }
  }

  throw new Error("Model returned incomplete JSON.");
}
