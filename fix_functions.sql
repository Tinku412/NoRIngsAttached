-- Critical Functions for Subscription System
-- Run this in Supabase SQL Editor if the main schema didn't work

-- Function to check if user has active subscription
CREATE OR REPLACE FUNCTION get_user_subscription_status(user_uuid UUID)
RETURNS TABLE (
    plan_type TEXT,
    status TEXT,
    end_date TIMESTAMP WITH TIME ZONE,
    is_premium BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(s.plan_type, 'free') as plan_type,
        COALESCE(s.status, 'active') as status,
        s.end_date,
        CASE 
            WHEN s.plan_type IN ('3_months', '6_months') 
                AND s.status = 'active' 
                AND (s.end_date IS NULL OR s.end_date > NOW()) 
            THEN TRUE 
            ELSE FALSE 
        END as is_premium
    FROM subscriptions s
    WHERE s.user_id = user_uuid
    ORDER BY s.created_at DESC
    LIMIT 1;
    
    -- If no subscription found, return free plan
    IF NOT FOUND THEN
        RETURN QUERY SELECT 'free'::TEXT, 'active'::TEXT, NULL::TIMESTAMP WITH TIME ZONE, FALSE::BOOLEAN;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create or update subscription
CREATE OR REPLACE FUNCTION create_or_update_subscription(
    user_uuid UUID,
    plan TEXT,
    payment_id TEXT DEFAULT NULL,
    order_id TEXT DEFAULT NULL,
    amount INTEGER DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    subscription_uuid UUID;
    end_date_calculated TIMESTAMP WITH TIME ZONE;
BEGIN
    -- Calculate end date based on plan
    CASE plan
        WHEN '3_months' THEN
            end_date_calculated := NOW() + INTERVAL '3 months';
        WHEN '6_months' THEN
            end_date_calculated := NOW() + INTERVAL '6 months';
        ELSE
            end_date_calculated := NULL; -- Free plan has no end date
    END CASE;

    -- Insert or update subscription
    INSERT INTO subscriptions (
        user_id, 
        plan_type, 
        status, 
        start_date, 
        end_date, 
        razorpay_payment_id, 
        razorpay_order_id, 
        amount_paid
    ) VALUES (
        user_uuid, 
        plan, 
        'active', 
        NOW(), 
        end_date_calculated, 
        payment_id, 
        order_id, 
        amount
    )
    ON CONFLICT (user_id) DO UPDATE SET
        plan_type = EXCLUDED.plan_type,
        status = EXCLUDED.status,
        start_date = EXCLUDED.start_date,
        end_date = EXCLUDED.end_date,
        razorpay_payment_id = EXCLUDED.razorpay_payment_id,
        razorpay_order_id = EXCLUDED.razorpay_order_id,
        amount_paid = EXCLUDED.amount_paid,
        updated_at = NOW()
    RETURNING id INTO subscription_uuid;

    RETURN subscription_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_user_subscription_status(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION create_or_update_subscription(UUID, TEXT, TEXT, TEXT, INTEGER) TO authenticated; 