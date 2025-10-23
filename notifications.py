"""
Notification Manager for Browser Push Notifications
Handles scheduling and sending push notifications to users about upcoming events.
"""

import os
import sqlite3
import json
import logging
from datetime import datetime, timedelta
from pywebpush import webpush, WebPushException
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.date import DateTrigger

logger = logging.getLogger(__name__)

class NotificationManager:
    """
    Manages browser push notifications for event reminders.
    Supports:
    - 24 hour before event notifications
    - 1 hour before event notifications
    - Automatic cleanup of old notifications
    """
    
    def __init__(self, db_path, vapid_private_key, vapid_public_key, vapid_claims):
        """
        Initialize the notification manager.
        
        Args:
            db_path: Path to SQLite database
            vapid_private_key: VAPID private key for web push
            vapid_public_key: VAPID public key for web push
            vapid_claims: Dict with 'sub' field (mailto:email@example.com)
        """
        self.db_path = db_path
        self.vapid_private_key = vapid_private_key
        self.vapid_public_key = vapid_public_key
        self.vapid_claims = vapid_claims
        
        # Initialize APScheduler
        self.scheduler = BackgroundScheduler()
        self.scheduler.start()
        
        # Schedule periodic check for pending notifications (every 5 minutes)
        self.scheduler.add_job(
            func=self.check_and_send_pending_notifications,
            trigger='interval',
            minutes=5,
            id='check_notifications',
            replace_existing=True
        )
        
        # Schedule cleanup of old notifications (daily at 3 AM)
        self.scheduler.add_job(
            func=self.cleanup_old_notifications,
            trigger='cron',
            hour=3,
            minute=0,
            id='cleanup_notifications',
            replace_existing=True
        )
        
        logger.info("✅ NotificationManager initialized with APScheduler")
    
    def get_user_preferences(self, user_id):
        """Get user notification preferences."""
        conn = sqlite3.connect(self.db_path)
        c = conn.cursor()
        
        c.execute("""
            SELECT notifications_enabled, notify_24h_before, notify_1h_before
            FROM user_notification_preferences
            WHERE user_id = ?
        """, (user_id,))
        
        result = c.fetchone()
        conn.close()
        
        if result:
            return {
                'enabled': bool(result[0]),
                'notify_24h': bool(result[1]),
                'notify_1h': bool(result[2])
            }
        else:
            # Default preferences if not set
            return {
                'enabled': True,
                'notify_24h': True,
                'notify_1h': True
            }
    
    def schedule_event_notifications(self, user_id, event_id, registration_id, event_datetime):
        """
        Schedule notifications for an event registration.
        
        Args:
            user_id: User ID
            event_id: Event ID
            registration_id: Registration ID
            event_datetime: DateTime object of the event
        """
        # Get user preferences
        prefs = self.get_user_preferences(user_id)
        
        if not prefs['enabled']:
            logger.info(f"User {user_id} has notifications disabled, skipping")
            return
        
        conn = sqlite3.connect(self.db_path)
        c = conn.cursor()
        
        now = datetime.now()
        
        # Schedule 24h notification
        if prefs['notify_24h']:
            notify_24h_time = event_datetime - timedelta(hours=24)
            if notify_24h_time > now:
                c.execute("""
                    INSERT INTO scheduled_notifications 
                    (user_id, event_id, registration_id, notification_type, scheduled_time)
                    VALUES (?, ?, ?, ?, ?)
                """, (user_id, event_id, registration_id, '24h_before', notify_24h_time))
                logger.info(f"📅 Scheduled 24h notification for user {user_id}, event {event_id} at {notify_24h_time}")
        
        # Schedule 1h notification
        if prefs['notify_1h']:
            notify_1h_time = event_datetime - timedelta(hours=1)
            if notify_1h_time > now:
                c.execute("""
                    INSERT INTO scheduled_notifications 
                    (user_id, event_id, registration_id, notification_type, scheduled_time)
                    VALUES (?, ?, ?, ?, ?)
                """, (user_id, event_id, registration_id, '1h_before', notify_1h_time))
                logger.info(f"⏰ Scheduled 1h notification for user {user_id}, event {event_id} at {notify_1h_time}")
        
        conn.commit()
        conn.close()
    
    def cancel_event_notifications(self, registration_id):
        """
        Cancel all scheduled notifications for a registration.
        
        Args:
            registration_id: Registration ID to cancel notifications for
        """
        conn = sqlite3.connect(self.db_path)
        c = conn.cursor()
        
        c.execute("""
            DELETE FROM scheduled_notifications
            WHERE registration_id = ? AND sent = 0
        """, (registration_id,))
        
        deleted_count = c.rowcount
        conn.commit()
        conn.close()
        
        if deleted_count > 0:
            logger.info(f"🗑️ Cancelled {deleted_count} notification(s) for registration {registration_id}")
    
    def send_push_notification(self, user_id, title, body, icon=None, url=None):
        """
        Send a push notification to all user's subscribed devices.
        
        Args:
            user_id: User ID to send notification to
            title: Notification title
            body: Notification body
            icon: Optional icon URL
            url: Optional URL to open when clicked
        """
        conn = sqlite3.connect(self.db_path)
        c = conn.cursor()
        
        # Get all push subscriptions for user
        c.execute("""
            SELECT id, endpoint, p256dh, auth
            FROM push_subscriptions
            WHERE user_id = ?
        """, (user_id,))
        
        subscriptions = c.fetchall()
        conn.close()
        
        if not subscriptions:
            logger.warning(f"No push subscriptions found for user {user_id}")
            return False
        
        # Prepare notification payload
        payload = {
            'title': title,
            'body': body,
            'icon': icon or '/static/favicon.ico',
            'badge': '/static/badge.png',
            'vibrate': [200, 100, 200],
            'requireInteraction': True,
            'tag': f'event-notification',
            'data': {
                'url': url or '/'
            }
        }
        
        success_count = 0
        failed_subscriptions = []
        
        for sub_id, endpoint, p256dh, auth in subscriptions:
            subscription_info = {
                'endpoint': endpoint,
                'keys': {
                    'p256dh': p256dh,
                    'auth': auth
                }
            }
            
            try:
                webpush(
                    subscription_info=subscription_info,
                    data=json.dumps(payload),
                    vapid_private_key=self.vapid_private_key,
                    vapid_claims=self.vapid_claims
                )
                success_count += 1
                logger.info(f"✅ Push notification sent to subscription {sub_id}")
            except WebPushException as e:
                logger.error(f"❌ Failed to send push notification to subscription {sub_id}: {e}")
                # If subscription is invalid (410 Gone), mark for deletion
                if e.response and e.response.status_code == 410:
                    failed_subscriptions.append(sub_id)
        
        # Remove invalid subscriptions
        if failed_subscriptions:
            conn = sqlite3.connect(self.db_path)
            c = conn.cursor()
            for sub_id in failed_subscriptions:
                c.execute("DELETE FROM push_subscriptions WHERE id = ?", (sub_id,))
                logger.info(f"🗑️ Removed invalid subscription {sub_id}")
            conn.commit()
            conn.close()
        
        return success_count > 0
    
    def check_and_send_pending_notifications(self):
        """
        Check for pending notifications that should be sent now.
        Called periodically by APScheduler.
        """
        conn = sqlite3.connect(self.db_path)
        c = conn.cursor()
        
        now = datetime.now()
        
        # Find notifications that should be sent
        c.execute("""
            SELECT sn.id, sn.user_id, sn.event_id, sn.notification_type,
                   e.title, e.day, e.start_time, e.event_date
            FROM scheduled_notifications sn
            JOIN events e ON sn.event_id = e.id
            WHERE sn.sent = 0 AND sn.scheduled_time <= ?
        """, (now,))
        
        pending = c.fetchall()
        
        for notif_id, user_id, event_id, notif_type, event_title, event_day, event_time, event_date in pending:
            try:
                # Prepare notification message
                time_msg = "domani" if notif_type == '24h_before' else "tra 1 ora"
                title = f"Promemoria Evento: {event_title}"
                body = f"Il tuo evento '{event_title}' inizia {time_msg} ({event_day} alle {event_time})"
                
                # Send push notification
                success = self.send_push_notification(
                    user_id=user_id,
                    title=title,
                    body=body,
                    url='/calendar'
                )
                
                if success:
                    # Mark as sent
                    c.execute("""
                        UPDATE scheduled_notifications
                        SET sent = 1, sent_at = ?
                        WHERE id = ?
                    """, (now, notif_id))
                    logger.info(f"📨 Sent {notif_type} notification for event {event_id} to user {user_id}")
                else:
                    # Mark error
                    c.execute("""
                        UPDATE scheduled_notifications
                        SET error_message = ?
                        WHERE id = ?
                    """, ("No active push subscriptions", notif_id))
                    logger.warning(f"⚠️ Could not send notification {notif_id}: no subscriptions")
                
            except Exception as e:
                logger.error(f"❌ Error sending notification {notif_id}: {e}")
                c.execute("""
                    UPDATE scheduled_notifications
                    SET error_message = ?
                    WHERE id = ?
                """, (str(e), notif_id))
        
        conn.commit()
        conn.close()
        
        if pending:
            logger.info(f"📬 Processed {len(pending)} pending notification(s)")
    
    def cleanup_old_notifications(self):
        """
        Clean up old sent notifications (older than 7 days).
        Called daily by APScheduler.
        """
        conn = sqlite3.connect(self.db_path)
        c = conn.cursor()
        
        cutoff_date = datetime.now() - timedelta(days=7)
        
        c.execute("""
            DELETE FROM scheduled_notifications
            WHERE sent = 1 AND sent_at < ?
        """, (cutoff_date,))
        
        deleted = c.rowcount
        conn.commit()
        conn.close()
        
        if deleted > 0:
            logger.info(f"🧹 Cleaned up {deleted} old notification(s)")
    
    def shutdown(self):
        """Shutdown the scheduler gracefully."""
        if self.scheduler.running:
            self.scheduler.shutdown()
            logger.info("NotificationManager scheduler stopped")
