import { getMongoConnection } from '../lib/mongo';
import { SummaryModel } from '../models/Summary';
import { renderSummary, type RenderVariant, type RenderSize } from '../pipeline/render';
import { closePuppeteerPool } from '../lib/puppeteerPool';

const VALID_FORMATS = ['a4', 'letter', 'onepager'] as const;
type Format = (typeof VALID_FORMATS)[number];

function isFormat(value: string | undefined): value is Format {
  return VALID_FORMATS.includes(value as Format);
}

// The CLI's single --format flag conflates the API's two separate
// dimensions (variant: full/onepager/appendix, and page size: a4/letter) —
// 'a4'/'letter' both mean the full study sheet at that page size, 'onepager'
// means the one-pager (always at a fixed size, since "fits on exactly one
// sheet" is what matters, not which paper size it's one sheet of).
function resolveVariantAndSize(format: Format): { variant: RenderVariant; size: RenderSize } {
  if (format === 'onepager') return { variant: 'onepager', size: 'a4' };
  return { variant: 'full', size: format };
}

function parseArgs(argv: string[]): { summaryId: string; format: Format } {
  const summaryId = argv[0];
  if (!summaryId) {
    throw new Error('Usage: npm run render -- <summaryId> [--format a4|letter|onepager]');
  }
  const formatIndex = argv.indexOf('--format');
  const formatArg = formatIndex >= 0 ? argv[formatIndex + 1] : undefined;
  const format = isFormat(formatArg) ? formatArg : 'a4';
  return { summaryId, format };
}

async function main(): Promise<void> {
  const { summaryId, format } = parseArgs(process.argv.slice(2));
  const { variant, size } = resolveVariantAndSize(format);

  await getMongoConnection();
  const summary = await SummaryModel.findById(summaryId);
  if (!summary) {
    throw new Error(`Summary ${summaryId} not found`);
  }

  console.log(`Rendering summary ${summaryId} (${variant}, ${size})...`);
  const start = Date.now();
  const result = await renderSummary(summaryId, variant, size);
  const elapsedMs = Date.now() - start;

  console.log(`\nRendered ${result.r2Key}`);
  console.log(`Size: ${(result.sizeBytes / 1024).toFixed(1)} KB`);
  console.log(`Time: ${(elapsedMs / 1000).toFixed(2)}s`);
  console.log(`URL: ${result.url}`);

  await closePuppeteerPool();
  process.exit(0);
}

// AggregateError (e.g. Node's fetch/net failing over both IPv6 and IPv4 when
// storage isn't reachable) has an empty top-level .message — printing just
// name+message here would silently hide the actually-useful detail.
function describeError(err: unknown): string {
  if (err instanceof AggregateError) {
    return `${err.name}: ${err.errors.map((e) => (e instanceof Error ? e.message : String(e))).join('; ')}`;
  }
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
}

main().catch(async (err) => {
  console.error(`\n${describeError(err)}`);
  await closePuppeteerPool();
  process.exit(1);
});
