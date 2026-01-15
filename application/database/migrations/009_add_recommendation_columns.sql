-- Migration: Add missing columns to recommendations table
-- This migration adds columns required by database-service.js that were missing
-- from the original simple recommendations table schema

-- Add prediction_score column (required for ML confidence scores)
ALTER TABLE recommendations
ADD COLUMN IF NOT EXISTS prediction_score DECIMAL(5, 4);

-- Add confidence column (model confidence level)
ALTER TABLE recommendations
ADD COLUMN IF NOT EXISTS confidence DECIMAL(5, 4);

-- Add stop_loss_price column (risk management)
ALTER TABLE recommendations
ADD COLUMN IF NOT EXISTS stop_loss_price DECIMAL(10, 2);

-- Add risk_level column (LOW/MEDIUM/HIGH)
ALTER TABLE recommendations
ADD COLUMN IF NOT EXISTS risk_level VARCHAR(10) DEFAULT 'MEDIUM';

-- Add rationale column (explanation for recommendation)
ALTER TABLE recommendations
ADD COLUMN IF NOT EXISTS rationale TEXT;

-- Add estimated_hit_days column (days to target)
ALTER TABLE recommendations
ADD COLUMN IF NOT EXISTS estimated_hit_days INTEGER;

-- Add estimated_hit_date column (projected target date)
ALTER TABLE recommendations
ADD COLUMN IF NOT EXISTS estimated_hit_date DATE;

-- Add source column (where recommendation came from)
ALTER TABLE recommendations
ADD COLUMN IF NOT EXISTS source VARCHAR(100) DEFAULT 'stock-analytics-api';

-- Add metadata column (JSON for additional data)
ALTER TABLE recommendations
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Add updated_at column (for tracking updates)
ALTER TABLE recommendations
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Create recommendation_outcomes table if not exists (for tracking)
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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(recommendation_id, check_date)
);

-- Create hit_time_accuracy table if not exists (for ML model evaluation)
CREATE TABLE IF NOT EXISTS hit_time_accuracy (
    id SERIAL PRIMARY KEY,
    recommendation_id VARCHAR(255) NOT NULL,
    estimated_hit_date DATE,
    actual_hit_date DATE,
    days_difference INTEGER,
    accuracy_score DECIMAL(5, 2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create performance_metrics table if not exists (for dashboard)
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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(period, metric_date)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_recommendations_symbol ON recommendations(symbol);
CREATE INDEX IF NOT EXISTS idx_recommendations_type ON recommendations(recommendation_type);
CREATE INDEX IF NOT EXISTS idx_recommendations_created ON recommendations(created_at);
CREATE INDEX IF NOT EXISTS idx_recommendations_risk ON recommendations(risk_level);
CREATE INDEX IF NOT EXISTS idx_outcomes_recommendation ON recommendation_outcomes(recommendation_id);
CREATE INDEX IF NOT EXISTS idx_outcomes_symbol ON recommendation_outcomes(symbol);
CREATE INDEX IF NOT EXISTS idx_outcomes_date ON recommendation_outcomes(check_date);
