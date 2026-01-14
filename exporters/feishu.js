// 飞书导出模块
class FeishuExporter {
  constructor(appId, appSecret) {
    this.appId = appId;
    this.appSecret = appSecret;
    this.token = null;
  }

  async export(data) {
    try {
      // 1. 获取访问令牌
      await this.getAccessToken();

      // 2. 创建多维表格
      const appToken = await this.createBitable(data);

      // 3. 创建数据表
      const tableId = await this.createTable(appToken);

      // 4. 添加字段
      await this.addFields(appToken, tableId);

      // 5. 批量插入数据
      await this.insertRecords(appToken, tableId, data);

      return {
        success: true,
        appToken: appToken,
        tableId: tableId,
        url: `https://www.feishu.cn/base/${appToken}`
      };
    } catch (error) {
      console.error('飞书导出失败:', error);
      throw error;
    }
  }

  async getAccessToken() {
    const response = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        app_id: this.appId,
        app_secret: this.appSecret
      })
    });

    const result = await response.json();
    
    if (result.code !== 0) {
      throw new Error(`获取飞书访问令牌失败: ${result.msg}`);
    }

    this.token = result.tenant_access_token;
    return this.token;
  }

  async createBitable(data) {
    const response = await fetch('https://open.feishu.cn/open-apis/bitable/v1/apps', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: `小红书收藏夹_${this.getTimestamp()}`,
        folder_token: '' // 可以指定文件夹
      })
    });

    const result = await response.json();
    
    if (result.code !== 0) {
      throw new Error(`创建多维表格失败: ${result.msg}`);
    }

    return result.data.app.app_token;
  }

  async createTable(appToken) {
    const response = await fetch(`https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        table: {
          name: '收藏列表'
        }
      })
    });

    const result = await response.json();
    
    if (result.code !== 0) {
      throw new Error(`创建数据表失败: ${result.msg}`);
    }

    return result.data.table_id;
  }

  async addFields(appToken, tableId) {
    // 定义字段结构
    const fields = [
      { field_name: '标题', type: 1 }, // 文本
      { field_name: '链接', type: 15 }, // URL
      { field_name: '封面图片', type: 17 }, // 附件
      { field_name: '作者', type: 1 }, // 文本
      { field_name: '收藏时间', type: 5 }, // 日期
      { field_name: '类型', type: 3 }, // 单选
      { field_name: '标签', type: 4 } // 多选
    ];

    for (const field of fields) {
      try {
        await fetch(`https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/fields`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ field })
        });
      } catch (error) {
        console.error('添加字段失败:', error);
      }
    }
  }

  async insertRecords(appToken, tableId, data) {
    // 批量插入记录,每次最多500条
    const batchSize = 500;
    
    for (let i = 0; i < data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize);
      const records = batch.map(item => ({
        fields: {
          '标题': item.title,
          '链接': item.url,
          '作者': item.author.nickname,
          '收藏时间': new Date(item.collectTime).getTime(),
          '类型': item.type
        }
      }));

      const response = await fetch(
        `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/batch_create`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ records })
        }
      );

      const result = await response.json();
      
      if (result.code !== 0) {
        console.error(`批量插入记录失败 (batch ${i / batchSize + 1}):`, result.msg);
      }

      // 避免触发限流
      await this.sleep(1000);
    }
  }

  getTimestamp() {
    const now = new Date();
    return now.toLocaleString('zh-CN', { 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).replace(/\//g, '-');
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 导出供background使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FeishuExporter;
}
