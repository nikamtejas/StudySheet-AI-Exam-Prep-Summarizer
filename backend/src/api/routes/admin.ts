import { Router } from 'express';
import { JobModel } from '../../models/Job';
import { requireAdmin } from '../middleware/requireAdmin';
import { asyncHandler } from '../asyncHandler';
import type { AdminSummary } from '../../contracts';

export const adminRouter = Router();
adminRouter.use(requireAdmin);

const RECENT_JOBS_LIMIT = 200;

// docs/studysheet-milestones.md M8: "Admin view: jobs, cost per job, failure
// rate, cost per active user." One endpoint bundling the job list with the
// aggregate figures rather than several — there's no dashboard UI beyond a
// single admin page (frontend/src/app/(app)/admin/page.tsx) to justify
// splitting these into separately-cached resources yet.
adminRouter.get(
  '/jobs',
  asyncHandler(async (_req, res) => {
    const recentJobs = await JobModel.find().sort({ createdAt: -1 }).limit(RECENT_JOBS_LIMIT);

    const [totalJobs, failedJobs, costAgg, activeUserAgg] = await Promise.all([
      JobModel.countDocuments(),
      JobModel.countDocuments({ status: 'failed' }),
      JobModel.aggregate<{ _id: null; total: number }>([
        { $group: { _id: null, total: { $sum: '$costCents' } } },
      ]),
      JobModel.aggregate<{ _id: null; activeUsers: number }>([
        { $match: { costCents: { $gt: 0 } } },
        { $group: { _id: '$userId' } },
        { $count: 'activeUsers' },
      ]),
    ]);

    const totalCostCents = costAgg[0]?.total ?? 0;
    const activeUsers = (activeUserAgg[0] as unknown as { activeUsers: number } | undefined)?.activeUsers ?? 0;

    const body: AdminSummary = {
      jobs: recentJobs.map((job) => ({
        jobId: job.id,
        userId: job.userId,
        status: job.status,
        stage: job.stage,
        costCents: job.costCents,
        createdAt: job.createdAt.toISOString(),
      })),
      totalJobs,
      failureRate: totalJobs === 0 ? 0 : failedJobs / totalJobs,
      totalCostCents,
      costPerActiveUserCents: activeUsers === 0 ? 0 : totalCostCents / activeUsers,
    };
    res.json(body);
  }),
);
