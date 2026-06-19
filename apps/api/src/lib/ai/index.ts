/**
 * Public API of the AI module. Routes should import from `../lib/ai` rather than
 * reaching into individual files, so the module's surface stays explicit.
 *
 * Two sub-domains live here:
 *  - Chat assistant pipeline: orchestrator → llm-client / semantic-layer / sql-* / safety
 *  - Customer insight: customer-ai-service → customer-ai-context → customer-dataset / customer-explanation
 *
 * Internal files keep importing each other by relative path; this barrel only
 * re-exports what the rest of the app consumes.
 */

// Chat assistant
export { orchestrate, sseError, generateConversationTitle } from "./orchestrator";

// Customer insight
export {
  createCustomerAiExplanation,
  type CustomerAiExplanationResponse,
} from "./customer-ai-service";
export {
  loadCustomerPayments,
  loadCustomerUsageMonthly,
} from "./customer-dataset";
