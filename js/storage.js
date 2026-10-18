/**
 * storage.js —— 数据持久化层
 * 职责：读写 localStorage、导出/导入完整备份
 * 绝不做：渲染 UI、绑定事件
 */

(function () {
  'use strict';

  // 5 个 localStorage key（统一前缀）
  const KEYS = {
    PLANS:       'popo_plans',       // 按日期 key 的计划数据
    MEMOS:       'popo_memos',       // 备忘数组
    KNOWLEDGE:   'popo_knowledge',   // 知识库
    SETTINGS:    'popo_settings',    // 设置
    META:        'popo_meta',        // 元信息
    AUTO_BACKUP: 'popo_auto_backup'  // 退出页面前自动保存的完整快照（覆盖式）
  };

  // 默认值工厂
  const DEFAULTS = {
    [KEYS.PLANS]:     {},
    [KEYS.MEMOS]:     [],
    [KEYS.KNOWLEDGE]: {
      folders: ['励志', '写作', '哲学'],
      tags: [],
      sentences: [],
      lastDailySentenceDate: '',
      lastDailySentenceId: null
    },
    [KEYS.SETTINGS]: {
      dailyNotifyTime: '08:00',
      notifyEnabled: true,
      homeLayout: ['top5', 'dailySentence', 'memoPreview'],
      saveReminderEnabled: false
    },
    [KEYS.META]: {
      firstRun: true,
      version: '1.0'
    }
  };

  /**
   * 读取 localStorage，key 不存在或 parse 失败返回 defaultValue
   */
  function load(key, defaultValue) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null || raw === undefined || raw === '') {
        return defaultValue !== undefined ? defaultValue : DEFAULTS[key];
      }
      return JSON.parse(raw);
    } catch (e) {
      console.warn('[Storage.load] 解析失败，返回默认值:', key, e);
      return defaultValue !== undefined ? defaultValue : DEFAULTS[key];
    }
  }

  /**
   * 写入 localStorage，返回写入后的 value（方便链式调用）
   * 写入后触发变更通知（云同步据此自动推送）
   */
  function save(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      if (key !== KEYS.AUTO_BACKUP) notifyChange();
      return value;
    } catch (e) {
      console.error('[Storage.save] 写入失败:', key, e);
      return value;
    }
  }

  // ========== 变更通知（供 cloud.js 注册自动推送） ==========

  var changeCallbacks = [];

  function onChange(cb) {
    changeCallbacks.push(cb);
  }

  /**
   * 数据变更：刷新 META.updatedAt（直接写 localStorage 防递归），并通知监听者
   */
  function notifyChange() {
    try {
      var meta = load(KEYS.META, {});
      meta.updatedAt = new Date().toISOString();
      localStorage.setItem(KEYS.META, JSON.stringify(meta));
    } catch (e) { /* ignore */ }
    changeCallbacks.forEach(function (cb) {
      try { cb(); } catch (e) { /* ignore */ }
    });
  }

  /**
   * 导出全部数据为 JSON 对象
   */
  function collectAll() {
    return {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      plans:     load(KEYS.PLANS),
      memos:     load(KEYS.MEMOS),
      knowledge: load(KEYS.KNOWLEDGE),
      settings:  load(KEYS.SETTINGS),
      meta:      load(KEYS.META)
    };
  }

  /**
   * 触发浏览器下载备份文件
   */
  function exportAll() {
    const data = collectAll();
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });

    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const fname = `popo_backup_${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}.json`;

    // 触发下载
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 500);

    return true;
  }

  /**
   * 从文件对象恢复数据
   * @returns {Promise<object>} 解析后的数据（调用方负责校验和覆盖写入）
   */
  function readBackupFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const data = JSON.parse(e.target.result);
          resolve(data);
        } catch (err) {
          reject(new Error('文件不是有效的 JSON'));
        }
      };
      reader.onerror = () => reject(new Error('读取文件失败'));
      reader.readAsText(file, 'utf-8');
    });
  }

  /**
   * 校验备份文件结构是否完整
   */
  function validateBackup(data) {
    const requiredKeys = ['version', 'plans', 'memos', 'knowledge', 'settings', 'meta'];
    const missing = requiredKeys.filter(k => !(k in data));
    if (missing.length > 0) {
      return { ok: false, reason: `缺少必需字段: ${missing.join(', ')}` };
    }
    if (typeof data.version !== 'string') {
      return { ok: false, reason: 'version 字段格式错误' };
    }
    return { ok: true };
  }

  /**
   * 把备份数据写入 localStorage（覆盖）
   */
  function writeAll(data) {
    save(KEYS.PLANS,     data.plans);
    save(KEYS.MEMOS,     data.memos);
    save(KEYS.KNOWLEDGE, data.knowledge);
    save(KEYS.SETTINGS,  data.settings);
    save(KEYS.META,      data.meta);
  }

  /**
   * 保存退出前自动备份：把当前全部数据快照写入 AUTO_BACKUP 键（覆盖上一次版本）
   * 供「退出前提醒保存数据」开关在 beforeunload / pagehide 时调用
   */
  function saveAutoBackup() {
    var snapshot = collectAll();
    save(KEYS.AUTO_BACKUP, snapshot);
    return snapshot;
  }

  /**
   * 读取上次自动备份，不存在返回 null
   */
  function loadAutoBackup() {
    var raw = localStorage.getItem(KEYS.AUTO_BACKUP);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      console.warn('[Storage.loadAutoBackup] 解析失败', e);
      return null;
    }
  }

  /**
   * 是否存在自动备份
   */
  function hasAutoBackup() {
    return localStorage.getItem(KEYS.AUTO_BACKUP) !== null;
  }

  // 暴露全局
  window.Storage = {
    KEYS,
    DEFAULTS,
    load,
    save,
    onChange,
    collectAll,
    exportAll,
    readBackupFile,
    validateBackup,
    writeAll,
    saveAutoBackup,
    loadAutoBackup,
    hasAutoBackup
  };
})();
