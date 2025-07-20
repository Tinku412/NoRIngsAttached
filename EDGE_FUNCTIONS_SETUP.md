# Subscription System with Supabase Edge Functions Setup Guide

This guide shows how to set up the subscription system using Supabase Edge Functions for secure server-side processing.

## 🚀 **Why Edge Functions?**

### **Benefits:**
- ✅ **Secure**: Razorpay secrets stay on server-side
- ✅ **No Complex Server**: Serverless functions
- ✅ **Payment Verification**: Server-side signature verification
- ✅ **Automatic Scaling**: Supabase handles scaling
- ✅ **Simple Deployment**: Deploy directly from Supabase CLI

### **vs Previous Approach:**
- **Before**: Client-side only (less secure)
- **Now**: Server-side order creation and verification (production-ready)

## 📋 **Prerequisites**

1. **Supabase CLI installed**
   ```bash
   npm install -g supabase
   ```

2. **Supabase project linked**
   ```bash
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   ```

3. **Razorpay account** with Key ID and Key Secret

## 🗄️ **Step 1: Database Setup**

Run the updated `database_schema.sql` in your Supabase SQL Editor:

```sql
-- This creates all tables including the new payment_orders table
-- Copy and paste the entire database_schema.sql content
```

**New table added:**
- `payment_orders`: Stores order details for verification

## 🔧 **Step 2: Deploy Edge Functions**

### **2.1 Deploy the Functions**

```bash
# Deploy create-razorpay-order function
supabase functions deploy create-razorpay-order

# Deploy verify-payment function  
supabase functions deploy verify-payment
```

### **2.2 Set Environment Variables**

Set up your Razorpay keys securely:

```bash
# Set Razorpay keys
supabase secrets set RAZORPAY_KEY_ID=rzp_live_XNy50iFwlZctcc
supabase secrets set RAZORPAY_KEY_SECRET=your_razorpay_key_secret_here

# Verify secrets are set
supabase secrets list
```

**Important**: Never commit your `RAZORPAY_KEY_SECRET` to git!

## 🎯 **Step 3: Update Frontend**

### **3.1 Switch to Edge Functions Version**

Replace the subscription utilities import:

```html
<!-- Before -->
<script src="subscription-utils-fallback.js"></script>

<!-- After -->
<script src="subscription-utils-edge.js"></script>
```

### **3.2 Update Razorpay Key**

In `subscription-utils-edge.js`, make sure your public key is set:

```javascript
this.razorpayKeyId = 'rzp_live_XNy50iFwlZctcc'; // Your actual public key
```

## 🔐 **Step 4: Security Configuration**

### **4.1 Supabase RLS (Row Level Security)**

The database schema automatically sets up RLS policies. Verify they're enabled:

```sql
-- Check RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('subscriptions', 'payment_orders', 'transactions');
```

### **4.2 Edge Function Permissions**

Edge Functions automatically have access to:
- Environment variables (secrets)
- Supabase client with service role permissions
- User authentication context

## 🧪 **Step 5: Testing**

### **5.1 Test Edge Functions**

```bash
# Test locally (optional)
supabase functions serve

# Test create-razorpay-order
curl -X POST 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/create-razorpay-order' \
  -H 'Authorization: Bearer YOUR_USER_JWT_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"planId": "3_months"}'
```

### **5.2 Test Payment Flow**

1. **Create Order**: Click "Subscribe Now" → Edge Function creates Razorpay order
2. **Payment**: Complete payment with test card
3. **Verification**: Edge Function verifies payment and activates subscription

### **5.3 Test Cards**

```
Success: 4111 1111 1111 1111
Failure: 4000 0000 0000 0002  
CVV: Any 3 digits
Expiry: Any future date
```

## 📁 **File Structure**

```
├── supabase/
│   └── functions/
│       ├── create-razorpay-order/
│       │   └── index.ts
│       └── verify-payment/
│           └── index.ts
├── database_schema.sql
├── subscription-utils-edge.js
├── subscription.html
├── profiles.html
└── profile-details.html
```

## 🔄 **Payment Flow Architecture**

```
Frontend (subscription.html)
    ↓ 1. User clicks "Subscribe"
Edge Function (create-razorpay-order)
    ↓ 2. Creates Razorpay order
Razorpay Checkout
    ↓ 3. User completes payment
Frontend (payment success callback)
    ↓ 4. Sends payment details
Edge Function (verify-payment)
    ↓ 5. Verifies signature & activates subscription
Database (subscriptions table)
    ↓ 6. User gets premium access
```

## 🛠️ **Debugging**

### **Check Edge Function Logs**

```bash
# View function logs
supabase functions logs create-razorpay-order
supabase functions logs verify-payment
```

### **Common Issues**

1. **"Function not found"**
   - Ensure functions are deployed: `supabase functions list`
   - Check function names match exactly

2. **"Environment variable not found"**
   - Verify secrets: `supabase secrets list`
   - Redeploy functions after setting secrets

3. **"Payment verification failed"**
   - Check Razorpay key secret is correct
   - Verify signature calculation in logs

4. **CORS errors**
   - Edge Functions include CORS headers
   - Check browser console for specific errors

### **Database Debugging**

```sql
-- Check recent orders
SELECT * FROM payment_orders ORDER BY created_at DESC LIMIT 10;

-- Check user subscriptions
SELECT * FROM subscriptions WHERE user_id = 'user-id-here';

-- Check transactions
SELECT * FROM transactions ORDER BY created_at DESC LIMIT 10;
```

## 🚀 **Going Live**

### **1. Switch to Live Razorpay**

```bash
# Update to live keys
supabase secrets set RAZORPAY_KEY_ID=rzp_live_YOUR_LIVE_KEY
supabase secrets set RAZORPAY_KEY_SECRET=your_live_secret_here

# Update frontend
# subscription-utils-edge.js: this.razorpayKeyId = 'rzp_live_YOUR_LIVE_KEY'
```

### **2. Enable Webhooks (Optional)**

For additional security, set up Razorpay webhooks:
- URL: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/razorpay-webhook`
- Events: `payment.captured`, `payment.failed`

### **3. Production Checklist**

- ✅ Live Razorpay keys configured
- ✅ Edge Functions deployed and tested
- ✅ Database RLS policies enabled
- ✅ SSL certificate (automatic with Supabase)
- ✅ Error handling and logging in place

## 💰 **Pricing & Limits**

### **Supabase Edge Functions:**
- **Free Tier**: 500,000 invocations/month
- **Pro**: $25/month for 2M invocations
- **Perfect for subscription system**: ~2 calls per payment

### **Razorpay Pricing:**
- **Domestic**: 2% per transaction
- **International**: 3% per transaction
- **No setup fees**

## 🔧 **Advanced Configuration**

### **Custom Domain (Optional)**
```bash
# If using custom domain
supabase domains create YOUR_DOMAIN
```

### **Monitoring & Alerts**
Set up alerts for:
- Failed payments
- Edge Function errors
- Subscription expirations

## 📞 **Support & Resources**

- **Supabase Docs**: [supabase.com/docs/guides/functions](https://supabase.com/docs/guides/functions)
- **Razorpay Docs**: [razorpay.com/docs](https://razorpay.com/docs)
- **Edge Functions**: Built on Deno runtime

## 🎯 **Next Steps**

After setup:
1. Test thoroughly with real payments
2. Monitor Edge Function logs
3. Set up alerts for payment failures
4. Consider implementing webhooks for additional security
5. Add subscription management features (pause, cancel, etc.)

---

This Edge Functions approach gives you production-ready, secure payment processing without managing your own servers! 🎉 