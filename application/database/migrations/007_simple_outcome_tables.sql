-- Simple recreation of recommendation outcome tracking tables
-- Minimal version to avoid migration failures

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
    outcome_status VARCHAR(20),
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