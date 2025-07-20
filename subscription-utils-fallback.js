// Temporary fallback version of SubscriptionManager for testing
// Use this if database functions are not yet created

class SubscriptionManagerFallback {
    constructor(supabaseClient) {
        this.supabase = supabaseClient;
        this.razorpayKeyId = 'rzp_live_XNy50iFwlZctcc'; // Your Razorpay key
    }

    // Fallback method - checks subscription table directly
    async getUserSubscriptionStatus() {
        try {
            const { data: { user } } = await this.supabase.auth.getUser();
            if (!user) throw new Error('User not authenticated');

            // Try to get subscription directly from table
            const { data: subscription, error } = await this.supabase
                .from('subscriptions')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            if (error && error.code !== 'PGRST116') {
                console.error('Error getting subscription:', error);
                // Return free plan as fallback
                return {
                    plan_type: 'free',
                    status: 'active',
                    end_date: null,
                    is_premium: false
                };
            }

            if (!subscription) {
                return {
                    plan_type: 'free',
                    status: 'active',
                    end_date: null,
                    is_premium: false
                };
            }

            // Check if subscription is still active
            const now = new Date();
            const endDate = subscription.end_date ? new Date(subscription.end_date) : null;
            const isActive = subscription.status === 'active' && (!endDate || endDate > now);
            const isPremium = isActive && ['3_months', '6_months'].includes(subscription.plan_type);

            return {
                plan_type: subscription.plan_type,
                status: isActive ? 'active' : 'expired',
                end_date: subscription.end_date,
                is_premium: isPremium
            };

        } catch (error) {
            console.error('Error getting subscription status:', error);
            return {
                plan_type: 'free',
                status: 'active',
                end_date: null,
                is_premium: false
            };
        }
    }

    // Get subscription plans from table
    async getSubscriptionPlans() {
        try {
            const { data, error } = await this.supabase
                .from('subscription_plans')
                .select('*')
                .eq('is_active', true)
                .order('duration_months');

            if (error) {
                console.error('Error getting plans:', error);
                // Return hardcoded plans as fallback
                return [
                    {
                        id: 'free',
                        name: 'Free Plan',
                        duration_months: 0,
                        price_inr: 0,
                        features: {},
                        is_active: true
                    },
                    {
                        id: '3_months',
                        name: '3 Months Premium',
                        duration_months: 3,
                        price_inr: 49900,
                        features: {},
                        is_active: true
                    },
                    {
                        id: '6_months',
                        name: '6 Months Premium',
                        duration_months: 6,
                        price_inr: 74900,
                        features: {},
                        is_active: true
                    }
                ];
            }
            return data || [];
        } catch (error) {
            console.error('Error getting subscription plans:', error);
            return [];
        }
    }

    // Create Razorpay order
    async createRazorpayOrder(planId) {
        try {
            const plans = await this.getSubscriptionPlans();
            const plan = plans.find(p => p.id === planId);
            
            if (!plan) throw new Error('Plan not found');

            const { data: { user } } = await this.supabase.auth.getUser();
            if (!user) throw new Error('User not authenticated');

            const options = {
                key: this.razorpayKeyId,
                amount: plan.price_inr,
                currency: 'INR',
                name: 'No Rings Attached',
                description: `${plan.name} Subscription`,
                prefill: {
                    email: user.email,
                },
                theme: {
                    color: '#e4b902'
                },
                handler: (response) => this.handlePaymentSuccess(response, planId),
                modal: {
                    ondismiss: () => {
                        console.log('Payment modal closed');
                    }
                }
            };

            const rzp = new Razorpay(options);
            rzp.open();

        } catch (error) {
            console.error('Error creating Razorpay order:', error);
            throw error;
        }
    }

    // Handle successful payment - create subscription manually
    async handlePaymentSuccess(paymentResponse, planId) {
        try {
            const { data: { user } } = await this.supabase.auth.getUser();
            if (!user) throw new Error('User not authenticated');

            const plans = await this.getSubscriptionPlans();
            const plan = plans.find(p => p.id === planId);

            // Calculate end date
            let endDate = null;
            if (planId === '3_months') {
                endDate = new Date();
                endDate.setMonth(endDate.getMonth() + 3);
            } else if (planId === '6_months') {
                endDate = new Date();
                endDate.setMonth(endDate.getMonth() + 6);
            }

            // Create subscription record manually
            const { data, error } = await this.supabase
                .from('subscriptions')
                .upsert([{
                    user_id: user.id,
                    plan_type: planId,
                    status: 'active',
                    start_date: new Date().toISOString(),
                    end_date: endDate ? endDate.toISOString() : null,
                    razorpay_payment_id: paymentResponse.razorpay_payment_id,
                    razorpay_order_id: paymentResponse.razorpay_order_id || 'manual_order',
                    amount_paid: plan.price_inr,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                }], { 
                    onConflict: 'user_id' 
                });

            if (error) throw error;

            // Create transaction record
            await this.supabase
                .from('transactions')
                .insert([{
                    user_id: user.id,
                    razorpay_payment_id: paymentResponse.razorpay_payment_id,
                    razorpay_order_id: paymentResponse.razorpay_order_id || 'manual_order',
                    razorpay_signature: paymentResponse.razorpay_signature,
                    amount: plan.price_inr,
                    status: 'completed'
                }]);

            this.showNotification('Payment successful! Your subscription has been activated.', 'success');
            
            setTimeout(() => {
                window.location.reload();
            }, 2000);

        } catch (error) {
            console.error('Error handling payment success:', error);
            this.showNotification('Payment processed but there was an error activating your subscription. Please contact support.', 'error');
        }
    }

    async canAccessPremiumContent() {
        const status = await this.getUserSubscriptionStatus();
        return status.is_premium;
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `subscription-notification ${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <span>${message}</span>
                <button onclick="this.parentElement.parentElement.remove()">&times;</button>
            </div>
        `;
        
        const styles = `
            .subscription-notification {
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 15px 20px;
                border-radius: 8px;
                color: white;
                z-index: 10000;
                max-width: 400px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            }
            .subscription-notification.success { background-color: #10B981; }
            .subscription-notification.error { background-color: #EF4444; }
            .subscription-notification.info { background-color: #3B82F6; }
            .notification-content {
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 10px;
            }
            .notification-content button {
                background: none;
                border: none;
                color: white;
                font-size: 18px;
                cursor: pointer;
                padding: 0;
                width: 20px;
                height: 20px;
                display: flex;
                align-items: center;
                justify-content: center;
            }
        `;

        if (!document.getElementById('subscription-notification-styles')) {
            const styleSheet = document.createElement('style');
            styleSheet.id = 'subscription-notification-styles';
            styleSheet.textContent = styles;
            document.head.appendChild(styleSheet);
        }

        document.body.appendChild(notification);

        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 5000);
    }

    formatPrice(priceInPaise) {
        return `₹${(priceInPaise / 100).toLocaleString('en-IN')}`;
    }

    getPlanFeatures(planId) {
        const features = {
            'free': [
                'View all profiles (without pictures)',
                'Basic profile information',
                'Limited contact details'
            ],
            '3_months': [
                'View all profile pictures',
                'Full contact details access',
                'Premium member badge',
                '3 months full access'
            ],
            '6_months': [
                'View all profile pictures', 
                'Full contact details access',
                'Premium member badge',
                '6 months full access',
                'Best value plan'
            ]
        };

        return features[planId] || [];
    }
}

// Export the fallback version
window.SubscriptionManager = SubscriptionManagerFallback; 