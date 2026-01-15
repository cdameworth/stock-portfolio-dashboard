-- Migration: Create all deferred indexes
-- Tables and columns guaranteed to exist after migration 011

-- Indexes for recommendation_outcomes table
CREATE INDEX IF NOT EXISTS idx_outcomes_recommendation ON recommendation_outcomes(recommendation_id);
CREATE INDEX IF NOT EXISTS idx_outcomes_symbol ON recommendation_outcomes(symbol);
CREATE INDEX IF NOT EXISTS idx_outcomes_date ON recommendation_outcomes(check_date);

-- Index for risk_level column on recommendations
CREATE INDEX IF NOT EXISTS idx_recommendations_risk ON recommendations(risk_level);

-- Indexes for users table columns
CREATE INDEX IF NOT EXISTS idx_users_is_admin ON users(is_admin);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Indexes for admin_audit_log table
CREATE INDEX IF NOT EXISTS idx_admin_audit_admin ON admin_audit_log(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_action ON admin_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_log(created_at);
