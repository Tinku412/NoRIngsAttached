// Subscription Management Utilities using Supabase Edge Functions
// This version uses Edge Functions for secure server-side payment processing

class SubscriptionManagerEdge {
    constructor(supabaseClient) {
        this.supabase = supabaseClient;
        // Only need the public key - secret is handled by Edge Functions
        this.razorpayKeyId = 'rzp_live_mU33VGxlJtN6CF'; // Your public Razorpay key
    }

    // Check user's current subscription status
    async getUserSubscriptionStatus() {
        try {
            const { data: { user } } = await this.supabase.auth.getUser();
            if (!user) throw new Error('User not authenticated');

            // Try using the database function first
            try {
                const { data, error } = await this.supabase
                    .rpc('get_user_subscription_status', { user_uuid: user.id });

                if (!error && data && data.length > 0) {
                    return data[0];
                }
            } catch (functionError) {
                console.log('Database function not available, using fallback method');
            }

            // Fallback: Direct table query
            const { data: subscription, error } = await this.supabase
                .from('subscriptions')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            if (error && error.code !== 'PGRST116') {
                console.error('Error getting subscription:', error);
                return {
                    plan_type: 'free',
                    status: 'active',
                    end_date: null,
                    cancelled_at: null,
                    is_premium: false
                };
            }

            if (!subscription) {
                return {
                    plan_type: 'free',
                    status: 'active',
                    end_date: null,
                    cancelled_at: null,
                    is_premium: false
                };
            }

            // Check if subscription is still active
            const now = new Date();
            const endDate = subscription.end_date ? new Date(subscription.end_date) : null;
            const isActive = ['active', 'cancelled'].includes(subscription.status) && (!endDate || endDate > now);
            const isPremium = isActive && ['3_months', '6_months', 'legacy_premium'].includes(subscription.plan_type);

            return {
                plan_type: subscription.plan_type,
                status: isActive ? subscription.status : 'expired',
                end_date: subscription.end_date,
                cancelled_at: subscription.cancelled_at,
                is_premium: isPremium
            };

        } catch (error) {
            console.error('Error getting subscription status:', error);
            return {
                plan_type: 'free',
                status: 'active',
                end_date: null,
                cancelled_at: null,
                is_premium: false
            };
        }
    }

    // Get subscription plans
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
                        price_inr: 17700,
                        features: {},
                        is_active: true
                    },
                    {
                        id: '6_months',
                        name: '6 Months Premium',
                        duration_months: 6,
                        price_inr: 29400,
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

    // Create Razorpay order via Edge Function
    async createRazorpayOrder(planId) {
        try {
            const { data: { user } } = await this.supabase.auth.getUser();
            if (!user) throw new Error('User not authenticated');

            // Get user's session token
            const { data: { session } } = await this.supabase.auth.getSession();
            if (!session) throw new Error('No active session');

            // Call Edge Function to create order
            const response = await fetch(`${this.supabase.supabaseUrl}/functions/v1/create-razorpay-order`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ planId })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to create order');
            }

            const orderData = await response.json();

            // Create Razorpay checkout options
            const options = {
                key: orderData.keyId,
                amount: orderData.amount,
                currency: orderData.currency,
                name: 'No Rings Attached',
                description: `${orderData.planName} Subscription`,
                order_id: orderData.orderId,
                prefill: {
                    email: orderData.userEmail,
                },
                theme: {
                    color: '#e4b902'
                },
                handler: (response) => this.handlePaymentSuccess(response),
                modal: {
                    ondismiss: () => {
                        console.log('Payment modal closed');
                    }
                }
            };

            // Create and open Razorpay checkout
            const rzp = new Razorpay(options);
            rzp.open();

        } catch (error) {
            console.error('Error creating Razorpay order:', error);
            this.showNotification(error.message || 'Failed to create payment order', 'error');
            throw error;
        }
    }

    // Handle successful payment
    async handlePaymentSuccess(paymentResponse) {
        try {
            const { data: { user } } = await this.supabase.auth.getUser();
            if (!user) throw new Error('User not authenticated');

            // Get user's session token
            const { data: { session } } = await this.supabase.auth.getSession();
            if (!session) throw new Error('No active session');

            this.showNotification('Payment successful! Verifying and activating subscription...', 'info');

            // Call Edge Function to verify payment
            const response = await fetch(`${this.supabase.supabaseUrl}/functions/v1/verify-payment`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    razorpay_order_id: paymentResponse.razorpay_order_id,
                    razorpay_payment_id: paymentResponse.razorpay_payment_id,
                    razorpay_signature: paymentResponse.razorpay_signature
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Payment verification failed');
            }

            const verificationData = await response.json();

            // Show success message
            this.showNotification('Subscription activated successfully!', 'success');
            
            // Reload page to refresh subscription status
            setTimeout(() => {
                window.location.reload();
            }, 2000);

        } catch (error) {
            console.error('Error verifying payment:', error);
            this.showNotification('Payment was processed but verification failed. Please contact support if your subscription is not activated.', 'error');
        }
    }

    // Check if user can access premium content
    async canAccessPremiumContent() {
        const status = await this.getUserSubscriptionStatus();
        return status.is_premium;
    }

    // Show notification
    showNotification(message, type = 'info') {
        // Remove existing notifications
        const existingNotifications = document.querySelectorAll('.subscription-notification');
        existingNotifications.forEach(notification => notification.remove());

        // Create notification element
        const notification = document.createElement('div');
        notification.className = `subscription-notification ${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <span>${message}</span>
                <button onclick="this.parentElement.parentElement.remove()">&times;</button>
            </div>
        `;
        
        // Add styles
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
                animation: slideIn 0.3s ease-out;
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
            @keyframes slideIn {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
        `;

        // Add styles to head if not already added
        if (!document.getElementById('subscription-notification-styles')) {
            const styleSheet = document.createElement('style');
            styleSheet.id = 'subscription-notification-styles';
            styleSheet.textContent = styles;
            document.head.appendChild(styleSheet);
        }

        document.body.appendChild(notification);

        // Auto remove after 5 seconds
        setTimeout(() => {
            if (notification.parentElement) {
                notification.style.animation = 'slideOut 0.3s ease-in forwards';
                setTimeout(() => notification.remove(), 300);
            }
        }, 5000);
    }

    // Format price for display
    formatPrice(priceInPaise) {
        return `&#8377;${(priceInPaise / 100).toLocaleString('en-IN')}`;
    }

    // Format price for UI display with old price strikethrough and monthly rate
    formatPriceWithDiscount(planId, priceInPaise) {
        if (planId === '3_months') {
            const monthlyRate = Math.round(priceInPaise / 3 / 100);
            return `
                <div class="price-display">
                    <span class="old-price">&#8377;499</span>
                    <span class="new-price">&#8377;${(priceInPaise / 100).toLocaleString('en-IN')}</span>
                    <span class="monthly-rate">(&#8377;${monthlyRate}/month)</span>
                </div>
            `;
        } else if (planId === '6_months') {
            const monthlyRate = Math.round(priceInPaise / 6 / 100);
            return `
                <div class="price-display">
                    <span class="old-price">&#8377;749</span>
                    <span class="new-price">&#8377;${(priceInPaise / 100).toLocaleString('en-IN')}</span>
                    <span class="monthly-rate">(&#8377;${monthlyRate}/month)</span>
                </div>
            `;
        }
        return this.formatPrice(priceInPaise);
    }

    // Get plan features for display
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

// Utility functions for content blurring (same as before)
function blurContent(element, message = 'Subscribe to view full details') {
    if (!element) return;
    
    element.style.filter = 'blur(5px)';
    element.style.position = 'relative';
    element.style.pointerEvents = 'none';
    
    const overlay = document.createElement('div');
    overlay.className = 'blur-overlay';
    overlay.innerHTML = `
        <div class="blur-message">
            <i class="fas fa-crown" style="color: #e4b902; margin-bottom: 10px; font-size: 24px;"></i>
            <p>${message}</p>
            <button onclick="window.location.href='subscription.html'" class="upgrade-btn">
                Upgrade Now
            </button>
        </div>
    `;
    
    const overlayStyles = `
        .blur-overlay {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(255, 255, 255, 0.9);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10;
            border-radius: 8px;
        }
        .blur-message {
            text-align: center;
            padding: 20px;
            background: white;
            border-radius: 12px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            border: 2px solid #e4b902;
        }
        .blur-message p {
            margin: 10px 0;
            color: #333;
            font-weight: 500;
        }
        .upgrade-btn {
            background: #e4b902;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 6px;
            cursor: pointer;
            font-weight: 600;
            transition: all 0.3s ease;
        }
        .upgrade-btn:hover {
            background: #d4a502;
            transform: translateY(-1px);
        }
    `;

    if (!document.getElementById('blur-overlay-styles')) {
        const styleSheet = document.createElement('style');
        styleSheet.id = 'blur-overlay-styles';
        styleSheet.textContent = overlayStyles;
        document.head.appendChild(styleSheet);
    }

    const parentPosition = window.getComputedStyle(element.parentElement).position;
    if (parentPosition === 'static') {
        element.parentElement.style.position = 'relative';
    }

    element.parentElement.appendChild(overlay);
}

function unblurContent(element) {
    if (!element) return;
    
    element.style.filter = 'none';
    element.style.pointerEvents = 'auto';
    
    const overlay = element.parentElement.querySelector('.blur-overlay');
    if (overlay) {
        overlay.remove();
    }
}

// Export the Edge Function version
window.SubscriptionManager = SubscriptionManagerEdge;
window.blurContent = blurContent;
window.unblurContent = unblurContent; 