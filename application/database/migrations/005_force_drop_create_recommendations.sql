-- Force drop and recreate recommendations table
DROP TABLE IF EXISTS recommendations CASCADE;

CREATE TABLE recommendations (
    id SERIAL PRIMARY KEY,
    recommendation_id VARCHAR(255) UNIQUE NOT NULL,
    symbol VARCHAR(10) NOT NULL,
    company_name VARCHAR(255),
    recommendation_type VARCHAR(10) NOT NULL,
    current_price DECIMAL(10, 2) NOT NULL,
    target_price DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);