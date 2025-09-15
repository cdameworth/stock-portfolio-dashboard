-- Stock Portfolio Dashboard - Recommendations Tables Migration
-- Creates all recommendation-related tables for AI performance tracking

-- Recommendations table to store all AI recommendations
CREATE TABLE IF NOT EXISTS recommendations (
    id SERIAL PRIMARY KEY,
    recommendation_id VARCHAR(255) UNIQUE NOT NULL,
    symbol VARCHAR(10) NOT NULL,
    company_name VARCHAR(255),
    recommendation_type VARCHAR(10) NOT NULL CHECK (recommendation_type IN ('BUY', 'SELL', 'HOLD')),
    prediction_score DECIMAL(5, 4),
    confidence DECIMAL(5, 4),
    current_price DECIMAL(10, 2) NOT NULL,
    target_price DECIMAL(10, 2) NOT NULL,
    stop_loss_price DECIMAL(10, 2),
    risk_level VARCHAR(10) CHECK (risk_level IN ('LOW', 'MEDIUM', 'HIGH')),
    rationale TEXT,
    estimated_hit_days INTEGER,
    estimated_hit_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    source VARCHAR(50),
    metadata JSONB
);

-- Recommendation outcomes table
CREATE TABLE IF NOT EXISTS recommendation_outcomes (
    id SERIAL PRIMARY KEY,
    recommendation_id VARCHAR(255) NOT NULL,
    symbol VARCHAR(10) NOT NULL,
    check_date DATE NOT NULL,
    check_price DECIMAL(10, 2) NOT NULL,
    price_change_percent DECIMAL(8, 4),
    target_achieved BOOLEAN DEFAULT FALSE,
    stop_loss_triggered BOOLEAN DEFAULT FALSE,
    days_since_recommendation INTEGER,
    outcome_status VARCHAR(20) CHECK (outcome_status IN ('PENDING', 'SUCCESS', 'FAILED', 'PARTIAL', 'EXPIRED')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Performance metrics table
CREATE TABLE IF NOT EXISTS performance_metrics (
    id SERIAL PRIMARY KEY,
    period VARCHAR(10) NOT NULL,
    metric_date DATE NOT NULL,
    total_recommendations INTEGER,
    successful_recommendations INTEGER,
    failed_recommendations INTEGER,
    success_rate DECIMAL(5, 2),
    average_gain DECIMAL(8, 2),
    average_days_to_hit INTEGER,
    high_confidence_accuracy DECIMAL(5, 2),
    ai_return DECIMAL(8, 2),
    sp500_return DECIMAL(8, 2),
    nasdaq_return DECIMAL(8, 2),
    ai_alpha DECIMAL(8, 2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Hit time accuracy table
CREATE TABLE IF NOT EXISTS hit_time_accuracy (
    id SERIAL PRIMARY KEY,
    recommendation_id VARCHAR(255) NOT NULL,
    estimated_hit_date DATE NOT NULL,
    actual_hit_date DATE,
    days_difference INTEGER,
    accuracy_score DECIMAL(5, 2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);