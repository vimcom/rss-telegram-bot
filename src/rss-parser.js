export class RSSParser {
  async parseRSS(url) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'RSS Bot 1.0'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const xmlText = await response.text();
      return this.parseXML(xmlText);
    } catch (error) {
      console.error(`解析RSS失败 ${url}:`, error);
      return [];
    }
  }

  parseXML(xmlText) {
    const items = [];
    
    // 简单的XML解析（生产环境建议使用专业XML解析库）
    const itemMatches = xmlText.match(/<item[^>]*>[\s\S]*?<\/item>/gi) || 
                       xmlText.match(/<entry[^>]*>[\s\S]*?<\/entry>/gi);

    if (!itemMatches) return items;

    for (const itemXml of itemMatches) {
      try {
        const item = this.parseItem(itemXml);
        if (item.title && item.guid) {
          items.push(item);
        }
      } catch (error) {
        console.error('解析item失败:', error);
      }
    }

    return items.slice(0, 10); // 限制最多10条
  }

  parseItem(itemXml) {
    const item = {};

    // 提取标题
    const titleMatch = itemXml.match(/<title[^>]*><!\[CDATA\[(.*?)\]\]><\/title>/) ||
                      itemXml.match(/<title[^>]*>(.*?)<\/title>/);
    item.title = titleMatch ? this.decodeHTML(titleMatch[1].trim()) : '';

    // 提取链接
    const linkMatch = itemXml.match(/<link[^>]*>(.*?)<\/link>/) ||
                     itemXml.match(/<link[^>]*href=["'](.*?)["'][^>]*>/);
    item.link = linkMatch ? linkMatch[1].trim() : '';

    // 提取描述
    const descMatch = itemXml.match(/<description[^>]*><!\[CDATA\[(.*?)\]\]><\/description>/) ||
                     itemXml.match(/<description[^>]*>(.*?)<\/description>/) ||
                     itemXml.match(/<content:encoded[^>]*><!\[CDATA\[(.*?)\]\]><\/content:encoded>/) ||
                     itemXml.match(/<summary[^>]*>(.*?)<\/summary>/);
    
    if (descMatch) {
      item.description = this.stripHTML(this.decodeHTML(descMatch[1])).substring(0, 200);
    }

    // 提取GUID
    const guidMatch = itemXml.match(/<guid[^>]*>(.*?)<\/guid>/) ||
                     itemXml.match(/<id[^>]*>(.*?)<\/id>/);
    item.guid = guidMatch ? guidMatch[1].trim() : item.link || item.title;

    // 提取发布时间
    const pubDateMatch = itemXml.match(/<pubDate[^>]*>(.*?)<\/pubDate>/) ||
                        itemXml.match(/<published[^>]*>(.*?)<\/published>/) ||
                        itemXml.match(/<updated[^>]*>(.*?)<\/updated>/);
    
    if (pubDateMatch) {
      try {
        item.publishedAt = new Date(pubDateMatch[1].trim()).toLocaleString('zh-CN');
      } catch (e) {
        item.publishedAt = pubDateMatch[1].trim();
      }
    }

    return item;
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
