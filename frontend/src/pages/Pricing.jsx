import { useSubscription } from '../context/SubscriptionContext.jsx';
import CheckoutButton from '../components/CheckoutButton.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { Link } from 'react-router-dom';

export default function Pricing() {
  const { tier, limits, usage } = useSubscription();
  const { isAuthenticated } = useAuth();

  const plans = [
    {
      name: 'Free',
      price: '$0',
      period: 'forever',
      tier: 'free',
      features: [
        '10 operations per day',
        '10MB max file size',
        'Basic PDF operations',
        'Community support',
      ],
      current: tier === 'free',
    },
    {
      name: 'Pro',
      price: '$9.99',
      period: 'per month',
      tier: 'pro',
      priceYearly: '$99.99',
      periodYearly: 'per year',
      features: [
        'Unlimited operations',
        '100MB max file size',
        'All PDF features',
        'No ads',
        'Batch processing',
        'Priority support',
      ],
      popular: true,
      current: tier === 'pro',
    },
    {
      name: 'Enterprise',
      price: '$49.99',
      period: 'per month',
      tier: 'enterprise',
      priceYearly: '$499.99',
      periodYearly: 'per year',
      features: [
        'Everything in Pro',
        '500MB max file size',
        'API access',
        'White-label option',
        'Custom integrations',
        'SLA guarantee',
      ],
      current: tier === 'enterprise',
    },
  ];

  return (
    <div className="bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Simple, transparent pricing
          </h1>
          <p className="mt-3 text-lg text-gray-600">
            Choose the plan that's right for you
          </p>
        </div>

        {!isAuthenticated && (
          <div className="text-center mb-8">
            <p className="text-gray-600">
              <Link to="/register" className="text-blue-600 hover:text-blue-500 font-medium">
                Sign up
              </Link>
              {' '}or{' '}
              <Link to="/login" className="text-blue-600 hover:text-blue-500 font-medium">
                sign in
              </Link>
              {' '}to get started
            </p>
          </div>
        )}

        {tier === 'free' && isAuthenticated && (
          <div className="mb-8 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800">
              <strong>Current usage:</strong> {usage.daily.used} / {limits.dailyOperations} operations today
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {plans.map((plan) => (
            <div
              key={plan.tier}
              className={`relative rounded-lg border ${
                plan.popular
                  ? 'border-blue-500 shadow-md'
                  : 'border-gray-200'
              } bg-white p-6`}
            >
              {plan.popular && (
                <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                  <span className="bg-blue-500 text-white px-3 py-1 rounded-full text-sm font-medium">
                    Most Popular
                  </span>
                </div>
              )}

              {plan.current && (
                <div className="absolute top-4 right-4">
                  <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-medium">
                    Current Plan
                  </span>
                </div>
              )}

              <div className="text-center">
                <h3 className="text-xl font-bold text-gray-900">{plan.name}</h3>
                <div className="mt-3">
                  <span className="text-3xl font-bold text-gray-900">
                    {plan.price}
                  </span>
                  <span className="text-sm text-gray-500 ml-1">
                    {plan.period}
                  </span>
                </div>
                {plan.priceYearly && (
                  <div className="mt-1.5 text-xs text-gray-500">
                    or {plan.priceYearly} {plan.periodYearly}
                  </div>
                )}
              </div>

              <ul className="mt-6 space-y-3">
                {plan.features.map((feature, index) => (
                  <li key={index} className="text-sm text-gray-700">
                    {feature}
                  </li>
                ))}
              </ul>

              <div className="mt-6">
                {plan.current ? (
                  <button
                    disabled
                    className="w-full bg-gray-300 text-gray-500 cursor-not-allowed px-6 py-3 rounded-lg font-medium"
                  >
                    Current Plan
                  </button>
                ) : plan.tier === 'free' ? (
                  <div className="text-center text-sm text-gray-500">
                    Free forever
                  </div>
                ) : (
                  <CheckoutButton
                    tier={plan.tier}
                    billingPeriod="monthly"
                    className="w-full"
                  />
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 text-center">
          <p className="text-sm text-gray-600">
            All plans include secure file processing and data privacy protection.
          </p>
        </div>
      </div>
    </div>
  );
}
