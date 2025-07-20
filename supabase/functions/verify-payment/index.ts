import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createHmac } from "https://deno.land/std@0.168.0/node/crypto.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    )

    // Get the authorization header
    const authHeader = req.headers.get('Authorization')!
    
    // Get user from JWT token
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(
      authHeader.replace('Bearer ', '')
    )

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Parse request body
    const { 
      razorpay_order_id, 
      razorpay_payment_id, 
      razorpay_signature 
    } = await req.json()

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return new Response(
        JSON.stringify({ error: 'Missing payment verification data' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Get Razorpay key secret
    const razorpayKeySecret = Deno.env.get('RAZORPAY_KEY_SECRET')
    if (!razorpayKeySecret) {
      return new Response(
        JSON.stringify({ error: 'Razorpay configuration missing' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Verify Razorpay signature
    const body = razorpay_order_id + "|" + razorpay_payment_id
    const expectedSignature = createHmac('sha256', razorpayKeySecret)
      .update(body)
      .digest('hex')

    if (expectedSignature !== razorpay_signature) {
      return new Response(
        JSON.stringify({ error: 'Payment verification failed' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Get order details from database
    const { data: orderData, error: orderError } = await supabaseClient
      .from('payment_orders')
      .select('*')
      .eq('razorpay_order_id', razorpay_order_id)
      .eq('user_id', user.id)
      .single()

    if (orderError || !orderData) {
      return new Response(
        JSON.stringify({ error: 'Order not found' }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Get plan details
    const { data: plan, error: planError } = await supabaseClient
      .from('subscription_plans')
      .select('*')
      .eq('id', orderData.plan_id)
      .single()

    if (planError || !plan) {
      return new Response(
        JSON.stringify({ error: 'Plan not found' }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Calculate subscription end date
    let endDate = null
    if (plan.duration_months > 0) {
      const startDate = new Date()
      endDate = new Date(startDate)
      endDate.setMonth(endDate.getMonth() + plan.duration_months)
    }

    // Create or update subscription
    const { error: subscriptionError } = await supabaseClient
      .from('subscriptions')
      .upsert([{
        user_id: user.id,
        plan_type: plan.id,
        status: 'active',
        start_date: new Date().toISOString(),
        end_date: endDate ? endDate.toISOString() : null,
        razorpay_payment_id: razorpay_payment_id,
        razorpay_order_id: razorpay_order_id,
        amount_paid: plan.price_inr,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }], { 
        onConflict: 'user_id' 
      })

    if (subscriptionError) {
      console.error('Error creating subscription:', subscriptionError)
      return new Response(
        JSON.stringify({ error: 'Failed to activate subscription' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Create transaction record
    const { error: transactionError } = await supabaseClient
      .from('transactions')
      .insert([{
        user_id: user.id,
        razorpay_payment_id: razorpay_payment_id,
        razorpay_order_id: razorpay_order_id,
        razorpay_signature: razorpay_signature,
        amount: plan.price_inr,
        status: 'completed',
        payment_method: 'razorpay',
        created_at: new Date().toISOString()
      }])

    if (transactionError) {
      console.error('Error creating transaction record:', transactionError)
      // Don't fail the request, subscription is already created
    }

    // Update order status
    await supabaseClient
      .from('payment_orders')
      .update({ 
        status: 'completed',
        updated_at: new Date().toISOString()
      })
      .eq('id', orderData.id)

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Payment verified and subscription activated',
        subscription: {
          plan_type: plan.id,
          plan_name: plan.name,
          start_date: new Date().toISOString(),
          end_date: endDate ? endDate.toISOString() : null,
          status: 'active'
        }
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Payment verification error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
}) 