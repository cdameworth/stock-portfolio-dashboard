-- Migration: Create recommendation_outcomes table only
-- Keep this migration simple - just create one table

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
