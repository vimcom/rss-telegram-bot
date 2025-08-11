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
      
      case '/proxy':
        await this.handleProxyCommand(userId, args);
        break;
      
      case '/failed':
        await this.handleFailedCommand(userId);
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
          '🔧 /proxy <RSS链接> - 测试RSS源访问情况\n' +
          '⚠️ /failed - 查看失败的RSS订阅\n' +
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

        // 先测试RSS源是否可访问
        const testResult = await this.testRSSSource(url);
        if (!testResult.accessible) {
          results.push(`⚠️ 无法访问：${url}\n   错误：${testResult.error}`);
          errorCount++;
          continue;
        }

        const siteName = testResult.siteName || await this.extractSiteName(url);
        const added = await this.dbManager.addSubscription(userId, url, siteName);
        
        if (added) {
          results.push(`✅ 已添加：${siteName}${testResult.proxyUsed ? ' (通过代理)' : ''}`);
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

  // 测试RSS源可访问性
  async testRSSSource(url) {
    const rssParser = new (await import('./rss-parser.js')).RSSParser();
    
    try {
      // 尝试获取第一条内容以验证
      const items = await rssParser.parseRSS(url);
      
      if (items.length > 0) {
        return { 
          accessible: true, 
          siteName: await this.extractSiteName(url),
          proxyUsed: false // 这里简化处理，实际可以从parser返回更多信息
        };
      } else {
        return { 
          accessible: false, 
          error: 'RSS源无内容或格式错误' 
        };
      }
    } catch (error) {
      return { 
        accessible: false, 
        error: error.message 
      };
    }
  }

  async handleProxyCommand(userId, args) {
    if (args.length === 0) {
      await this.sendMessage(userId, 
        '🔧 代理测试命令：\n\n' +
        '📝 用法：/proxy <RSS链接>\n' +
        '🎯 功能：测试RSS源访问情况\n' +
        '📊 显示：直连状态、代理结果、内容预览\n\n' +
        '💡 示例：/proxy https://linux.do/latest.rss'
      );
      return;
    }

    const url = args[0];
    if (!this.isValidUrl(url)) {
      await this.sendMessage(userId, '❌ 无效的URL格式');
      return;
    }

    await this.sendMessage(userId, '🔍 正在测试RSS源访问情况，请稍候...');

    const rssParser = new (await import('./rss-parser.js')).RSSParser();
    
    try {
      // 测试直接访问
      let directResult = '❌ 直接访问失败';
      let proxyResult = '❌ 代理访问失败';
      let contentPreview = '';

      try {
        const directResponse = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/xml, text/xml'
          },
          timeout: 10000
        });
        
        if (directResponse.ok) {
          directResult = '✅ 直接访问成功';
          const xmlText = await directResponse.text();
          const items = rssParser.parseXML(xmlText);
          if (items.length > 0) {
            contentPreview = `📄 内容预览：${items[0].title}`;
          }
        } else {
          directResult = `❌ 直接访问失败 (HTTP ${directResponse.status})`;
        }
      } catch (error) {
        directResult = `❌ 直接访问失败 (${error.message})`;
      }

      // 测试代理访问
      if (!directResult.includes('成功')) {
        try {
          const items = await rssParser.parseRSS(url);
          if (items.length > 0) {
            proxyResult = '✅ 代理访问成功';
            contentPreview = `📄 内容预览：${items[0].title}`;
          }
        } catch (error) {
          proxyResult = `❌ 代理访问失败 (${error.message})`;
        }
      }

      const siteName = await this.extractSiteName(url);
      
      const message = 
        `🔍 RSS源测试结果：\n\n` +
        `🌐 网站：${siteName}\n` +
        `🔗 链接：${url}\n\n` +
        `📡 ${directResult}\n` +
        `🔀 ${proxyResult}\n\n` +
        `${contentPreview}\n\n` +
        `💡 ${directResult.includes('成功') || proxyResult.includes('成功') ? 
          '该RSS源可以正常使用' : 
          '该RSS源暂时无法访问，建议检查链接或稍后再试'
        }`;
      
      await this.sendMessage(userId, message);
    } catch (error) {
      await this.sendMessage(userId, `❌ 测试过程中发生错误：${error.message}`);
    }
  }

  async handleFailedCommand(userId) {
    try {
      const userSubscriptions = await this.dbManager.getUserSubscriptions(userId);
      const failedSubs = await this.dbManager.getFailedSubscriptions();
      
      // 过滤出用户的失败订阅
      const userFailed = failedSubs.filter(failed => 
        userSubscriptions.some(sub => sub.rss_url === failed.rss_url)
      );
      
      if (userFailed.length === 0) {
        await this.sendMessage(userId, '✅ 您的所有RSS订阅都工作正常！');
        return;
      }
      
      let message = `⚠️ 失败的RSS订阅 (${userFailed.length}个)：\n\n`;
      
      userFailed.forEach((failed, index) => {
        const errorMsg = failed.error_message || '未知错误';
        const shortError = errorMsg.length > 50 ? errorMsg.substring(0, 50) + '...' : errorMsg;
        message += `${index + 1}. ${failed.site_name || '未知网站'}\n`;
        message += `🔗 ${failed.rss_url}\n`;
        message += `❌ ${shortError}\n`;
        message += `🔄 失败次数: ${failed.failure_count}\n`;
        message += `⏰ 最后失败: ${new Date(failed.last_failure).toLocaleString('zh-CN')}\n\n`;
      });
      
      message += '💡 建议：检查RSS源是否可访问，或考虑删除失效的订阅';
      
      await this.sendMessage(userId, message);
    } catch (error) {
      console.error('获取失败订阅失败:', error);
      await this.sendMessage(userId, '获取失败信息时出错，请稍后再试');
    }
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
