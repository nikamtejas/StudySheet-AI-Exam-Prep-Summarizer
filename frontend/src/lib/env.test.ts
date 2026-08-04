import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const originalEnv = { ...process.env };

describe("env", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env.NEXT_PUBLIC_API_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.RENDER_TOKEN_SECRET;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("loads successfully when all required vars are present", async () => {
    process.env.NEXT_PUBLIC_API_URL = "http://localhost:4000";
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    process.env.RENDER_TOKEN_SECRET = "test-render-secret";

    const { env } = await import("./env");

    expect(env.NEXT_PUBLIC_API_URL).toBe("http://localhost:4000");
    expect(env.RENDER_TOKEN_SECRET).toBe("test-render-secret");
  });

  it("throws with a message naming the missing variable, instead of failing later at call time", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    process.env.RENDER_TOKEN_SECRET = "test-render-secret";
    // NEXT_PUBLIC_API_URL intentionally left unset.

    await expect(import("./env")).rejects.toThrow(/NEXT_PUBLIC_API_URL/);
  });

  it("throws when RENDER_TOKEN_SECRET is missing — M6's /print route needs it to verify render tokens", async () => {
    process.env.NEXT_PUBLIC_API_URL = "http://localhost:4000";
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    // RENDER_TOKEN_SECRET intentionally left unset.

    await expect(import("./env")).rejects.toThrow(/RENDER_TOKEN_SECRET/);
  });
});
