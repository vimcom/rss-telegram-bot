import { TelegramBot } from './telegram-bot.js';
import { RSSParser } from './rss-parser.js';
import { DBManager } from './db-manager.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Telegram Webhook处理
    if (url.pathname === '/webhook' && request.method === 'POST') {
      const bot = new TelegramBot(env.TELEGRAM_BOT_TOKEN, env.DB);
      const update = await request.json();
      return await bot.handleUpdate(update);
    }
    
    // 手动触发RSS检查
    if (url.pathname === '/check-rss' && request.method === 'GET') {
      await this.checkRSSFeeds(env);
      return new Response('RSS检查完成', { status: 200 });
    }
    
    return new Response('RSS Telegram Bot运行中', { status: 200 });
  },

  // Cron触发的RSS检查
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(this.checkRSSFeeds(env));
  },

  // 检查所有RSS源（优化版本）
  async checkRSSFeeds(env) {
    const dbManager = new DBManager(env.DB);
    const rssParser = new RSSParser();
    const bot = new TelegramBot(env.TELEGRAM_BOT_TOKEN, env.DB);
    
    try {
      // 获取所有订阅
      const subscriptions = await dbManager.getAllSubscriptions();
      
      // 分批处理，避免超时
      const BATCH_SIZE = 50;
      const batches = [];
      for (let i = 0; i < subscriptions.length; i += BATCH_SIZE) {
        batches.push(subscriptions.slice(i, i + BATCH_SIZE));
      }
      
      for (const batch of batches) {
        await Promise.all(batch.map(async (sub) => {
          try {
            const items = await rssParser.parseRSS(sub.rss_url);
            
            for (const item of items) {
              // 检查是否已推送过
              const exists = await dbManager.checkItemExists(sub.rss_url, item.guid);
              
              if (!exists) {
                // 推送到Telegram
                await bot.sendRSSItem(sub.user_id, item, sub.site_name);
                
                // 记录已推送
                await dbManager.saveRSSItem(sub.rss_url, item);
                
                // 延迟避免频率限制
                await new Promise(resolve => setTimeout(resolve, 500));
              }
            }
          } catch (error) {
            console.error(`处理RSS源 ${sub.rss_url} 失败:`, error);
          }
        }));
        
        // 批次间延迟
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      // 清理30天前的旧记录
      await dbManager.cleanupOldItems(30);
      
    } catch (error) {
      console.error('RSS检查失败:', error);
    }
  }
};
