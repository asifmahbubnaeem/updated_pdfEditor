import { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext.jsx';
import api from '../services/api.js';

const SubscriptionContext = createContext(null);

export const useSubscription = () => {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
};

export const SubscriptionProvider = ({ children }) => {
  const { user, isAuthenticated } = useAuth();
  const [subscription, setSubscription] = useState(null);
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(true);

  // Load subscription data
  useEffect(() => {
    if (isAuthenticated) {
      loadSubscription();
    } else {
      setSubscription(null);
      setUsage(null);
      setLoading(false);
    }
  }, [isAuthenticated, user]);

  const loadSubscription = async () => {
    try {
      const response = await api.get('/api/subscription');
      setSubscription(response.data);
      setUsage(response.data.usage);
    } catch (error) {
      console.error('Error loading subscription:', error);
      setSubscription(null);
      setUsage(null);
    } finally {
      setLoading(false);
    }
  };

  const refreshSubscription = async () => {
    await loadSubscription();
  };

  const tier = subscription?.tier || user?.subscription_tier || 'free';
  const isProUser = tier === 'pro' || tier === 'enterprise';
  const isEnterpriseUser = tier === 'enterprise';

  const limits = subscription?.limits || {
    dailyOperations: 10,
    maxFileSize: 10 * 1024 * 1024, // 10MB
    features: ['basic'],
  };

  const usageStats = usage || {
    daily: { used: 0, limit: limits.dailyOperations },
    monthly: { used: 0, limit: 0 },
  };

  const dailyUsagePercent = limits.dailyOperations === 'unlimited'
    ? 0
    : (usageStats.daily.used / limits.dailyOperations) * 100;

  const canPerformOperation = () => {
    if (isProUser) return true;
    return usageStats.daily.used < limits.dailyOperations;
  };

  const value = {
    subscription,
    usage: usageStats,
    tier,
    isProUser,
    isEnterpriseUser,
    limits,
    loading,
    dailyUsagePercent,
    canPerformOperation,
    refreshSubscription,
  };

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
};
