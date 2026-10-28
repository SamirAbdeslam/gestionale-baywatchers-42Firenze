-- Legacy init_db schema, including effective ALTER TABLE columns.
-- week and wallet already exist in CREATE TABLE, so their duplicate ALTERs are omitted.

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    intra_id INTEGER UNIQUE NOT NULL,
    login TEXT UNIQUE NOT NULL,
    email TEXT,
    display_name TEXT,
    image_url TEXT,
    wallet INTEGER DEFAULT 0,
    is_admin BOOLEAN DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    day TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    max_slots INTEGER DEFAULT 10,
    registered INTEGER DEFAULT 0,
    compensation INTEGER DEFAULT 0,
    week INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

INSERT OR IGNORE INTO settings (key, value) VALUES ('active_week', '1');

INSERT OR IGNORE INTO settings (key, value) VALUES ('display_week', '1');

INSERT OR IGNORE INTO settings (key, value) VALUES ('max_events_per_user', '0');

CREATE TABLE IF NOT EXISTS registrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    participant_name TEXT NOT NULL,
    registration_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES events(id)
);

CREATE TABLE IF NOT EXISTS week_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    target_week INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS template_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    day TEXT NOT NULL,
    event_date DATE,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    max_slots INTEGER DEFAULT 10,
    compensation INTEGER DEFAULT 0,
    FOREIGN KEY (template_id) REFERENCES week_templates(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS baywatcher_whitelist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    intra_login TEXT UNIQUE NOT NULL,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS action_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME NOT NULL,
    user_id INTEGER NOT NULL,
    username TEXT NOT NULL,
    action_type TEXT NOT NULL,
    action_description TEXT,
    ip_address TEXT,
    user_agent TEXT,
    resource_id TEXT,
    resource_type TEXT,
    old_value TEXT,
    new_value TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_logs_timestamp 
ON action_logs(timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_logs_user 
ON action_logs(user_id);

CREATE TABLE IF NOT EXISTS user_notification_preferences (
    user_id INTEGER PRIMARY KEY,
    notifications_enabled BOOLEAN DEFAULT 1,
    notify_24h_before BOOLEAN DEFAULT 1,
    notify_1h_before BOOLEAN DEFAULT 1,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS scheduled_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    event_id INTEGER NOT NULL,
    registration_id INTEGER NOT NULL,
    notification_type TEXT NOT NULL,
    scheduled_time DATETIME NOT NULL,
    sent BOOLEAN DEFAULT 0,
    sent_at DATETIME,
    error_message TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (event_id) REFERENCES events(id),
    FOREIGN KEY (registration_id) REFERENCES registrations(id)
);

CREATE INDEX IF NOT EXISTS idx_notifications_scheduled 
ON scheduled_notifications(scheduled_time, sent);

CREATE INDEX IF NOT EXISTS idx_notifications_user 
ON scheduled_notifications(user_id);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user 
ON push_subscriptions(user_id);

ALTER TABLE events ADD COLUMN event_date DATE;

ALTER TABLE registrations ADD COLUMN attended BOOLEAN DEFAULT 1;
