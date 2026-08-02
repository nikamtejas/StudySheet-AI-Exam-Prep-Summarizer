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

  it("loads successfully when both public URLs are present", async () => {
    process.env.NEXT_PUBLIC_API_URL = "http://localhost:4000";
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";

    const { env } = await import("./env");

    expect(env.NEXT_PUBLIC_API_URL).toBe("http://localhost:4000");
    expect(env.RENDER_TOKEN_SECRET).toBeUndefined();
  });

  it("throws with a message naming the missing variable, instead of failing later at call time", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    // NEXT_PUBLIC_API_URL intentionally left unset.

    await expect(import("./env")).rejects.toThrow(/NEXT_PUBLIC_API_URL/);
  });
});
