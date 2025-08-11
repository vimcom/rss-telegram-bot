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
