import { useSubscription } from '../context/SubscriptionContext.jsx';
import { Link } from 'react-router-dom';

export default function UsageLimitWarning() {
  const { tier, usage, limits, dailyUsagePercent, canPerformOperation } = useSubscription();

  // Don't show warning for Pro/Enterprise users
  if (tier === 'pro' || tier === 'enterprise') {
    return null;
  }

  // Don't show if user can still perform operations
  if (canPerformOperation()) {
    return null;
  }

  return (
    <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
      <div className="flex">
        <div className="flex-shrink-0">
          <svg
            className="h-5 w-5 text-yellow-400"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <div className="ml-3 flex-1">
          <p className="text-sm text-yellow-700">
            <strong>Daily limit reached!</strong> You've used {usage.daily.used} of {limits.dailyOperations} operations today.
          </p>
          <div className="mt-2">
            <Link
              to="/pricing"
              className="text-sm font-medium text-yellow-800 underline hover:text-yellow-900"
            >
              Upgrade to Pro for unlimited access →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export function UsageProgressBar() {
  const { tier, usage, limits, dailyUsagePercent } = useSubscription();

  if (tier === 'pro' || tier === 'enterprise') {
    return null;
  }

  const remaining = limits.dailyOperations - usage.daily.used;
  const isWarning = dailyUsagePercent >= 80;
  const isCritical = dailyUsagePercent >= 100;

  return (
    <div className="mb-4">
      <div className="flex justify-between items-center mb-1">
        <span className="text-sm text-gray-600">
          Daily usage: {usage.daily.used} / {limits.dailyOperations}
        </span>
        <span className="text-sm font-medium text-gray-700">
          {remaining} remaining
        </span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2.5">
        <div
          className={`h-2.5 rounded-full transition-all ${
            isCritical
              ? 'bg-red-500'
              : isWarning
              ? 'bg-yellow-500'
              : 'bg-blue-500'
          }`}
          style={{ width: `${Math.min(dailyUsagePercent, 100)}%` }}
        />
      </div>
      {isWarning && (
        <p className="text-xs text-gray-500 mt-1">
          {isCritical ? (
            <Link to="/pricing" className="text-blue-600 hover:underline">
              Upgrade to continue →
            </Link>
          ) : (
            'Consider upgrading for unlimited access'
          )}
        </p>
      )}
    </div>
  );
}
