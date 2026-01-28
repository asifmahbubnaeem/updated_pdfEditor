import express from 'express';
import Stripe from 'stripe';
import { body, validationResult } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import paymentService from '../services/paymentService.js';
import db from '../config/database.js';

const router = express.Router();

/**
 * Create checkout session
 * POST /api/payment/create-checkout
 */
router.post(
  '/create-checkout',
  authenticate,
  [
    body('tier').isIn(['pro', 'enterprise']).withMessage('Tier must be pro or enterprise'),
    body('billingPeriod').optional().isIn(['monthly', 'yearly']).withMessage('Billing period must be monthly or yearly'),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          errors: errors.array(),
        });
      }

      const { tier, billingPeriod = 'monthly' } = req.body;
      const userId = req.userId;

      // Check if user already has an active subscription
      const existingSubscription = await db.getSubscriptionByUserId(userId);
      if (existingSubscription && existingSubscription.status === 'active') {
        return res.status(400).json({
          error: 'You already have an active subscription',
          code: 'SUBSCRIPTION_EXISTS',
          subscription: existingSubscription,
        });
      }

      // Create checkout session
      const session = await paymentService.createCheckoutSession(userId, tier, billingPeriod);

      res.json({
        sessionId: session.sessionId,
        url: session.url,
      });
    } catch (error) {
      console.error('Error creating checkout session:', error);
      next(error);
    }
  }
);

/**
 * Create customer portal session
 * POST /api/payment/create-portal
 */
router.post(
  '/create-portal',
  authenticate,
  async (req, res, next) => {
    try {
      const userId = req.userId;

      const session = await paymentService.createPortalSession(userId);

      res.json({
        url: session.url,
      });
    } catch (error) {
      console.error('Error creating portal session:', error);
      if (error.message === 'No active subscription found') {
        return res.status(404).json({
          error: 'No active subscription found',
          code: 'NO_SUBSCRIPTION',
        });
      }
      next(error);
    }
  }
);

/**
 * Get subscription details
 * GET /api/payment/subscription
 */
router.get(
  '/subscription',
  authenticate,
  async (req, res, next) => {
    try {
      const userId = req.userId;

      // Get subscription from database
      const subscription = await db.getSubscriptionByUserId(userId);
      if (!subscription) {
        return res.json({
          subscription: null,
          tier: 'free',
        });
      }

      // Get Stripe subscription details if available
      let stripeSubscription = null;
      if (subscription.stripe_subscription_id) {
        try {
          stripeSubscription = await paymentService.getStripeSubscription(
            subscription.stripe_subscription_id
          );
        } catch (error) {
          console.error('Error fetching Stripe subscription:', error);
          // Continue without Stripe details
        }
      }

      res.json({
        subscription: {
          ...subscription,
          stripeDetails: stripeSubscription ? {
            status: stripeSubscription.status,
            current_period_start: stripeSubscription.current_period_start,
            current_period_end: stripeSubscription.current_period_end,
            cancel_at_period_end: stripeSubscription.cancel_at_period_end,
          } : null,
        },
        tier: subscription.tier,
      });
    } catch (error) {
      console.error('Error getting subscription:', error);
      next(error);
    }
  }
);

/**
 * Cancel subscription
 * POST /api/payment/cancel-subscription
 */
router.post(
  '/cancel-subscription',
  authenticate,
  [
    body('cancelAtPeriodEnd').optional().isBoolean().withMessage('cancelAtPeriodEnd must be boolean'),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          errors: errors.array(),
        });
      }

      const userId = req.userId;
      const cancelAtPeriodEnd = req.body.cancelAtPeriodEnd !== false; // Default to true

      const result = await paymentService.cancelSubscription(userId, cancelAtPeriodEnd);

      res.json({
        message: cancelAtPeriodEnd
          ? 'Subscription will be cancelled at the end of the billing period'
          : 'Subscription cancelled immediately',
        ...result,
      });
    } catch (error) {
      console.error('Error canceling subscription:', error);
      if (error.message === 'No active subscription found') {
        return res.status(404).json({
          error: 'No active subscription found',
          code: 'NO_SUBSCRIPTION',
        });
      }
      next(error);
    }
  }
);

/**
 * Stripe webhook endpoint
 * POST /api/payment/webhook
 * Note: This endpoint should not use authenticate middleware
 * Stripe will verify the webhook signature
 */
router.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error('Stripe webhook secret not configured');
      return res.status(500).json({ error: 'Webhook secret not configured' });
    }

    let event;

    try {
      // Verify webhook signature
      event = Stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(400).json({ error: `Webhook Error: ${err.message}` });
    }

    try {
      // Handle the event
      await paymentService.handleWebhook(event);
      res.json({ received: true });
    } catch (error) {
      console.error('Error handling webhook:', error);
      res.status(500).json({ error: 'Webhook handler failed' });
    }
  }
);

export default router;
