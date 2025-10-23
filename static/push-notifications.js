/**
 * Push Notification Manager
 * Handles registration, subscription, and permission requests for browser push notifications
 */

class PushNotificationManager {
    constructor() {
        this.swRegistration = null;
        this.isSubscribed = false;
        this.applicationServerKey = null;
    }

    /**
     * Initialize push notifications
     */
    async init() {
        // Check if service workers and push are supported
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            console.warn('Push notifications are not supported by this browser');
            return false;
        }

        try {
            // Register service worker
            this.swRegistration = await navigator.serviceWorker.register('/static/sw.js');
            console.log('Service Worker registered:', this.swRegistration);

            // Get VAPID public key from server
            const response = await fetch('/api/vapid-public-key');
            if (response.ok) {
                const data = await response.json();
                this.applicationServerKey = this.urlBase64ToUint8Array(data.publicKey);
            } else {
                console.warn('Could not fetch VAPID public key');
                return false;
            }

            // Check current subscription status
            const subscription = await this.swRegistration.pushManager.getSubscription();
            this.isSubscribed = subscription !== null;

            if (this.isSubscribed) {
                console.log('User is already subscribed to push notifications');
            }

            return true;
        } catch (error) {
            console.error('Error initializing push notifications:', error);
            return false;
        }
    }

    /**
     * Request permission and subscribe to push notifications
     */
    async subscribe() {
        try {
            // Request permission
            const permission = await Notification.requestPermission();
            
            if (permission !== 'granted') {
                console.warn('Notification permission denied');
                return false;
            }

            // Subscribe to push notifications
            const subscription = await this.swRegistration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: this.applicationServerKey
            });

            console.log('User is subscribed:', subscription);

            // Send subscription to server
            const response = await fetch('/api/push/subscribe', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(subscription.toJSON())
            });

            if (response.ok) {
                this.isSubscribed = true;
                console.log('Subscription sent to server successfully');
                return true;
            } else {
                console.error('Failed to send subscription to server');
                return false;
            }
        } catch (error) {
            console.error('Error subscribing to push notifications:', error);
            return false;
        }
    }

    /**
     * Unsubscribe from push notifications
     */
    async unsubscribe() {
        try {
            const subscription = await this.swRegistration.pushManager.getSubscription();
            
            if (!subscription) {
                console.log('No subscription to unsubscribe from');
                return true;
            }

            // Unsubscribe locally
            await subscription.unsubscribe();
            
            // Remove from server
            const response = await fetch('/api/push/unsubscribe', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(subscription.toJSON())
            });

            this.isSubscribed = false;
            console.log('User unsubscribed from push notifications');
            return true;
        } catch (error) {
            console.error('Error unsubscribing from push notifications:', error);
            return false;
        }
    }

    /**
     * Check if user is currently subscribed
     */
    async checkSubscription() {
        if (!this.swRegistration) {
            return false;
        }

        const subscription = await this.swRegistration.pushManager.getSubscription();
        this.isSubscribed = subscription !== null;
        return this.isSubscribed;
    }

    /**
     * Convert VAPID key from base64 to Uint8Array
     */
    urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding)
            .replace(/\-/g, '+')
            .replace(/_/g, '/');

        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);

        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    }

    /**
     * Show a prompt to enable notifications
     */
    showEnablePrompt() {
        // You can customize this prompt UI
        const enable = confirm(
            '🔔 Vuoi ricevere notifiche per gli eventi a cui ti iscrivi?\n\n' +
            'Ti avviseremo 24 ore e 1 ora prima di ogni evento.'
        );

        if (enable) {
            return this.subscribe();
        }
        return Promise.resolve(false);
    }
}

// Global instance
const pushManager = new PushNotificationManager();

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    const initialized = await pushManager.init();
    
    // Only show prompt if not already subscribed and user is logged in
    if (initialized && !pushManager.isSubscribed) {
        // Check if user has already dismissed the prompt
        const dismissed = localStorage.getItem('notification-prompt-dismissed');
        
        if (!dismissed) {
            // Show prompt after a short delay
            setTimeout(() => {
                pushManager.showEnablePrompt().then(subscribed => {
                    if (!subscribed) {
                        // Remember that user dismissed
                        localStorage.setItem('notification-prompt-dismissed', 'true');
                    } else {
                        // Clear dismissed flag if they enabled
                        localStorage.removeItem('notification-prompt-dismissed');
                    }
                });
            }, 3000); // Wait 3 seconds before showing prompt
        }
    }
});

// Export for use in other scripts
window.pushManager = pushManager;
