-- Subscription System Database Schema for No Rings Attached

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create subscriptions table
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    plan_type TEXT NOT NULL CHECK (plan_type IN ('free', '3_months', '6_months')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled')),
    start_date TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    razorpay_payment_id TEXT,
    razorpay_order_id TEXT,
    amount_paid INTEGER, -- Amount in paise (INR)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    UNIQUE(user_id) -- One subscription per user
);

-- Create payment_orders table for Edge Function integration
CREATE TABLE IF NOT EXISTS payment_orders (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    razorpay_order_id TEXT UNIQUE NOT NULL,
    plan_id TEXT NOT NULL,
    amount INTEGER NOT NULL, -- Amount in paise (INR)
    status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'completed', 'failed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Create transactions table for payment tracking
CREATE TABLE IF NOT EXISTS transactions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    subscription_id UUID REFERENCES subscriptions(id) ON DELETE CASCADE,
    razorpay_payment_id TEXT UNIQUE NOT NULL,
    razorpay_order_id TEXT NOT NULL,
    razorpay_signature TEXT,
    amount INTEGER NOT NULL, -- Amount in paise (INR)
    currency TEXT DEFAULT 'INR' NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
    payment_method TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Create subscription plans table (optional - for easier management)
CREATE TABLE IF NOT EXISTS subscription_plans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    duration_months INTEGER NOT NULL,
    price_inr INTEGER NOT NULL, -- Price in paise
    features JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Insert default subscription plans
INSERT INTO subscription_plans (id, name, duration_months, price_inr, features) VALUES
('free', 'Free Plan', 0, 0, '{"profile_pictures": false, "contact_details": false, "profile_count": "unlimited"}'),
('3_months', '3 Months Premium', 3, 17700, '{"profile_pictures": true, "contact_details": true, "profile_count": "unlimited"}'),
('6_months', '6 Months Premium', 6, 29400, '{"profile_pictures": true, "contact_details": true, "profile_count": "unlimited"}')
ON CONFLICT (id) DO UPDATE SET
    price_inr = EXCLUDED.price_inr,
    features = EXCLUDED.features,
    is_active = EXCLUDED.is_active;

-- Function to check if user has active subscription
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

-- Function to expire old subscriptions (can be called via cron)
CREATE OR REPLACE FUNCTION expire_old_subscriptions()
RETURNS INTEGER AS $$
DECLARE
    expired_count INTEGER;
BEGIN
    UPDATE subscriptions 
    SET status = 'expired', updated_at = NOW()
    WHERE status = 'active' 
        AND end_date IS NOT NULL 
        AND end_date < NOW();
    
    GET DIAGNOSTICS expired_count = ROW_COUNT;
    RETURN expired_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Row Level Security (RLS) policies
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;

-- Subscriptions policies
CREATE POLICY "Users can view their own subscriptions" ON subscriptions
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own subscriptions" ON subscriptions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own subscriptions" ON subscriptions
    FOR UPDATE USING (auth.uid() = user_id);

-- Payment orders policies
CREATE POLICY "Users can view their own payment orders" ON payment_orders
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own payment orders" ON payment_orders
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own payment orders" ON payment_orders
    FOR UPDATE USING (auth.uid() = user_id);

-- Transactions policies
CREATE POLICY "Users can view their own transactions" ON transactions
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own transactions" ON transactions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Subscription plans policies (read-only for all authenticated users)
CREATE POLICY "Authenticated users can view subscription plans" ON subscription_plans
    FOR SELECT TO authenticated USING (true);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_end_date ON subscriptions(end_date);
CREATE INDEX IF NOT EXISTS idx_payment_orders_user_id ON payment_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_orders_razorpay_order_id ON payment_orders(razorpay_order_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_payment_id ON transactions(razorpay_payment_id);

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON subscription_plans TO anon, authenticated;
GRANT ALL ON subscriptions TO authenticated;
GRANT ALL ON payment_orders TO authenticated;
GRANT ALL ON transactions TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_subscription_status(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION create_or_update_subscription(UUID, TEXT, TEXT, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION expire_old_subscriptions() TO authenticated; 