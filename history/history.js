// 历史记录页面逻辑
class HistoryPage {
  constructor() {
    this.history = null;
    this.charts = {};
    this.init();
  }

  async init() {
    await this.loadHistory();
    this.renderStats();
    this.renderCharts();
    this.renderRecords();
    this.bindEvents();
  }

  async loadHistory() {
    const result = await chrome.storage.local.get(['exportHistory']);
    this.history = result.exportHistory || {
      lastExportTime: null,
      lastExportCount: 0,
      lastExportedIds: [],
      exportRecords: []
    };
  }

  bindEvents() {
    document.getElementById('backBtn').addEventListener('click', () => {
      window.close();
    });

    document.getElementById('clearHistoryBtn').addEventListener('click', () => {
      this.clearHistory();
    });
  }

  renderStats() {
    const records = this.history.exportRecords || [];
    
    // 总导出次数
    document.getElementById('totalExports').textContent = records.length;
    
    // 总收藏数
    document.getElementById('totalItems').textContent = this.history.lastExportCount || 0;
    
    // 上次导出时间
    if (this.history.lastExportTime) {
      const date = new Date(this.history.lastExportTime);
      const now = new Date();
      const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
      
      let timeText;
      if (diffDays === 0) {
        timeText = '今天';
      } else if (diffDays === 1) {
        timeText = '昨天';
      } else if (diffDays < 7) {
        timeText = `${diffDays}天前`;
      } else {
        timeText = date.toLocaleDateString('zh-CN');
      }
      
      document.getElementById('lastExportTime').textContent = timeText;
    } else {
      document.getElementById('lastExportTime').textContent = '从未';
    }
    
    // 平均每次导出数量
    if (records.length > 0) {
      const total = records.reduce((sum, record) => sum + record.count, 0);
      const avg = Math.round(total / records.length);
      document.getElementById('avgPerExport').textContent = avg;
    } else {
      document.getElementById('avgPerExport').textContent = '0';
    }
  }

  renderCharts() {
    const records = this.history.exportRecords || [];
    
    if (records.length === 0) {
      return;
    }

    // 1. 导出趋势图
    this.renderTrendChart(records);
    
    // 2. 格式分布图
    this.renderFormatChart(records);
    
    // 3. 目标分布图
    this.renderTargetChart(records);
    
    // 4. 每周统计图
    this.renderWeeklyChart(records);
  }

  renderTrendChart(records) {
    const ctx = document.getElementById('trendChart');
    
    // 按时间排序
    const sortedRecords = [...records].sort((a, b) => 
      new Date(a.timestamp) - new Date(b.timestamp)
    );
    
    const labels = sortedRecords.map(record => {
      const date = new Date(record.timestamp);
      return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
    });
    
    const data = sortedRecords.map(record => record.count);
    
    this.charts.trend = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: '导出数量',
          data: data,
          borderColor: '#ff2442',
          backgroundColor: 'rgba(255, 36, 66, 0.1)',
          tension: 0.4,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            display: false
          }
        },
        scales: {
          y: {
            beginAtZero: true
          }
        }
      }
    });
  }

  renderFormatChart(records) {
    const ctx = document.getElementById('formatChart');
    
    // 统计各格式数量
    const formatCount = {};
    records.forEach(record => {
      const format = record.format || 'unknown';
      formatCount[format] = (formatCount[format] || 0) + 1;
    });
    
    const labels = Object.keys(formatCount).map(f => f.toUpperCase());
    const data = Object.values(formatCount);
    
    this.charts.format = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: [
            '#ff2442',
            '#ff6b6b',
            '#ffa500',
            '#4caf50',
            '#2196f3'
          ]
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            position: 'bottom'
          }
        }
      }
    });
  }

  renderTargetChart(records) {
    const ctx = document.getElementById('targetChart');
    
    // 统计各目标数量
    const targetCount = {};
    records.forEach(record => {
      const target = record.target || 'unknown';
      targetCount[target] = (targetCount[target] || 0) + 1;
    });
    
    const targetNames = {
      'local': '本地文件',
      'feishu': '飞书',
      'notion': 'Notion',
      'unknown': '未知'
    };
    
    const labels = Object.keys(targetCount).map(t => targetNames[t] || t);
    const data = Object.values(targetCount);
    
    this.charts.target = new Chart(ctx, {
      type: 'pie',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: [
            '#ff2442',
            '#00d4ff',
            '#000000',
            '#94a3b8'
          ]
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            position: 'bottom'
          }
        }
      }
    });
  }

  renderWeeklyChart(records) {
    const ctx = document.getElementById('weeklyChart');
    
    // 按周统计
    const weeklyCount = {};
    records.forEach(record => {
      const date = new Date(record.timestamp);
      const weekStart = this.getWeekStart(date);
      const weekKey = weekStart.toLocaleDateString('zh-CN');
      
      if (!weeklyCount[weekKey]) {
        weeklyCount[weekKey] = { count: 0, items: 0 };
      }
      weeklyCount[weekKey].count += 1;
      weeklyCount[weekKey].items += record.count;
    });
    
    const sortedWeeks = Object.keys(weeklyCount).sort((a, b) => 
      new Date(a) - new Date(b)
    );
    
    const labels = sortedWeeks.map(week => {
      const date = new Date(week);
      return `${date.getMonth() + 1}/${date.getDate()}`;
    });
    
    const countData = sortedWeeks.map(week => weeklyCount[week].count);
    const itemsData = sortedWeeks.map(week => weeklyCount[week].items);
    
    this.charts.weekly = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: '导出次数',
            data: countData,
            backgroundColor: '#ff2442',
            yAxisID: 'y'
          },
          {
            label: '收藏数量',
            data: itemsData,
            backgroundColor: '#4caf50',
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            position: 'bottom'
          }
        },
        scales: {
          y: {
            type: 'linear',
            display: true,
            position: 'left',
            beginAtZero: true
          },
          y1: {
            type: 'linear',
            display: true,
            position: 'right',
            beginAtZero: true,
            grid: {
              drawOnChartArea: false
            }
          }
        }
      }
    });
  }

  getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // 调整为周一
    return new Date(d.setDate(diff));
  }

  renderRecords() {
    const records = this.history.exportRecords || [];
    const recordsList = document.getElementById('recordsList');
    const emptyState = document.getElementById('emptyState');
    
    if (records.length === 0) {
      recordsList.style.display = 'none';
      emptyState.style.display = 'block';
      return;
    }
    
    recordsList.style.display = 'flex';
    emptyState.style.display = 'none';
    
    // 按时间倒序排列
    const sortedRecords = [...records].sort((a, b) => 
      new Date(b.timestamp) - new Date(a.timestamp)
    );
    
    recordsList.innerHTML = sortedRecords.map((record, index) => {
      const date = new Date(record.timestamp);
      const formatIcons = {
        'json': '📄',
        'csv': '📊',
        'html': '🌐',
        'markdown': '📝'
      };
      
      const targetNames = {
        'local': '本地文件',
        'feishu': '飞书',
        'notion': 'Notion'
      };
      
      return `
        <div class="record-item">
          <div class="record-icon">${formatIcons[record.format] || '📦'}</div>
          <div class="record-content">
            <div class="record-title">
              导出 ${record.count} 条收藏
              <span class="record-badge">${record.format?.toUpperCase() || 'N/A'}</span>
            </div>
            <div class="record-meta">
              <span>📅 ${date.toLocaleString('zh-CN')}</span>
              <span>📍 ${targetNames[record.target] || record.target}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  async clearHistory() {
    if (!confirm('确定要清除所有导出历史记录吗?此操作不可恢复。')) {
      return;
    }
    
    await chrome.storage.local.remove(['exportHistory', 'lastExportFile']);
    
    alert('历史记录已清除');
    window.location.reload();
  }
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  new HistoryPage();
});
