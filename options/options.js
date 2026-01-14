// Options页面逻辑
class OptionsController {
  constructor() {
    this.init();
  }

  async init() {
    await this.loadSettings();
    this.bindEvents();
  }

  async loadSettings() {
    const result = await chrome.storage.local.get([
      'feishuConfig',
      'notionConfig',
      'defaultFormat',
      'autoDownloadImages',
      'maxConcurrent',
      'retryTimes',
      'enableDebug',
      'autoExportConfig'
    ]);

    // 飞书配置
    if (result.feishuConfig) {
      document.getElementById('feishuAppId').value = result.feishuConfig.appId || '';
      document.getElementById('feishuAppSecret').value = result.feishuConfig.appSecret || '';
    }

    // Notion配置
    if (result.notionConfig) {
      document.getElementById('notionToken').value = result.notionConfig.token || '';
      document.getElementById('notionDatabaseId').value = result.notionConfig.databaseId || '';
    }

    // 本地导出设置
    const defaultFormat = result.defaultFormat || 'json';
    document.querySelector(`input[name="defaultFormat"][value="${defaultFormat}"]`).checked = true;
    document.getElementById('autoDownloadImages').checked = result.autoDownloadImages || false;

    // 高级设置
    document.getElementById('maxConcurrent').value = result.maxConcurrent || 3;
    document.getElementById('retryTimes').value = result.retryTimes || 3;
    document.getElementById('enableDebug').checked = result.enableDebug || false;
    
    // 自动导出设置
    const autoExportConfig = result.autoExportConfig || {};
    document.getElementById('enableAutoExport').checked = autoExportConfig.enabled || false;
    document.getElementById('autoExportDay').value = autoExportConfig.day || '1';
    document.getElementById('autoExportHour').value = autoExportConfig.hour || '10';
    document.getElementById('autoExportFormat').value = autoExportConfig.format || 'json';
    document.getElementById('autoExportAppendMode').checked = autoExportConfig.appendMode !== false;
    document.getElementById('autoExportOnlyNew').checked = autoExportConfig.onlyNew !== false;
    
    // 显示/隐藏自动导出选项
    document.getElementById('autoExportOptions').style.display = 
      autoExportConfig.enabled ? 'block' : 'none';
  }

  bindEvents() {
    // 保存按钮
    document.getElementById('saveBtn').addEventListener('click', () => this.saveSettings());

    // 测试连接按钮
    document.getElementById('testFeishu').addEventListener('click', () => this.testFeishu());
    document.getElementById('testNotion').addEventListener('click', () => this.testNotion());

    // 自动导出复选框
    document.getElementById('enableAutoExport').addEventListener('change', (e) => {
      document.getElementById('autoExportOptions').style.display = e.target.checked ? 'block' : 'none';
    });
    
    // 数据管理按钮
    document.getElementById('clearCache').addEventListener('click', () => this.clearCache());
    document.getElementById('exportSettings').addEventListener('click', () => this.exportSettings());
    document.getElementById('importSettings').addEventListener('click', () => {
      document.getElementById('importFile').click();
    });
    document.getElementById('importFile').addEventListener('change', (e) => this.importSettings(e));
  }

  async saveSettings() {
    const saveBtn = document.getElementById('saveBtn');
    const saveStatus = document.getElementById('saveStatus');
    
    saveBtn.disabled = true;
    saveBtn.textContent = '保存中...';

    try {
      const settings = {
        feishuConfig: {
          appId: document.getElementById('feishuAppId').value.trim(),
          appSecret: document.getElementById('feishuAppSecret').value.trim()
        },
        notionConfig: {
          token: document.getElementById('notionToken').value.trim(),
          databaseId: document.getElementById('notionDatabaseId').value.trim()
        },
        defaultFormat: document.querySelector('input[name="defaultFormat"]:checked').value,
        autoDownloadImages: document.getElementById('autoDownloadImages').checked,
        maxConcurrent: parseInt(document.getElementById('maxConcurrent').value),
        retryTimes: parseInt(document.getElementById('retryTimes').value),
        enableDebug: document.getElementById('enableDebug').checked,
        autoExportConfig: {
          enabled: document.getElementById('enableAutoExport').checked,
          day: document.getElementById('autoExportDay').value,
          hour: document.getElementById('autoExportHour').value,
          format: document.getElementById('autoExportFormat').value,
          appendMode: document.getElementById('autoExportAppendMode').checked,
          onlyNew: document.getElementById('autoExportOnlyNew').checked
        }
      };

      await chrome.storage.local.set(settings);

      saveStatus.textContent = '✓ 设置已保存';
      saveStatus.style.color = '#28a745';

      setTimeout(() => {
        saveStatus.textContent = '';
      }, 3000);
    } catch (error) {
      saveStatus.textContent = '✗ 保存失败: ' + error.message;
      saveStatus.style.color = '#dc3545';
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = '💾 保存设置';
    }
  }

  async testFeishu() {
    const appId = document.getElementById('feishuAppId').value.trim();
    const appSecret = document.getElementById('feishuAppSecret').value.trim();

    if (!appId || !appSecret) {
      alert('请先填写飞书App ID和App Secret');
      return;
    }

    const testBtn = document.getElementById('testFeishu');
    testBtn.disabled = true;
    testBtn.textContent = '测试中...';

    try {
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

      if (result.code === 0) {
        alert('✓ 飞书连接测试成功!');
      } else {
        alert('✗ 飞书连接测试失败: ' + result.msg);
      }
    } catch (error) {
      alert('✗ 飞书连接测试失败: ' + error.message);
    } finally {
      testBtn.disabled = false;
      testBtn.textContent = '测试连接';
    }
  }

  async testNotion() {
    const token = document.getElementById('notionToken').value.trim();

    if (!token) {
      alert('请先填写Notion Integration Token');
      return;
    }

    const testBtn = document.getElementById('testNotion');
    testBtn.disabled = true;
    testBtn.textContent = '测试中...';

    try {
      const response = await fetch('https://api.notion.com/v1/users/me', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Notion-Version': '2022-06-28'
        }
      });

      if (response.ok) {
        const result = await response.json();
        alert(`✓ Notion连接测试成功!\n用户: ${result.name || result.bot?.owner?.user?.name || 'Bot'}`);
      } else {
        const error = await response.json();
        alert('✗ Notion连接测试失败: ' + error.message);
      }
    } catch (error) {
      alert('✗ Notion连接测试失败: ' + error.message);
    } finally {
      testBtn.disabled = false;
      testBtn.textContent = '测试连接';
    }
  }

  async clearCache() {
    if (!confirm('确定要清除所有缓存数据吗?这将删除已采集的收藏数据。')) {
      return;
    }

    try {
      await chrome.storage.local.remove(['collectedData']);
      alert('✓ 缓存数据已清除');
    } catch (error) {
      alert('✗ 清除失败: ' + error.message);
    }
  }

  async exportSettings() {
    try {
      const settings = await chrome.storage.local.get(null);
      
      // 移除敏感数据中的密钥(可选)
      const exportData = JSON.stringify(settings, null, 2);
      
      const blob = new Blob([exportData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `xhs-exporter-settings-${Date.now()}.json`;
      a.click();
      
      URL.revokeObjectURL(url);
    } catch (error) {
      alert('✗ 导出失败: ' + error.message);
    }
  }

  async importSettings(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const settings = JSON.parse(text);
      
      await chrome.storage.local.set(settings);
      
      alert('✓ 配置导入成功,页面将重新加载');
      location.reload();
    } catch (error) {
      alert('✗ 导入失败: ' + error.message);
    }
  }
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  new OptionsController();
});
