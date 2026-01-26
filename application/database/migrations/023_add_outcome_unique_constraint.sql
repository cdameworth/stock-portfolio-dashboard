-- Migration 023: Add unique constraint for recommendation_outcomes
-- Required for ON CONFLICT (recommendation_id, check_date) in trackOutcome

-- Add unique constraint if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'unique_recommendation_outcome_daily'
    ) THEN
        ALTER TABLE recommendation_outcomes
        ADD CONSTRAINT unique_recommendation_outcome_daily
        UNIQUE (recommendation_id, check_date);
    END IF;
END $$;

-- Also add for hit_time_accuracy if needed
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'unique_hit_time_recommendation'
    ) THEN
        ALTER TABLE hit_time_accuracy
        ADD CONSTRAINT unique_hit_time_recommendation
        UNIQUE (recommendation_id);
    END IF;
EXCEPTION
    WHEN undefined_table THEN
        -- hit_time_accuracy doesn't exist, skip
        NULL;
END $$;
