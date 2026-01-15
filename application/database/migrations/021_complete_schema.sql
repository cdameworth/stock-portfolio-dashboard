-- Migration 021: Complete Schema (God Migration)
-- This migration ensures ALL tables, columns, and indexes exist.
-- Uses IF NOT EXISTS/IF EXISTS for complete idempotency.
-- This is the single source of truth for the database schema.

-- ============================================
-- SECTION 1: CORE TABLES
-- ============================================

-- Users table (should exist from initial setup)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Portfolios table
CREATE TABLE IF NOT EXISTS portfolios (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Portfolio holdings
CREATE TABLE IF NOT EXISTS holdings (
    id SERIAL PRIMARY KEY,
    portfolio_id INTEGER REFERENCES portfolios(id) ON DELETE CASCADE,
    symbol VARCHAR(10) NOT NULL,
    shares DECIMAL(15, 6) NOT NULL,
    average_cost DECIMAL(10, 2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Recommendations table
CREATE TABLE IF NOT EXISTS recommendations (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(10) NOT NULL,
    recommendation_type VARCHAR(20) NOT NULL,
    target_price DECIMAL(10, 2),
    entry_price DECIMAL(10, 2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- SECTION 2: EXTENDED TABLES
-- ============================================

-- Recommendation outcomes tracking
CREATE TABLE IF NOT EXISTS recommendation_outcomes (
    id SERIAL PRIMARY KEY,
    recommendation_id VARCHAR(255) NOT NULL,
    symbol VARCHAR(10) NOT NULL,
    check_date DATE NOT NULL,
    check_price DECIMAL(10, 2),
    price_change_percent DECIMAL(8, 4),
    target_achieved BOOLEAN DEFAULT FALSE,
    stop_loss_triggered BOOLEAN DEFAULT FALSE,
    days_since_recommendation INTEGER,
    outcome_status VARCHAR(20) DEFAULT 'PENDING',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Admin audit log
CREATE TABLE IF NOT EXISTS admin_audit_log (
    id SERIAL PRIMARY KEY,
    admin_user_id INTEGER NOT NULL,
    action VARCHAR(100) NOT NULL,
    target_type VARCHAR(50),
    target_id VARCHAR(255),
    details JSONB DEFAULT '{}',
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- System configuration
CREATE TABLE IF NOT EXISTS system_config (
    id SERIAL PRIMARY KEY,
    config_key VARCHAR(100) UNIQUE NOT NULL,
    config_value JSONB NOT NULL,
    description TEXT,
    updated_by INTEGER,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Hit time accuracy tracking
CREATE TABLE IF NOT EXISTS hit_time_accuracy (
    id SERIAL PRIMARY KEY,
    recommendation_id VARCHAR(255) NOT NULL,
    estimated_hit_date DATE,
    actual_hit_date DATE,
    days_difference INTEGER,
    accuracy_score DECIMAL(5, 2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Performance metrics aggregation
CREATE TABLE IF NOT EXISTS performance_metrics (
    id SERIAL PRIMARY KEY,
    period VARCHAR(10) NOT NULL,
    metric_date DATE NOT NULL,
    total_recommendations INTEGER DEFAULT 0,
    successful_recommendations INTEGER DEFAULT 0,
    failed_recommendations INTEGER DEFAULT 0,
    success_rate DECIMAL(5, 2) DEFAULT 0,
    average_gain DECIMAL(8, 4) DEFAULT 0,
    average_days_to_hit INTEGER DEFAULT 0,
    high_confidence_accuracy DECIMAL(5, 2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- SECTION 3: COLUMN EXTENSIONS
-- ============================================

-- Users table extensions
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'user';

-- Recommendations table extensions
ALTER TABLE recommendations ADD COLUMN IF NOT EXISTS risk_level VARCHAR(10) DEFAULT 'MEDIUM';
ALTER TABLE recommendations ADD COLUMN IF NOT EXISTS prediction_score DECIMAL(5, 4);
ALTER TABLE recommendations ADD COLUMN IF NOT EXISTS confidence DECIMAL(5, 4);
ALTER TABLE recommendations ADD COLUMN IF NOT EXISTS stop_loss_price DECIMAL(10, 2);
ALTER TABLE recommendations ADD COLUMN IF NOT EXISTS rationale TEXT;
ALTER TABLE recommendations ADD COLUMN IF NOT EXISTS estimated_hit_days INTEGER;
ALTER TABLE recommendations ADD COLUMN IF NOT EXISTS estimated_hit_date DATE;
ALTER TABLE recommendations ADD COLUMN IF NOT EXISTS source VARCHAR(100) DEFAULT 'stock-analytics-api';
ALTER TABLE recommendations ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
ALTER TABLE recommendations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- ============================================
-- SECTION 4: INDEXES
-- ============================================

-- Recommendation outcomes indexes
CREATE INDEX IF NOT EXISTS idx_outcomes_recommendation ON recommendation_outcomes(recommendation_id);
CREATE INDEX IF NOT EXISTS idx_outcomes_symbol ON recommendation_outcomes(symbol);
CREATE INDEX IF NOT EXISTS idx_outcomes_date ON recommendation_outcomes(check_date);
CREATE INDEX IF NOT EXISTS idx_outcomes_status ON recommendation_outcomes(outcome_status);

-- Recommendations indexes
CREATE INDEX IF NOT EXISTS idx_recommendations_risk ON recommendations(risk_level);
CREATE INDEX IF NOT EXISTS idx_recommendations_symbol ON recommendations(symbol);
CREATE INDEX IF NOT EXISTS idx_recommendations_type ON recommendations(recommendation_type);
CREATE INDEX IF NOT EXISTS idx_recommendations_created ON recommendations(created_at);

-- Users indexes
CREATE INDEX IF NOT EXISTS idx_users_is_admin ON users(is_admin);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Admin audit log indexes
CREATE INDEX IF NOT EXISTS idx_admin_audit_admin ON admin_audit_log(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_action ON admin_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_log(created_at);

-- Hit time accuracy indexes
CREATE INDEX IF NOT EXISTS idx_hit_accuracy_recommendation ON hit_time_accuracy(recommendation_id);

-- Performance metrics indexes
CREATE INDEX IF NOT EXISTS idx_perf_metrics_period ON performance_metrics(period);
CREATE INDEX IF NOT EXISTS idx_perf_metrics_date ON performance_metrics(metric_date);

-- Holdings indexes
CREATE INDEX IF NOT EXISTS idx_holdings_portfolio ON holdings(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_holdings_symbol ON holdings(symbol);

-- Portfolios indexes
CREATE INDEX IF NOT EXISTS idx_portfolios_user ON portfolios(user_id);
