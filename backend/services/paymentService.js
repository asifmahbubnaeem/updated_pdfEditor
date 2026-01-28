import Stripe from 'stripe';
import dotenv from 'dotenv';
import db from '../config/database.js';

dotenv.config();

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-06-20.acacia',
});

// Subscription price IDs (set these in Stripe Dashboard)
const PRICE_IDS = {
  pro: {
    monthly: process.env.STRIPE_PRICE_ID_PRO_MONTHLY || 'price_pro_monthly',
    yearly: process.env.STRIPE_PRICE_ID_PRO_YEARLY || 'price_pro_yearly',
  },
  enterprise: {
    monthly: process.env.STRIPE_PRICE_ID_ENTERPRISE_MONTHLY || 'price_enterprise_monthly',
    yearly: process.env.STRIPE_PRICE_ID_ENTERPRISE_YEARLY || 'price_enterprise_yearly',
  },
};

// Frontend URL for redirects
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

/**
 * Create a Stripe checkout session for subscription
 * @param {string} userId - User ID
 * @param {string} tier - Subscription tier (pro or enterprise)
 * @param {string} billingPeriod - 'monthly' or 'yearly'
 * @returns {Promise<Object>} Checkout session
 */
export const createCheckoutSession = async (userId, tier, billingPeriod = 'monthly') => {
  try {
    // Get user to get email
    const user = await db.getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Get price ID for tier and billing period
    const priceId = PRICE_IDS[tier]?.[billingPeriod];
    if (!priceId) {
      throw new Error(`Invalid tier or billing period: ${tier}/${billingPeriod}`);
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer_email: user.email,
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${FRONTEND_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${FRONTEND_URL}/pricing?canceled=true`,
      metadata: {
        userId: userId,
        tier: tier,
        billingPeriod: billingPeriod,
      },
      subscription_data: {
        metadata: {
          userId: userId,
          tier: tier,
        },
      },
    });

    return {
      sessionId: session.id,
      url: session.url,
    };
  } catch (error) {
    console.error('Error creating checkout session:', error);
    throw error;
  }
};

/**
 * Create a Stripe customer portal session
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Portal session
 */
export const createPortalSession = async (userId) => {
  try {
    // Get user's subscription
    const subscription = await db.getSubscriptionByUserId(userId);
    if (!subscription || !subscription.stripe_subscription_id) {
      throw new Error('No active subscription found');
    }

    // Get Stripe customer ID from subscription
    const stripeSubscription = await stripe.subscriptions.retrieve(
      subscription.stripe_subscription_id
    );
    const customerId = stripeSubscription.customer;

    // Create portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${FRONTEND_URL}/account`,
    });

    return {
      url: session.url,
    };
  } catch (error) {
    console.error('Error creating portal session:', error);
    throw error;
  }
};

/**
 * Handle Stripe webhook events
 * @param {Object} event - Stripe webhook event
 * @returns {Promise<void>}
 */
export const handleWebhook = async (event) => {
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object);
        break;

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpdate(event.data.object);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;

      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event.data.object);
        break;

      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  } catch (error) {
    console.error('Error handling webhook:', error);
    throw error;
  }
};

/**
 * Handle checkout session completed
 */
const handleCheckoutCompleted = async (session) => {
  const userId = session.metadata?.userId;
  const tier = session.metadata?.tier || 'pro';

  if (!userId) {
    console.error('No userId in checkout session metadata');
    return;
  }

  // Get subscription from Stripe
  const subscriptionId = session.subscription;
  if (!subscriptionId) {
    console.error('No subscription ID in checkout session');
    return;
  }

  // Activate subscription
  await activateSubscription(userId, subscriptionId, tier);
};

/**
 * Handle subscription update
 */
const handleSubscriptionUpdate = async (stripeSubscription) => {
  const userId = stripeSubscription.metadata?.userId;
  if (!userId) {
    console.error('No userId in subscription metadata');
    return;
  }

  // Get existing subscription from database
  const existingSubscription = await db.getSubscriptionByUserId(userId);
  if (!existingSubscription) {
    console.error('Subscription not found in database');
    return;
  }

  // Update subscription status
  const status = mapStripeStatusToDb(stripeSubscription.status);
  await db.updateSubscription(existingSubscription.id, {
    status: status,
    end_date: stripeSubscription.current_period_end
      ? new Date(stripeSubscription.current_period_end * 1000).toISOString()
      : null,
  });

  // Update user tier if subscription is active
  if (status === 'active') {
    const tier = stripeSubscription.metadata?.tier || 'pro';
    await db.updateUser(userId, {
      subscription_tier: tier,
      subscription_status: 'active',
    });
  }
};

/**
 * Handle subscription deleted
 */
const handleSubscriptionDeleted = async (stripeSubscription) => {
  const userId = stripeSubscription.metadata?.userId;
  if (!userId) {
    console.error('No userId in subscription metadata');
    return;
  }

  // Deactivate subscription
  await deactivateSubscription(userId);
};

/**
 * Handle payment succeeded
 */
const handlePaymentSucceeded = async (invoice) => {
  const subscriptionId = invoice.subscription;
  if (!subscriptionId) return;

  const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId);
  const userId = stripeSubscription.metadata?.userId;
  if (!userId) return;

  // Log transaction
  await db.createTransaction({
    user_id: userId,
    subscription_id: subscriptionId,
    amount: invoice.amount_paid / 100, // Convert from cents
    currency: invoice.currency.toUpperCase(),
    payment_provider: 'stripe',
    provider_transaction_id: invoice.id,
    status: 'completed',
    metadata: {
      invoice_id: invoice.id,
      subscription_id: subscriptionId,
    },
  });
};

/**
 * Handle payment failed
 */
const handlePaymentFailed = async (invoice) => {
  const subscriptionId = invoice.subscription;
  if (!subscriptionId) return;

  const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId);
  const userId = stripeSubscription.metadata?.userId;
  if (!userId) return;

  // Log failed transaction
  await db.createTransaction({
    user_id: userId,
    subscription_id: subscriptionId,
    amount: invoice.amount_due / 100,
    currency: invoice.currency.toUpperCase(),
    payment_provider: 'stripe',
    provider_transaction_id: invoice.id,
    status: 'failed',
    metadata: {
      invoice_id: invoice.id,
      subscription_id: subscriptionId,
      failure_reason: invoice.last_payment_error?.message,
    },
  });

  // Update subscription status to past_due
  const existingSubscription = await db.getSubscriptionByUserId(userId);
  if (existingSubscription) {
    await db.updateSubscription(existingSubscription.id, {
      status: 'past_due',
    });
  }
};

/**
 * Activate subscription
 */
export const activateSubscription = async (userId, stripeSubscriptionId, tier) => {
  try {
    // Get Stripe subscription details
    const stripeSubscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);

    // Create or update subscription in database
    const existingSubscription = await db.getSubscriptionByUserId(userId);
    
    if (existingSubscription) {
      // Update existing subscription
      await db.updateSubscription(existingSubscription.id, {
        stripe_subscription_id: stripeSubscriptionId,
        tier: tier,
        status: 'active',
        start_date: new Date(stripeSubscription.current_period_start * 1000).toISOString(),
        end_date: new Date(stripeSubscription.current_period_end * 1000).toISOString(),
      });
    } else {
      // Create new subscription
      await db.createSubscription({
        user_id: userId,
        stripe_subscription_id: stripeSubscriptionId,
        tier: tier,
        status: 'active',
        start_date: new Date(stripeSubscription.current_period_start * 1000).toISOString(),
        end_date: new Date(stripeSubscription.current_period_end * 1000).toISOString(),
      });
    }

    // Update user tier
    await db.updateUser(userId, {
      subscription_tier: tier,
      subscription_status: 'active',
    });

    console.log(`Subscription activated for user ${userId}, tier: ${tier}`);
  } catch (error) {
    console.error('Error activating subscription:', error);
    throw error;
  }
};

/**
 * Deactivate subscription
 */
export const deactivateSubscription = async (userId) => {
  try {
    // Get subscription
    const subscription = await db.getSubscriptionByUserId(userId);
    if (subscription) {
      // Update subscription status
      await db.updateSubscription(subscription.id, {
        status: 'cancelled',
        end_date: new Date().toISOString(),
      });
    }

    // Update user to free tier
    await db.updateUser(userId, {
      subscription_tier: 'free',
      subscription_status: 'cancelled',
    });

    console.log(`Subscription deactivated for user ${userId}`);
  } catch (error) {
    console.error('Error deactivating subscription:', error);
    throw error;
  }
};

/**
 * Map Stripe subscription status to database status
 */
const mapStripeStatusToDb = (stripeStatus) => {
  const statusMap = {
    active: 'active',
    canceled: 'cancelled',
    past_due: 'past_due',
    unpaid: 'expired',
    incomplete: 'expired',
    incomplete_expired: 'expired',
    trialing: 'active',
  };
  return statusMap[stripeStatus] || 'expired';
};

/**
 * Get subscription details from Stripe
 */
export const getStripeSubscription = async (stripeSubscriptionId) => {
  try {
    return await stripe.subscriptions.retrieve(stripeSubscriptionId);
  } catch (error) {
    console.error('Error retrieving Stripe subscription:', error);
    throw error;
  }
};

/**
 * Cancel subscription
 */
export const cancelSubscription = async (userId, cancelAtPeriodEnd = true) => {
  try {
    const subscription = await db.getSubscriptionByUserId(userId);
    if (!subscription || !subscription.stripe_subscription_id) {
      throw new Error('No active subscription found');
    }

    if (cancelAtPeriodEnd) {
      // Cancel at period end
      await stripe.subscriptions.update(subscription.stripe_subscription_id, {
        cancel_at_period_end: true,
      });
      
      await db.updateSubscription(subscription.id, {
        cancel_at_period_end: true,
      });
    } else {
      // Cancel immediately
      await stripe.subscriptions.cancel(subscription.stripe_subscription_id);
      await deactivateSubscription(userId);
    }

    return { success: true };
  } catch (error) {
    console.error('Error canceling subscription:', error);
    throw error;
  }
};

export default {
  createCheckoutSession,
  createPortalSession,
  handleWebhook,
  activateSubscription,
  deactivateSubscription,
  getStripeSubscription,
  cancelSubscription,
};
