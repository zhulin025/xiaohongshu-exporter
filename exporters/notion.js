// Notion导出模块
class NotionExporter {
  constructor(token) {
    this.token = token;
    this.apiVersion = '2022-06-28';
  }

  async export(data, databaseId = null) {
    try {
      // 如果没有指定数据库ID,创建新数据库
      if (!databaseId) {
        databaseId = await this.createDatabase();
      }

      // 批量创建页面
      await this.createPages(databaseId, data);

      return {
        success: true,
        databaseId: databaseId,
        url: `https://www.notion.so/${databaseId.replace(/-/g, '')}`
      };
    } catch (error) {
      console.error('Notion导出失败:', error);
      throw error;
    }
  }

  async createDatabase() {
    // 首先需要获取父页面ID
    // 这里我们搜索用户的工作空间来找到一个合适的父页面
    const parentPageId = await this.findParentPage();

    const response = await fetch('https://api.notion.com/v1/databases', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        'Notion-Version': this.apiVersion
      },
      body: JSON.stringify({
        parent: {
          type: 'page_id',
          page_id: parentPageId
        },
        title: [
          {
            type: 'text',
            text: {
              content: `小红书收藏夹_${this.getTimestamp()}`
            }
          }
        ],
        properties: {
          '标题': {
            title: {}
          },
          '链接': {
            url: {}
          },
          '作者': {
            rich_text: {}
          },
          '收藏时间': {
            date: {}
          },
          '类型': {
            select: {
              options: [
                { name: '图文', color: 'blue' },
                { name: '视频', color: 'red' }
              ]
            }
          },
          '标签': {
            multi_select: {
              options: []
            }
          }
        }
      })
    });

    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(`创建Notion数据库失败: ${result.message}`);
    }

    return result.id;
  }

  async findParentPage() {
    // 搜索用户的工作空间,找到第一个可用的页面
    const response = await fetch('https://api.notion.com/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        'Notion-Version': this.apiVersion
      },
      body: JSON.stringify({
        filter: {
          value: 'page',
          property: 'object'
        },
        page_size: 1
      })
    });

    const result = await response.json();
    
    if (!response.ok || !result.results || result.results.length === 0) {
      throw new Error('无法找到父页面,请在Notion中创建一个页面并授权给集成');
    }

    return result.results[0].id;
  }

  async createPages(databaseId, data) {
    // 批量创建页面,每次创建一个(Notion API限制)
    for (let i = 0; i < data.length; i++) {
      try {
        await this.createPage(databaseId, data[i]);
        
        // 避免触发限流,每3个请求暂停一次
        if ((i + 1) % 3 === 0) {
          await this.sleep(1000);
        }
      } catch (error) {
        console.error(`创建页面失败 (${i + 1}/${data.length}):`, error);
      }
    }
  }

  async createPage(databaseId, item) {
    const response = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        'Notion-Version': this.apiVersion
      },
      body: JSON.stringify({
        parent: {
          database_id: databaseId
        },
        properties: {
          '标题': {
            title: [
              {
                text: {
                  content: item.title || '无标题'
                }
              }
            ]
          },
          '链接': {
            url: item.url
          },
          '作者': {
            rich_text: [
              {
                text: {
                  content: item.author.nickname || '未知作者'
                }
              }
            ]
          },
          '收藏时间': {
            date: {
              start: new Date(item.collectTime).toISOString().split('T')[0]
            }
          },
          '类型': {
            select: {
              name: item.type || '图文'
            }
          }
        },
        children: this.buildPageContent(item)
      })
    });

    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(`创建页面失败: ${result.message}`);
    }

    return result.id;
  }

  buildPageContent(item) {
    const blocks = [];

    // 添加封面图片
    if (item.coverImage) {
      blocks.push({
        object: 'block',
        type: 'image',
        image: {
          type: 'external',
          external: {
            url: item.coverImage
          }
        }
      });
    }

    // 添加描述
    if (item.description) {
      blocks.push({
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [
            {
              type: 'text',
              text: {
                content: item.description
              }
            }
          ]
        }
      });
    }

    // 添加链接
    blocks.push({
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [
          {
            type: 'text',
            text: {
              content: '查看原文',
              link: {
                url: item.url
              }
            }
          }
        ]
      }
    });

    return blocks;
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
  module.exports = NotionExporter;
}
