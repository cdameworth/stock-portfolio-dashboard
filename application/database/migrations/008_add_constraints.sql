-- Add missing constraints for ON CONFLICT operations
-- These constraints are required for the database service functions to work properly

-- Add unique constraint for recommendation_outcomes (recommendation_id, check_date)
ALTER TABLE recommendation_outcomes
ADD CONSTRAINT unique_recommendation_check_date
UNIQUE (recommendation_id, check_date);

-- Add unique constraint for performance_metrics (period, metric_date)
ALTER TABLE performance_metrics
ADD CONSTRAINT unique_period_metric_date
UNIQUE (period, metric_date);

-- Add unique constraint for hit_time_accuracy (recommendation_id)
-- Only one accuracy record per recommendation
ALTER TABLE hit_time_accuracy
ADD CONSTRAINT unique_recommendation_accuracy
UNIQUE (recommendation_id);