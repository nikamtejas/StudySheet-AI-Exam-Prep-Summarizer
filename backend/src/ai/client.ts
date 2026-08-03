import Anthropic from '@anthropic-ai/sdk';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { z } from 'zod';
import { env } from '../config/env';

let client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!client) {
    client = new Anthropic({
      // Omit entirely rather than passing `undefined` when unset — lets the
      // SDK fall back to its own credential resolution (env var, `ant auth
      // login` profile, etc.) instead of erroring at construction time.
      ...(env.ANTHROPIC_API_KEY ? { apiKey: env.ANTHROPIC_API_KEY } : {}),
      maxRetries: 3,
      timeout: 120_000,
    });
  }
  return client;
}

// Model routing — see docs/studysheet-build-prompt.md §6. Verified current
// IDs against the Anthropic models catalog (Opus is at 4.8, not "5" — the
// spec's illustrative "claude-opus-5" predates that naming).
export const MODELS = {
  haiku: 'claude-haiku-4-5',
  sonnet: 'claude-sonnet-5',
  opus: 'claude-opus-4-8',
} as const;
export type ModelKey = keyof typeof MODELS;

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

// $ per million tokens (input, output), standard API rates. Sonnet 5 has an
// introductory discount ($2/$10) through 2026-08-31, not modeled here —
// M2's gate only requires landing within ~20% of the estimate.
const PRICING: Record<ModelKey, { input: number; output: number }> = {
  haiku: { input: 1.0, output: 5.0 },
  sonnet: { input: 3.0, output: 15.0 },
  opus: { input: 5.0, output: 25.0 },
};

export function costCents(model: ModelKey, usage: TokenUsage): number {
  const rates = PRICING[model];
  const dollars =
    (usage.inputTokens / 1_000_000) * rates.input + (usage.outputTokens / 1_000_000) * rates.output;
  return dollars * 100;
}

// zod-to-json-schema emits a `$schema` meta key that the Messages API's
// structured-output schema doesn't expect as a sibling of `type`/`properties`.
function toApiJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  // zod-to-json-schema's generic overloads hit TS's type-instantiation depth
  // limit against a widened ZodTypeAny (a known upstream limitation, not a
  // real type-safety issue here — the return value is validated at runtime
  // by the caller's own schema.safeParse regardless).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = zodToJsonSchema(schema as any) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

function safeParseJson(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export interface StructuredCallParams<S extends z.ZodTypeAny> {
  model: ModelKey;
  system: string;
  userContent: string;
  schema: S;
  maxTokens?: number;
  // Adaptive thinking. Only Sonnet 5 / Opus 4.8 support it — never set this
  // for Haiku calls (it isn't in the adaptive-thinking tier and will 400).
  thinking?: boolean;
}

export interface StructuredCallResult<S extends z.ZodTypeAny> {
  data: z.output<S>;
  usage: TokenUsage;
  costCents: number;
  repaired: boolean;
}

// Calls Claude for strict-JSON output, validates with the caller's Zod
// schema, and retries once with the validation error appended if it fails —
// docs/studysheet-milestones.md reliability invariant 4. Structured outputs
// (output_config.format) make the first-pass failure rare but not
// impossible, so the repair retry stays as the real safety net.
//
// Parameterized by the schema type S (not its inferred output T directly) —
// schemas with `.default()` fields have distinct input/output types, which
// confuses inference when the generic is keyed on the output type alone.
export async function callStructured<S extends z.ZodTypeAny>(
  params: StructuredCallParams<S>,
): Promise<StructuredCallResult<S>> {
  const { model, system, userContent, schema, maxTokens = 4096, thinking = false } = params;
  const anthropic = getAnthropicClient();
  const jsonSchema = toApiJsonSchema(schema);

  async function attempt(userText: string): Promise<{ text: string; usage: TokenUsage }> {
    const response = await anthropic.messages.create({
      model: MODELS[model],
      max_tokens: maxTokens,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      output_config: { format: { type: 'json_schema', schema: jsonSchema } },
      ...(thinking ? { thinking: { type: 'adaptive' as const } } : {}),
      messages: [{ role: 'user', content: userText }],
    });
    const textBlock = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === 'text',
    );
    return {
      text: textBlock?.text ?? '',
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }

  const first = await attempt(userContent);
  const firstJson = safeParseJson(first.text);
  const firstResult = firstJson.ok ? schema.safeParse(firstJson.value) : null;

  if (firstResult?.success) {
    return { data: firstResult.data, usage: first.usage, costCents: costCents(model, first.usage), repaired: false };
  }

  const errorDetail = firstJson.ok
    ? JSON.stringify(firstResult?.error.issues ?? [])
    : `Response was not valid JSON: ${firstJson.error}`;
  const repairPrompt = `${userContent}\n\nYour previous response failed validation against the required schema:\n${errorDetail}\n\nReturn corrected JSON only, matching the schema exactly.`;

  const second = await attempt(repairPrompt);
  const secondJson = safeParseJson(second.text);
  const secondResult = secondJson.ok ? schema.safeParse(secondJson.value) : null;

  const combinedUsage: TokenUsage = {
    inputTokens: first.usage.inputTokens + second.usage.inputTokens,
    outputTokens: first.usage.outputTokens + second.usage.outputTokens,
  };
  const combinedCostCents = costCents(model, first.usage) + costCents(model, second.usage);

  if (secondResult?.success) {
    return { data: secondResult.data, usage: combinedUsage, costCents: combinedCostCents, repaired: true };
  }

  const finalError = secondJson.ok
    ? JSON.stringify(secondResult?.error.issues ?? [])
    : `Response was not valid JSON: ${secondJson.error}`;
  throw new Error(`Model response failed schema validation twice: ${finalError}`);
}
