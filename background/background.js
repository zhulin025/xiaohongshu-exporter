// Background Service Worker
class BackgroundService {
  constructor() {
    this.init();
  }

  init() {
    // 监听来自popup的消息
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      // 处理旧的export消息格式
      if (message.action === 'export') {
        this.handleExport(message.data, message.targets, message.options)
          .then(result => sendResponse(result))
          .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
      }
      
      // 处理新的分离导出消息格式
      if (message.action === 'exportLocal') {
        this.exportToLocal(message.data, {
          format: message.format,
          downloadImages: message.downloadImages,
          appendMode: message.appendMode || false
        })
          .then(result => sendResponse(result))
          .catch(error => sendResponse({ success: false, message: error.message }));
        return true;
      }
      
      if (message.action === 'exportFeishu') {
        this.exportToFeishu(message.data, {})
          .then(result => sendResponse(result))
          .catch(error => sendResponse({ success: false, message: error.message }));
        return true;
      }
      
      if (message.action === 'exportNotion') {
        this.exportToNotion(message.data, {})
          .then(result => sendResponse(result))
          .catch(error => sendResponse({ success: false, message: error.message }));
        return true;
      }
    });

    // 插件安装或更新时
    chrome.runtime.onInstalled.addListener((details) => {
      if (details.reason === 'install') {
        console.log('小红书收藏夹导出助手已安装');
        this.showWelcomePage();
      } else if (details.reason === 'update') {
        console.log('小红书收藏夹导出助手已更新');
      }
    });
  }

  async handleExport(data, targets, options) {
    const results = [];

    try {
      // 并行执行导出任务
      const tasks = targets.map(target => {
        switch (target) {
          case 'local':
            return this.exportToLocal(data, options);
          case 'feishu':
            return this.exportToFeishu(data, options);
          case 'notion':
            return this.exportToNotion(data, options);
          default:
            return Promise.resolve({ success: false, message: '未知的导出目标' });
        }
      });

      const taskResults = await Promise.allSettled(tasks);

      taskResults.forEach((result, index) => {
        const target = targets[index];
        if (result.status === 'fulfilled') {
          results.push({
            target: target,
            success: result.value.success,
            message: result.value.message
          });
        } else {
          results.push({
            target: target,
            success: false,
            message: result.reason.message || '导出失败'
          });
        }
      });

      return {
        success: true,
        results: results
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        results: results
      };
    }
  }

  async exportToLocal(data, options) {
    try {
      const format = options.format || 'json';
      const appendMode = options.appendMode || false;
      let content, filename, mimeType;
      
      // 如果是追加模式,先检查是否有之前的文件记录
      let previousData = [];
      if (appendMode) {
        const history = await chrome.storage.local.get(['lastExportFile']);
        if (history.lastExportFile && history.lastExportFile.format === format) {
          // 有之前的文件,合并数据
          previousData = history.lastExportFile.data || [];
          filename = history.lastExportFile.filename;
        }
      }

      switch (format) {
        case 'json':
          if (appendMode && previousData.length > 0) {
            // 追加模式:合并数据并去重
            const mergedData = this.mergeAndDeduplicate(previousData, data);
            content = JSON.stringify(mergedData, null, 2);
          } else {
            content = JSON.stringify(data, null, 2);
          }
          if (!filename) {
            filename = `xiaohongshu_favorites_${this.getTimestamp()}.json`;
          }
          mimeType = 'application/json';
          break;

        case 'csv':
          if (appendMode && previousData.length > 0) {
            const mergedData = this.mergeAndDeduplicate(previousData, data);
            content = this.convertToCSV(mergedData);
          } else {
            content = this.convertToCSV(data);
          }
          if (!filename) {
            filename = `xiaohongshu_favorites_${this.getTimestamp()}.csv`;
          }
          mimeType = 'text/csv';
          break;

        case 'html':
          if (appendMode && previousData.length > 0) {
            const mergedData = this.mergeAndDeduplicate(previousData, data);
            content = this.convertToHTML(mergedData);
          } else {
            content = this.convertToHTML(data);
          }
          if (!filename) {
            filename = `xiaohongshu_favorites_${this.getTimestamp()}.html`;
          }
          mimeType = 'text/html';
          break;

        case 'markdown':
          if (appendMode && previousData.length > 0) {
            const mergedData = this.mergeAndDeduplicate(previousData, data);
            content = this.convertToMarkdown(mergedData);
          } else {
            content = this.convertToMarkdown(data);
          }
          if (!filename) {
            filename = `xiaohongshu_favorites_${this.getTimestamp()}.md`;
          }
          mimeType = 'text/markdown';
          break;

        default:
          throw new Error('不支持的导出格式');
      }

      // 使用data URL下载(Service Worker不支持createObjectURL)
      const base64Content = btoa(unescape(encodeURIComponent(content)));
      const dataUrl = `data:${mimeType};base64,${base64Content}`;

      await chrome.downloads.download({
        url: dataUrl,
        filename: filename,
        saveAs: true
      });

      // 如果需要下载图片
      if (options.downloadImages) {
        await this.downloadImages(data);
      }
      
      // 保存文件信息以便下次追加
      if (appendMode) {
        const finalData = previousData.length > 0 ? this.mergeAndDeduplicate(previousData, data) : data;
        await chrome.storage.local.set({
          lastExportFile: {
            filename: filename,
            format: format,
            data: finalData,
            timestamp: new Date().toISOString()
          }
        });
      }

      const totalCount = appendMode && previousData.length > 0 
        ? this.mergeAndDeduplicate(previousData, data).length 
        : data.length;
      const newCount = data.length;
      const message = appendMode && previousData.length > 0
        ? `已追加 ${newCount} 条新收藏,总计 ${totalCount} 条`
        : `已导出 ${data.length} 条收藏为 ${format.toUpperCase()} 格式`;

      return {
        success: true,
        message: message
      };
    } catch (error) {
      console.error('本地导出失败:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  async exportToFeishu(data, options) {
    try {
      // 获取飞书配置
      const result = await chrome.storage.local.get(['feishuConfig']);
      const config = result.feishuConfig;

      if (!config || !config.appId || !config.appSecret) {
        throw new Error('请先配置飞书API密钥');
      }

      // 获取访问令牌
      const token = await this.getFeishuToken(config.appId, config.appSecret);

      // 创建多维表格
      const tableId = await this.createFeishuTable(token, data);

      return {
        success: true,
        message: `已导出 ${data.length} 条收藏到飞书多维表格`
      };
    } catch (error) {
      console.error('飞书导出失败:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  async exportToNotion(data, options) {
    try {
      // 获取Notion配置
      const result = await chrome.storage.local.get(['notionConfig']);
      const config = result.notionConfig;

      if (!config || !config.token) {
        throw new Error('请先配置Notion Integration Token');
      }

      // 如果没有指定数据库ID,创建新数据库
      let databaseId = config.databaseId;
      if (!databaseId) {
        databaseId = await this.createNotionDatabase(config.token);
      }

      // 批量创建页面
      await this.createNotionPages(config.token, databaseId, data);

      return {
        success: true,
        message: `已导出 ${data.length} 条收藏到Notion数据库`
      };
    } catch (error) {
      console.error('Notion导出失败:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  convertToCSV(data) {
    const headers = ['标题', '链接', '作者', '收藏时间', '类型'];
    const rows = data.map(item => [
      this.escapeCSV(item.title),
      item.url,
      this.escapeCSV(item.author.nickname),
      item.collectTime,
      item.type
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    return '\uFEFF' + csvContent; // 添加BOM以支持中文
  }

  convertToHTML(data) {
    const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>小红书收藏夹导出</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; padding: 20px; }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { text-align: center; color: #ff2442; margin-bottom: 30px; }
    .stats { text-align: center; margin-bottom: 30px; color: #666; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 20px; }
    .card { background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); transition: transform 0.3s; }
    .card:hover { transform: translateY(-5px); box-shadow: 0 4px 16px rgba(0,0,0,0.15); }
    .card img { width: 100%; height: 200px; object-fit: cover; }
    .card-body { padding: 15px; }
    .card-title { font-size: 16px; font-weight: 600; margin-bottom: 10px; color: #333; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .card-author { font-size: 14px; color: #666; margin-bottom: 10px; }
    .card-link { display: inline-block; padding: 8px 16px; background: #ff2442; color: white; text-decoration: none; border-radius: 4px; font-size: 14px; }
    .card-link:hover { background: #e61e3a; }
  </style>
</head>
<body>
  <div class="container">
    <h1>📚 小红书收藏夹</h1>
    <div class="stats">共 ${data.length} 条收藏 | 导出时间: ${new Date().toLocaleString('zh-CN')}</div>
    <div class="grid">
      ${data.map(item => `
        <div class="card">
          ${item.coverImage ? `<img src="${item.coverImage}" alt="${item.title}">` : ''}
          <div class="card-body">
            <div class="card-title">${this.escapeHTML(item.title)}</div>
            <div class="card-author">👤 ${this.escapeHTML(item.author.nickname)}</div>
            <a href="${item.url}" class="card-link" target="_blank">查看原文</a>
          </div>
        </div>
      `).join('')}
    </div>
  </div>
</body>
</html>
    `;
    return html;
  }

  convertToMarkdown(data) {
    let markdown = `# 小红书收藏夹导出\n\n`;
    markdown += `> 共 ${data.length} 条收藏 | 导出时间: ${new Date().toLocaleString('zh-CN')}\n\n`;
    markdown += `---\n\n`;

    data.forEach((item, index) => {
      markdown += `## ${index + 1}. ${item.title}\n\n`;
      markdown += `- **作者**: ${item.author.nickname}\n`;
      markdown += `- **链接**: [点击查看](${item.url})\n`;
      markdown += `- **收藏时间**: ${new Date(item.collectTime).toLocaleString('zh-CN')}\n`;
      if (item.coverImage) {
        markdown += `- **封面**: ![](${item.coverImage})\n`;
      }
      markdown += `\n---\n\n`;
    });

    return markdown;
  }

  mergeAndDeduplicate(oldData, newData) {
    // 合并两个数组并根据ID去重
    const idMap = new Map();
    
    // 先加入旧数据
    oldData.forEach(item => {
      idMap.set(item.id, item);
    });
    
    // 再加入新数据(如果ID相同则覆盖)
    newData.forEach(item => {
      idMap.set(item.id, item);
    });
    
    // 转换为数组并按index排序
    const mergedArray = Array.from(idMap.values());
    mergedArray.sort((a, b) => (a.index || 0) - (b.index || 0));
    
    return mergedArray;
  }

  async downloadImages(data) {
    // 批量下载图片
    const imageUrls = data
      .filter(item => item.coverImage)
      .map(item => item.coverImage);

    for (let i = 0; i < imageUrls.length; i++) {
      try {
        const url = imageUrls[i];
        const filename = `xiaohongshu_images/image_${i + 1}.jpg`;
        await chrome.downloads.download({ url, filename });
      } catch (error) {
        console.error('下载图片失败:', error);
      }
    }
  }

  async getFeishuToken(appId, appSecret) {
    // 实现飞书token获取逻辑
    const response = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        app_id: appId,
        app_secret: appSecret
      })
    });

    const result = await response.json();
    if (result.code !== 0) {
      throw new Error('获取飞书访问令牌失败: ' + result.msg);
    }

    return result.tenant_access_token;
  }

  async createFeishuTable(token, data) {
    // 实现飞书多维表格创建逻辑
    // 这里是简化版本,实际需要调用飞书API
    throw new Error('飞书导出功能开发中,敬请期待');
  }

  async createNotionDatabase(token) {
    // 实现Notion数据库创建逻辑
    throw new Error('Notion导出功能开发中,敬请期待');
  }

  async createNotionPages(token, databaseId, data) {
    // 实现Notion页面创建逻辑
    throw new Error('Notion导出功能开发中,敬请期待');
  }

  escapeCSV(str) {
    if (!str) return '';
    str = str.toString();
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  escapeHTML(str) {
    if (!str) return '';
    return str.toString()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  getTimestamp() {
    const now = new Date();
    return now.toISOString().replace(/[:.]/g, '-').slice(0, -5);
  }

  showWelcomePage() {
    // 打开欢迎页面
    chrome.tabs.create({
      url: chrome.runtime.getURL('options/options.html')
    });
  }
}

// 初始化后台服务
new BackgroundService();
