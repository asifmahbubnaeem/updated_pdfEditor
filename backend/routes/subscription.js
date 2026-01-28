import express from 'express';
import { authenticate } from '../middleware/auth.js';
import db, { supabase } from '../config/database.js';
import { getUserUsageStats } from '../services/usageTrackingService.js';
import { getTierLimits } from '../middleware/subscriptionCheck.js';

const router = express.Router();

/**
 * Get current subscription status
 * GET /api/subscription
 */
router.get('/', authenticate, async (req, res, next) => {
  try {
    const userId = req.userId;
    const user = req.user;

    // Get subscription from database
    const subscription = await db.getSubscriptionByUserId(userId);

    // Get usage stats
    const usageStats = await getUserUsageStats(userId);

    // Get tier limits
    const tier = user.subscription_tier || 'free';
    const limits = getTierLimits(tier);

    res.json({
      subscription: subscription || null,
      tier: tier,
      status: user.subscription_status || 'active',
      limits: {
        dailyOperations: limits.dailyOperations === Infinity ? 'unlimited' : limits.dailyOperations,
        maxFileSize: limits.maxFileSize,
        features: limits.features,
      },
      usage: usageStats,
    });
  } catch (error) {
    console.error('Error getting subscription:', error);
    next(error);
  }
});

/**
 * Get subscription history
 * GET /api/subscription/history
 */
router.get('/history', authenticate, async (req, res, next) => {
  try {
    const userId = req.userId;

    // Get all subscriptions (including cancelled ones)
    const { data: subscriptions, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({
      subscriptions: subscriptions || [],
    });
  } catch (error) {
    console.error('Error getting subscription history:', error);
    next(error);
  }
});

/**
 * Get transaction history
 * GET /api/subscription/transactions
 */
router.get('/transactions', authenticate, async (req, res, next) => {
  try {
    const userId = req.userId;

    // Get all transactions
    const { data: transactions, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    res.json({
      transactions: transactions || [],
    });
  } catch (error) {
    console.error('Error getting transactions:', error);
    next(error);
  }
});

export default router;
