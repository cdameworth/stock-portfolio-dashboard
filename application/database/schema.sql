-- Stock Portfolio Dashboard Database Schema
-- Recommendations tracking with performance validation

-- Create database if not exists
-- CREATE DATABASE IF NOT EXISTS stock_portfolio;

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
    
    -- Time-based predictions
    estimated_hit_days INTEGER, -- Estimated days to reach target
    estimated_hit_date DATE, -- Calculated date when target should be hit
    
    -- Tracking fields
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    source VARCHAR(50), -- API source or model version
    metadata JSONB, -- Additional flexible data
    
    -- Indexes for performance
    INDEX idx_symbol (symbol),
    INDEX idx_created_at (created_at),
    INDEX idx_recommendation_type (recommendation_type),
    INDEX idx_estimated_hit_date (estimated_hit_date)
);

-- Recommendation outcomes table to track actual performance
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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (recommendation_id) REFERENCES recommendations(recommendation_id),
    INDEX idx_check_date (check_date),
    INDEX idx_outcome_status (outcome_status),
    UNIQUE KEY unique_daily_check (recommendation_id, check_date)
);

-- Performance metrics table for aggregated statistics
CREATE TABLE IF NOT EXISTS performance_metrics (
    id SERIAL PRIMARY KEY,
    period VARCHAR(10) NOT NULL, -- '1D', '1W', '1M', '3M', '6M', '1Y'
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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_metric_date (metric_date),
    INDEX idx_period (period),
    UNIQUE KEY unique_daily_metric (period, metric_date)
);

-- Hit time accuracy table to track prediction timing accuracy
CREATE TABLE IF NOT EXISTS hit_time_accuracy (
    id SERIAL PRIMARY KEY,
    recommendation_id VARCHAR(255) NOT NULL,
    estimated_hit_date DATE NOT NULL,
    actual_hit_date DATE,
    days_difference INTEGER, -- Positive if hit early, negative if late
    accuracy_score DECIMAL(5, 2), -- 100% if perfect, decreases with difference
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (recommendation_id) REFERENCES recommendations(recommendation_id),
    INDEX idx_accuracy_score (accuracy_score)
);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for updated_at
CREATE TRIGGER update_recommendations_updated_at BEFORE UPDATE
    ON recommendations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();