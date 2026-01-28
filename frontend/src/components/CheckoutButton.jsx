import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useSubscription } from '../context/SubscriptionContext.jsx';
import api from '../services/api.js';

export default function CheckoutButton({ tier = 'pro', billingPeriod = 'monthly', className = '' }) {
  const { isAuthenticated } = useAuth();
  const { tier: currentTier } = useSubscription();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleCheckout = async () => {
    if (!isAuthenticated) {
      window.location.href = '/login?redirect=/pricing';
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await api.post('/api/payment/create-checkout', {
        tier,
        billingPeriod,
      });

      // Redirect to Stripe Checkout
      window.location.href = response.data.url;
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create checkout session');
      setLoading(false);
    }
  };

  // Don't show button if user already has this tier or higher
  if (currentTier === tier || (tier === 'pro' && currentTier === 'enterprise')) {
    return (
      <button
        disabled
        className={`${className} bg-gray-300 text-gray-500 cursor-not-allowed px-6 py-3 rounded-lg font-medium`}
      >
        Current Plan
      </button>
    );
  }

  return (
    <div>
      <button
        onClick={handleCheckout}
        disabled={loading}
        className={`${className} ${
          loading
            ? 'bg-gray-400 cursor-not-allowed'
            : 'bg-blue-600 hover:bg-blue-700'
        } text-white px-6 py-3 rounded-lg font-medium transition-colors`}
      >
        {loading ? 'Processing...' : `Upgrade to ${tier.charAt(0).toUpperCase() + tier.slice(1)}`}
      </button>
      {error && (
        <p className="text-red-600 text-sm mt-2">{error}</p>
      )}
    </div>
  );
}
