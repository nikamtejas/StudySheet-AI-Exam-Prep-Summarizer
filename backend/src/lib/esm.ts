// @auth/express and @auth/mongodb-adapter are pure ESM ("type": "module", no
// "require" export condition) — this backend compiles to CommonJS
// (tsconfig.json: module: "CommonJS"; converting the whole backend to ESM to
// satisfy two dependencies would touch every relative import in the
// codebase, per Node's ESM extension-required-imports rule, for a M8-sized
// milestone that shouldn't be rewriting M0-M7's module system).
//
// A plain `await import(specifier)` doesn't solve this on its own — verified
// directly that tsc's CommonJS emit rewrites a literal `import()` expression
// into `Promise.resolve().then(() => require(specifier))`, which still
// throws ERR_REQUIRE_ESM at runtime against a pure-ESM package. Wrapping the
// call in `new Function(...)` (indirect eval) hides the literal `import(`
// token from TypeScript's AST transform, so it's never rewritten — confirmed
// directly that the compiled output is then a genuine native dynamic import
// and successfully loads real ESM from compiled CommonJS output.
const nativeDynamicImport = new Function('specifier', 'return import(specifier)') as (
  specifier: string,
) => Promise<unknown>;

export function importEsm<T>(specifier: string): Promise<T> {
  return nativeDynamicImport(specifier) as Promise<T>;
}
