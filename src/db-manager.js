export class DBManager {
  constructor(db) {
    this.db = db;
  }

  async addSubscription(userId, rssUrl, siteName) {
    try {
      await this.db.prepare(
        'INSERT INTO subscriptions (user_id, rss_url, site_name) VALUES (?, ?, ?)'
      ).bind(userId, rssUrl, siteName).run();
      return true;
    } catch (error) {
      if (error.message.includes('UNIQUE constraint failed')) {
        return false; // 已存在
      }
      throw error;
    }
  }

  async checkSubscriptionExists(userId, rssUrl) {
    const result = await this.db.prepare(
      'SELECT id FROM subscriptions WHERE user_id = ? AND rss_url = ?'
    ).bind(userId, rssUrl).first();
    return !!result;
  }

  async deleteSubscription(userId, rssUrl) {
    try {
      const result = await this.db.prepare(
        'DELETE FROM subscriptions WHERE user_id = ? AND rss_url = ?'
      ).bind(userId, rssUrl).run();
      return result.changes > 0;
    } catch (error) {
      console.error('删除订阅时发生错误:', error);
      return false;
    }
  }

  async getUserSubscriptions(userId) {
    const result = await this.db.prepare(
      'SELECT * FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC'
    ).bind(userId).all();
    return result.results || [];
  }

  async getAllSubscriptions() {
    const result = await this.db.prepare(
      'SELECT DISTINCT user_id, rss_url, site_name FROM subscriptions'
    ).all();
    return result.results || [];
  }

  async checkItemExists(rssUrl, guid) {
    const result = await this.db.prepare(
      'SELECT id FROM rss_items WHERE rss_url = ? AND item_guid = ?'
    ).bind(rssUrl, guid).first();
    return !!result;
  }

  async saveRSSItem(rssUrl, item) {
    try {
      await this.db.prepare(
        'INSERT INTO rss_items (rss_url, item_guid, title, link, published_at) VALUES (?, ?, ?, ?, ?)'
      ).bind(
        rssUrl,
        item.guid,
        item.title,
        item.link || null,
        item.publishedAt || null
      ).run();
    } catch (error) {
      if (!error.message.includes('UNIQUE constraint failed')) {
        throw error;
      }
    }
  }

  async cleanupOldItems(days = 30) {
    await this.db.prepare(
      'DELETE FROM rss_items WHERE created_at < datetime("now", "-" || ? || " days")'
    ).bind(days).run();
  }
}
