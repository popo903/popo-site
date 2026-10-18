/**
 * cloud.js —— 云同步 + 门禁模块
 * 职责：
 *   1. 门禁：首次绑定访问令牌(token) + 设置快捷密码；之后凭密码解锁进入
 *   2. 云同步：把本地全量数据快照与 GitHub 私有仓库 popo-data 的 data.json 双向同步
 * 安全边界：
 *   - 数据存私有仓库，读取必须持有 token；token 只存在用户自己的设备 localStorage
 *   - 快捷密码只存 SHA-256 哈希（本地 + 云端 gate.json），代码与云端均无明文
 *   - 离线时用本地缓存的哈希副本校验，保证电脑关机后手机也能解锁离线使用
 */

(function () {
  'use strict';

  // ========== 云端配置 ==========
  var OWNER = 'popo903';
  var DATA_REPO = 'popo-data';

  var LS_TOKEN = 'popo_gate_token';       // 访问令牌（= GitHub PAT）
  var LS_GATE_HASH = 'popo_gate_hash';    // 快捷密码哈希的本地缓存副本（离线校验用）
  var LS_UNLOCKED_AT = 'popo_gate_unlocked_at'; // 解锁时间戳（记住设备 30 天）
  var UNLOCK_TTL = 30 * 24 * 3600 * 1000; // 30 天

  var lastPullSha = null;    // 最近一次云端 data.json 的 sha（PUT 时防冲突）
  var pushTimer = null;      // 防抖定时器
  var PUSH_DELAY = 3000;     // 保存后 3 秒合并推送

  // ========== 工具 ==========

  // 纯 JS 实现的 SHA-256（HTTP 局域网环境下 crypto.subtle 不可用时的兜底）
  function sha256Sync(ascii) {
    function rr(v, a) { return (v >>> a) | (v << (32 - a)); }
    var maxWord = Math.pow(2, 32), result = '';
    var words = [], asciiBitLength = ascii.length * 8;
    var hash = sha256Sync.h = sha256Sync.h || [], k = sha256Sync.k = sha256Sync.k || [];
    var primeCounter = k.length, isComposite = {};
    for (var candidate = 2; primeCounter < 64; candidate++) {
      if (!isComposite[candidate]) {
        for (var i = 0; i < 313; i += candidate) isComposite[i] = candidate;
        hash[primeCounter] = (Math.pow(candidate, 0.5) * maxWord) | 0;
        k[primeCounter++] = (Math.pow(candidate, 1 / 3) * maxWord) | 0;
      }
    }
    ascii += '\x80';
    while (ascii.length % 64 - 56) ascii += '\x00';
    for (var i = 0; i < ascii.length; i++) {
      var j = ascii.charCodeAt(i);
      if (j >> 8) return null; // 仅支持单字节字符
      words[i >> 2] |= j << ((3 - i) % 4) * 8;
    }
    words[words.length] = (asciiBitLength / maxWord) | 0;
    words[words.length] = asciiBitLength;
    for (var j = 0; j < words.length;) {
      var w = words.slice(j, j += 16), oldHash = hash;
      hash = hash.slice(0, 8);
      for (var i = 0; i < 64; i++) {
        var w15 = w[i - 15], w2 = w[i - 2];
        var a = hash[0], e = hash[4];
        var temp1 = hash[7]
          + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25))
          + ((e & hash[5]) ^ (~e & hash[6]))
          + k[i]
          + (w[i] = (i < 16) ? w[i] : (
            w[i - 16]
            + (rr(w15, 7) ^ rr(w15, 18) ^ (w15 >>> 3))
            + w[i - 7]
            + (rr(w2, 17) ^ rr(w2, 19) ^ (w2 >>> 10))
          ) | 0);
        var temp2 = (rr(a, 2) ^ rr(a, 13) ^ rr(a, 22))
          + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
        hash = [(temp1 + temp2) | 0].concat(hash);
        hash[4] = (hash[4] + temp1) | 0;
      }
      for (var i = 0; i < 8; i++) hash[i] = (hash[i] + oldHash[i]) | 0;
    }
    for (var i = 0; i < 8; i++) {
      for (var j = 3; j + 1; j--) {
        var b = (hash[i] >> (j * 8)) & 255;
        result += ((b < 16) ? '0' : '') + b.toString(16);
      }
    }
    return result;
  }

  function sha256Hex(text) {
    // HTTP（非 localhost）环境无 crypto.subtle，走纯 JS 实现
    if (!window.crypto || !crypto.subtle || !crypto.subtle.digest) {
      var ascii = unescape(encodeURIComponent(text));
      return Promise.resolve(sha256Sync(ascii));
    }
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
      .then(function (buf) {
        var arr = new Uint8Array(buf), hex = '';
        for (var i = 0; i < arr.length; i++) hex += ('0' + arr[i].toString(16)).slice(-2);
        return hex;
      });
  }

  // GitHub Contents API 返回的 base64 可能含换行，且内容是 UTF-8
  function decodeBase64Utf8(b64) {
    var bin = atob(b64.replace(/\s/g, ''));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
  }

  function apiHeaders(token) {
    return {
      'Authorization': 'token ' + token,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json'
    };
  }

  function apiUrl(path) {
    return 'https://api.github.com/repos/' + OWNER + '/' + DATA_REPO + '/contents/' + path;
  }

  // 带超时的 fetch：默认 10 秒，防止网络不通时界面一直转圈
  function fetchT(url, opts, timeoutMs) {
    var ms = timeoutMs || 10000;
    return new Promise(function (resolve, reject) {
      var ctrl = new AbortController();
      var timer = setTimeout(function () {
        ctrl.abort();
        reject(new Error('网络超时（' + Math.round(ms / 1000) + '秒），请检查网络后重试'));
      }, ms);
      opts = opts || {};
      opts.signal = ctrl.signal;
      fetch(url, opts).then(function (res) {
        clearTimeout(timer);
        resolve(res);
      }, function (err) {
        clearTimeout(timer);
        if (ctrl.signal.aborted) return; // 已按超时拒绝
        reject(err);
      });
    });
  }

  // ========== token 管理 ==========

  function getToken() { return localStorage.getItem(LS_TOKEN) || ''; }
  function isBound() { return getToken().length > 0; }
  function saveToken(token) { localStorage.setItem(LS_TOKEN, token.trim()); }
  function clearToken() {
    localStorage.removeItem(LS_TOKEN);
    localStorage.removeItem(LS_GATE_HASH);
    localStorage.removeItem(LS_UNLOCKED_AT);
  }

  // 校验 token 是否可用（能否读到数据仓库 gate.json；404 也算有效——仓库可访问）
  function verifyToken(token) {
    return fetchT(apiUrl('gate.json'), { headers: apiHeaders(token) })
      .then(function (res) {
        if (res.status === 200 || res.status === 404) return true;
        if (res.status === 401) return false;
        throw new Error('GitHub API 状态 ' + res.status);
      })
      .catch(function (err) {
        if (err && err.message && err.message.indexOf('GitHub API') === 0) throw err;
        return false; // 网络错误等
      });
  }

  // ========== 解锁状态 ==========

  function isUnlocked() {
    var t = parseInt(localStorage.getItem(LS_UNLOCKED_AT) || '0', 10);
    return t > 0 && (Date.now() - t) < UNLOCK_TTL;
  }
  function markUnlocked() { localStorage.setItem(LS_UNLOCKED_AT, String(Date.now())); }
  function lock() { localStorage.removeItem(LS_UNLOCKED_AT); }

  // ========== gate.json（快捷密码哈希的云端存取） ==========

  function fetchGateHash(token) {
    return fetchT(apiUrl('gate.json'), { headers: apiHeaders(token) })
      .then(function (res) {
        if (res.status === 404) return null; // 尚未设置密码
        if (!res.ok) throw new Error('读取门禁配置失败(' + res.status + ')');
        return res.json();
      })
      .then(function (json) {
        if (!json) return null;
        var hash = decodeBase64Utf8(json.content).trim();
        localStorage.setItem(LS_GATE_HASH, hash); // 缓存副本供离线校验
        return hash;
      });
  }

  // 先 GET 取现有 sha（有则覆盖更新，无则新建），避免新建时携带无效 sha
  function putGateHash(token, hash) {
    localStorage.setItem(LS_GATE_HASH, hash); // 先落本地，保证离线也可用
    return fetchT(apiUrl('gate.json'), { headers: apiHeaders(token) })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (json) {
        var body = {
          message: 'update gate',
          content: btoa(unescape(encodeURIComponent(hash)))
        };
        if (json && json.sha) body.sha = json.sha;
        return fetchT(apiUrl('gate.json'), {
          method: 'PUT',
          headers: apiHeaders(token),
          body: JSON.stringify(body)
        });
      })
      .then(function (res) {
      if (!res.ok) throw new Error('写入门禁配置失败(' + res.status + ')');
      return true;
    });
  }

  // 校验密码：优先云端哈希（支持改密码跨设备生效），失败回退本地缓存（离线）
  function verifyPassword(password) {
    var token = getToken();
    return fetchGateHash(token)
      .then(function (remoteHash) {
        return sha256Hex(password).then(function (pHash) {
          var candidates = [];
          if (remoteHash) candidates.push(remoteHash);
          var localHash = localStorage.getItem(LS_GATE_HASH);
          if (localHash) candidates.push(localHash);
          return candidates.indexOf(pHash) >= 0;
        });
      })
      .catch(function () {
        // 网络/云端异常 → 用本地缓存哈希离线校验
        var localHash = localStorage.getItem(LS_GATE_HASH);
        if (!localHash) return Promise.resolve(false);
        return sha256Hex(password).then(function (pHash) {
          return pHash === localHash;
        });
      });
  }

  // ========== 数据同步 ==========

  function pullData() {
    var token = getToken();
    if (!token) return Promise.resolve(null);
    return fetchT(apiUrl('data.json'), { headers: apiHeaders(token) })
      .then(function (res) {
        if (res.status === 404) return null; // 云端还没有数据
        if (!res.ok) throw new Error('拉取云端数据失败(' + res.status + ')');
        return res.json();
      })
      .then(function (json) {
        if (!json) return null;
        lastPullSha = json.sha;
        var text = decodeBase64Utf8(json.content);
        var data = JSON.parse(text);
        if (!Storage.validateBackup(data).ok) throw new Error('云端数据格式不完整');
        return data;
      });
  }

  function pushData() {
    var token = getToken();
    if (!token) return Promise.resolve(false);
    var snapshot = Storage.collectAll();
    snapshot.exportedAt = new Date().toISOString();

    function doPut(sha) {
      var body = {
        message: 'sync ' + snapshot.exportedAt,
        content: btoa(unescape(encodeURIComponent(JSON.stringify(snapshot)))),
        sha: sha || undefined
      };
      return fetchT(apiUrl('data.json'), {
        method: 'PUT',
        headers: apiHeaders(token),
        body: JSON.stringify(body)
      });
    }

    // 先取当前 sha（文件可能被其他设备更新过），再 PUT；409 冲突时重试一次
    return fetchT(apiUrl('data.json'), { headers: apiHeaders(token) })
      .then(function (res) {
        if (res.status === 404) return null;
        if (!res.ok) throw new Error('读取云端 sha 失败(' + res.status + ')');
        return res.json();
      })
      .then(function (json) { return doPut(json ? json.sha : null); })
      .then(function (res) {
        if (res.ok) {
          setLastSync(Date.now());
          return true;
        }
        if (res.status === 409 || res.status === 422) {
          // 冲突：重取 sha 再推一次（最后写入者胜）
          return fetchT(apiUrl('data.json'), { headers: apiHeaders(token) })
            .then(function (r2) { return r2.ok ? r2.json() : null; })
            .then(function (j2) { return doPut(j2 ? j2.sha : null); })
            .then(function (r3) {
              if (r3.ok) { setLastSync(Date.now()); return true; }
              throw new Error('同步冲突，请稍后在设置里手动同步');
            });
        }
        throw new Error('推送失败(' + res.status + ')');
      });
  }

  // 打开应用时：拉取云端，比较时间戳决定覆盖方向
  function syncOnOpen() {
    var token = getToken();
    if (!token) return Promise.resolve({ action: 'none' });
    return pullData().then(function (remote) {
      if (!remote) {
        // 云端为空 → 若本地有数据则首次上传
        return pushData().then(function () { return { action: 'uploaded' }; });
      }
      var localMeta = Storage.load(Storage.KEYS.META, {});
      var localTime = localMeta.updatedAt || '';
      var remoteTime = (remote.meta && remote.meta.updatedAt) || remote.exportedAt || '';
      if (remoteTime > localTime) {
        // 云端较新 → 覆盖本地（保留本地的 token 相关设置）
        Storage.writeAll(remote);
        return { action: 'pulled' };
      }
      if (localTime > remoteTime) {
        return pushData().then(function () { return { action: 'pushed' }; });
      }
      return { action: 'same' };
    });
  }

  function schedulePush() {
    if (!isBound()) return;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(function () {
      pushTimer = null;
      pushData().catch(function (err) {
        console.warn('[Cloud] 自动推送失败:', err.message);
      });
    }, PUSH_DELAY);
  }

  function setLastSync(ts) {
    var settings = Storage.load(Storage.KEYS.SETTINGS, {});
    settings.lastSyncAt = ts;
    Storage.save(Storage.KEYS.SETTINGS, settings);
  }

  function getLastSync() {
    var settings = Storage.load(Storage.KEYS.SETTINGS, {});
    return settings.lastSyncAt || 0;
  }

  // ========== 首次绑定流程（供门禁 UI 调用） ==========

  // 1) 校验并保存 token
  function bindToken(token) {
    return verifyToken(token).then(function (ok) {
      if (!ok) throw new Error('令牌无效或权限不足');
      saveToken(token);
      return true;
    });
  }

  // 2) 设置快捷密码：哈希先存本地并立即解锁；云端写入放后台，网络不通不阻塞进入
  function setPassword(password) {
    return sha256Hex(password).then(function (hash) {
      localStorage.setItem(LS_GATE_HASH, hash);
      markUnlocked();
      putGateHash(getToken(), hash).catch(function (err) {
        console.warn('[Cloud] 密码云端同步失败（已存本地，联网后可在设置里改一次密码触发重传）:', err.message);
      });
      return true;
    });
  }

  // 3) 输入密码解锁
  function unlockWithPassword(password) {
    return verifyPassword(password).then(function (ok) {
      if (ok) markUnlocked();
      return ok;
    });
  }

  // 4) 忘记密码：用 token 重置（先校验 token，再设新密码）
  function resetPasswordWithToken(token, newPassword) {
    return verifyToken(token).then(function (ok) {
      if (!ok) throw new Error('令牌无效或权限不足');
      saveToken(token);
      return setPassword(newPassword);
    });
  }

  // ========== 门禁 UI ==========

  var gateEl = null;

  function ensureGateEl() {
    if (gateEl) return gateEl;
    gateEl = document.createElement('div');
    gateEl.id = 'gate';
    gateEl.innerHTML =
      '<div class="gate-card">' +
      '  <div class="gate-logo">🌸</div>' +
      '  <div class="gate-title">popo 专属工作台</div>' +
      '  <div class="gate-body" id="gate-body"></div>' +
      '</div>';
    document.body.appendChild(gateEl);
    return gateEl;
  }

  function showGate() {
    var el = ensureGateEl();
    el.hidden = false;
    var body = document.getElementById('gate-body');

    if (!isBound()) {
      // 首次绑定
      body.innerHTML =
        '<p class="gate-tip">首次使用：请粘贴你的 GitHub 访问令牌（Token）完成绑定。<br>令牌仅保存在本设备，用于读写你的私有数据仓库。</p>' +
        '<input type="password" class="gate-input" id="gate-token" placeholder="粘贴 ghp_ 开头的令牌" autocomplete="off">' +
        '<button class="gate-btn" id="gate-bind">绑定令牌</button>' +
        '<div class="gate-err" id="gate-err"></div>';
      document.getElementById('gate-bind').addEventListener('click', function () {
        var t = document.getElementById('gate-token').value.trim();
        var errEl = document.getElementById('gate-err');
        if (!t) { errEl.textContent = '请输入令牌'; return; }
        errEl.textContent = '正在验证...';
        bindToken(t).then(function () {
          showSetPassword();
        }).catch(function (e) { errEl.textContent = '❌ ' + e.message; });
      });
      return;
    }

    // 已绑定 → 输密码
    body.innerHTML =
      '<p class="gate-tip">输入快捷密码解锁</p>' +
      '<input type="password" class="gate-input" id="gate-pass" placeholder="快捷密码" autocomplete="off">' +
      '<button class="gate-btn" id="gate-unlock">进入工作台</button>' +
      '<div class="gate-err" id="gate-err"></div>' +
      '<a href="javascript:void(0)" class="gate-link" id="gate-reset">忘记密码？用令牌重置</a>';
    document.getElementById('gate-unlock').addEventListener('click', function () {
      var pass = document.getElementById('gate-pass').value;
      var errEl = document.getElementById('gate-err');
      if (!pass) { errEl.textContent = '请输入密码'; return; }
      errEl.textContent = '正在校验...';
      unlockWithPassword(pass).then(function (ok) {
        if (ok) { el.hidden = true; onUnlocked(); }
        else errEl.textContent = '❌ 密码错误';
      }).catch(function (e) { errEl.textContent = '❌ ' + e.message; });
    });
    // 回车提交
    document.getElementById('gate-pass').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') document.getElementById('gate-unlock').click();
    });
    document.getElementById('gate-reset').addEventListener('click', showReset);
  }

  function showSetPassword() {
    var body = document.getElementById('gate-body');
    body.innerHTML =
      '<p class="gate-tip">绑定成功！请设置快捷密码（6 位数字）<br>之后打开工作台凭密码解锁</p>' +
      '<input type="password" class="gate-input" id="gate-p1" placeholder="输入 6 位数字密码" maxlength="6" autocomplete="off">' +
      '<input type="password" class="gate-input" id="gate-p2" placeholder="再次输入确认" maxlength="6" autocomplete="off">' +
      '<button class="gate-btn" id="gate-setpass">完成设置</button>' +
      '<div class="gate-err" id="gate-err"></div>';
    document.getElementById('gate-setpass').addEventListener('click', function () {
      var p1 = document.getElementById('gate-p1').value;
      var p2 = document.getElementById('gate-p2').value;
      var errEl = document.getElementById('gate-err');
      if (!/^\d{6}$/.test(p1)) { errEl.textContent = '密码必须是 6 位数字'; return; }
      if (p1 !== p2) { errEl.textContent = '两次输入不一致'; return; }
      errEl.textContent = '正在保存...';
      setPassword(p1).then(function () {
        ensureGateEl().hidden = true;
        onUnlocked();
      }).catch(function (e) { errEl.textContent = '❌ ' + e.message; });
    });
  }

  function showReset() {
    var body = document.getElementById('gate-body');
    body.innerHTML =
      '<p class="gate-tip">重置密码：粘贴访问令牌 + 设置新密码</p>' +
      '<input type="password" class="gate-input" id="gate-rt" placeholder="粘贴 ghp_ 开头的令牌" autocomplete="off">' +
      '<input type="password" class="gate-input" id="gate-rp1" placeholder="新密码（6 位数字）" maxlength="6" autocomplete="off">' +
      '<input type="password" class="gate-input" id="gate-rp2" placeholder="再次输入确认" maxlength="6" autocomplete="off">' +
      '<button class="gate-btn" id="gate-doreset">重置并进入</button>' +
      '<div class="gate-err" id="gate-err"></div>' +
      '<a href="javascript:void(0)" class="gate-link" id="gate-back">返回</a>';
    document.getElementById('gate-doreset').addEventListener('click', function () {
      var t = document.getElementById('gate-rt').value.trim();
      var p1 = document.getElementById('gate-rp1').value;
      var p2 = document.getElementById('gate-rp2').value;
      var errEl = document.getElementById('gate-err');
      if (!/^\d{6}$/.test(p1)) { errEl.textContent = '密码必须是 6 位数字'; return; }
      if (p1 !== p2) { errEl.textContent = '两次输入不一致'; return; }
      errEl.textContent = '正在验证...';
      resetPasswordWithToken(t, p1).then(function () {
        ensureGateEl().hidden = true;
        onUnlocked();
      }).catch(function (e) { errEl.textContent = '❌ ' + e.message; });
    });
    document.getElementById('gate-back').addEventListener('click', showGate);
  }

  // ========== 生命周期 ==========

  var unlockCallbacks = [];

  function onUnlocked() {
    unlockCallbacks.forEach(function (cb) { try { cb(); } catch (e) {} });
    // 解锁后立即云同步
    syncOnOpen().catch(function (err) {
      console.warn('[Cloud] 打开时同步失败:', err.message);
    });
  }

  /**
   * 启动门禁。返回 Promise，resolve = 应用可以启动
   * - 若 30 天内已解锁过 → 直接放行
   * - 否则显示门禁，等用户操作后放行
   */
  function bootstrap() {
    return new Promise(function (resolve) {
      if (isBound() && isUnlocked()) {
        // 已解锁：立即放行，后台静默同步
        setTimeout(function () {
          syncOnOpen().catch(function (err) {
            console.warn('[Cloud] 打开时同步失败:', err.message);
          });
        }, 50);
        resolve();
        return;
      }
      // 等待 DOM 就绪后再显示门禁
      function show() { showGate(); }
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', show);
      } else {
        show();
      }
      unlockCallbacks.push(function () { resolve(); });
    });
  }

  // ========== 暴露 ==========

  window.Cloud = {
    // 生命周期
    bootstrap: bootstrap,
    onUnlocked: function (cb) { unlockCallbacks.push(cb); },
    // 门禁
    isBound: isBound,
    isUnlocked: isUnlocked,
    markUnlocked: markUnlocked,
    lock: lock,
    bindToken: bindToken,
    setPassword: setPassword,
    unlockWithPassword: unlockWithPassword,
    resetPasswordWithToken: resetPasswordWithToken,
    verifyToken: verifyToken,
    verifyPassword: verifyPassword,
    // 同步
    pullData: pullData,
    pushData: pushData,
    syncOnOpen: syncOnOpen,
    schedulePush: schedulePush,
    getLastSync: getLastSync,
    // 工具（测试用）
    sha256Hex: sha256Hex,
    decodeBase64Utf8: decodeBase64Utf8,
    _config: { OWNER: OWNER, DATA_REPO: DATA_REPO, LS_TOKEN: LS_TOKEN }
  };
})();
