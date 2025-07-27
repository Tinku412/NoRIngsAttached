# Subscription System Setup Guide

This guide explains how to set up the subscription system for No Rings Attached with Razorpay payment gateway and Supabase.

## Prerequisites

- Supabase account and project
- Razorpay account (test/live)
- Access to Supabase SQL editor

## Step 1: Database Setup

1. Open your Supabase project dashboard
2. Go to the SQL Editor
3. Run the SQL commands from `database_schema.sql` to create the necessary tables and functions

## Step 2: Razorpay Setup

1. **Get Razorpay Credentials:**
   - Sign up at [razorpay.com](https://razorpay.com)
   - Get your Key ID and Key Secret from the dashboard
   - For testing, use test credentials (they start with `rzp_test_`)

2. **Update Razorpay Key:**
   - Open `subscription-utils.js`
   - Replace `rzp_test_0sxEbp8PnhPOru` with your actual Razorpay Key ID
   ```javascript
   this.razorpayKeyId = 'your_razorpay_key_id_here';
   ```

## Step 3: Supabase Configuration

1. **Row Level Security (RLS):**
   - The database schema automatically sets up RLS policies
   - Ensure your Supabase project has RLS enabled

2. **Test Database Functions:**
   ```sql
   -- Test the subscription status function
   SELECT * FROM get_user_subscription_status('your-user-id-here');
   
   -- Test creating a subscription
   SELECT create_or_update_subscription('your-user-id-here', '3_months', 'test_payment_id', 'test_order_id', 17700);
   ```

## Step 4: Features Implementation

### Free Users Restrictions:
- ✅ Profile pictures are blurred with upgrade overlay
- ✅ Contact details are hidden/blurred
- ✅ Can view all profile basic information

### Premium Users (3 months / 6 months):
- ✅ Full access to profile pictures
- ✅ Access to contact details
- ✅ Premium member indicators

## Step 5: Testing

### Test Payment Flow:

1. **Test Cards for Razorpay:**
   ```
   Success: 4111 1111 1111 1111
   CVV: Any 3 digits
   Expiry: Any future date
   ```

2. **Test Subscription Flow:**
   - Visit `/subscription.html`
   - Select a plan (3 months or 6 months)
   - Complete payment with test card
   - Check if subscription is activated

3. **Test Access Control:**
   - Before subscription: Images should be blurred
   - After subscription: Images should be visible
   - Check contact details access

## Step 6: Going Live

1. **Switch to Live Razorpay:**
   - Get live credentials from Razorpay dashboard
   - Update the key in `subscription-utils.js`
   - Enable live mode in Razorpay dashboard

2. **Webhook Setup (Optional):**
   - Set up Razorpay webhooks for payment verification
   - Update subscription status automatically

## Subscription Plans

| Plan | Duration | Price | Features |
|------|----------|-------|----------|
| Free | Lifetime | ₹0 | Basic profiles (no images/contact) |
| 3 Months | 3 months | ₹177 | Full access to all features |
| 6 Months | 6 months | ₹294 | Full access to all features |

## File Structure

```
├── database_schema.sql         # Database tables and functions
├── subscription.html          # Subscription plans page
├── subscription-utils.js      # Subscription management utilities
├── profiles.html             # Updated with subscription logic
├── profile-details.html      # Updated with subscription logic
├── index.html               # Updated with subscription link
└── SUBSCRIPTION_SETUP.md    # This setup guide
```

## Troubleshooting

### Common Issues:

1. **Payment not processing:**
   - Check Razorpay key ID is correct
   - Ensure test mode is enabled for testing
   - Check browser console for errors

2. **Subscription not activating:**
   - Verify database functions are created successfully
   - Check Supabase RLS policies
   - Ensure user is authenticated

3. **Images still blurred after payment:**
   - Clear browser cache
   - Check subscription status in database
   - Verify subscription expiry date

### Database Queries for Debugging:

```sql
-- Check user's subscription
SELECT * FROM subscriptions WHERE user_id = 'user-id-here';

-- Check transactions
SELECT * FROM transactions WHERE user_id = 'user-id-here';

-- Check subscription plans
SELECT * FROM subscription_plans;

-- Expire old subscriptions manually
SELECT expire_old_subscriptions();
```

## Security Notes

- Never expose Razorpay Key Secret in frontend code
- Use HTTPS in production
- Validate payments on server-side (recommended)
- Monitor transaction logs regularly

## Support

For issues with:
- Razorpay: [razorpay.com/support](https://razorpay.com/support)
- Supabase: [supabase.com/docs](https://supabase.com/docs)

## Future Enhancements

Consider implementing:
- Server-side payment verification
- Automatic subscription renewal
- Pro-rated upgrades/downgrades
- Usage analytics
- Email notifications for subscription events 