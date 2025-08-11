-- 订阅表
CREATE TABLE subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    rss_url TEXT NOT NULL,
    site_name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, rss_url)
);

-- RSS文章表 (用于防止重复推送)
CREATE TABLE rss_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rss_url TEXT NOT NULL,
    item_guid TEXT NOT NULL,
    title TEXT NOT NULL,
    link TEXT,
    published_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(rss_url, item_guid)
);

-- RSS失败记录表 (用于跟踪访问失败的RSS源)
CREATE TABLE rss_failures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rss_url TEXT NOT NULL UNIQUE,
    error_message TEXT,
    failure_count INTEGER DEFAULT 1,
    last_failure DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
