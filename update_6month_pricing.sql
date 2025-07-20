-- Update 6-month plan pricing from ₹799 to ₹749
-- This updates the subscription_plans table to reflect the new pricing

UPDATE subscription_plans 
SET 
    price_inr = 74900,  -- ₹749 in paise
    updated_at = NOW()
WHERE id = '6_months';

-- Verify the update
SELECT id, name, duration_months, price_inr, is_active 
FROM subscription_plans 
WHERE id = '6_months'; 