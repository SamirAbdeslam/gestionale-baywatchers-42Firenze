# 🔔 Push Notifications Setup Guide

This guide explains how to set up browser push notifications for the Baywatchers event management system.

## Features

Users receive browser push notifications:
- **24 hours before** an event they're registered for
- **1 hour before** the event starts

## Setup Instructions

### 1. Install Dependencies

The required dependencies are already in `requirements.txt`:
```bash
pip install -r requirements.txt
```

This includes:
- `APScheduler` - Background task scheduler
- `pywebpush` - Web Push notification library

### 2. Generate VAPID Keys

VAPID (Voluntary Application Server Identification) keys are required for web push notifications.

Run the generator script:
```bash
python generate_vapid_keys.py
```

This will output something like:
```
VAPID_PUBLIC_KEY=BG8x...
VAPID_PRIVATE_KEY=abc123...
VAPID_EMAIL=mailto:your-email@example.com
```

### 3. Configure Environment Variables

Add the generated keys to your `.env` file:
```bash
# Push Notifications
VAPID_PUBLIC_KEY=<your_public_key>
VAPID_PRIVATE_KEY=<your_private_key>
VAPID_EMAIL=mailto:your-email@example.com
```

⚠️ **Important**: 
- Never commit the private key to version control
- Update `VAPID_EMAIL` with a real contact email
- The email should be in `mailto:` format

### 4. Database Migration

The notification tables are created automatically when you start the app. The `init_db()` function will create:
- `user_notification_preferences` - User notification settings
- `push_subscriptions` - Browser push subscription data
- `scheduled_notifications` - Queue of pending notifications

### 5. Start the Application

```bash
python app.py
```

The notification scheduler will start automatically and check for pending notifications every 5 minutes.

## How It Works

### User Flow

1. **Login**: User logs in to the system
2. **Prompt**: After 3 seconds, user is prompted to enable notifications (if not already dismissed)
3. **Permission**: Browser asks for notification permission
4. **Subscribe**: If granted, the app subscribes to push notifications
5. **Register for Event**: When user registers for an event, two notifications are scheduled:
   - One for 24 hours before the event
   - One for 1 hour before the event
6. **Receive Notifications**: At the scheduled times, users receive browser push notifications
7. **Unregister**: If user unregisters, the scheduled notifications are cancelled

### Technical Flow

1. **Service Worker** (`static/sw.js`): Handles incoming push messages
2. **Push Manager** (`static/push-notifications.js`): Manages subscriptions and permissions
3. **Notification Manager** (`notifications.py`): Backend scheduler and sender
4. **APScheduler**: Runs every 5 minutes to check for pending notifications

### API Endpoints

- `GET /api/vapid-public-key` - Returns public VAPID key for subscription
- `POST /api/push/subscribe` - Saves user's push subscription
- `POST /api/push/unsubscribe` - Removes user's push subscription
- `GET /api/notifications/preferences` - Gets user's notification preferences
- `POST /api/notifications/preferences` - Updates user's notification preferences

## User Preferences

Users can control their notifications from their profile page (`/user/profile`):

- **Enable/Disable all notifications**
- **24-hour reminder** - Toggle on/off
- **1-hour reminder** - Toggle on/off
- **Test notification** - Send a test push notification

## Testing

### Test Locally

1. **Generate VAPID keys**: `python generate_vapid_keys.py`
2. **Add to .env**: Copy the keys to your `.env` file
3. **Start app**: `python app.py`
4. **Login**: Access the app and login
5. **Allow notifications**: Click "Allow" when prompted
6. **Test**: Go to your profile and click "Test Notification"

### Test Event Notifications

To test without waiting 24 hours:

1. Modify `notifications.py` temporarily to use shorter delays:
   ```python
   # Change from:
   notify_24h_time = event_datetime - timedelta(hours=24)
   # To:
   notify_24h_time = event_datetime - timedelta(minutes=2)
   ```

2. Register for an event that starts in a few minutes
3. Wait 2 minutes and you should receive the notification

### Check Scheduler

The APScheduler logs will show:
```
✅ NotificationManager initialized with APScheduler
📅 Scheduled 24h notification for user X, event Y at <time>
⏰ Scheduled 1h notification for user X, event Y at <time>
📨 Sent 24h_before notification for event X to user Y
```

## Troubleshooting

### Notifications Not Working

1. **Check VAPID keys are set** in `.env`
2. **Check browser permissions**: Settings > Site Settings > Notifications
3. **Check console** for JavaScript errors
4. **Check server logs** for scheduler errors
5. **Verify subscription**: Check `push_subscriptions` table in database

### Permission Denied

- User must manually grant notification permission
- Some browsers block notifications in incognito mode
- HTTPS is required (except localhost)

### No Notifications Scheduled

- Check that `event_date` is set on events
- Verify `pool_start` is configured in settings
- Check that user has notifications enabled in preferences
- Verify registration was successful

### Scheduler Not Running

- Check that `notification_manager` initialized successfully
- Look for errors in startup logs
- Verify APScheduler is installed

## Production Considerations

### HTTPS Required

Browser push notifications require HTTPS (except for localhost). Make sure your production deployment uses SSL/TLS.

### VAPID Email

Use a real, monitored email address for `VAPID_EMAIL`. Push services may use this to contact you about issues.

### Database Backups

The `push_subscriptions` table contains sensitive subscription data. Include it in your backup strategy.

### Cleanup

Old sent notifications are automatically cleaned up after 7 days by the scheduler.

### Scaling

For high-traffic deployments:
- Consider using a dedicated task queue (Celery, RQ)
- Use a distributed scheduler for multiple app instances
- Monitor scheduler performance

## Browser Support

Push notifications are supported by:
- ✅ Chrome/Edge (desktop & mobile)
- ✅ Firefox (desktop & mobile)
- ✅ Safari 16+ (macOS, iOS)
- ✅ Opera

## Security

- **VAPID Private Key**: Keep this secret! It's like a password for sending notifications
- **Subscription Data**: Includes endpoint URLs that should not be shared publicly
- **User Consent**: Always get explicit user permission before subscribing

## Additional Resources

- [Web Push Protocol](https://datatracker.ietf.org/doc/html/rfc8030)
- [VAPID Specification](https://datatracker.ietf.org/doc/html/rfc8292)
- [pywebpush Documentation](https://github.com/web-push-libs/pywebpush)
- [Service Workers API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
