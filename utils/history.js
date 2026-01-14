// 导出历史记录管理模块
class ExportHistory {
  constructor() {
    this.storageKey = 'exportHistory';
  }

  // 获取导出历史
  async getHistory() {
    const result = await chrome.storage.local.get([this.storageKey]);
    return result[this.storageKey] || {
      lastExportTime: null,
      lastExportCount: 0,
      lastExportedIds: [],
      lastNoteId: null,
      lastNoteIndex: 0,
      exportRecords: []
    };
  }

  // 保存导出历史
  async saveHistory(history) {
    await chrome.storage.local.set({ [this.storageKey]: history });
  }

  // 添加导出记录
  async addExportRecord(data, format, target) {
    const history = await this.getHistory();
    
    const record = {
      timestamp: new Date().toISOString(),
      count: data.length,
      format: format,
      target: target,
      lastNoteId: data.length > 0 ? data[data.length - 1].id : null,
      lastNoteIndex: data.length > 0 ? data[data.length - 1].index : 0
    };

    history.exportRecords.push(record);
    history.lastExportTime = record.timestamp;
    history.lastExportCount = data.length;
    history.lastExportedIds = data.map(item => item.id);
    history.lastNoteId = record.lastNoteId;
    history.lastNoteIndex = record.lastNoteIndex;

    // 只保留最近10条记录
    if (history.exportRecords.length > 10) {
      history.exportRecords = history.exportRecords.slice(-10);
    }

    await this.saveHistory(history);
    return record;
  }

  // 检测新增收藏
  async detectNewItems(currentItems) {
    const history = await this.getHistory();
    
    if (!history.lastExportTime || history.lastExportedIds.length === 0) {
      // 首次使用,所有都是新的
      return {
        hasNew: true,
        newCount: currentItems.length,
        newItems: currentItems,
        isFirstTime: true
      };
    }

    // 使用Set快速查找
    const exportedIds = new Set(history.lastExportedIds);
    const newItems = currentItems.filter(item => !exportedIds.has(item.id));

    return {
      hasNew: newItems.length > 0,
      newCount: newItems.length,
      newItems: newItems,
      isFirstTime: false,
      lastExportTime: history.lastExportTime,
      lastExportCount: history.lastExportCount
    };
  }

  // 标记收藏为已导出
  async markAsExported(items) {
    const history = await this.getHistory();
    const newIds = items.map(item => item.id);
    
    // 合并ID列表,去重
    const allIds = new Set([...history.lastExportedIds, ...newIds]);
    history.lastExportedIds = Array.from(allIds);
    
    // 更新最后导出信息
    if (items.length > 0) {
      const lastItem = items[items.length - 1];
      history.lastNoteId = lastItem.id;
      history.lastNoteIndex = lastItem.index || 0;
    }
    
    history.lastExportTime = new Date().toISOString();
    history.lastExportCount = history.lastExportedIds.length;

    await this.saveHistory(history);
  }

  // 清除历史记录
  async clearHistory() {
    await chrome.storage.local.remove([this.storageKey]);
  }

  // 获取导出统计
  async getStatistics() {
    const history = await this.getHistory();
    
    return {
      totalExports: history.exportRecords.length,
      totalItems: history.lastExportCount,
      lastExportTime: history.lastExportTime,
      exportsByFormat: this.groupBy(history.exportRecords, 'format'),
      exportsByTarget: this.groupBy(history.exportRecords, 'target')
    };
  }

  // 辅助方法: 分组统计
  groupBy(array, key) {
    return array.reduce((result, item) => {
      const group = item[key];
      result[group] = (result[group] || 0) + 1;
      return result;
    }, {});
  }

  // 获取建议的采集范围
  async getSuggestedRange() {
    const history = await this.getHistory();
    
    if (!history.lastNoteIndex || history.lastNoteIndex === 0) {
      return null; // 首次使用,无建议
    }

    return {
      startIndex: history.lastNoteIndex + 1,
      endIndex: -1, // 采集到最后
      message: `建议从第 ${history.lastNoteIndex + 1} 条开始采集新增内容`
    };
  }
}

// 导出单例
const exportHistory = new ExportHistory();
