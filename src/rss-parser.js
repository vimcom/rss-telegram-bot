export class RSSParser {
  constructor() {
    // 公共RSS代理服务列表
    this.proxyServices = [
      'https://api.rss2json.com/v1/api.json?rss_url=',
      'https://cors-anywhere.herokuapp.com/',
      'https://api.allorigins.win/raw?url=',
    ];
  }

  async parseRSS(url) {
    const maxRetries = 3;
    let lastError;
    
    // 首先尝试直接访问
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.fetchWithHeaders(url, attempt);

        if (response.ok) {
          const xmlText = await response.text();
          const items = this.parseXML(xmlText);
          
          if (items.length > 0) {
            return items;
          }
        } else if (response.status === 403) {
          console.warn(`直接访问被拒绝 ${url}, 尝试代理方案`);
          break; // 403错误直接跳到代理方案
        } else {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
      } catch (error) {
        lastError = error;
        console.warn(`RSS解析尝试 ${attempt}/${maxRetries} 失败 ${url}:`, error.message);
        
        if (attempt < maxRetries && !error.message.includes('403')) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }
    
    // 如果直接访问失败，尝试代理服务
    console.log(`尝试通过代理访问 ${url}`);
    const proxyResult = await this.tryProxyServices(url);
    if (proxyResult && proxyResult.length > 0) {
      return proxyResult;
    }
    
    console.error(`所有方法都失败了 ${url}: ${lastError?.message || 'Unknown error'}`);
    return [];
  }

  async tryProxyServices(url) {
    for (const proxy of this.proxyServices) {
      try {
        console.log(`尝试代理: ${proxy}`);
        
        let proxyUrl;
        let response;
        
        if (proxy.includes('rss2json.com')) {
          // RSS2JSON API - 返回JSON格式
          proxyUrl = proxy + encodeURIComponent(url);
          response = await fetch(proxyUrl, {
            headers: {
              'User-Agent': 'RSS-Bot/1.0',
              'Accept': 'application/json'
            },
            timeout: 20000
          });
          
          if (response.ok) {
            const jsonData = await response.json();
            if (jsonData.status === 'ok' && jsonData.items) {
              return this.convertJsonToItems(jsonData.items);
            }
          }
        } else {
          // 其他CORS代理
          proxyUrl = proxy + encodeURIComponent(url);
          response = await fetch(proxyUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'application/xml, text/xml, */*',
              'X-Requested-With': 'XMLHttpRequest'
            },
            timeout: 20000
          });
          
          if (response.ok) {
            const xmlText = await response.text();
            const items = this.parseXML(xmlText);
            if (items.length > 0) {
              return items;
            }
          }
        }
      } catch (error) {
        console.warn(`代理 ${proxy} 失败:`, error.message);
        continue;
      }
    }
    
    return null;
  }

  // 将RSS2JSON的结果转换为标准格式
  convertJsonToItems(jsonItems) {
    return jsonItems.slice(0, 10).map(item => ({
      title: item.title || '',
      link: item.link || '',
      description: this.stripHTML(item.description || '').substring(0, 200),
      guid: item.guid || item.link || item.title,
      publishedAt: item.pubDate ? new Date(item.pubDate).toLocaleString('zh-CN') : ''
    }));
  }

  async fetchWithHeaders(url, attempt = 1) {
    // 根据尝试次数使用不同的请求策略
    const strategies = [
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/rss+xml, application/xml, text/xml, */*',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      },
      {
        headers: {
          'User-Agent': 'Feedbin feed-id:1 - 1 subscribers',
          'Accept': 'application/rss+xml, application/atom+xml, text/xml',
          'Accept-Language': 'en-US,en;q=0.5'
        }
      },
      {
        headers: {
          'User-Agent': 'RSS Bot/1.0 (+https://example.com/bot)',
          'Accept': 'application/xml, text/xml, */*',
          'Accept-Language': 'zh-CN,en;q=0.8'
        }
      }
    ];

    const strategy = strategies[Math.min(attempt - 1, strategies.length - 1)];
    
    // 添加随机延迟防止被识别为机器人
    if (attempt > 1) {
      await new Promise(resolve => setTimeout(resolve, Math.random() * 2000 + 1000));
    }

    return fetch(url, {
      method: 'GET',
      headers: strategy.headers,
      redirect: 'follow',
      timeout: 15000 // 15秒超时
    });
  }

  parseXML(xmlText) {
    const items = [];
    
    // 检测是否为Atom格式
    const isAtom = xmlText.includes('<feed') && xmlText.includes('xmlns="http://www.w3.org/2005/Atom"');
    
    // 根据格式选择合适的匹配模式
    let itemMatches;
    if (isAtom) {
      itemMatches = xmlText.match(/<entry[^>]*>[\s\S]*?<\/entry>/gi);
    } else {
      itemMatches = xmlText.match(/<item[^>]*>[\s\S]*?<\/item>/gi);
    }

    if (!itemMatches) return items;

    for (const itemXml of itemMatches) {
      try {
        const item = isAtom ? this.parseAtomEntry(itemXml) : this.parseRSSItem(itemXml);
        if (item.title && item.guid) {
          items.push(item);
        }
      } catch (error) {
        console.error('解析item失败:', error);
      }
    }

    return items.slice(0, 10); // 限制最多10条
  }

  parseRSSItem(itemXml) {
    const item = {};

    // 提取标题
    const titleMatch = itemXml.match(/<title[^>]*><!\[CDATA\[(.*?)\]\]><\/title>/) ||
                      itemXml.match(/<title[^>]*>(.*?)<\/title>/);
    item.title = titleMatch ? this.decodeHTML(titleMatch[1].trim()) : '';

    // 提取链接
    const linkMatch = itemXml.match(/<link[^>]*>(.*?)<\/link>/);
    item.link = linkMatch ? linkMatch[1].trim() : '';

    // 提取描述
    const descMatch = itemXml.match(/<description[^>]*><!\[CDATA\[(.*?)\]\]><\/description>/) ||
                     itemXml.match(/<description[^>]*>(.*?)<\/description>/) ||
                     itemXml.match(/<content:encoded[^>]*><!\[CDATA\[(.*?)\]\]><\/content:encoded>/);
    
    if (descMatch) {
      item.description = this.stripHTML(this.decodeHTML(descMatch[1])).substring(0, 200);
    }

    // 提取GUID
    const guidMatch = itemXml.match(/<guid[^>]*>(.*?)<\/guid>/);
    item.guid = guidMatch ? guidMatch[1].trim() : item.link || item.title;

    // 提取发布时间
    const pubDateMatch = itemXml.match(/<pubDate[^>]*>(.*?)<\/pubDate>/);
    if (pubDateMatch) {
      try {
        item.publishedAt = new Date(pubDateMatch[1].trim()).toLocaleString('zh-CN');
      } catch (e) {
        item.publishedAt = pubDateMatch[1].trim();
      }
    }

    return item;
  }

  parseAtomEntry(entryXml) {
    const item = {};

    // 提取标题
    const titleMatch = entryXml.match(/<title[^>]*type=["']?html["']?[^>]*><!\[CDATA\[(.*?)\]\]><\/title>/) ||
                      entryXml.match(/<title[^>]*type=["']?html["']?[^>]*>(.*?)<\/title>/) ||
                      entryXml.match(/<title[^>]*><!\[CDATA\[(.*?)\]\]><\/title>/) ||
                      entryXml.match(/<title[^>]*>(.*?)<\/title>/);
    item.title = titleMatch ? this.decodeHTML(titleMatch[1].trim()) : '';

    // 提取链接 - Atom中链接格式为 <link href="..."/>
    const linkMatch = entryXml.match(/<link[^>]+href=["'](.*?)["'][^>]*\/?>/) ||
                     entryXml.match(/<link[^>]+href=["'](.*?)["'][^>]*><\/link>/);
    item.link = linkMatch ? linkMatch[1].trim() : '';

    // 提取内容/摘要
    const contentMatch = entryXml.match(/<content[^>]*type=["']?html["']?[^>]*><!\[CDATA\[(.*?)\]\]><\/content>/) ||
                        entryXml.match(/<content[^>]*type=["']?html["']?[^>]*>(.*?)<\/content>/) ||
                        entryXml.match(/<content[^>]*><!\[CDATA\[(.*?)\]\]><\/content>/) ||
                        entryXml.match(/<content[^>]*>(.*?)<\/content>/) ||
                        entryXml.match(/<summary[^>]*type=["']?html["']?[^>]*><!\[CDATA\[(.*?)\]\]><\/summary>/) ||
                        entryXml.match(/<summary[^>]*type=["']?html["']?[^>]*>(.*?)<\/summary>/) ||
                        entryXml.match(/<summary[^>]*><!\[CDATA\[(.*?)\]\]><\/summary>/) ||
                        entryXml.match(/<summary[^>]*>(.*?)<\/summary>/);
    
    if (contentMatch) {
      item.description = this.stripHTML(this.decodeHTML(contentMatch[1])).substring(0, 200);
    }

    // 提取ID作为GUID
    const idMatch = entryXml.match(/<id[^>]*>(.*?)<\/id>/);
    item.guid = idMatch ? idMatch[1].trim() : item.link || item.title;

    // 提取发布时间 - Atom使用 published 或 updated
    const publishedMatch = entryXml.match(/<published[^>]*>(.*?)<\/published>/) ||
                          entryXml.match(/<updated[^>]*>(.*?)<\/updated>/);
    if (publishedMatch) {
      try {
        item.publishedAt = new Date(publishedMatch[1].trim()).toLocaleString('zh-CN');
      } catch (e) {
        item.publishedAt = publishedMatch[1].trim();
      }
    }

    return item;
  }

  parseItem(itemXml) {
    // 这个方法保留用于向后兼容，但实际使用上面的专门方法
    return this.parseRSSItem(itemXml);
  }

  stripHTML(html) {
    return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }

  decodeHTML(str) {
    const entities = {
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&#39;': "'",
      '&nbsp;': ' '
    };
    
    return str.replace(/&[a-z0-9#]+;/gi, (match) => entities[match] || match);
  }
}
