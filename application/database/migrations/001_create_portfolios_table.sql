-- Migration 001: Create portfolios table
-- Simple migration to create just the portfolios table for user portfolio functionality

-- Create portfolios table
CREATE TABLE IF NOT EXISTS portfolios (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    symbols TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Create index for user queries
CREATE INDEX IF NOT EXISTS idx_portfolios_user_id ON portfolios(user_id);

-- Migration completed successfully