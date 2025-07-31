// Subscription Management Utilities for No Rings Attached

class SubscriptionManager {
    constructor(supabaseClient) {
        this.supabase = supabaseClient;
        this.razorpayKeyId = 'rzp_live_mU33VGxlJtN6CF'; // Replace with your actual Razorpay key
    }

    // Check user's current subscription status
    async getUserSubscriptionStatus() {
        try {
            const { data: { user } } = await this.supabase.auth.getUser();
            if (!user) throw new Error('User not authenticated');

            const { data, error } = await this.supabase
                .rpc('get_user_subscription_status', { user_uuid: user.id });

            if (error) throw error;

            return data && data.length > 0 ? data[0] : {
                plan_type: 'free',
                status: 'active',
                end_date: null,
                is_premium: false
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

    // Get subscription plans
    async getSubscriptionPlans() {
        try {
            const { data, error } = await this.supabase
                .from('subscription_plans')
                .select('*')
                .eq('is_active', true)
                .order('duration_months');

            if (error) throw error;
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

            // In a real app, you'd call your backend to create the order
            // For simplicity, we'll create the order directly with Razorpay
            const options = {
                key: this.razorpayKeyId,
                amount: plan.price_inr, // Amount in paise
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

            // Create and open Razorpay checkout
            const rzp = new Razorpay(options);
            rzp.open();

        } catch (error) {
            console.error('Error creating Razorpay order:', error);
            throw error;
        }
    }

    // Handle successful payment
    async handlePaymentSuccess(paymentResponse, planId) {
        try {
            const { data: { user } } = await this.supabase.auth.getUser();
            if (!user) throw new Error('User not authenticated');

            const plans = await this.getSubscriptionPlans();
            const plan = plans.find(p => p.id === planId);

            // Create or update subscription
            const { data, error } = await this.supabase
                .rpc('create_or_update_subscription', {
                    user_uuid: user.id,
                    plan: planId,
                    payment_id: paymentResponse.razorpay_payment_id,
                    order_id: paymentResponse.razorpay_order_id || 'manual_order',
                    amount: plan.price_inr
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

            // Show success message
            this.showNotification('Payment successful! Your subscription has been activated.', 'success');
            
            // Reload page to refresh subscription status
            setTimeout(() => {
                window.location.reload();
            }, 2000);

        } catch (error) {
            console.error('Error handling payment success:', error);
            this.showNotification('Payment processed but there was an error activating your subscription. Please contact support.', 'error');
        }
    }

    // Check if user can access premium content
    async canAccessPremiumContent() {
        const status = await this.getUserSubscriptionStatus();
        return status.is_premium;
    }

    // Show notification
    showNotification(message, type = 'info') {
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
                notification.remove();
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

// Utility functions for content blurring
function blurContent(element, message = 'Subscribe to view full details') {
    if (!element) return;
    
    element.style.filter = 'blur(5px)';
    element.style.position = 'relative';
    element.style.pointerEvents = 'none';
    
    // Add overlay message
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
    
    // Add overlay styles
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

    // Add styles if not already added
    if (!document.getElementById('blur-overlay-styles')) {
        const styleSheet = document.createElement('style');
        styleSheet.id = 'blur-overlay-styles';
        styleSheet.textContent = overlayStyles;
        document.head.appendChild(styleSheet);
    }

    // Position parent relatively if not already
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
    
    // Remove overlay
    const overlay = element.parentElement.querySelector('.blur-overlay');
    if (overlay) {
        overlay.remove();
    }
}

// Export for use in other files
window.SubscriptionManager = SubscriptionManager;
window.blurContent = blurContent;
window.unblurContent = unblurContent; 