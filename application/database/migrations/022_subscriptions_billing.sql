-- Migration 022: Subscriptions and Billing Tables
-- Adds Stripe integration for subscription management
-- Version: 1.0.0

-- ============================================
-- SECTION 1: SUBSCRIPTIONS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS subscriptions (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stripe_customer_id VARCHAR(255) UNIQUE,
    stripe_subscription_id VARCHAR(255) UNIQUE,
    plan VARCHAR(50) NOT NULL DEFAULT 'free',
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    current_period_start TIMESTAMP,
    current_period_end TIMESTAMP,
    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    canceled_at TIMESTAMP,
    trial_start TIMESTAMP,
    trial_end TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_plan CHECK (plan IN ('free', 'basic', 'pro', 'premium')),
    CONSTRAINT valid_status CHECK (status IN ('active', 'canceled', 'past_due', 'trialing', 'incomplete', 'incomplete_expired', 'unpaid'))
);

-- ============================================
-- SECTION 2: BILLING HISTORY TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS billing_history (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subscription_id INTEGER REFERENCES subscriptions(id) ON DELETE SET NULL,
    stripe_invoice_id VARCHAR(255) UNIQUE,
    stripe_payment_intent_id VARCHAR(255),
    amount_cents INTEGER NOT NULL,
    currency VARCHAR(3) DEFAULT 'usd',
    status VARCHAR(50) NOT NULL,
    description TEXT,
    invoice_url TEXT,
    invoice_pdf TEXT,
    period_start TIMESTAMP,
    period_end TIMESTAMP,
    paid_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_billing_status CHECK (status IN ('draft', 'open', 'paid', 'void', 'uncollectible'))
);

-- ============================================
-- SECTION 3: SUBSCRIPTION EVENTS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS subscription_events (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    subscription_id INTEGER REFERENCES subscriptions(id) ON DELETE SET NULL,
    stripe_event_id VARCHAR(255) UNIQUE NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    event_data JSONB DEFAULT '{}',
    processed BOOLEAN DEFAULT FALSE,
    processed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- SECTION 4: PROMOTIONAL CODES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS promo_codes (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    stripe_coupon_id VARCHAR(255),
    discount_type VARCHAR(20) NOT NULL,
    discount_value INTEGER NOT NULL,
    max_uses INTEGER,
    current_uses INTEGER DEFAULT 0,
    valid_from TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    valid_until TIMESTAMP,
    applicable_plans TEXT[] DEFAULT ARRAY['pro', 'premium'],
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_discount_type CHECK (discount_type IN ('percent', 'fixed'))
);

-- ============================================
-- SECTION 5: PROMO CODE REDEMPTIONS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS promo_redemptions (
    id SERIAL PRIMARY KEY,
    promo_code_id INTEGER NOT NULL REFERENCES promo_codes(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subscription_id INTEGER REFERENCES subscriptions(id) ON DELETE SET NULL,
    redeemed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(promo_code_id, user_id)
);

-- ============================================
-- SECTION 6: ADD COLUMNS TO USERS TABLE
-- ============================================

-- Add subscription-related columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan VARCHAR(50) DEFAULT 'free';
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(50) DEFAULT 'active';
ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMP;

-- ============================================
-- SECTION 7: INDEXES FOR PERFORMANCE
-- ============================================

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer_id ON subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_subscription_id ON subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_plan ON subscriptions(plan);

CREATE INDEX IF NOT EXISTS idx_billing_history_user_id ON billing_history(user_id);
CREATE INDEX IF NOT EXISTS idx_billing_history_subscription_id ON billing_history(subscription_id);
CREATE INDEX IF NOT EXISTS idx_billing_history_stripe_invoice_id ON billing_history(stripe_invoice_id);
CREATE INDEX IF NOT EXISTS idx_billing_history_status ON billing_history(status);
CREATE INDEX IF NOT EXISTS idx_billing_history_created_at ON billing_history(created_at);

CREATE INDEX IF NOT EXISTS idx_subscription_events_user_id ON subscription_events(user_id);
CREATE INDEX IF NOT EXISTS idx_subscription_events_stripe_event_id ON subscription_events(stripe_event_id);
CREATE INDEX IF NOT EXISTS idx_subscription_events_event_type ON subscription_events(event_type);
CREATE INDEX IF NOT EXISTS idx_subscription_events_processed ON subscription_events(processed);

CREATE INDEX IF NOT EXISTS idx_promo_codes_code ON promo_codes(code);
CREATE INDEX IF NOT EXISTS idx_promo_codes_active ON promo_codes(active);

CREATE INDEX IF NOT EXISTS idx_users_stripe_customer_id ON users(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_users_plan ON users(plan);

-- ============================================
-- SECTION 8: INSERT DEFAULT FREE PLAN CONFIG
-- ============================================

INSERT INTO system_config (config_key, config_value, description)
VALUES (
    'subscription_plans',
    '{
        "free": {
            "name": "Free",
            "price_monthly": 0,
            "price_yearly": 0,
            "features": {
                "portfolios": 1,
                "stocks_per_portfolio": 10,
                "recommendations_per_day": 5,
                "real_time_data": false,
                "ai_insights": false,
                "export": false,
                "alerts": false,
                "priority_support": false
            }
        },
        "pro": {
            "name": "Pro",
            "price_monthly": 1499,
            "price_yearly": 14990,
            "stripe_price_monthly": null,
            "stripe_price_yearly": null,
            "features": {
                "portfolios": -1,
                "stocks_per_portfolio": -1,
                "recommendations_per_day": -1,
                "real_time_data": true,
                "ai_insights": false,
                "export": true,
                "alerts": true,
                "priority_support": false
            }
        },
        "premium": {
            "name": "Premium",
            "price_monthly": 2999,
            "price_yearly": 29990,
            "stripe_price_monthly": null,
            "stripe_price_yearly": null,
            "features": {
                "portfolios": -1,
                "stocks_per_portfolio": -1,
                "recommendations_per_day": -1,
                "real_time_data": true,
                "ai_insights": true,
                "export": true,
                "alerts": true,
                "priority_support": true
            }
        }
    }',
    'Subscription plan configurations including pricing and features'
)
ON CONFLICT (config_key) DO UPDATE SET
    config_value = EXCLUDED.config_value,
    updated_at = CURRENT_TIMESTAMP;
