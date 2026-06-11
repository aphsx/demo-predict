export type SafetyCheck = {
  ok: boolean;
  warnings: string[];
  blockedReason: string | null;
};

const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|rules?)/i,
  /disregard\s+(all\s+)?(previous|prior|above)\s+(instructions?|rules?)/i,
  /system\s*prompt/i,
  /developer\s+message/i,
  /reveal\s+(your\s+)?(prompt|instructions?|rules?)/i,
  /print\s+(your\s+)?(prompt|instructions?|rules?)/i,
  /you\s+are\s+now/i,
  /jailbreak/i,
  /bypass\s+(the\s+)?(guardrails?|policy|permissions?)/i,
  /run\s+(insert|update|delete|drop|alter|truncate)\b/i,
  /ห้ามทำตามคำสั่ง/i,
  /ลืมคำสั่ง/i,
  /เปิดเผย\s*(system|prompt|คำสั่ง)/i,
];

const HARD_BLOCK_PATTERNS = [
  /(?:^|\s)(insert|update|delete|drop|alter|truncate)\s+/i,
  /(?:^|\s)(grant|revoke|copy|execute|call)\s+/i,
  /(?:^|\s)(pg_sleep|dblink|lo_import|lo_export)\s*\(/i,
];

export function checkUserQuestionSafety(question: string): SafetyCheck {
  const warnings: string[] = [];
  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    if (pattern.test(question)) {
      warnings.push("Question contains prompt-injection or policy-bypass language.");
      break;
    }
  }
  for (const pattern of HARD_BLOCK_PATTERNS) {
    if (pattern.test(question)) {
      return {
        ok: false,
        warnings,
        blockedReason: "Question asks for a blocked database operation.",
      };
    }
  }
  return { ok: true, warnings, blockedReason: null };
}

export function sanitizeRetrievedText(text: string): string {
  return text
    .replace(/```/g, "'''")
    .replace(/\b(system|developer|assistant)\s*:/gi, "$1 label:")
    .replace(/ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|rules?)/gi, "[removed instruction-like text]")
    .slice(0, 1_500);
}

export function truncateForEvidence(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n[truncated ${value.length - maxChars} chars]`;
}
