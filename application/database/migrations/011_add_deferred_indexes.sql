-- Migration: Add indexes for tables and columns created in previous migrations
-- These indexes couldn't be created in the same transaction as the tables/columns
-- because CREATE TABLE and ADD COLUMN IF NOT EXISTS don't make objects visible until commit

-- Indexes for recommendation_outcomes table (created in migration 009)
CREATE INDEX IF NOT EXISTS idx_outcomes_recommendation ON recommendation_outcomes(recommendation_id);
CREATE INDEX IF NOT EXISTS idx_outcomes_symbol ON recommendation_outcomes(symbol);
CREATE INDEX IF NOT EXISTS idx_outcomes_date ON recommendation_outcomes(check_date);

-- Index for risk_level column (added in migration 009)
CREATE INDEX IF NOT EXISTS idx_recommendations_risk ON recommendations(risk_level);

-- Index for is_admin column (added in migration 010)
CREATE INDEX IF NOT EXISTS idx_users_is_admin ON users(is_admin);

-- Index for role column (added in migration 010)
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
