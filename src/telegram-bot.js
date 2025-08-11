import { DBManager } from './db-manager.js';

export class TelegramBot {
  constructor(token, db) {
    this.token = token;
    this.dbManager = new DBManager(db);
    this.apiUrl = `https://api.telegram.org/bot${token}`;
  }

  async handleUpdate(update) {
    try {
      if (update.message) {
        await this.handleMessage(update.message);
      }
      return new Response('OK', { status: 200 });
    } catch (error) {
      console.error('处理更新失败:', error);
      return new Response('Error', { status: 500 });
    }
  }

  async handleMessage(message) {
    const userId = message.from.id.toString();
    const text = message.text?.trim();

    if (!text || !text.startsWith('/')) return;

    const [command, ...args] = text.split(' ');

    switch (command) {
      case '/start':
        await this.sendMessage(userId, '欢迎使用RSS订阅Bot！\n\n可用命令：\n/add <RSS链接> - 添加订阅\n/list - 查看订阅列表\n/del <编号> - 删除订阅\n/help - 帮助信息');
        break;
      
      case '/add':
        await this.handleAddCommand(userId, args);
        break;
      
      case '/list':
        await this.handleListCommand(userId);
        break;
      
      case '/del':
        await this.handleDeleteCommand(userId, args);
        break;
      
      case '/stats':
        await this.handleStatsCommand(userId);
        break;
      
      case '/help':
        await this.sendMessage(userId, 
          '📖 帮助信息：\n\n' +
          '🔗 /add <RSS链接> - 添加单个RSS订阅\n' +
          '🔗 /add <链接1> <链接2> ... - 添加多个RSS订阅\n' +
          '📝 /list - 查看所有订阅\n' +
          '🗑 /del <编号> - 删除单个订阅\n' +
          '🗑 /del <编号1> <编号2> ... - 删除多个订阅\n' +
          '📊 /stats - 查看统计信息\n' +
          '❓ /help - 显示帮助信息'
        );
        break;
      
      default:
        await this.sendMessage(userId, '未知命令，输入 /help 查看帮助');
    }
  }

  async handleAddCommand(userId, args) {
    if (args.length === 0) {
      await this.sendMessage(userId, '请提供RSS链接，例如：/add https://example.com/rss.xml');
      return;
    }

    let addedCount = 0;
    let duplicateCount = 0;
    let errorCount = 0;
    const results = [];

    for (const url of args) {
      try {
        if (!this.isValidUrl(url)) {
          results.push(`❌ 无效链接：${url}`);
          errorCount++;
          continue;
        }

        const siteName = await this.extractSiteName(url);
        const added = await this.dbManager.addSubscription(userId, url, siteName);
        
        if (added) {
          results.push(`✅ 已添加：${siteName}`);
          addedCount++;
        } else {
          results.push(`⚠️ 已订阅：${siteName}`);
          duplicateCount++;
        }
      } catch (error) {
        results.push(`❌ 添加失败：${url}`);
        errorCount++;
      }
    }

    let summary = `📊 操作结果：\n✅ 新增：${addedCount}个\n⚠️ 重复：${duplicateCount}个\n❌ 失败：${errorCount}个\n\n`;
    const message = summary + results.join('\n');
    
    await this.sendMessage(userId, message);
  }

  async handleStatsCommand(userId) {
    try {
      const userStats = await this.dbManager.getUserSubscriptions(userId);
      const globalStats = await this.dbManager.getStats();
      
      const message = 
        `📊 统计信息：\n\n` +
        `👤 您的订阅：${userStats.length} 个\n` +
        `🌐 全局统计：\n` +
        `  └ 总用户：${globalStats.users} 人\n` +
        `  └ 总订阅：${globalStats.subscriptions} 个\n` +
        `  └ 文章记录：${globalStats.items} 条\n\n` +
        `🔄 检查频率：每10分钟\n` +
        `💾 记录保留：30天`;
      
      await this.sendMessage(userId, message);
    } catch (error) {
      console.error('获取统计信息失败:', error);
      await this.sendMessage(userId, '获取统计信息失败，请稍后再试');
    }
  }

  async handleListCommand(userId) {
    const subscriptions = await this.dbManager.getUserSubscriptions(userId);
    
    if (subscriptions.length === 0) {
      await this.sendMessage(userId, '您还没有任何订阅，使用 /add 添加RSS源');
      return;
    }

    let message = `📚 您的订阅列表（${subscriptions.length}个）：\n\n`;
    subscriptions.forEach((sub, index) => {
      message += `${index + 1}. ${sub.site_name}\n🔗 ${sub.rss_url}\n\n`;
    });
    
    message += '💡 使用 /del <编号> 删除订阅';
    await this.sendMessage(userId, message);
  }

  async handleDeleteCommand(userId, args) {
    if (args.length === 0) {
      await this.sendMessage(userId, '请指定要删除的订阅编号，例如：/del 1 或 /del 1 3 5');
      return;
    }

    const subscriptions = await this.dbManager.getUserSubscriptions(userId);
    if (subscriptions.length === 0) {
      await this.sendMessage(userId, '您没有任何订阅');
      return;
    }

    let deletedCount = 0;
    let errorCount = 0;
    const results = [];
    const toDelete = []; // 先收集要删除的项目

    // 验证所有编号并收集要删除的订阅
    for (const arg of args) {
      const index = parseInt(arg) - 1;
      
      if (isNaN(index) || index < 0 || index >= subscriptions.length) {
        results.push(`❌ 无效编号：${arg}`);
        errorCount++;
        continue;
      }

      const subscription = subscriptions[index];
      if (!toDelete.find(item => item.rss_url === subscription.rss_url)) {
        toDelete.push(subscription);
      }
    }

    // 执行删除操作
    for (const subscription of toDelete) {
      try {
        const deleted = await this.dbManager.deleteSubscription(userId, subscription.rss_url);
        
        if (deleted) {
          results.push(`✅ 已删除：${subscription.site_name}`);
          deletedCount++;
        } else {
          // 检查是否真的存在于数据库中
          const stillExists = await this.dbManager.checkSubscriptionExists(userId, subscription.rss_url);
          if (!stillExists) {
            results.push(`✅ 已删除：${subscription.site_name}`);
            deletedCount++;
          } else {
            results.push(`❌ 删除失败：${subscription.site_name}`);
            errorCount++;
          }
        }
      } catch (error) {
        console.error('删除订阅失败:', error);
        results.push(`❌ 删除失败：${subscription.site_name}`);
        errorCount++;
      }
    }

    let summary = `📊 删除结果：\n✅ 成功：${deletedCount}个\n❌ 失败：${errorCount}个\n\n`;
    const message = summary + results.join('\n');
    
    await this.sendMessage(userId, message);
  }

  async sendRSSItem(userId, item, siteName) {
    const title = this.escapeMarkdown(item.title);
    const link = item.link || '';
    const description = this.escapeMarkdown(item.description || '');
    const publishedAt = item.publishedAt || '未知时间';
    
    // 格式化消息：第一行标题+链接，第二行来源+时间
    let message = `🔗 [${title}](${link})\n`;
    if (description) {
      message += `📝 ${description.substring(0, 200)}${description.length > 200 ? '...' : ''}\n`;
    }
    message += `📰 来源：${siteName} | ⏰ ${publishedAt}`;

    await this.sendMessage(userId, message, true);
  }

  async sendMessage(userId, text, parseMode = false) {
    const payload = {
      chat_id: userId,
      text: text,
      disable_web_page_preview: false
    };
    
    if (parseMode) {
      payload.parse_mode = 'Markdown';
    }

    const response = await fetch(`${this.apiUrl}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('发送消息失败:', error);
    }
  }

  isValidUrl(string) {
    try {
      new URL(string);
      return true;
    } catch (_) {
      return false;
    }
  }

  async extractSiteName(url) {
    try {
      const domain = new URL(url).hostname;
      return domain.replace('www.', '');
    } catch (error) {
      return 'Unknown Site';
    }
  }

  escapeMarkdown(text) {
    return text.replace(/[_*\[\]()~`>#+=|{}.!-]/g, '\\$&');
  }
}
