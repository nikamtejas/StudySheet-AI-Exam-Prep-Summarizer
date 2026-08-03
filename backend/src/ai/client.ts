import Anthropic, { toFile } from '@anthropic-ai/sdk';
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

const FILES_API_BETA = 'files-api-2025-04-14';

// Uploads a buffer (a rasterized page JPEG, for the vision path) once so it
// can be referenced by file_id across both the first attempt and the repair
// retry, instead of re-sending base64 — docs/studysheet-milestones.md M3.
export async function uploadFile(buffer: Buffer, filename: string, mimeType: string): Promise<string> {
  const anthropic = getAnthropicClient();
  const file = await toFile(buffer, filename, { type: mimeType });
  const uploaded = await anthropic.beta.files.upload({ file, betas: [FILES_API_BETA] });
  return uploaded.id;
}

export async function deleteFile(fileId: string): Promise<void> {
  const anthropic = getAnthropicClient();
  await anthropic.beta.files.delete(fileId, { betas: [FILES_API_BETA] });
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

// What a caller can put in a user turn. Images are always referenced by
// Files API file_id (never inline base64) — see uploadFile() above.
export type UserContentBlock = { type: 'text'; text: string } | { type: 'image'; fileId: string };

function toApiContentBlocks(
  blocks: UserContentBlock[],
): Array<{ type: 'text'; text: string } | { type: 'image'; source: { type: 'file'; file_id: string } }> {
  return blocks.map((block) =>
    block.type === 'text' ? block : { type: 'image', source: { type: 'file', file_id: block.fileId } },
  );
}

export interface StructuredCallParams<S extends z.ZodTypeAny> {
  model: ModelKey;
  system: string;
  userContent: string | UserContentBlock[];
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

  const baseBlocks: UserContentBlock[] =
    typeof userContent === 'string' ? [{ type: 'text', text: userContent }] : userContent;

  async function attempt(blocks: UserContentBlock[]): Promise<{ text: string; usage: TokenUsage }> {
    const hasImages = blocks.some((block) => block.type === 'image');
    const systemBlocks = [
      { type: 'text' as const, text: system, cache_control: { type: 'ephemeral' as const } },
    ];
    const outputConfig = { format: { type: 'json_schema' as const, schema: jsonSchema } };
    const thinkingConfig = thinking ? { thinking: { type: 'adaptive' as const } } : {};

    // Only the vision path needs the beta endpoint — file_id image
    // references aren't representable in the GA endpoint's narrower content
    // block type, hence two separate calls rather than one shared object
    // (the GA and beta content-block types don't unify). Plain text calls
    // stay on the GA endpoint, unchanged from M2.
    let text: string;
    let usage: TokenUsage;
    if (hasImages) {
      const response = await anthropic.beta.messages.create({
        model: MODELS[model],
        max_tokens: maxTokens,
        system: systemBlocks,
        output_config: outputConfig,
        ...thinkingConfig,
        betas: [FILES_API_BETA],
        messages: [{ role: 'user', content: toApiContentBlocks(blocks) }],
      });
      const textBlock = response.content.find((block) => block.type === 'text');
      text = textBlock && 'text' in textBlock ? textBlock.text : '';
      usage = { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens };
    } else {
      const textOnly = blocks.filter(
        (block): block is Extract<UserContentBlock, { type: 'text' }> => block.type === 'text',
      );
      const response = await anthropic.messages.create({
        model: MODELS[model],
        max_tokens: maxTokens,
        system: systemBlocks,
        output_config: outputConfig,
        ...thinkingConfig,
        messages: [{ role: 'user', content: textOnly.map((block) => ({ type: 'text', text: block.text })) }],
      });
      const textBlock = response.content.find(
        (block): block is Anthropic.TextBlock => block.type === 'text',
      );
      text = textBlock?.text ?? '';
      usage = { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens };
    }

    return { text, usage };
  }

  const first = await attempt(baseBlocks);
  const firstJson = safeParseJson(first.text);
  const firstResult = firstJson.ok ? schema.safeParse(firstJson.value) : null;

  if (firstResult?.success) {
    return { data: firstResult.data, usage: first.usage, costCents: costCents(model, first.usage), repaired: false };
  }

  const errorDetail = firstJson.ok
    ? JSON.stringify(firstResult?.error.issues ?? [])
    : `Response was not valid JSON: ${firstJson.error}`;
  const repairBlocks: UserContentBlock[] = [
    ...baseBlocks,
    {
      type: 'text',
      text: `Your previous response failed validation against the required schema:\n${errorDetail}\n\nReturn corrected JSON only, matching the schema exactly.`,
    },
  ];

  const second = await attempt(repairBlocks);
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
