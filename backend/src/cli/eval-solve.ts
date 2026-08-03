import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { solveOne, answersAgree } from '../pipeline/verify';
import { SubjectSchema } from '../contracts';

const FixtureSchema = z.object({
  id: z.string(),
  subject: SubjectSchema,
  statement: z.string(),
  expected: z.object({
    value: z.string(),
    units: z.string().optional(),
  }),
});
type Fixture = z.infer<typeof FixtureSchema>;

const FIXTURES_DIR = path.join(__dirname, '..', '..', 'fixtures', 'problems');

// Same fan-out-with-a-cap shape as the real "solving" pipeline stage
// (docs/studysheet-build-prompt.md §7 stage 7) — this eval harness is meant
// to approximate real job cost/latency, not just correctness.
const CONCURRENCY = 4;

// Gates from docs/studysheet-milestones.md M4 "Done when".
const OVERALL_PASS_GATE = 0.95;
const PER_SUBJECT_PASS_GATE = 0.9;

function loadFixtures(): Fixture[] {
  const files = fs.readdirSync(FIXTURES_DIR).filter((f) => f.endsWith('.json'));
  const fixtures: Fixture[] = [];
  for (const file of files) {
    const raw: unknown = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, file), 'utf8'));
    if (!Array.isArray(raw)) throw new Error(`${file} must contain a JSON array of fixtures`);
    for (const item of raw) {
      fixtures.push(FixtureSchema.parse(item));
    }
  }
  return fixtures;
}

interface EvalResult {
  fixture: Fixture;
  pass: boolean;
  verified: boolean;
  latencyMs: number;
  costCents: number;
  error?: string;
}

async function runFixture(fixture: Fixture): Promise<EvalResult> {
  const start = Date.now();
  try {
    // pageRef is meaningless for a standalone fixture (no source document) —
    // solveOne() requires one only because it's shared with the pipeline's
    // per-document "solving" stage, which does have a real page to cite.
    const result = await solveOne({ statement: fixture.statement, pageRef: 1 });
    const correct = answersAgree(result.data.answer, fixture.expected);
    return {
      fixture,
      // A correct-but-unverified answer still fails the eval gate: the
      // fixture set exists to measure whether verification behaves, not
      // just whether the underlying model can do the arithmetic.
      pass: correct && result.data.verified,
      verified: result.data.verified,
      latencyMs: Date.now() - start,
      costCents: result.costCents,
    };
  } catch (err) {
    return {
      fixture,
      pass: false,
      verified: false,
      latencyMs: Date.now() - start,
      costCents: 0,
      error: (err as Error).message,
    };
  }
}

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(4)}`;
}

async function main(): Promise<void> {
  const fixtures = loadFixtures();
  console.log(`Running ${fixtures.length} fixtures (concurrency ${CONCURRENCY})...\n`);

  const results: EvalResult[] = [];
  for (let i = 0; i < fixtures.length; i += CONCURRENCY) {
    const batch = fixtures.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(batch.map(runFixture));
    results.push(...batchResults);
    for (const r of batchResults) {
      const status = r.pass ? 'PASS' : 'FAIL';
      const suffix = r.error ? ` — ${r.error}` : !r.verified ? ' — unverified' : '';
      console.log(`[${status}] ${r.fixture.id} (${r.latencyMs}ms, ${formatMoney(r.costCents)})${suffix}`);
    }
  }

  const bySubject = new Map<string, EvalResult[]>();
  for (const r of results) {
    const list = bySubject.get(r.fixture.subject) ?? [];
    list.push(r);
    bySubject.set(r.fixture.subject, list);
  }

  console.log('\n--- Summary ---');
  console.log(
    'Subject'.padEnd(12) + 'Pass Rate'.padEnd(12) + 'Mean Latency'.padEnd(14) + 'Mean Cost',
  );

  let gateMet = true;
  for (const [subject, list] of [...bySubject.entries()].sort()) {
    const passCount = list.filter((r) => r.pass).length;
    const passRate = passCount / list.length;
    const meanLatency = list.reduce((sum, r) => sum + r.latencyMs, 0) / list.length;
    const meanCost = list.reduce((sum, r) => sum + r.costCents, 0) / list.length;
    if (passRate < PER_SUBJECT_PASS_GATE) gateMet = false;
    console.log(
      subject.padEnd(12) +
        `${(passRate * 100).toFixed(1)}%`.padEnd(12) +
        `${meanLatency.toFixed(0)}ms`.padEnd(14) +
        formatMoney(meanCost),
    );
  }

  const totalPass = results.filter((r) => r.pass).length;
  const overallPassRate = totalPass / results.length;
  const totalCost = results.reduce((sum, r) => sum + r.costCents, 0);
  const meanLatency = results.reduce((sum, r) => sum + r.latencyMs, 0) / results.length;
  if (overallPassRate < OVERALL_PASS_GATE) gateMet = false;

  console.log('-'.repeat(50));
  console.log(
    `Overall: ${(overallPassRate * 100).toFixed(1)}% (${totalPass}/${results.length}), ` +
      `mean latency ${meanLatency.toFixed(0)}ms, total cost ${formatMoney(totalCost)}`,
  );

  console.log(
    gateMet
      ? `\nGate met (overall >= ${OVERALL_PASS_GATE * 100}%, every subject >= ${PER_SUBJECT_PASS_GATE * 100}%).`
      : `\nGate NOT met (overall >= ${OVERALL_PASS_GATE * 100}%, every subject >= ${PER_SUBJECT_PASS_GATE * 100}% required) — do not launch a subject below its bar.`,
  );
  process.exit(gateMet ? 0 : 1);
}

main().catch((err) => {
  console.error(`\n${(err as Error).name}: ${(err as Error).message}`);
  process.exit(1);
});
