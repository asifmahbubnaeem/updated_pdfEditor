import db from '../config/database.js';

/**
 * Subscription tier limits
 */
const TIER_LIMITS = {
  free: {
    dailyOperations: 10,
    maxFileSize: 10 * 1024 * 1024, // 10MB
    features: ['basic'],
  },
  pro: {
    dailyOperations: Infinity,
    maxFileSize: 100 * 1024 * 1024, // 100MB
    features: ['basic', 'advanced', 'batch'],
  },
  enterprise: {
    dailyOperations: Infinity,
    maxFileSize: 500 * 1024 * 1024, // 500MB
    features: ['basic', 'advanced', 'batch', 'api', 'white-label'],
  },
};

/**
 * Check if user has access to a feature
 * @param {string} tier - Subscription tier
 * @param {string} feature - Feature name
 * @returns {boolean}
 */
export const hasFeatureAccess = (tier, feature) => {
  const limits = TIER_LIMITS[tier] || TIER_LIMITS.free;
  return limits.features.includes(feature);
};

/**
 * Check if user can perform operation (usage limit check)
 */
export const checkUsageLimit = async (req, res, next) => {
  try {
    // If no user, treat as free tier
    const userId = req.userId || req.body.userId;
    const tier = req.user?.subscription_tier || 'free';
    
    if (tier === 'pro' || tier === 'enterprise') {
      // Unlimited for paid tiers
      return next();
    }

    // Check daily usage for free tier
    if (userId) {
      const dailyUsage = await db.getDailyUsage(userId);
      const limits = TIER_LIMITS[tier] || TIER_LIMITS.free;
      
      if (dailyUsage >= limits.dailyOperations) {
        return res.status(403).json({
          error: `Daily limit reached. You've used ${dailyUsage}/${limits.dailyOperations} operations today.`,
          code: 'DAILY_LIMIT_EXCEEDED',
          limit: limits.dailyOperations,
          used: dailyUsage,
          upgradeUrl: '/pricing',
        });
      }
    }

    next();
  } catch (error) {
    console.error('Usage limit check error:', error);
    // Allow request to proceed if check fails (fail open)
    next();
  }
};

/**
 * Check file size limit based on subscription tier
 */
export const checkFileSizeLimit = (req, res, next) => {
  try {
    const tier = req.user?.subscription_tier || 'free';
    const limits = TIER_LIMITS[tier] || TIER_LIMITS.free;
    const fileSize = req.file?.size || 0;

    if (fileSize > limits.maxFileSize) {
      return res.status(400).json({
        error: `File size exceeds limit for ${tier} tier. Maximum size: ${(limits.maxFileSize / 1024 / 1024).toFixed(0)}MB`,
        code: 'FILE_SIZE_EXCEEDED',
        maxSize: limits.maxFileSize,
        fileSize: fileSize,
        upgradeUrl: '/pricing',
      });
    }

    next();
  } catch (error) {
    console.error('File size check error:', error);
    next();
  }
};

/**
 * Check if user has access to a specific feature
 */
export const requireFeature = (feature) => {
  return (req, res, next) => {
    try {
      const tier = req.user?.subscription_tier || 'free';
      
      if (!hasFeatureAccess(tier, feature)) {
        return res.status(403).json({
          error: `Feature '${feature}' requires a paid subscription`,
          code: 'FEATURE_NOT_AVAILABLE',
          requiredTier: 'pro',
          upgradeUrl: '/pricing',
        });
      }

      next();
    } catch (error) {
      console.error('Feature check error:', error);
      res.status(500).json({ error: 'Feature check failed' });
    }
  };
};

/**
 * Get subscription limits for a tier
 */
export const getTierLimits = (tier) => {
  return TIER_LIMITS[tier] || TIER_LIMITS.free;
};

export default {
  checkUsageLimit,
  checkFileSizeLimit,
  requireFeature,
  hasFeatureAccess,
  getTierLimits,
};
