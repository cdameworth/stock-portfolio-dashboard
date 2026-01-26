/**
 * Stripe Service
 * Handles all Stripe payment processing, subscription management,
 * and billing operations for the stock portfolio dashboard.
 *
 * @version 1.0.0
 */

const BaseService = require('./base-service');
const Stripe = require('stripe');

class StripeService extends BaseService {
  constructor() {
    super('StripeService', { dbConfig: true });

    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2024-12-18.acacia',
    });

    // Plan configuration - prices in cents
    this.plans = {
      free: {
        name: 'Free',
        priceMonthly: 0,
        priceYearly: 0,
        stripePriceMonthly: null,
        stripePriceYearly: null,
      },
      pro: {
        name: 'Pro',
        priceMonthly: 1499, // $14.99
        priceYearly: 14990, // $149.90 (2 months free)
        stripePriceMonthly: process.env.STRIPE_PRICE_PRO_MONTHLY,
        stripePriceYearly: process.env.STRIPE_PRICE_PRO_YEARLY,
      },
      premium: {
        name: 'Premium',
        priceMonthly: 2999, // $29.99
        priceYearly: 29990, // $299.90 (2 months free)
        stripePriceMonthly: process.env.STRIPE_PRICE_PREMIUM_MONTHLY,
        stripePriceYearly: process.env.STRIPE_PRICE_PREMIUM_YEARLY,
      },
    };
  }

  /**
   * Create or retrieve a Stripe customer for a user
   */
  async getOrCreateCustomer(userId, email, name = null) {
    return this.executeOperation(async () => {
      // Check if user already has a Stripe customer ID
      const userResult = await this.executeQuery(
        'SELECT stripe_customer_id FROM users WHERE id = $1',
        [userId]
      );

      if (userResult.rows[0]?.stripe_customer_id) {
        const customer = await this.stripe.customers.retrieve(
          userResult.rows[0].stripe_customer_id
        );
        return customer;
      }

      // Create new Stripe customer
      const customer = await this.stripe.customers.create({
        email,
        name,
        metadata: { userId: userId.toString() },
      });

      // Save Stripe customer ID to user record
      await this.executeQuery(
        'UPDATE users SET stripe_customer_id = $1 WHERE id = $2',
        [customer.id, userId]
      );

      this.logger.info('Created Stripe customer', { userId, customerId: customer.id });
      return customer;
    }, 'getOrCreateCustomer', { userId, email });
  }

  /**
   * Create a checkout session for subscription
   */
  async createCheckoutSession(userId, email, plan, billingPeriod = 'monthly') {
    return this.executeOperation(async () => {
      const planConfig = this.plans[plan];
      if (!planConfig || plan === 'free') {
        throw new Error(`Invalid plan: ${plan}`);
      }

      const priceId = billingPeriod === 'yearly'
        ? planConfig.stripePriceYearly
        : planConfig.stripePriceMonthly;

      if (!priceId) {
        throw new Error(`Price ID not configured for ${plan} ${billingPeriod}`);
      }

      // Get or create Stripe customer
      const customerResult = await this.getOrCreateCustomer(userId, email);
      const customerId = customerResult.data?.id || customerResult.id;

      const session = await this.stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        mode: 'subscription',
        success_url: `${process.env.APP_URL || 'http://localhost:5000'}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.APP_URL || 'http://localhost:5000'}/billing/cancel`,
        metadata: {
          userId: userId.toString(),
          plan,
          billingPeriod,
        },
        subscription_data: {
          metadata: {
            userId: userId.toString(),
            plan,
          },
        },
        allow_promotion_codes: true,
      });

      this.logger.info('Created checkout session', {
        userId,
        plan,
        billingPeriod,
        sessionId: session.id
      });

      return { sessionId: session.id, url: session.url };
    }, 'createCheckoutSession', { userId, plan, billingPeriod });
  }

  /**
   * Create a billing portal session for managing subscription
   */
  async createBillingPortalSession(userId) {
    return this.executeOperation(async () => {
      const userResult = await this.executeQuery(
        'SELECT stripe_customer_id, email FROM users WHERE id = $1',
        [userId]
      );

      const user = userResult.rows[0];
      if (!user?.stripe_customer_id) {
        throw new Error('User does not have an active subscription');
      }

      const session = await this.stripe.billingPortal.sessions.create({
        customer: user.stripe_customer_id,
        return_url: `${process.env.APP_URL || 'http://localhost:5000'}/settings`,
      });

      return { url: session.url };
    }, 'createBillingPortalSession', { userId });
  }

  /**
   * Handle Stripe webhook events
   */
  async handleWebhook(payload, signature) {
    return this.executeOperation(async () => {
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

      let event;
      try {
        event = this.stripe.webhooks.constructEvent(payload, signature, webhookSecret);
      } catch (err) {
        this.logger.error('Webhook signature verification failed', { error: err.message });
        throw new Error(`Webhook signature verification failed: ${err.message}`);
      }

      // Check if event was already processed (idempotency)
      const existingEvent = await this.executeQuery(
        'SELECT id FROM subscription_events WHERE stripe_event_id = $1',
        [event.id]
      );

      if (existingEvent.rows.length > 0) {
        this.logger.info('Event already processed', { eventId: event.id });
        return { received: true, duplicate: true };
      }

      // Process the event
      await this.processWebhookEvent(event);

      return { received: true };
    }, 'handleWebhook', { eventType: payload?.type });
  }

  /**
   * Process different webhook event types
   */
  async processWebhookEvent(event) {
    const { type, data } = event;
    const object = data.object;

    this.logger.info('Processing webhook event', { type, objectId: object.id });

    switch (type) {
      case 'checkout.session.completed':
        await this.handleCheckoutComplete(object);
        break;

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdate(object);
        break;

      case 'customer.subscription.deleted':
        await this.handleSubscriptionCanceled(object);
        break;

      case 'invoice.paid':
        await this.handleInvoicePaid(object);
        break;

      case 'invoice.payment_failed':
        await this.handlePaymentFailed(object);
        break;

      default:
        this.logger.info('Unhandled webhook event type', { type });
    }

    // Record the event
    await this.recordSubscriptionEvent(event);
  }

  /**
   * Handle successful checkout completion
   */
  async handleCheckoutComplete(session) {
    const userId = session.metadata?.userId;
    const plan = session.metadata?.plan;

    if (!userId || !plan) {
      this.logger.warn('Missing metadata in checkout session', { sessionId: session.id });
      return;
    }

    this.logger.info('Checkout completed', { userId, plan, sessionId: session.id });
  }

  /**
   * Handle subscription creation or update
   */
  async handleSubscriptionUpdate(subscription) {
    const userId = subscription.metadata?.userId;
    const plan = subscription.metadata?.plan || this.getPlanFromPriceId(subscription.items.data[0]?.price?.id);

    if (!userId) {
      // Try to find user by customer ID
      const userResult = await this.executeQuery(
        'SELECT id FROM users WHERE stripe_customer_id = $1',
        [subscription.customer]
      );

      if (userResult.rows.length === 0) {
        this.logger.warn('User not found for subscription', {
          subscriptionId: subscription.id,
          customerId: subscription.customer
        });
        return;
      }
    }

    const targetUserId = userId || (await this.getUserIdByCustomer(subscription.customer));

    // Upsert subscription record
    await this.executeQuery(
      `INSERT INTO subscriptions (
        user_id, stripe_customer_id, stripe_subscription_id, plan, status,
        current_period_start, current_period_end, cancel_at_period_end,
        trial_start, trial_end, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      ON CONFLICT (stripe_subscription_id) DO UPDATE SET
        plan = EXCLUDED.plan,
        status = EXCLUDED.status,
        current_period_start = EXCLUDED.current_period_start,
        current_period_end = EXCLUDED.current_period_end,
        cancel_at_period_end = EXCLUDED.cancel_at_period_end,
        updated_at = NOW()`,
      [
        targetUserId,
        subscription.customer,
        subscription.id,
        plan,
        subscription.status,
        new Date(subscription.current_period_start * 1000),
        new Date(subscription.current_period_end * 1000),
        subscription.cancel_at_period_end,
        subscription.trial_start ? new Date(subscription.trial_start * 1000) : null,
        subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
      ]
    );

    // Update user's plan
    await this.executeQuery(
      `UPDATE users SET
        plan = $1,
        subscription_status = $2,
        updated_at = NOW()
      WHERE id = $3`,
      [plan, subscription.status, targetUserId]
    );

    this.logger.info('Subscription updated', {
      userId: targetUserId,
      plan,
      status: subscription.status
    });
  }

  /**
   * Handle subscription cancellation
   */
  async handleSubscriptionCanceled(subscription) {
    const targetUserId = await this.getUserIdByCustomer(subscription.customer);

    if (!targetUserId) {
      this.logger.warn('User not found for canceled subscription', {
        subscriptionId: subscription.id
      });
      return;
    }

    // Update subscription record
    await this.executeQuery(
      `UPDATE subscriptions SET
        status = 'canceled',
        canceled_at = NOW(),
        updated_at = NOW()
      WHERE stripe_subscription_id = $1`,
      [subscription.id]
    );

    // Downgrade user to free plan
    await this.executeQuery(
      `UPDATE users SET
        plan = 'free',
        subscription_status = 'canceled',
        updated_at = NOW()
      WHERE id = $1`,
      [targetUserId]
    );

    this.logger.info('Subscription canceled', { userId: targetUserId });
  }

  /**
   * Handle successful invoice payment
   */
  async handleInvoicePaid(invoice) {
    const targetUserId = await this.getUserIdByCustomer(invoice.customer);

    if (!targetUserId) return;

    // Get subscription ID
    const subResult = await this.executeQuery(
      'SELECT id FROM subscriptions WHERE stripe_customer_id = $1',
      [invoice.customer]
    );

    await this.executeQuery(
      `INSERT INTO billing_history (
        user_id, subscription_id, stripe_invoice_id, stripe_payment_intent_id,
        amount_cents, currency, status, description, invoice_url, invoice_pdf,
        period_start, period_end, paid_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
      ON CONFLICT (stripe_invoice_id) DO UPDATE SET
        status = EXCLUDED.status,
        paid_at = NOW()`,
      [
        targetUserId,
        subResult.rows[0]?.id || null,
        invoice.id,
        invoice.payment_intent,
        invoice.amount_paid,
        invoice.currency,
        'paid',
        invoice.description || `Subscription payment`,
        invoice.hosted_invoice_url,
        invoice.invoice_pdf,
        invoice.period_start ? new Date(invoice.period_start * 1000) : null,
        invoice.period_end ? new Date(invoice.period_end * 1000) : null,
      ]
    );

    this.logger.info('Invoice paid recorded', {
      userId: targetUserId,
      invoiceId: invoice.id,
      amount: invoice.amount_paid
    });
  }

  /**
   * Handle failed payment
   */
  async handlePaymentFailed(invoice) {
    const targetUserId = await this.getUserIdByCustomer(invoice.customer);

    if (!targetUserId) return;

    // Update user subscription status
    await this.executeQuery(
      `UPDATE users SET
        subscription_status = 'past_due',
        updated_at = NOW()
      WHERE id = $1`,
      [targetUserId]
    );

    this.logger.warn('Payment failed', {
      userId: targetUserId,
      invoiceId: invoice.id
    });
  }

  /**
   * Record subscription event for audit trail
   */
  async recordSubscriptionEvent(event) {
    const userId = await this.getUserIdByCustomer(event.data.object.customer);

    await this.executeQuery(
      `INSERT INTO subscription_events (
        user_id, stripe_event_id, event_type, event_data, processed, processed_at
      ) VALUES ($1, $2, $3, $4, true, NOW())`,
      [
        userId,
        event.id,
        event.type,
        JSON.stringify(event.data.object),
      ]
    );
  }

  /**
   * Get user ID from Stripe customer ID
   */
  async getUserIdByCustomer(customerId) {
    const result = await this.executeQuery(
      'SELECT id FROM users WHERE stripe_customer_id = $1',
      [customerId]
    );
    return result.rows[0]?.id || null;
  }

  /**
   * Get plan name from Stripe price ID
   */
  getPlanFromPriceId(priceId) {
    for (const [planName, config] of Object.entries(this.plans)) {
      if (config.stripePriceMonthly === priceId || config.stripePriceYearly === priceId) {
        return planName;
      }
    }
    return 'free';
  }

  /**
   * Get user's current subscription details
   */
  async getSubscription(userId) {
    return this.executeOperation(async () => {
      const result = await this.executeQuery(
        `SELECT s.*, u.email, u.plan as user_plan
         FROM subscriptions s
         JOIN users u ON u.id = s.user_id
         WHERE s.user_id = $1
         ORDER BY s.created_at DESC
         LIMIT 1`,
        [userId]
      );

      if (result.rows.length === 0) {
        return {
          plan: 'free',
          status: 'active',
          hasSubscription: false,
        };
      }

      const sub = result.rows[0];
      return {
        plan: sub.plan,
        status: sub.status,
        hasSubscription: true,
        currentPeriodEnd: sub.current_period_end,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        stripeSubscriptionId: sub.stripe_subscription_id,
      };
    }, 'getSubscription', { userId });
  }

  /**
   * Get user's billing history
   */
  async getBillingHistory(userId, limit = 10) {
    return this.executeOperation(async () => {
      const result = await this.executeQuery(
        `SELECT * FROM billing_history
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [userId, limit]
      );

      return result.rows.map(row => ({
        id: row.id,
        amount: row.amount_cents / 100,
        currency: row.currency,
        status: row.status,
        description: row.description,
        invoiceUrl: row.invoice_url,
        invoicePdf: row.invoice_pdf,
        paidAt: row.paid_at,
        periodStart: row.period_start,
        periodEnd: row.period_end,
      }));
    }, 'getBillingHistory', { userId, limit });
  }

  /**
   * Cancel subscription at period end
   */
  async cancelSubscription(userId) {
    return this.executeOperation(async () => {
      const subResult = await this.executeQuery(
        'SELECT stripe_subscription_id FROM subscriptions WHERE user_id = $1 AND status = $2',
        [userId, 'active']
      );

      if (subResult.rows.length === 0) {
        throw new Error('No active subscription found');
      }

      const subscription = await this.stripe.subscriptions.update(
        subResult.rows[0].stripe_subscription_id,
        { cancel_at_period_end: true }
      );

      await this.executeQuery(
        `UPDATE subscriptions SET
          cancel_at_period_end = true,
          updated_at = NOW()
        WHERE stripe_subscription_id = $1`,
        [subscription.id]
      );

      this.logger.info('Subscription scheduled for cancellation', { userId });

      return {
        cancelAtPeriodEnd: true,
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      };
    }, 'cancelSubscription', { userId });
  }

  /**
   * Reactivate a subscription scheduled for cancellation
   */
  async reactivateSubscription(userId) {
    return this.executeOperation(async () => {
      const subResult = await this.executeQuery(
        'SELECT stripe_subscription_id FROM subscriptions WHERE user_id = $1 AND cancel_at_period_end = true',
        [userId]
      );

      if (subResult.rows.length === 0) {
        throw new Error('No subscription pending cancellation found');
      }

      const subscription = await this.stripe.subscriptions.update(
        subResult.rows[0].stripe_subscription_id,
        { cancel_at_period_end: false }
      );

      await this.executeQuery(
        `UPDATE subscriptions SET
          cancel_at_period_end = false,
          updated_at = NOW()
        WHERE stripe_subscription_id = $1`,
        [subscription.id]
      );

      this.logger.info('Subscription reactivated', { userId });

      return { reactivated: true };
    }, 'reactivateSubscription', { userId });
  }

  /**
   * Get available plans with pricing
   */
  getPlans() {
    return Object.entries(this.plans).map(([key, plan]) => ({
      id: key,
      name: plan.name,
      priceMonthly: plan.priceMonthly / 100,
      priceYearly: plan.priceYearly / 100,
      features: this.getPlanFeatures(key),
    }));
  }

  /**
   * Get features for a specific plan
   */
  getPlanFeatures(plan) {
    const features = {
      free: [
        '1 portfolio',
        'Up to 10 stocks per portfolio',
        '5 AI recommendations per day',
        'Basic market data',
        'Community support',
      ],
      pro: [
        'Unlimited portfolios',
        'Unlimited stocks',
        'Unlimited AI recommendations',
        'Real-time market data',
        'Price alerts',
        'Export to CSV/PDF',
        'Email support',
      ],
      premium: [
        'Everything in Pro',
        'Advanced AI insights',
        'Portfolio performance analytics',
        'Tax optimization suggestions',
        'Priority support',
        'Early access to new features',
      ],
    };

    return features[plan] || features.free;
  }

  /**
   * Apply promotional code
   */
  async applyPromoCode(userId, code) {
    return this.executeOperation(async () => {
      // Find the promo code
      const promoResult = await this.executeQuery(
        `SELECT * FROM promo_codes
         WHERE code = $1
           AND active = true
           AND (valid_until IS NULL OR valid_until > NOW())
           AND (max_uses IS NULL OR current_uses < max_uses)`,
        [code.toUpperCase()]
      );

      if (promoResult.rows.length === 0) {
        throw new Error('Invalid or expired promo code');
      }

      const promo = promoResult.rows[0];

      // Check if user already redeemed this code
      const redemptionResult = await this.executeQuery(
        'SELECT id FROM promo_redemptions WHERE promo_code_id = $1 AND user_id = $2',
        [promo.id, userId]
      );

      if (redemptionResult.rows.length > 0) {
        throw new Error('You have already used this promo code');
      }

      // Apply the promo code (store for use at checkout)
      await this.executeQuery(
        `INSERT INTO promo_redemptions (promo_code_id, user_id) VALUES ($1, $2)`,
        [promo.id, userId]
      );

      // Increment usage count
      await this.executeQuery(
        'UPDATE promo_codes SET current_uses = current_uses + 1 WHERE id = $1',
        [promo.id]
      );

      return {
        code: promo.code,
        discountType: promo.discount_type,
        discountValue: promo.discount_value,
        stripeCouponId: promo.stripe_coupon_id,
      };
    }, 'applyPromoCode', { userId, code });
  }
}

module.exports = new StripeService();
