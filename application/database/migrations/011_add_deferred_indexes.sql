-- Migration: Add indexes for columns created in previous migrations
-- These indexes couldn't be created in the same transaction as the columns
-- because ADD COLUMN IF NOT EXISTS doesn't make columns visible until commit

-- Index for risk_level column (added in migration 009)
CREATE INDEX IF NOT EXISTS idx_recommendations_risk ON recommendations(risk_level);

-- Index for is_admin column (added in migration 010)
CREATE INDEX IF NOT EXISTS idx_users_is_admin ON users(is_admin);

-- Index for role column (added in migration 010)
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
