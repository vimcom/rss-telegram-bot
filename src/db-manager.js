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

  // 添加失败记录跟踪
  async recordFailure(rssUrl, errorMessage) {
    try {
      await this.db.prepare(`
        INSERT OR REPLACE INTO rss_failures 
        (rss_url, error_message, failure_count, last_failure, created_at) 
        VALUES (
          ?, ?, 
          COALESCE((SELECT failure_count FROM rss_failures WHERE rss_url = ?), 0) + 1,
          CURRENT_TIMESTAMP,
          COALESCE((SELECT created_at FROM rss_failures WHERE rss_url = ?), CURRENT_TIMESTAMP)
        )
      `).bind(rssUrl, errorMessage, rssUrl, rssUrl).run();
    } catch (error) {
      console.error('记录失败信息失败:', error);
    }
  }

  async getFailedSubscriptions() {
    try {
      const result = await this.db.prepare(`
        SELECT f.*, s.site_name, s.user_id
        FROM rss_failures f
        LEFT JOIN subscriptions s ON f.rss_url = s.rss_url
        WHERE f.failure_count >= 3
        ORDER BY f.last_failure DESC
      `).all();
      return result.results || [];
    } catch (error) {
      console.error('获取失败订阅失败:', error);
      return [];
    }
  }

  async clearFailureRecord(rssUrl) {
    try {
      await this.db.prepare('DELETE FROM rss_failures WHERE rss_url = ?').bind(rssUrl).run();
    } catch (error) {
      console.error('清除失败记录失败:', error);
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
    try {
      // 删除旧的RSS文章记录
      const result = await this.db.prepare(
        'DELETE FROM rss_items WHERE created_at < datetime("now", "-" || ? || " days")'
      ).bind(days).run();
      
      console.log(`清理了 ${result.changes} 条旧记录`);
      return result.changes;
    } catch (error) {
      console.error('清理旧记录失败:', error);
      return 0;
    }
  }

  // 获取统计信息
  async getStats() {
    try {
      const subCount = await this.db.prepare('SELECT COUNT(*) as count FROM subscriptions').first();
      const itemCount = await this.db.prepare('SELECT COUNT(*) as count FROM rss_items').first();
      const userCount = await this.db.prepare('SELECT COUNT(DISTINCT user_id) as count FROM subscriptions').first();
      
      return {
        subscriptions: subCount?.count || 0,
        items: itemCount?.count || 0,
        users: userCount?.count || 0
      };
    } catch (error) {
      console.error('获取统计信息失败:', error);
      return { subscriptions: 0, items: 0, users: 0 };
    }
  }
}
