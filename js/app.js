/**
 * app.js —— 入口
 * 职责：底部 Tab 导航 + 设置面板 + 初始化 + PWA 注册
 */

(function () {
  'use strict';

  // ========== 页面切换 ==========

  function switchPage(name) {
    // 隐藏所有 page sections
    var pages = document.querySelectorAll('.page');
    pages.forEach(function (p) { p.hidden = true; });

    // 显示目标页
    var target = document.getElementById('page-' + name);
    if (target) target.hidden = false;

    // 更新 Tab 激活态
    var tabs = document.querySelectorAll('.nav-item');
    tabs.forEach(function (t) {
      if (t.dataset.page === name) t.classList.add('active');
      else t.classList.remove('active');
    });

    // 触发该页的渲染
    switch (name) {
      case 'home':   HomeModule.render(); break;
      case 'plan':   PlanModule.render(); break;
      case 'memo':   MemoModule.render(); break;
      case 'knowledge': KnowledgeModule.render(); break;
    }
  }

  function bindNavigation() {
    var tabs = document.querySelectorAll('.nav-item');
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        switchPage(tab.dataset.page);
      });
    });
  }

  // ========== 设置面板 ==========

  function bindSettings() {
    var btn = document.getElementById('btn-settings');
    if (btn) btn.addEventListener('click', openSettings);
    var installBtn = document.getElementById('btn-install');
    if (installBtn) installBtn.addEventListener('click', triggerInstall);
  }

  function openSettings() {
    var settings = Storage.load(Storage.KEYS.SETTINGS, {
      dailyNotifyTime: '08:00', notifyEnabled: true, homeLayout: ['top5','dailySentence','memoPreview']
    });

    var body = '' +
      '<div class="form-row"><label class="form-label">📤 导出全部数据（备份）</label>' +
      '<button class="btn-primary" id="do-export">下载 JSON 文件</button></div>' +
      '<div class="form-row"><label class="form-label">📥 从文件恢复数据</label>' +
      '<button class="btn-ghost" id="do-import">选择 JSON 文件...</button>' +
      '<input type="file" id="import-file" accept=".json" hidden></div>' +
      '<hr style="margin:16px 0;border:none;border-top:1px solid #e5e7eb;">' +
      '<div class="form-row"><label class="form-label">🔔 通知开关</label>' +
      '<label style="cursor:pointer;"><input type="checkbox" id="set-notify-enabled" ' +
        (settings.notifyEnabled ? 'checked' : '') + '> 开启每日一句 + 21:00 提醒</label></div>' +
      '<div class="form-row"><label class="form-label">⏰ 每日一句推送时间</label>' +
      '<input type="time" class="form-input" id="set-notify-time" value="' +
        (settings.dailyNotifyTime || '08:00') + '"></div>' +
      '<hr style="margin:16px 0;border:none;border-top:1px solid #e5e7eb;">' +
      '<div class="form-row"><label class="form-label">💾 退出前提醒保存数据</label>' +
      '<label style="cursor:pointer;"><input type="checkbox" id="set-save-reminder" ' +
        (settings.saveReminderEnabled ? 'checked' : '') + '> 离开页面前自动保存备份（覆盖上一次）</label></div>' +
      '<div class="form-row"><label class="form-label">↩️ 恢复上次自动备份</label>' +
      '<button class="btn-ghost" id="do-restore-auto">恢复上次备份</button>' +
      '<span id="auto-backup-info" style="font-size:11px;color:#9ca3af;margin-left:8px;"></span></div>' +
      '<hr style="margin:16px 0;border:none;border-top:1px solid #e5e7eb;">' +
      '<div class="form-row"><label class="form-label">☁️ 云同步（GitHub 私有仓库）</label>' +
      '<span id="cloud-sync-info" style="font-size:11px;color:#9ca3af;">检查中...</span>' +
      '<div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">' +
      '<button class="btn-ghost" id="do-cloud-sync">立即同步</button>' +
      '<button class="btn-ghost" id="do-cloud-lock">锁定工作台</button></div></div>' +
      '<hr style="margin:16px 0;border:none;border-top:1px solid #e5e7eb;">' +
      '<div style="font-size:12px;color:#9ca3af;text-align:center;">popo 专属工作台 v2.0 · 云同步版</div>';

    Utils.showModal({
      title: '⚙️ 设置',
      bodyHTML: body,
      onClose: null
    });

    // 导出
    document.getElementById('do-export').addEventListener('click', function () {
      Storage.exportAll();
      Utils.toast('✓ 已导出备份文件');
    });

    // 导入
    var fileInput = document.getElementById('import-file');
    document.getElementById('do-import').addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () {
      var f = fileInput.files[0];
      if (!f) return;
      Storage.readBackupFile(f).then(function (data) {
        var v = Storage.validateBackup(data);
        if (!v.ok) { Utils.toast('❌ 文件格式错误：' + v.reason); return; }
        Utils.confirm('这将覆盖当前所有数据，确定继续吗？').then(function (ok) {
          if (!ok) return;
          Storage.writeAll(data);
          Utils.closeModal();
          Utils.toast('✓ 恢复成功');
          // 重新渲染当前页
          var activeTab = document.querySelector('.nav-item.active');
          if (activeTab) switchPage(activeTab.dataset.page);
        });
      }).catch(function (err) {
        Utils.toast('❌ ' + err.message);
      });
    });

    // 通知开关
    document.getElementById('set-notify-enabled').addEventListener('change', function (e) {
      settings.notifyEnabled = e.target.checked;
      Storage.save(Storage.KEYS.SETTINGS, settings);
      if (e.target.checked) requestNotificationPermission();
    });

    // 通知时间
    document.getElementById('set-notify-time').addEventListener('change', function (e) {
      settings.dailyNotifyTime = e.target.value;
      Storage.save(Storage.KEYS.SETTINGS, settings);
      Utils.toast('✓ 已更新为 ' + e.target.value);
    });

    // 退出前提醒保存数据开关
    document.getElementById('set-save-reminder').addEventListener('change', function (e) {
      settings.saveReminderEnabled = e.target.checked;
      Storage.save(Storage.KEYS.SETTINGS, settings);
      if (e.target.checked) {
        // 立即保存一份作为基准，保证退出时一定有可恢复的版本
        Storage.saveAutoBackup();
        Utils.toast('✓ 已开启，离开页面时将自动保存备份');
      } else {
        Utils.toast('已关闭退出前自动保存');
      }
    });

    // 恢复上次自动备份
    var restoreBtn = document.getElementById('do-restore-auto');
    var backupInfo = document.getElementById('auto-backup-info');
    function refreshAutoBackupInfo() {
      if (Storage.hasAutoBackup()) {
        var bk = Storage.loadAutoBackup();
        var t = bk && bk.exportedAt ? new Date(bk.exportedAt) : null;
        var tstr = t ? (t.getMonth() + 1) + '/' + t.getDate() + ' ' +
          String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0') : '';
        backupInfo.textContent = tstr ? '上次备份：' + tstr : '存在备份';
        restoreBtn.disabled = false;
      } else {
        backupInfo.textContent = '暂无自动备份';
        restoreBtn.disabled = true;
      }
    }
    refreshAutoBackupInfo();
    restoreBtn.addEventListener('click', function () {
      var bk = Storage.loadAutoBackup();
      if (!bk) { Utils.toast('暂无自动备份可恢复'); return; }
      var v = Storage.validateBackup(bk);
      if (!v.ok) { Utils.toast('❌ 备份损坏：' + v.reason); return; }
      Utils.confirm('这将用上次自动备份覆盖当前所有数据，确定继续吗？').then(function (ok) {
        if (!ok) return;
        Storage.writeAll(bk);
        Utils.closeModal();
        Utils.toast('✓ 已恢复上次自动备份');
        var activeTab = document.querySelector('.nav-item.active');
        if (activeTab) switchPage(activeTab.dataset.page);
      });
    });

    // ========== 云同步 ==========
    if (window.Cloud) {
      var syncInfo = document.getElementById('cloud-sync-info');
      function refreshSyncInfo() {
        if (!Cloud.isBound()) {
          syncInfo.textContent = '未绑定令牌';
          return;
        }
        var last = Cloud.getLastSync();
        if (!last) { syncInfo.textContent = '已绑定 · 尚未同步'; return; }
        var t = new Date(last);
        syncInfo.textContent = '已绑定 · 上次同步 ' +
          (t.getMonth() + 1) + '/' + t.getDate() + ' ' +
          String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0');
      }
      refreshSyncInfo();

      document.getElementById('do-cloud-sync').addEventListener('click', function () {
        if (!Cloud.isBound()) { Utils.toast('请先通过门禁绑定令牌'); return; }
        syncInfo.textContent = '同步中...';
        Cloud.syncOnOpen().then(function (r) {
          refreshSyncInfo();
          Utils.toast('✓ 同步完成（' + (r && r.action ? r.action : 'ok') + '）');
          var activeTab = document.querySelector('.nav-item.active');
          if (activeTab) switchPage(activeTab.dataset.page);
        }).catch(function (err) {
          refreshSyncInfo();
          Utils.toast('❌ 同步失败：' + err.message);
        });
      });

      document.getElementById('do-cloud-lock').addEventListener('click', function () {
        Utils.confirm('锁定后下次打开需要输入快捷密码，确定锁定吗？').then(function (ok) {
          if (!ok) return;
          Cloud.lock();
          Utils.closeModal();
          location.reload();
        });
      });
    }

  // ========== 退出页面前提醒保存数据 ==========

  function bindExitReminder() {
    function handleExit(e) {
      var settings = Storage.load(Storage.KEYS.SETTINGS, {});
      if (!settings.saveReminderEnabled) return;
      // 自动保存完整快照，覆盖上一次版本
      Storage.saveAutoBackup();
      // 触发浏览器原生离开确认弹窗，作为「提醒」
      if (e) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    }
    window.addEventListener('beforeunload', handleExit);
    // 移动端 pagehide 更可靠，作为兜底同样保存备份
    window.addEventListener('pagehide', function () {
      var settings = Storage.load(Storage.KEYS.SETTINGS, {});
      if (settings.saveReminderEnabled) Storage.saveAutoBackup();
    });
  }

  // ========== PWA 安装 ==========

  var deferredPrompt = null;

  function bindInstallButton() {
    var btn = document.getElementById('btn-install');
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      deferredPrompt = e;
      if (btn) btn.hidden = false;
    });
    window.addEventListener('appinstalled', function () {
      deferredPrompt = null;
      if (btn) btn.hidden = true;
    });
  }

  function triggerInstall() {
    if (!deferredPrompt) {
      Utils.toast('此浏览器暂不支持安装，或已安装过');
      return;
    }
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(function (choice) {
      if (choice.outcome === 'accepted') Utils.toast('✓ 安装成功');
      deferredPrompt = null;
    });
  }

  // ========== 通知权限 ==========

  function requestNotificationPermission() {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'granted') return;
    Notification.requestPermission();
  }

  // ========== 统一发通知（走 SW，杀后台后打开也能弹状态栏）==========

  function sendAppNotification(title, body) {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted') return;
    var icon = './icon-192.png';
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'notify', title: title, body: body, icon: icon, tag: 'popo-' + Date.now()
      });
    } else {
      try { new Notification(title, { body: body, icon: icon }); } catch (e) { /* ignore */ }
    }
  }

  // ========== 每日一句调度 ==========

  var dailySentenceTimer = null;

  function scheduleDailySentence() {
    var settings = Storage.load(Storage.KEYS.SETTINGS, { dailyNotifyTime: '08:00', notifyEnabled: true });
    if (settings.notifyEnabled === false) return;

    var today = Utils.DateUtil.todayStr();
    if (settings.lastDailyNotifyDate === today) return; // 今天已推过

    var target = settings.dailyNotifyTime || '08:00';
    var now = new Date();
    var parts = target.split(':');
    var targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(),
                               parseInt(parts[0], 10), parseInt(parts[1], 10), 0);

    if (now >= targetDate) {
      fireDailySentence(); // 已过点 → 立即补推
    } else {
      // 还没到点 → 页面开着期间到点弹
      dailySentenceTimer = setTimeout(fireDailySentence, targetDate.getTime() - now.getTime());
    }
  }

  function fireDailySentence() {
    var settings = Storage.load(Storage.KEYS.SETTINGS, { dailyNotifyTime: '08:00', notifyEnabled: true });
    if (settings.notifyEnabled === false) return;
    var today = Utils.DateUtil.todayStr();
    if (settings.lastDailyNotifyDate === today) return;

    var s = KnowledgeModule.pickDailySentence();
    if (!s) return; // 知识库为空，明天再试

    sendAppNotification('🍀 每日一句', s.content + (s.source ? ' —— ' + s.source : ''));
    settings.lastDailyNotifyDate = today;
    Storage.save(Storage.KEYS.SETTINGS, settings);
    if (dailySentenceTimer) { clearTimeout(dailySentenceTimer); dailySentenceTimer = null; }
  }

  // ========== PWA Service Worker ==========

  function registerPWA() {
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('./sw.js').catch(function (err) {
        console.warn('[PWA] SW 注册失败:', err);
      });
    }
  }

  // ========== 启动时的检查 ==========

  function runStartupChecks() {
    var settings = Storage.load(Storage.KEYS.SETTINGS, { notifyEnabled: true });
    if (settings.notifyEnabled) requestNotificationPermission();

    // 1. 扫描过期时间段 → 自动盖印章
    PlanModule.stampIncompleteBlocks();

    // 2. 检查明天计划提醒（20:00-23:59 且没检查过）
    PlanModule.checkTomorrowPlanReminder();

    // 3. 每日一句：到点/补推
    scheduleDailySentence();
  }

  // ========== 初始化 ==========

  function startApp() {
    registerPWA();
    bindNavigation();
    bindSettings();
    bindInstallButton();
    bindExitReminder();
    runStartupChecks();

    // 数据变更 → 云端自动推送（防抖）
    if (window.Cloud && Cloud.isBound()) {
      Storage.onChange(function () { Cloud.schedulePush(); });
    }

    // 初始化各模块
    PlanModule.init(); // 渲染今日计划
    MemoModule.bind();
    KnowledgeModule.bind();

    // 默认显示首页
    switchPage('home');

    console.log('[popo] ✅ 初始化完成');
  }

  function init() {
    // 门禁：未绑定/未解锁时先显示门禁，解锁后才启动应用
    if (window.Cloud) {
      Cloud.bootstrap().then(startApp);
    } else {
      startApp();
    }
  }

  document.addEventListener('DOMContentLoaded', init);

  // 暴露（home.js 里跳转用；plan.js 发通知用）
  window.App = { switchPage: switchPage, sendNotification: sendAppNotification };
})();
