// Content Script - 在小红书页面中运行
class XiaohongshuCollector {
  constructor() {
    this.collectedItems = [];
    this.isCollecting = false;
    this.isPaused = false;
    this.startIndex = 1;
    this.endIndex = -1; // -1表示采集全部
    this.currentIndex = 0; // 当前采集到的位置
    this.startTime = 0; // 采集开始时间
    this.lastSaveCount = 0; // 上次保存时的数量
    this.saveInterval = 10; // 每10条保存一次
    
    // 速度统计相关
    this.lastProgressTime = 0; // 上次进度更新时间
    this.lastProgressCount = 0; // 上次进度更新时的数量
    this.speedSamples = []; // 速度采样数组
    this.maxSpeedSamples = 10; // 最多保存10个采样
    this.totalEstimate = 0; // 总数预估
    
    // 心跳检测相关
    this.lastHeartbeat = 0; // 上次心跳时间
    this.heartbeatInterval = 5000; // 心跳间隔 5秒
    this.heartbeatTimer = null; // 心跳定时器
    
    // 进度面板相关
    this.progressPanel = null; // 进度面板 DOM元素
    this.isPanelMinimized = false; // 面板是否最小化
    
    // 智能优化相关
    this.scrollDelay = 1500; // 滚动延迟(毫秒)
    this.minScrollDelay = 800; // 最小延迟
    this.maxScrollDelay = 3000; // 最大延迟
  }

  async startCollect(options = {}) {
    if (this.isCollecting) {
      return { success: false, error: '正在采集中,请勿重复操作' };
    }

    this.isCollecting = true;
    this.isPaused = false;
    this.collectedItems = [];
    this.startTime = Date.now();
    this.currentIndex = 0;
    this.lastSaveCount = 0;
    
    // 重置速度统计
    this.lastProgressTime = 0;
    this.lastProgressCount = 0;
    this.speedSamples = [];
    this.totalEstimate = 0;
    
    // 设置采集范围
    this.startIndex = options.startIndex || 1;
    this.endIndex = options.endIndex || -1;
    
    // 启动心跳检测
    this.startHeartbeat();
    
    // 显示进度面板
    this.showProgressPanel();

    try {
      // 检查是否在收藏夹页面
      if (!this.isOnFavoritePage()) {
        throw new Error('请先打开小红书收藏夹页面');
      }

      // 等待页面加载
      await this.waitForPageLoad();

      // 滚动加载所有内容(如果需要)
      await this.scrollToLoadAll();

      // 提取收藏数据
      const items = this.extractFavoriteItems();

      this.collectedItems = items;
      this.currentIndex = items.length;
      this.isCollecting = false;
      
      // 最终保存
      await this.saveProgress();
      
      // 如果是正常完成(非暂停),清除进度记录
      if (!this.isPaused) {
        await this.clearProgress();
      }

      return {
        success: true,
        data: items,
        paused: this.isPaused
      };
    } catch (error) {
      this.isCollecting = false;
      
      // 错误时也保存进度
      await this.saveProgress();
      
      return {
        success: false,
        error: error.message,
        data: this.collectedItems, // 返回已采集的数据
        paused: this.isPaused
      };
    } finally {
      // 停止心跳检测
      this.stopHeartbeat();
    }
  }

  async pauseCollect() {
    if (this.isCollecting) {
      this.isPaused = true;
      this.isCollecting = false;
      
      // 保存进度
      await this.saveProgress();
      
      return {
        success: true,
        data: this.collectedItems,
        message: `已暂停,已采集 ${this.collectedItems.length} 条`
      };
    }
    return {
      success: false,
      error: '当前没有正在进行的采集任务'
    };
  }

  isOnFavoritePage() {
    // 检查URL是否包含收藏夹相关路径
    const url = window.location.href;
    return url.includes('xiaohongshu.com') && 
           (url.includes('/user/profile/') || 
            url.includes('/collection') || 
            document.querySelector('[class*="collect"]') !== null);
  }

  async waitForPageLoad() {
    return new Promise((resolve) => {
      if (document.readyState === 'complete') {
        setTimeout(resolve, 1000);
      } else {
        window.addEventListener('load', () => {
          setTimeout(resolve, 1000);
        });
      }
    });
  }

  async scrollToLoadAll() {
    let lastHeight = 0;
    let unchangedCount = 0;
    const maxUnchangedCount = 3;
    
    console.log('=== 开始滚动加载 ===');
    console.log(`采集范围: ${this.startIndex} - ${this.endIndex === -1 ? '全部' : this.endIndex}`);

    // 如果指定了结束位置,先计算需要加载到多少条
    const needLoadCount = this.endIndex > 0 ? this.endIndex : Infinity;
    console.log(`目标数量: ${needLoadCount === Infinity ? '全部' : needLoadCount}`);

    while (unchangedCount < maxUnchangedCount && !this.isPaused) {
      // 实时提取并统计已采集的笔记
      const extractStart = Date.now();
      const items = this.extractFavoriteItems();
      this.collectedItems = items;
      const currentItemCount = items.length;
      this.currentIndex = currentItemCount;
      const extractTime = Date.now() - extractStart;
      if (extractTime > 100) {
        console.log(`提取笔记耗时: ${extractTime}ms`);
      }
      
      // 计算采集速度
      const now = Date.now();
      const elapsedTime = now - this.startTime;
      const elapsedSeconds = elapsedTime / 1000;
      
      // 计算当前速度(每秒采集条数)
      let currentSpeed = 0;
      if (this.lastProgressTime > 0) {
        const timeDiff = (now - this.lastProgressTime) / 1000;
        const countDiff = currentItemCount - this.lastProgressCount;
        if (timeDiff > 0) {
          currentSpeed = countDiff / timeDiff;
          // 添加到采样数组
          this.speedSamples.push(currentSpeed);
          if (this.speedSamples.length > this.maxSpeedSamples) {
            this.speedSamples.shift();
          }
        }
      }
      
      // 计算平均速度
      const avgSpeed = this.speedSamples.length > 0 
        ? this.speedSamples.reduce((a, b) => a + b, 0) / this.speedSamples.length 
        : 0;
      
      // 预估总数(如果没有指定结束位置)
      if (this.endIndex <= 0 && avgSpeed > 0) {
        // 根据当前速度和加载趋势预估
        this.totalEstimate = Math.max(this.totalEstimate, currentItemCount + 100);
      } else if (this.endIndex > 0) {
        this.totalEstimate = this.endIndex;
      }
      
      // 计算进度百分比
      const progressPercent = this.totalEstimate > 0 
        ? Math.min(100, (currentItemCount / this.totalEstimate) * 100) 
        : 0;
      
      // 预估剩余时间
      let remainingTime = 0;
      if (avgSpeed > 0 && this.totalEstimate > currentItemCount) {
        remainingTime = (this.totalEstimate - currentItemCount) / avgSpeed;
      }
      
      // 发送进度更新
      const progressData = {
        action: 'collectProgress',
        current: currentItemCount,
        total: this.totalEstimate > 0 ? this.totalEstimate : null,
        percent: progressPercent,
        speed: avgSpeed,
        elapsedTime: elapsedSeconds,
        remainingTime: remainingTime,
        target: this.endIndex > 0 ? this.endIndex : '全部'
      };
      
      chrome.runtime.sendMessage(progressData);
      
      // 更新进度面板
      this.updateProgressPanel(progressData);
      
      // 更新上次进度记录
      this.lastProgressTime = now;
      this.lastProgressCount = currentItemCount;
      
      // 自动保存检查
      await this.autoSaveCheck();

      if (currentItemCount >= needLoadCount) {
        console.log(`已加载足够的内容: ${currentItemCount} 条`);
        break;
      }

      // 滚动到底部
      window.scrollTo(0, document.body.scrollHeight);

      // 智能优化的等待时间
      const delay = this.calculateOptimalDelay(avgSpeed);
      await this.sleep(delay);

      const currentHeight = document.body.scrollHeight;

      if (currentHeight === lastHeight) {
        unchangedCount++;
      } else {
        unchangedCount = 0;
        lastHeight = currentHeight;
      }

      console.log(`滚动加载中... 高度: ${currentHeight}, 已加载: ${currentItemCount} 条, 未变化次数: ${unchangedCount}`);
    }

    // 滚动回顶部
    window.scrollTo(0, 0);
    await this.sleep(500);
  }

  extractFavoriteItems() {
    const startTime = Date.now();
    
    // 通过链接查找所有笔记
    const links = document.querySelectorAll('a[href*="/explore/"]');
    
    // 使用Map存储所有笔记(以noteId为键,自动去重)
    const allNotes = new Map();
    
    // 先加载已有的笔记(保持累积)
    if (this.collectedItems && this.collectedItems.length > 0) {
      this.collectedItems.forEach(item => {
        if (item.id) {
          allNotes.set(item.id, item);
        }
      });
      console.log(`加载了 ${allNotes.size} 条已采集的笔记`);
    }
    
    // 提取当前页面的笔记
    links.forEach(link => {
      const href = link.href;
      const match = href.match(/\/explore\/([a-zA-Z0-9]+)/);
      if (match && match[1]) {
        const noteId = match[1];
        // 如果这个笔记还没有采集,就添加
        if (!allNotes.has(noteId)) {
          const item = this.parseNoteFromLink(link, noteId, allNotes.size + 1);
          if (item) {
            allNotes.set(noteId, item);
          }
        }
      }
    });
    
    // 转换为数组
    const items = Array.from(allNotes.values());
    
    // 应用范围过滤(如果指定了范围)
    let filteredItems = items;
    if (this.startIndex > 1 || this.endIndex > 0) {
      filteredItems = items.filter((item, index) => {
        const position = index + 1;
        return position >= this.startIndex && (this.endIndex === -1 || position <= this.endIndex);
      });
      console.log(`应用范围过滤 (${this.startIndex}-${this.endIndex === -1 ? '全部' : this.endIndex}): ${items.length} → ${filteredItems.length} 条`);
    }
    
    const extractTime = Date.now() - startTime;
    console.log(`提取完成: ${filteredItems.length}条笔记 (总计: ${items.length}, 范围: ${this.startIndex}-${this.endIndex === -1 ? '全部' : this.endIndex}, 耗时: ${extractTime}ms)`);
    return filteredItems;
  }

  parseNoteFromLink(link, noteId, index) {
    try {
      // 查找链接附近的图片
      let imgElement = link.querySelector('img');
      if (!imgElement) {
        const parent = link.parentElement;
        imgElement = parent ? parent.querySelector('img') : null;
      }

      const coverImage = imgElement ? imgElement.src : '';

      // 尝试获取标题
      const titleElement = link.querySelector('[class*="title"]') || 
                          link.querySelector('span') ||
                          link.querySelector('p');
      const title = titleElement ? titleElement.textContent.trim() : '无标题';

      return {
        index: index,
        id: noteId,
        title: title || '无标题',
        url: `https://www.xiaohongshu.com/explore/${noteId}`,
        coverImage: coverImage,
        author: {
          nickname: '未知作者'
        },
        collectTime: new Date().toISOString(),
        type: '图文'
      };
    } catch (error) {
      console.error('从链接解析笔记失败:', error);
      return null;
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // 保存采集进度
  async saveProgress() {
    try {
      await chrome.storage.local.set({
        collectionProgress: {
          status: this.isPaused ? 'paused' : (this.isCollecting ? 'in_progress' : 'completed'),
          startTime: this.startTime,
          lastUpdateTime: Date.now(),
          startIndex: this.startIndex,
          endIndex: this.endIndex,
          currentIndex: this.currentIndex,
          collectedCount: this.collectedItems.length,
          data: this.collectedItems
        }
      });
      console.log(`进度已保存: ${this.collectedItems.length}条`);
    } catch (error) {
      console.error('保存进度失败:', error);
    }
  }

  // 自动保存检查
  async autoSaveCheck() {
    if (this.collectedItems.length - this.lastSaveCount >= this.saveInterval) {
      await this.saveProgress();
      this.lastSaveCount = this.collectedItems.length;
    }
  }

  // 清除进度记录
  async clearProgress() {
    try {
      await chrome.storage.local.remove('collectionProgress');
      console.log('进度记录已清除');
    } catch (error) {
      console.error('清除进度失败:', error);
    }
  }

  // 启动心跳检测
  startHeartbeat() {
    this.lastHeartbeat = Date.now();
    
    // 清除之前的定时器
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }
    
    // 启动心跳定时器
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, this.heartbeatInterval);
    
    console.log('心跳检测已启动');
  }

  // 停止心跳检测
  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
      console.log('心跳检测已停止');
    }
  }

  // 发送心跳
  sendHeartbeat() {
    const now = Date.now();
    this.lastHeartbeat = now;
    
    // 发送心跳消息到background
    chrome.runtime.sendMessage({
      action: 'heartbeat',
      timestamp: now,
      isCollecting: this.isCollecting,
      isPaused: this.isPaused,
      currentCount: this.collectedItems.length,
      currentIndex: this.currentIndex
    }).catch(error => {
      console.error('发送心跳失败:', error);
    });
  }

  // 计算最优滚动延迟(智能优化)
  calculateOptimalDelay(avgSpeed) {
    // 如果还没有速度数据,使用默认延迟
    if (!avgSpeed || avgSpeed === 0) {
      return this.scrollDelay;
    }

    // 根据速度调整延迟
    // 速度快(大于3条/秒) -> 减少延迟
    // 速度慢(小于2条/秒) -> 增加延迟
    let delay = this.scrollDelay;

    if (avgSpeed > 3.5) {
      // 网络很快,减少延迟到30%
      delay = this.scrollDelay * 0.7;
    } else if (avgSpeed > 2.5) {
      // 网络较快,减少延迟到15%
      delay = this.scrollDelay * 0.85;
    } else if (avgSpeed < 1.5) {
      // 网络很慢,增加延迟50%
      delay = this.scrollDelay * 1.5;
    } else if (avgSpeed < 2.0) {
      // 网络较慢,增加延迟30%
      delay = this.scrollDelay * 1.3;
    }

    // 限制在最小和最大值之间
    delay = Math.max(this.minScrollDelay, Math.min(delay, this.maxScrollDelay));

    // 更新当前延迟值(用于下次计算)
    this.scrollDelay = delay;

    console.log(`智能优化: 当前速度 ${avgSpeed.toFixed(2)} 条/秒, 调整延迟为 ${Math.round(delay)}ms`);

    return delay;
  }

  // 检查心跳超时(由外部调用)
  isHeartbeatTimeout() {
    const now = Date.now();
    const timeout = this.heartbeatInterval * 3; // 3倍心跳间隔为超时
    return (now - this.lastHeartbeat) > timeout;
  }

  // 创建进度面板
  createProgressPanel() {
    // 如果已存在,先移除
    if (this.progressPanel) {
      this.progressPanel.remove();
    }

    // 创建面板容器
    const panel = document.createElement('div');
    panel.className = 'xhs-exporter-progress-panel';
    panel.innerHTML = `
      <div class="xhs-exporter-panel-header">
        <div class="xhs-exporter-panel-title">采集进度</div>
        <div class="xhs-exporter-panel-actions">
          <button class="xhs-exporter-panel-btn" id="xhs-minimize-btn" title="最小化">−</button>
          <button class="xhs-exporter-panel-btn" id="xhs-close-btn" title="关闭">×</button>
        </div>
      </div>
      <div class="xhs-exporter-panel-content">
        <div class="xhs-exporter-progress-header">
          <div class="xhs-exporter-progress-title">
            <span class="xhs-exporter-progress-status">采集中...</span>
            <span class="xhs-exporter-progress-percent">0%</span>
          </div>
          <div class="xhs-exporter-progress-stats">
            <span class="xhs-exporter-stat-item">
              <span class="xhs-exporter-stat-label">已采集:</span>
              <span class="xhs-exporter-stat-value" id="xhs-progress-current">0</span>
            </span>
            <span class="xhs-exporter-stat-separator">/</span>
            <span class="xhs-exporter-stat-item">
              <span class="xhs-exporter-stat-label">总计:</span>
              <span class="xhs-exporter-stat-value" id="xhs-progress-total">--</span>
            </span>
          </div>
        </div>
        
        <div class="xhs-exporter-progress-bar-container">
          <div class="xhs-exporter-progress-bar">
            <div class="xhs-exporter-progress-fill" id="xhs-progress-fill">
              <span class="xhs-exporter-progress-bar-text" id="xhs-progress-bar-text">0%</span>
            </div>
          </div>
        </div>
        
        <div class="xhs-exporter-progress-details">
          <div class="xhs-exporter-detail-row">
            <span class="xhs-exporter-detail-label">采集速度</span>
            <span class="xhs-exporter-detail-value" id="xhs-collect-speed">-- 条/秒</span>
          </div>
          <div class="xhs-exporter-detail-row">
            <span class="xhs-exporter-detail-label">已用时间</span>
            <span class="xhs-exporter-detail-value" id="xhs-elapsed-time">00:00</span>
          </div>
          <div class="xhs-exporter-detail-row">
            <span class="xhs-exporter-detail-label">预计剩余</span>
            <span class="xhs-exporter-detail-value" id="xhs-remaining-time">--</span>
          </div>
        </div>
        
        <div class="xhs-exporter-progress-text" id="xhs-progress-text">正在加载收藏夹...</div>
        
        <div class="xhs-exporter-panel-controls">
          <button class="xhs-exporter-control-btn pause" id="xhs-pause-btn" title="暂停采集">
            <span>⏸️</span>
            <span>暂停采集</span>
          </button>
          <button class="xhs-exporter-control-btn resume" id="xhs-resume-btn" style="display: none;" title="继续采集">
            <span>▶️</span>
            <span>继续采集</span>
          </button>
          <button class="xhs-exporter-control-btn export" id="xhs-export-btn" title="导出数据">
            <span>💾</span>
            <span>导出数据</span>
          </button>
        </div>
      </div>
    `;

    // 添加到页面
    document.body.appendChild(panel);
    this.progressPanel = panel;

    // 绑定事件
    this.bindPanelEvents();

    return panel;
  }

  // 绑定面板事件
  bindPanelEvents() {
    if (!this.progressPanel) return;

    // 最小化按钮
    const minimizeBtn = this.progressPanel.querySelector('#xhs-minimize-btn');
    if (minimizeBtn) {
      minimizeBtn.addEventListener('click', () => {
        this.togglePanelMinimize();
      });
    }

    // 关闭按钮
    const closeBtn = this.progressPanel.querySelector('#xhs-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.hideProgressPanel();
      });
    }

    // 拖拽功能
    this.makePanelDraggable();
    
    // 暂停按钮
    const pauseBtn = this.progressPanel.querySelector('#xhs-pause-btn');
    if (pauseBtn) {
      pauseBtn.addEventListener('click', () => {
        this.pauseCollect();
        pauseBtn.style.display = 'none';
        const resumeBtn = this.progressPanel.querySelector('#xhs-resume-btn');
        if (resumeBtn) resumeBtn.style.display = 'flex';
        console.log('用户点击面板暂停按钮');
      });
    }
    
    // 继续按钮
    const resumeBtn = this.progressPanel.querySelector('#xhs-resume-btn');
    if (resumeBtn) {
      resumeBtn.addEventListener('click', async () => {
        resumeBtn.style.display = 'none';
        const pauseBtn = this.progressPanel.querySelector('#xhs-pause-btn');
        if (pauseBtn) pauseBtn.style.display = 'flex';
        await this.resumeCollect();
        console.log('用户点击面板继续按钮');
      });
    }
    
    // 导出按钮
    const exportBtn = this.progressPanel.querySelector('#xhs-export-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        // 发送消息给popup进行导出
        chrome.runtime.sendMessage({
          action: 'openPopup',
          data: this.collectedItems
        }).catch(error => {
          console.error('打开popup失败:', error);
          // 如果无法打开popup,直接导出JSON
          this.quickExportJSON();
        });
        console.log('用户点击面板导出按钮');
      });
    }
  }

  // 切换面板最小化状态
  togglePanelMinimize() {
    if (!this.progressPanel) return;

    this.isPanelMinimized = !this.isPanelMinimized;
    
    if (this.isPanelMinimized) {
      this.progressPanel.classList.add('minimized');
      const minimizeBtn = this.progressPanel.querySelector('#xhs-minimize-btn');
      if (minimizeBtn) {
        minimizeBtn.textContent = '+';
        minimizeBtn.title = '展开';
      }
    } else {
      this.progressPanel.classList.remove('minimized');
      const minimizeBtn = this.progressPanel.querySelector('#xhs-minimize-btn');
      if (minimizeBtn) {
        minimizeBtn.textContent = '−';
        minimizeBtn.title = '最小化';
      }
    }
  }

  // 隐藏进度面板
  hideProgressPanel() {
    if (this.progressPanel) {
      this.progressPanel.remove();
      this.progressPanel = null;
    }
  }

  // 显示进度面板
  showProgressPanel() {
    if (!this.progressPanel) {
      this.createProgressPanel();
    }
  }

  // 使面板可拖拽
  makePanelDraggable() {
    if (!this.progressPanel) return;

    const header = this.progressPanel.querySelector('.xhs-exporter-panel-header');
    if (!header) return;

    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;

    header.style.cursor = 'move';

    header.addEventListener('mousedown', (e) => {
      // 如果点击的是按钮,不启动拖拽
      if (e.target.classList.contains('xhs-exporter-panel-btn')) {
        return;
      }

      isDragging = true;
      initialX = e.clientX - this.progressPanel.offsetLeft;
      initialY = e.clientY - this.progressPanel.offsetTop;
      this.progressPanel.classList.add('dragging');
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;

      e.preventDefault();
      currentX = e.clientX - initialX;
      currentY = e.clientY - initialY;

      // 限制在视口范围内
      const maxX = window.innerWidth - this.progressPanel.offsetWidth;
      const maxY = window.innerHeight - this.progressPanel.offsetHeight;

      currentX = Math.max(0, Math.min(currentX, maxX));
      currentY = Math.max(0, Math.min(currentY, maxY));

      this.progressPanel.style.left = currentX + 'px';
      this.progressPanel.style.top = currentY + 'px';
      this.progressPanel.style.right = 'auto';
      this.progressPanel.style.bottom = 'auto';
    });

    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        this.progressPanel.classList.remove('dragging');
      }
    });
  }

  // 更新进度面板
  updateProgressPanel(data) {
    if (!this.progressPanel) return;

    // 更新百分比
    const percent = data.percent || 0;
    const percentText = percent.toFixed(1) + '%';
    
    const progressPercent = this.progressPanel.querySelector('.xhs-exporter-progress-percent');
    if (progressPercent) {
      progressPercent.textContent = percentText;
    }
    
    // 更新进度条
    const progressFill = this.progressPanel.querySelector('#xhs-progress-fill');
    const progressBarText = this.progressPanel.querySelector('#xhs-progress-bar-text');
    if (progressFill) {
      progressFill.style.width = percent + '%';
    }
    if (progressBarText) {
      progressBarText.textContent = percentText;
    }
    
    // 更新当前/总计
    const progressCurrent = this.progressPanel.querySelector('#xhs-progress-current');
    const progressTotal = this.progressPanel.querySelector('#xhs-progress-total');
    if (progressCurrent) {
      progressCurrent.textContent = data.current || 0;
    }
    if (progressTotal) {
      progressTotal.textContent = data.total || '--';
    }
    
    // 更新采集速度
    const collectSpeed = this.progressPanel.querySelector('#xhs-collect-speed');
    if (collectSpeed && data.speed !== undefined) {
      const speed = data.speed.toFixed(2);
      collectSpeed.textContent = speed + ' 条/秒';
    }
    
    // 更新已用时间
    const elapsedTime = this.progressPanel.querySelector('#xhs-elapsed-time');
    if (elapsedTime && data.elapsedTime !== undefined) {
      const minutes = Math.floor(data.elapsedTime / 60);
      const seconds = Math.floor(data.elapsedTime % 60);
      elapsedTime.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    
    // 更新预计剩余时间
    const remainingTime = this.progressPanel.querySelector('#xhs-remaining-time');
    if (remainingTime && data.remainingTime !== undefined) {
      if (data.remainingTime > 0) {
        const minutes = Math.floor(data.remainingTime / 60);
        const seconds = Math.floor(data.remainingTime % 60);
        if (minutes > 0) {
          remainingTime.textContent = `${minutes}分${seconds}秒`;
        } else {
          remainingTime.textContent = `${seconds}秒`;
        }
      } else {
        remainingTime.textContent = '--';
      }
    }
    
    // 更新进度文本
    const progressText = this.progressPanel.querySelector('#xhs-progress-text');
    if (progressText) {
      progressText.textContent = `正在加载收藏夹... 已发现 ${data.current} 条收藏`;
    }
  }

  // 继续采集(从上次中断的位置继续)
  async resumeCollect() {
    if (this.isCollecting) {
      return { success: false, error: '正在采集中,请勿重复操作' };
    }

    try {
      // 读取保存的进度
      const result = await chrome.storage.local.get('collectionProgress');
      const progress = result.collectionProgress;

      if (!progress) {
        return { success: false, error: '没有找到未完成的采集任务' };
      }

      // 检查状态
      if (progress.status === 'completed') {
        return { success: false, error: '上次采集已完成,无需继续' };
      }

      // 恢复状态
      this.isCollecting = true;
      this.isPaused = false;
      this.collectedItems = progress.data || [];
      this.startTime = progress.startTime;
      this.startIndex = progress.startIndex;
      this.endIndex = progress.endIndex;
      this.currentIndex = progress.currentIndex;
      this.lastSaveCount = this.collectedItems.length;

      console.log(`继续采集: 从第${this.currentIndex + 1}条开始, 已采集${this.collectedItems.length}条`);

      // 检查是否在收藏夹页面
      if (!this.isOnFavoritePage()) {
        throw new Error('请先打开小红书收藏夹页面');
      }

      // 等待页面加载
      await this.waitForPageLoad();

      // 继续滚动加载
      await this.scrollToLoadAll();

      // 提取收藏数据
      const items = this.extractFavoriteItems();

      // 合并数据(去重)
      const mergedItems = this.mergeItems(this.collectedItems, items);
      this.collectedItems = mergedItems;
      this.currentIndex = mergedItems.length;
      this.isCollecting = false;

      // 最终保存
      await this.saveProgress();

      // 如果是正常完成(非暂停),清除进度记录
      if (!this.isPaused) {
        await this.clearProgress();
      }

      return {
        success: true,
        data: mergedItems,
        paused: this.isPaused,
        message: `继续采集完成,总计${mergedItems.length}条`
      };
    } catch (error) {
      this.isCollecting = false;

      // 错误时也保存进度
      await this.saveProgress();

      return {
        success: false,
        error: error.message,
        data: this.collectedItems,
        paused: this.isPaused
      };
    }
  }

  // 合并数据并去重
  mergeItems(oldItems, newItems) {
    const idMap = new Map();

    // 先加载旧数据
    oldItems.forEach(item => {
      idMap.set(item.id, item);
    });

    // 再加载新数据(会覆盖重复的)
    newItems.forEach(item => {
      if (!idMap.has(item.id)) {
        idMap.set(item.id, item);
      }
    });

    // 转换为数组并按index排序
    const merged = Array.from(idMap.values());
    merged.sort((a, b) => (a.index || 0) - (b.index || 0));

    // 重新设置index
    merged.forEach((item, idx) => {
      item.index = idx + 1;
    });

    return merged;
  }
  
  // 快速导出JSON
  quickExportJSON() {
    try {
      const data = {
        exportTime: new Date().toISOString(),
        totalCount: this.collectedItems.length,
        items: this.collectedItems
      };
      
      const jsonStr = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `xiaohongshu_favorites_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      console.log(`快速导出JSON成功: ${this.collectedItems.length}条`);
      
      // 显示提示
      this.showToast('导出成功!', 'success');
    } catch (error) {
      console.error('快速导出JSON失败:', error);
      this.showToast('导出失败: ' + error.message, 'error');
    }
  }
  
  // 显示提示
  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `xhs-exporter-toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.remove();
    }, 3000);
  }
}

// 全局collector实例,用于暂停控制
let globalCollector = null;

// 监听来自popup的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'startCollect') {
    globalCollector = new XiaohongshuCollector();
    globalCollector.startCollect(message.options || {}).then(result => {
      globalCollector = null;
      sendResponse(result);
    });
    return true; // 保持消息通道开放
  }
  
  if (message.action === 'pauseCollect') {
    if (globalCollector) {
      globalCollector.pauseCollect().then(result => {
        sendResponse(result);
      });
    } else {
      sendResponse({
        success: false,
        error: '当前没有正在进行的采集任务'
      });
    }
    return true;
  }
  
  if (message.action === 'resumeCollect') {
    globalCollector = new XiaohongshuCollector();
    globalCollector.resumeCollect().then(result => {
      globalCollector = null;
      sendResponse(result);
    });
    return true;
  }
  
  if (message.action === 'clearProgress') {
    const tempCollector = new XiaohongshuCollector();
    tempCollector.clearProgress().then(() => {
      sendResponse({ success: true, message: '进度记录已清除' });
    });
    return true;
  }
});

// 页面加载完成后注入提示
window.addEventListener('load', () => {
  console.log('小红书收藏夹导出助手已加载');
});
