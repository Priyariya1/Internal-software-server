import express from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

// Analytics: revenue, pipeline, productivity
router.get('/overview', authenticateToken, requireRole(['admin', 'manager']), async (req, res) => {
  res.json({ module: 'analytics', status: 'ok' });
});

router.get('/revenue', authenticateToken, requireRole(['admin', 'manager']), async (req, res) => {
  res.json({
    totalRevenueYtd: 0,
    revenueVsTargetPct: 0,
    mrr: 0,
    arr: 0,
    momGrowthPct: 0,
    trend12mo: [],
    topSources: [],
  });
});

router.get('/pipeline', authenticateToken, requireRole(['admin', 'manager']), async (req, res) => {
  res.json({
    pipelineValue: 0,
    openDeals: 0,
    winRatePct: 0,
    averageDealSize: 0,
    dealsByStage: [],
    leadsOverTime: [],
  });
});

router.get('/productivity', authenticateToken, requireRole(['admin', 'manager']), async (req, res) => {
  res.json({
    taskCompletionRatePct: 0,
    onTimeProjectsPct: 0,
    absenteeismRatePct: 0,
    overtimeHours: 0,
    projectTimeline: [],
    teamOutput: [],
  });
});

export default router;


