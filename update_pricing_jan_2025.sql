-- Update subscription plan pricing to new amounts
-- 3 months: ₹177 (17700 paise), 6 months: ₹294 (29400 paise)
-- Updated on January 2025

-- Update 3-month plan pricing 
UPDATE subscription_plans 
SET 
    price_inr = 17700,  -- ₹177 in paise
    updated_at = NOW()
WHERE id = '3_months';

-- Update 6-month plan pricing 
UPDATE subscription_plans 
SET 
    price_inr = 29400,  -- ₹294 in paise
    updated_at = NOW()
WHERE id = '6_months';

-- Verify the updates
SELECT id, name, duration_months, price_inr, is_active 
FROM subscription_plans 
WHERE id IN ('3_months', '6_months'); 