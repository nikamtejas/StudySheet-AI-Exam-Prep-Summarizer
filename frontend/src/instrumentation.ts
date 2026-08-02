// Runs once when the Next.js server instance boots, before any request is
// handled — the frontend's equivalent of the backend's env.ts throwing at
// process start. See https://nextjs.org/docs/app/guides/instrumentation.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./lib/env");
  }
}
