import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useSubscription } from '../context/SubscriptionContext.jsx';
import { apiService } from '../services/api.js';
import PageLayout from '../components/PageLayout.jsx';

const formatDate = (unixSeconds) =>
  new Date(unixSeconds * 1000).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

export default function Account() {
  const { user } = useAuth();
  const { tier, usage, limits, refreshSubscription } = useSubscription();

  const [billing, setBilling] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loadingPortal, setLoadingPortal] = useState(false);
  const [loadingCancel, setLoadingCancel] = useState(false);
  const [error, setError] = useState('');

  const isPaid = tier !== 'free';

  useEffect(() => {
    if (!isPaid) return;

    apiService
      .getSubscriptionBillingDetails()
      .then((data) => setBilling(data.subscription?.stripeDetails || null))
      .catch(() => setBilling(null));

    apiService
      .getTransactions()
      .then(setTransactions)
      .catch(() => setTransactions([]));
  }, [isPaid]);

  const handleManageBilling = useCallback(async () => {
    setError('');
    setLoadingPortal(true);
    try {
      const { url } = await apiService.createPortalSession();
      window.location.href = url;
    } catch (err) {
      setError(err.response?.data?.error || 'Could not open the billing portal. Please try again.');
      setLoadingPortal(false);
    }
  }, []);

  const handleCancel = useCallback(async () => {
    if (!window.confirm('Cancel your subscription at the end of the current billing period?')) {
      return;
    }
    setError('');
    setLoadingCancel(true);
    try {
      await apiService.cancelSubscription(true);
      await refreshSubscription();
      const data = await apiService.getSubscriptionBillingDetails();
      setBilling(data.subscription?.stripeDetails || null);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not cancel your subscription. Please try again.');
    } finally {
      setLoadingCancel(false);
    }
  }, [refreshSubscription]);

  return (
    <PageLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-stone-900 tracking-tight">Account</h1>

        {/* Profile */}
        <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-6">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-stone-400 mb-3">
            Profile
          </h2>
          <p className="text-stone-900">{user?.email}</p>
        </div>

        {/* Plan */}
        <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-stone-400">
              Plan
            </h2>
            <span className="px-2.5 py-1 bg-indigo-100 text-indigo-700 rounded-full text-xs font-medium capitalize">
              {tier}
            </span>
          </div>

          {billing?.cancel_at_period_end && (
            <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3">
              Your subscription will end on {formatDate(billing.current_period_end)}. You'll keep access until then.
            </div>
          )}

          {billing?.status === 'past_due' && (
            <div className="mb-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">
              Your last payment failed. Update your payment method to avoid losing access.
            </div>
          )}

          <div className="space-y-2 text-sm text-stone-600 mb-5">
            <div className="flex justify-between">
              <span>Daily operations</span>
              <span className="text-stone-900 font-medium">
                {usage?.daily?.used ?? 0} / {limits?.dailyOperations === 'unlimited' ? '∞' : limits?.dailyOperations ?? '-'}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Max file size</span>
              <span className="text-stone-900 font-medium">
                {limits?.maxFileSize ? Math.round(limits.maxFileSize / (1024 * 1024)) : '-'}MB
              </span>
            </div>
            {billing?.current_period_end && !billing.cancel_at_period_end && (
              <div className="flex justify-between">
                <span>Renews on</span>
                <span className="text-stone-900 font-medium">{formatDate(billing.current_period_end)}</span>
              </div>
            )}
          </div>

          {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

          <div className="flex flex-wrap gap-3">
            {isPaid ? (
              <>
                <button
                  onClick={handleManageBilling}
                  disabled={loadingPortal}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700 disabled:bg-stone-400 disabled:cursor-not-allowed transition-colors"
                >
                  {loadingPortal ? 'Opening...' : 'Manage billing'}
                </button>
                {!billing?.cancel_at_period_end && (
                  <button
                    onClick={handleCancel}
                    disabled={loadingCancel}
                    className="px-4 py-2 border border-stone-300 text-stone-700 rounded-md text-sm font-medium hover:bg-stone-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {loadingCancel ? 'Cancelling...' : 'Cancel subscription'}
                  </button>
                )}
              </>
            ) : (
              <Link
                to="/pricing"
                className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700 transition-colors"
              >
                Upgrade plan
              </Link>
            )}
          </div>
        </div>

        {/* Billing history */}
        {transactions.length > 0 && (
          <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-6">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-stone-400 mb-4">
              Billing history
            </h2>
            <div className="divide-y divide-stone-100">
              {transactions.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between py-3 text-sm">
                  <div>
                    <p className="text-stone-900">
                      {new Date(tx.created_at).toLocaleDateString()}
                    </p>
                    <p className="text-stone-400 text-xs capitalize">{tx.status}</p>
                  </div>
                  <span className="text-stone-900 font-medium">
                    ${Number(tx.amount).toFixed(2)} {tx.currency}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </PageLayout>
  );
}
