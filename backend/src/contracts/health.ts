import { z } from 'zod';

export const HealthCheckResultSchema = z.object({
  ok: z.boolean(),
  latencyMs: z.number().optional(),
  error: z.string().optional(),
});
export type HealthCheckResult = z.infer<typeof HealthCheckResultSchema>;

export const HealthStatusSchema = z.object({
  ok: z.boolean(),
  service: z.enum(['api', 'worker']),
  checks: z.object({
    mongo: HealthCheckResultSchema,
    redis: HealthCheckResultSchema,
    storage: HealthCheckResultSchema,
  }),
  timestamp: z.string(),
});
export type HealthStatus = z.infer<typeof HealthStatusSchema>;
