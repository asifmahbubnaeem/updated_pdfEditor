import db from '../config/database.js';

/**
 * Log usage of an operation
 * @param {string} userId - User ID
 * @param {string} operationType - Type of operation (encrypt, decrypt, merge, etc.)
 * @param {number} fileSize - Size of file in bytes
 * @param {boolean} success - Whether operation succeeded
 * @param {Object} req - Express request object (for IP and user agent)
 * @returns {Promise<Object>} Usage log entry
 */
export const logUsage = async (userId, operationType, fileSize = 0, success = true, req = null) => {
  try {
    if (!userId) {
      // Don't log if no user ID
      return null;
    }

    const usageData = {
      user_id: userId,
      operation_type: operationType,
      file_size: fileSize,
      success: success,
      ip_address: req?.ip || req?.connection?.remoteAddress || null,
      user_agent: req?.headers?.['user-agent'] || null,
    };

    const logEntry = await db.logUsage(usageData);
    
    // Increment quota
    await db.incrementQuota(userId);
    
    return logEntry;
  } catch (error) {
    console.error('Error logging usage:', error);
    // Don't throw - usage logging shouldn't break the app
    return null;
  }
};

/**
 * Get user's usage statistics
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Usage statistics
 */
export const getUserUsageStats = async (userId) => {
  try {
    const dailyUsage = await db.getDailyUsage(userId);
    const monthlyUsage = await db.getMonthlyUsage(userId);
    const quota = await db.getOrCreateQuota(userId);
    
    return {
      daily: {
        used: dailyUsage,
        limit: quota.daily_operations || 0,
      },
      monthly: {
        used: monthlyUsage,
        limit: quota.monthly_operations || 0,
      },
      quota: quota,
    };
  } catch (error) {
    console.error('Error getting usage stats:', error);
    return {
      daily: { used: 0, limit: 0 },
      monthly: { used: 0, limit: 0 },
    };
  }
};

/**
 * Check if user can perform operation
 * @param {string} userId - User ID
 * @param {string} tier - Subscription tier
 * @returns {Promise<{allowed: boolean, reason?: string}>}
 */
export const canPerformOperation = async (userId, tier = 'free') => {
  try {
    if (tier === 'pro' || tier === 'enterprise') {
      return { allowed: true };
    }

    const dailyUsage = await db.getDailyUsage(userId);
    const limit = tier === 'free' ? 10 : Infinity;

    if (dailyUsage >= limit) {
      return {
        allowed: false,
        reason: `Daily limit of ${limit} operations reached`,
        used: dailyUsage,
        limit: limit,
      };
    }

    return { allowed: true, used: dailyUsage, limit: limit };
  } catch (error) {
    console.error('Error checking operation permission:', error);
    // Fail open - allow operation if check fails
    return { allowed: true };
  }
};

export default {
  logUsage,
  getUserUsageStats,
  canPerformOperation,
};
