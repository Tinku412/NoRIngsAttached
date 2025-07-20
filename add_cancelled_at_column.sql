-- Migration to add cancelled_at column to subscriptions table
-- Run this if you have an existing subscriptions table without the cancelled_at column

-- Add the cancelled_at column if it doesn't exist
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'subscriptions' 
        AND column_name = 'cancelled_at'
    ) THEN
        ALTER TABLE subscriptions ADD COLUMN cancelled_at TIMESTAMP WITH TIME ZONE;
    END IF;
END $$;

-- Update the subscription status function to include cancelled_at and legacy user support
CREATE OR REPLACE FUNCTION get_user_subscription_status(user_uuid UUID)
RETURNS TABLE (
    plan_type TEXT,
    status TEXT,
    end_date TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    is_premium BOOLEAN
) AS $$
DECLARE
    user_created_at TIMESTAMP WITH TIME ZONE;
    legacy_cutoff TIMESTAMP WITH TIME ZONE := '2025-07-20 00:00:00+00'::TIMESTAMP WITH TIME ZONE;
    legacy_expiry TIMESTAMP WITH TIME ZONE := '2025-09-01 00:00:00+00'::TIMESTAMP WITH TIME ZONE;
    is_legacy_user BOOLEAN := FALSE;
    subscription_premium BOOLEAN := FALSE;
BEGIN
    -- Get user creation date
    SELECT created_at INTO user_created_at
    FROM auth.users
    WHERE id = user_uuid;
    
    -- Check if user is eligible for legacy premium access
    IF user_created_at < legacy_cutoff AND NOW() < legacy_expiry THEN
        is_legacy_user := TRUE;
    END IF;
    
    -- Get subscription data
    SELECT 
        COALESCE(s.plan_type, 'free'),
        COALESCE(s.status, 'active'),
        s.end_date,
        s.cancelled_at,
        CASE 
            WHEN s.plan_type IN ('3_months', '6_months') 
                AND s.status IN ('active', 'cancelled')
                AND (s.end_date IS NULL OR s.end_date > NOW()) 
            THEN TRUE 
            ELSE FALSE 
        END
    INTO plan_type, status, end_date, cancelled_at, subscription_premium
    FROM subscriptions s
    WHERE s.user_id = user_uuid
    ORDER BY s.created_at DESC
    LIMIT 1;
    
    -- If no subscription found, set defaults
    IF NOT FOUND THEN
        plan_type := 'free';
        status := 'active';
        end_date := NULL;
        cancelled_at := NULL;
        subscription_premium := FALSE;
    END IF;
    
    -- For legacy users, override plan details if they don't have premium subscription
    IF is_legacy_user AND NOT subscription_premium THEN
        plan_type := 'legacy_premium';
        status := 'active';
        end_date := legacy_expiry;
        cancelled_at := NULL;
        subscription_premium := TRUE;
    END IF;
    
    -- Return the final result
    RETURN QUERY SELECT plan_type, status, end_date, cancelled_at, subscription_premium;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER; 