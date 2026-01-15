-- Migration: Create tables (no indexes - indexes go in 020)
-- This is the ONLY migration that matters now

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

CREATE TABLE IF NOT EXISTS system_config (
    id SERIAL PRIMARY KEY,
    config_key VARCHAR(100) UNIQUE NOT NULL,
    config_value JSONB NOT NULL,
    description TEXT,
    updated_by INTEGER,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS hit_time_accuracy (
    id SERIAL PRIMARY KEY,
    recommendation_id VARCHAR(255) NOT NULL,
    estimated_hit_date DATE,
    actual_hit_date DATE,
    days_difference INTEGER,
    accuracy_score DECIMAL(5, 2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'user';
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
