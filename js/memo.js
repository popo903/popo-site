/**
 * memo.js —— 快速备忘模块
 * 职责：备忘数据操作 + 备忘页渲染
 * 绝不做：碰其他模块的数据源
 */

(function () {
  'use strict';

  // localStorage key 从 Storage 拿
  var KEY = Storage.KEYS.MEMOS;

  // N6：当前展开全文的备忘 id（仅界面状态，不持久化）
  var expandedIds = {};

  // M10：当前左滑展开删除按钮的备忘 id（仅界面状态）
  var swipeOpenId = null;

  // 每次 add 的递增序号（浏览器 Date.now 精度受限，同一毫秒内可能相同）
  var _addSeq = 0;

  function nextSortKey() {
    // 用 (Date.now(), seq) 合成一个始终递增的 number
    return Date.now() * 1000 + (_addSeq++ % 1000);
  }

  // ============== 分类文件夹（F7） ==============

  // N4：四分类背景色 + 色块上的文字色（on）；icon 为用户提供 SVG（IC）
  var CATEGORIES = [
    { key: 'todo', label: '待办', icon: Utils.ICONS.todo, color: '#8d9369', on: '#f6efdc' },
    { key: 'idea', label: '想法', icon: Utils.ICONS.idea, color: '#b7c084', on: '#4a3b2c' },
    { key: 'question', label: '问题', icon: Utils.ICONS.question, color: '#d5897a', on: '#4a3b2c' }
  ];
  // 其他（未分类，M1 由「收集箱」更名）；icon 为心形 SVG
  var INBOX = { key: '', label: '其他', icon: Utils.ICONS.inbox, color: '#d3b39f', on: '#4a3b2c' };

  // M1：当前过滤的文件夹（null = 显示全部，仅界面状态不持久化）
  var activeFolder = null;

  function categoryOf(key) {
    for (var i = 0; i < CATEGORIES.length; i++) {
      if (CATEGORIES[i].key === key) return CATEGORIES[i];
    }
    return null;
  }

  /** 设置备忘分类（'' = 收集箱），非法分类返回 false */
  function setCategory(id, category) {
    category = category || '';
    if (category !== '' && !categoryOf(category)) return false;
    var memos = Storage.load(KEY, []);
    var found = null;
    for (var i = 0; i < memos.length; i++) {
      if (String(memos[i].id) === String(id)) {
        memos[i].category = category;
        found = memos[i];
        break;
      }
    }
    if (found) Storage.save(KEY, memos);
    return !!found;
  }

  // ============== 评价与反馈（S4） ==============

  /** 设置星级评分（0-5，0 = 清除评价），非法值返回 false */
  function setRating(id, rating) {
    rating = parseInt(rating, 10);
    if (isNaN(rating) || rating < 0 || rating > 5) return false;
    var memos = Storage.load(KEY, []);
    var found = false;
    for (var i = 0; i < memos.length; i++) {
      if (String(memos[i].id) === String(id)) {
        memos[i].rating = rating;
        found = true;
        break;
      }
    }
    if (found) Storage.save(KEY, memos);
    return found;
  }

  /** 设置文字反馈（trim 后存储，'' = 清除反馈），找不到返回 false */
  function setFeedback(id, text) {
    text = (text || '').trim();
    var memos = Storage.load(KEY, []);
    var found = false;
    for (var i = 0; i < memos.length; i++) {
      if (String(memos[i].id) === String(id)) {
        memos[i].feedback = text;
        found = true;
        break;
      }
    }
    if (found) Storage.save(KEY, memos);
    return found;
  }

  // ============== 数据 API ==============

  /** 存储写入（捕获配额超限） */
  function safeSave(memos) {
    try {
      Storage.save(KEY, memos);
      return true;
    } catch (e) {
      return false;
    }
  }

  /** 获取全部备忘，按时间倒序（newest first） */
  function getAll() {
    var arr = Storage.load(KEY, []);
    if (!Array.isArray(arr)) return [];
    // 按 sortKey 倒序：sortKey 大的在后加的
    return arr.slice().sort(function (a, b) {
      return (b.sortKey || b.createdAt || 0) - (a.sortKey || a.createdAt || 0);
    });
  }

  /** 新建一条备忘（可带最多 3 张本地图片 dataURL），返回创建后的对象 */
  function add(content, images) {
    content = (content || '').trim();
    var imgs = Array.isArray(images) ? images.slice(0, 3) : [];
    if (!content && imgs.length === 0) return null;
    var memos = Storage.load(KEY, []);
    var obj = {
      id: Utils.uid(),
      content: content,
      images: imgs,
      category: '',                // '' = 收集箱（未分类）
      createdAt: Date.now(),       // 显示用
      sortKey: nextSortKey()       // 排序用，始终递增
    };
    memos.push(obj);
    if (!safeSave(memos) && imgs.length) {
      // 配额超限：尝试去掉图片重存
      obj.images = [];
      if (!safeSave(memos)) {
        memos.pop();
        Utils.toast('⚠️ 存储空间不足，保存失败');
        return null;
      }
      Utils.toast('⚠️ 存储空间不足，仅保存了文字');
    }
    return obj;
  }

  /** 更新内容，返回更新后的对象（找不到则返回 null） */
  function edit(id, newContent) {
    newContent = (newContent || '').trim();
    var memos = Storage.load(KEY, []);
    var found = null;
    for (var i = 0; i < memos.length; i++) {
      if (String(memos[i].id) === String(id)) {
        if (!newContent) {
          // 空内容删除
          memos.splice(i, 1);
          Storage.save(KEY, memos);
          return null;
        }
        memos[i].content = newContent;
        found = memos[i];
        break;
      }
    }
    Storage.save(KEY, memos);
    return found;
  }

  /** 删除一条备忘 */
  function remove(id) {
    var memos = Storage.load(KEY, []);
    var filtered = memos.filter(function (m) { return String(m.id) !== String(id); });
    Storage.save(KEY, filtered);
    return filtered.length < memos.length;
  }

  /** 获取最近 n 条（首页预览用），按时间倒序 */
  function getRecent(n) {
    return getAll().slice(0, n || 3);
  }

  // ============== 渲染 ==============

  function render() {
    swipeOpenId = null; // M10：重渲染后左滑状态失效
    renderFolders();
    var list = Utils.$('#memo-list');
    if (!list) return;
    var memos = getAll();
    // M1：点按文件夹后只显示该分类的备忘
    if (activeFolder !== null) {
      memos = memos.filter(function (m) { return (m.category || '') === activeFolder; });
    }
    list.innerHTML = '';

    if (memos.length === 0) {
      list.innerHTML = activeFolder !== null
        ? '<div class="timeblock-empty">这个文件夹里还没有备忘</div>'
        : '<div class="timeblock-empty">还没有备忘，写下第一个灵感吧 ↑</div>';
      return;
    }

    memos.forEach(function (m) {
      var node = renderItem(m);
      list.appendChild(node);
      finalizeCollapse(node, m); // 节点入文档后测量是否溢出
    });
  }

  /** N6：折叠态下文字超出 3 行才显示「展开/收起」开关 */
  function finalizeCollapse(node, memo) {
    var content = node.querySelector('.memo-content');
    var toggle = node.querySelector('.memo-toggle');
    if (!content || !toggle) return;
    if (expandedIds[memo.id]) {
      toggle.hidden = false; // 已展开：始终可收起
      return;
    }
    // 折叠态：自然高度 > 3 行才显示开关。
    // 行高取计算样式；部分引擎 line-height 返回 normal 时，在 .memo-item 内放单行块级探针实测。
    // 用去折叠克隆体测自然高度，避免 line-clamp 下 scrollHeight/clientHeight 的引擎差异与取整抖动。
    var cs = getComputedStyle(content);
    var lh = parseFloat(cs.lineHeight);
    if (isNaN(lh) || lh <= 0) {
      var probe = document.createElement('div');
      probe.style.visibility = 'hidden';
      probe.textContent = '探';
      node.appendChild(probe);
      lh = probe.offsetHeight;
      node.removeChild(probe);
    }

    var clone = content.cloneNode(true);
    clone.classList.remove('clamped');
    clone.style.position = 'absolute';
    clone.style.visibility = 'hidden';
    clone.style.left = '-9999px';
    clone.style.width = content.clientWidth + 'px';
    clone.style.fontSize = cs.fontSize;
    clone.style.fontFamily = cs.fontFamily;
    clone.style.lineHeight = cs.lineHeight;
    document.body.appendChild(clone);
    var fullH = clone.offsetHeight;
    document.body.removeChild(clone);

    if (lh > 0) {
      toggle.hidden = fullH <= Math.ceil(lh * 3) + 1;
    } else {
      toggle.hidden = content.scrollHeight <= content.clientHeight + 1;
    }
  }

  /** 渲染顶部分类文件夹（M1 顺序：待办/想法/问题/其他，其他放最后） */
  function renderFolders() {
    var box = Utils.$('#memo-folders');
    if (!box) return;
    var memos = Storage.load(KEY, []);
    if (!Array.isArray(memos)) memos = [];
    function count(key) {
      return memos.filter(function (m) { return (m.category || '') === key; }).length;
    }
    function folderHTML(key, label, icon, color, on) {
      var active = activeFolder === key ? ' active' : '';
      return '<div class="memo-folder' + active + '" data-folder="' + key + '" style="--folder-color:' + color + ';--on-color:' + on + ';">' +
        '<div class="memo-folder-icon">' + icon + '</div>' +
        '<div class="memo-folder-label">' + label + '</div>' +
        '<div class="memo-folder-count">' + count(key) + '</div></div>';
    }
    var html = CATEGORIES.map(function (c) {
      return folderHTML(c.key, c.label, c.icon, c.color, c.on);
    }).join('');
    html += folderHTML('', INBOX.label, INBOX.icon, INBOX.color, INBOX.on);
    box.innerHTML = html;
  }

  function renderItem(memo) {
    var item = Utils.el('div', 'memo-item');
    item.dataset.id = memo.id;
    item.draggable = true; // 可拖动到上方文件夹归类

    // M10：内容包进 swipe-inner（左滑平移层），露出右侧删除按钮
    var inner = Utils.el('div', 'memo-swipe-inner');
    item.appendChild(inner);

    var cat = categoryOf(memo.category);
    var badge = Utils.el('span', 'memo-cat-badge' + (cat ? ' colored' : ''),
      (cat ? cat.icon : INBOX.icon) + '<span class="badge-text">' + (cat ? cat.label : '未分类') + '</span>');
    if (cat) {
      badge.style.setProperty('--cat-color', cat.color);
      badge.style.setProperty('--on-color', cat.on);
    }
    badge.title = '点按移入文件夹';

    var time = Utils.el('div', 'memo-time', Utils.DateUtil.formatDateTime(memo.createdAt));
    // N6：默认折叠为 3 行，超出部分通过「展开」查看全部
    var isExpanded = !!expandedIds[memo.id];
    var content = Utils.el('div', 'memo-content' + (isExpanded ? '' : ' clamped'), Utils.esc(memo.content));
    var toggle = Utils.el('span', 'memo-toggle', isExpanded ? '收起' : '展开');
    toggle.hidden = true; // 是否需要开关由 finalizeCollapse 测量后决定
    toggle.addEventListener('click', function () {
      if (expandedIds[memo.id]) { delete expandedIds[memo.id]; }
      else { expandedIds[memo.id] = true; }
      render();
    });

    var actions = Utils.el('div', 'memo-actions',
      '<span class="memo-edit" title="编辑">' + Utils.ICONS.edit + '</span>' +
      '<span class="memo-del" title="删除">' + Utils.ICONS.del + '</span>'
    );

    inner.appendChild(badge);
    inner.appendChild(time);
    inner.appendChild(content);
    inner.appendChild(toggle);

    if (memo.images && memo.images.length) {
      var imgs = Utils.el('div', 'memo-images');
      memo.images.forEach(function (src) {
        var img = document.createElement('img');
        img.className = 'memo-thumb';
        img.src = src;
        img.alt = '备忘图片';
        imgs.appendChild(img);
      });
      inner.appendChild(imgs);
    }

    // S4：星级评价 + 反馈入口
    var rating = parseInt(memo.rating, 10) || 0;
    var starsHTML = '';
    for (var n = 1; n <= 5; n++) {
      starsHTML += '<span class="star' + (n <= rating ? ' on' : '') + '" data-star="' + n +
        '" title="' + n + ' 星">★</span>';
    }
    var review = Utils.el('div', 'memo-review',
      '<div class="memo-stars">' + starsHTML +
        '<span class="memo-feedback-btn' + (memo.feedback ? ' has' : '') + '" title="事项反馈">' + Utils.ICONS.feedback + '</span>' +
      '</div>' +
      (memo.feedback ? '<div class="memo-feedback-text">' + Utils.esc(memo.feedback) + '</div>' : '')
    );
    inner.appendChild(review);

    inner.appendChild(actions);

    // M10：左滑露出的删除按钮
    var swipeDel = Utils.el('button', 'memo-swipe-del', '删除');
    swipeDel.type = 'button';
    item.appendChild(swipeDel);
    return item;
  }

  // ============== 拖拽归类 + 点按归类（F7） ==============

  /** 拖放/点选归类入口：归类成功后刷新（测试直接调用） */
  function applyDrop(id, folderKey) {
    var ok = setCategory(id, folderKey || '');
    if (ok) {
      render();
      var cat = categoryOf(folderKey);
      Utils.toast('已移入' + (cat ? cat.label : INBOX.label));
    }
    return ok;
  }

  /** 点按角标弹出分类选择（触屏友好的拖拽替代） */
  function openCategoryPicker(id) {
    var btns = [{ label: INBOX.icon + ' ' + INBOX.label, v: '', color: INBOX.color, on: INBOX.on }].concat(CATEGORIES.map(function (c) {
      return { label: c.icon + ' ' + c.label, v: c.key, color: c.color, on: c.on };
    }));
    var html = '<h3>移入文件夹</h3><div class="cat-picker">' + btns.map(function (b) {
      return '<button class="cat-pick-btn" data-v="' + b.v + '" style="background:' + b.color + ';color:' + b.on + ';border-color:transparent;">' + b.label + '</button>';
    }).join('') + '</div>';
    Utils.showModal({ bodyHTML: html });
    document.querySelectorAll('.cat-pick-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        Utils.closeModal();
        applyDrop(id, btn.dataset.v);
      });
    });
  }

  /** S4：弹窗编写/清除事项反馈 */
  function openFeedbackEditor(id) {
    var memos = Storage.load(KEY, []);
    var oldText = '';
    for (var i = 0; i < memos.length; i++) {
      if (String(memos[i].id) === String(id)) { oldText = memos[i].feedback || ''; break; }
    }
    var body =
      '<div class="form-row"><label class="form-label">对这条事项的反馈</label>' +
      '<textarea class="form-input" id="memo-feedback-input" rows="4" ' +
      'placeholder="做得怎么样？复盘、想法、后续安排…">' + Utils.esc(oldText) + '</textarea></div>';
    var actions = '<button class="btn-ghost" id="memo-feedback-clear">清除反馈</button>' +
                  '<button class="btn-ghost" id="memo-feedback-cancel">取消</button>' +
                  '<button class="btn-primary" id="memo-feedback-save">保存</button>';
    Utils.showModal({ title: '事项反馈', bodyHTML: body, actions: actions });

    Utils.$('#memo-feedback-cancel').addEventListener('click', Utils.closeModal);
    Utils.$('#memo-feedback-save').addEventListener('click', function () {
      var val = Utils.$('#memo-feedback-input').value;
      setFeedback(id, val);
      Utils.closeModal();
      render();
      Utils.toast('✓ 反馈已保存');
    });
    Utils.$('#memo-feedback-clear').addEventListener('click', function () {
      setFeedback(id, '');
      Utils.closeModal();
      render();
      Utils.toast('反馈已清除');
    });
  }

  // ============== 本地图片（F7） ==============

  /** 压缩本地图片：最长边 ≤ 640px、JPEG 0.6，回调 dataURL（失败传 null） */
  function compressImage(file, cb) {
    if (!file || !/^image\//.test(file.type)) { cb(null); return; }
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        try {
          var max = 640;
          var scale = Math.min(1, max / Math.max(img.width, img.height));
          var canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          cb(canvas.toDataURL('image/jpeg', 0.6));
        } catch (e) {
          cb(null);
        }
      };
      img.onerror = function () { cb(null); };
      img.src = reader.result;
    };
    reader.onerror = function () { cb(null); };
    reader.readAsDataURL(file);
  }

  // ============== 事件绑定（委托到 #page-memo） ==============

  function bind() {
    var page = Utils.$('#page-memo');
    if (!page) return;

    var input = Utils.$('#memo-input', page);
    var saveBtn = Utils.$('#memo-save', page);
    var list = Utils.$('#memo-list', page);
    var foldersBox = Utils.$('#memo-folders', page);

    // ---- 待添加图片（暂存，保存时随文字入库） ----
    var pendingImages = [];
    var imgBtn = Utils.$('#memo-image', page);
    var fileInput = Utils.$('#memo-file', page);
    var previews = Utils.$('#memo-image-previews', page);

    function renderPreviews() {
      if (!previews) return;
      previews.innerHTML = pendingImages.map(function (src, i) {
        return '<div class="memo-preview-item"><img src="' + src + '" alt="预览">' +
          '<span class="memo-preview-del" data-idx="' + i + '">✕</span></div>';
      }).join('');
      previews.querySelectorAll('.memo-preview-del').forEach(function (btn) {
        btn.addEventListener('click', function () {
          pendingImages.splice(parseInt(btn.dataset.idx), 1);
          renderPreviews();
        });
      });
    }

    if (imgBtn && fileInput) {
      imgBtn.addEventListener('click', function () { fileInput.click(); });
      fileInput.addEventListener('change', function () {
        var files = Array.prototype.slice.call(fileInput.files || []);
        files.slice(0, 3 - pendingImages.length).forEach(function (f) {
          compressImage(f, function (dataURL) {
            if (!dataURL) { Utils.toast('图片读取失败'); return; }
            if (pendingImages.length >= 3) { Utils.toast('最多添加 3 张图片'); return; }
            pendingImages.push(dataURL);
            renderPreviews();
          });
        });
        fileInput.value = '';
      });
    }

    // ---- 保存 ----
    function handleSave() {
      var val = input.value.trim();
      if (!val && pendingImages.length === 0) { Utils.toast('内容不能为空'); return; }
      var obj = add(val, pendingImages);
      if (obj) {
        // P2：正选中某个分类文件夹时，新备忘自动归入该模块
        if (activeFolder) setCategory(obj.id, activeFolder);
        pendingImages = [];
        renderPreviews();
        input.value = '';
        render();
        Utils.toast('✓ 已保存');
      }
    }

    saveBtn.addEventListener('click', handleSave);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); handleSave(); }
    });

    // ---- M10：左滑删除手势 ----
    var SWIPE_W = 76;        // 完全展开的平移量（= 删除按钮宽度）
    var SWIPE_OPEN_AT = -56; // 松手时平移超过此值则吸附展开
    var SWIPE_MAX = 84;      // 可平移的最大距离（含橡皮筋余量）
    var touchSwipe = { inner: null, id: null, startX: 0, startY: 0, dx: 0, baseOpen: 0, tracking: false, moved: false };

    function setSwipeX(inner, x) {
      inner.style.transform = x ? 'translateX(' + x + 'px)' : '';
    }

    function closeSwipe() {
      if (!swipeOpenId) return;
      list.querySelectorAll('.memo-item.swipe-open').forEach(function (it) {
        it.classList.remove('swipe-open');
        var inn = it.querySelector('.memo-swipe-inner');
        if (inn) { inn.style.transition = ''; setSwipeX(inn, 0); }
      });
      swipeOpenId = null;
    }

    list.addEventListener('touchstart', function (e) {
      var t = e.touches[0];
      touchSwipe.moved = false;
      var inner = e.target.closest ? e.target.closest('.memo-swipe-inner') : null;
      if (!inner) {
        // 点在删除按钮上时保持展开，其他区域点按则收起
        if (!e.target.closest('.memo-swipe-del')) closeSwipe();
        return;
      }
      var item = inner.closest('.memo-item');
      if (swipeOpenId && swipeOpenId !== item.dataset.id) closeSwipe();
      touchSwipe.id = item.dataset.id;
      touchSwipe.inner = inner;
      touchSwipe.startX = t.clientX;
      touchSwipe.startY = t.clientY;
      touchSwipe.baseOpen = (swipeOpenId === touchSwipe.id) ? -SWIPE_W : 0;
      touchSwipe.dx = touchSwipe.baseOpen;
      touchSwipe.tracking = true;
      inner.style.transition = 'none';
    }, { passive: true });

    list.addEventListener('touchmove', function (e) {
      if (!touchSwipe.tracking || !touchSwipe.inner) return;
      var t = e.touches[0];
      var dx = t.clientX - touchSwipe.startX;
      var dy = t.clientY - touchSwipe.startY;
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) {
        // 纵向滚动意图：放弃平移并还原
        touchSwipe.tracking = false;
        touchSwipe.inner.style.transition = '';
        if (touchSwipe.baseOpen === 0) setSwipeX(touchSwipe.inner, 0);
        return;
      }
      var x = touchSwipe.baseOpen + ((touchSwipe.baseOpen === 0 && dx > 0) ? 0 : dx);
      if (x > 0) x = 0;
      if (x < -SWIPE_MAX) x = -SWIPE_MAX;
      touchSwipe.dx = x;
      setSwipeX(touchSwipe.inner, x);
    }, { passive: true });

    function endSwipe() {
      if (!touchSwipe.tracking || !touchSwipe.inner) return;
      var inner = touchSwipe.inner;
      var item = inner.closest('.memo-item');
      inner.style.transition = '';
      touchSwipe.tracking = false;
      if (Math.abs(touchSwipe.dx - touchSwipe.baseOpen) > 10) touchSwipe.moved = true;
      if (touchSwipe.dx <= SWIPE_OPEN_AT) {
        swipeOpenId = touchSwipe.id;
        item.classList.add('swipe-open');
        setSwipeX(inner, -SWIPE_W);
      } else {
        if (swipeOpenId === touchSwipe.id) swipeOpenId = null;
        item.classList.remove('swipe-open');
        setSwipeX(inner, 0);
      }
      touchSwipe.inner = null;
    }
    list.addEventListener('touchend', endSwipe, { passive: true });
    list.addEventListener('touchcancel', endSwipe, { passive: true });

    // ---- 列表内：角标归类 + 图片查看 + 编辑 + 删除（事件委托） ----
    // M9：用 closest 命中按钮（图标为内联 SVG，e.target 常是 svg/path 而非按钮本身）
    list.addEventListener('click', function (e) {
      var target = e.target;
      var item = target.closest ? target.closest('.memo-item') : null;
      if (!item) return;
      var id = item.dataset.id;

      if (touchSwipe.moved) { touchSwipe.moved = false; return; } // M10：左滑手势后的误触吞掉

      if (target.closest('.memo-swipe-del')) { // M10：左滑露出的删除按钮
        closeSwipe();
        handleDelete(id);
      } else if (target.closest('.memo-cat-badge')) {
        openCategoryPicker(id);
      } else if (target.closest('.memo-thumb')) {
        Utils.showModal({ bodyHTML: '<img src="' + target.closest('.memo-thumb').src + '" style="max-width:100%;border-radius:8px;">' });
      } else if (target.closest('.memo-del')) {
        handleDelete(id);
      } else if (target.closest('.memo-edit')) {
        handleEdit(item, id);
      } else if (target.closest('.star')) {
        // S4：点星评分，再点当前评分则清除
        var star = parseInt(target.closest('.star').dataset.star, 10);
        var current = item.querySelectorAll('.memo-stars .star.on').length;
        if (setRating(id, star === current ? 0 : star)) render();
      } else if (target.closest('.memo-feedback-btn')) {
        openFeedbackEditor(id); // S4 反馈弹窗
      }
    });

    // ---- 拖拽：从列表拖出 ----
    list.addEventListener('dragstart', function (e) {
      if (e.target.tagName === 'INPUT') { e.preventDefault(); return; }
      var item = e.target.closest ? e.target.closest('.memo-item') : null;
      if (!item) return;
      e.dataTransfer.setData('text/plain', item.dataset.id);
      e.dataTransfer.effectAllowed = 'move';
      item.classList.add('dragging');
    });
    list.addEventListener('dragend', function () {
      list.querySelectorAll('.memo-item.dragging').forEach(function (el) {
        el.classList.remove('dragging');
      });
    });

    // ---- M1：点击文件夹过滤（再点同一个恢复显示全部） ----
    if (foldersBox) {
      foldersBox.addEventListener('click', function (e) {
        var folder = e.target.closest ? e.target.closest('.memo-folder') : null;
        if (!folder) return;
        var key = folder.dataset.folder || '';
        activeFolder = (activeFolder === key) ? null : key;
        render();
      });
    }

    // ---- 拖拽：放入文件夹 ----
    if (foldersBox) {
      foldersBox.addEventListener('dragover', function (e) {
        var folder = e.target.closest ? e.target.closest('.memo-folder') : null;
        if (!folder) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        folder.classList.add('drag-over');
      });
      foldersBox.addEventListener('dragleave', function (e) {
        var folder = e.target.closest ? e.target.closest('.memo-folder') : null;
        if (folder) folder.classList.remove('drag-over');
      });
      foldersBox.addEventListener('drop', function (e) {
        var folder = e.target.closest ? e.target.closest('.memo-folder') : null;
        if (!folder) return;
        e.preventDefault();
        folder.classList.remove('drag-over');
        var id = e.dataTransfer.getData('text/plain');
        if (id) applyDrop(id, folder.dataset.folder);
      });
    }
  }

  function handleDelete(id) {
    Utils.confirm('确定删除这条备忘吗？').then(function (ok) {
      if (!ok) return;
      remove(id);
      render();
      Utils.toast('已删除');
    });
  }

  function handleEdit(item, id) {
    var contentEl = Utils.$('.memo-content', item);
    var oldText = contentEl.textContent;
    var input = Utils.el('input', 'memo-edit-input');
    input.type = 'text';
    input.value = oldText;
    contentEl.replaceWith(input);
    input.focus();
    input.select();

    function saveEdit() {
      var val = input.value.trim();
      if (val && val !== oldText) {
        edit(id, val);
      }
      render();
    }

    input.addEventListener('blur', saveEdit);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
      if (e.key === 'Escape') { input.value = oldText; input.blur(); }
    });
  }

  // 暴露全局
  window.MemoModule = {
    // 数据 API（测试直接调用）
    getAll: getAll,
    add: add,
    edit: edit,
    remove: remove,
    getRecent: getRecent,
    // 分类（F7）
    CATEGORIES: CATEGORIES,
    categoryOf: categoryOf,
    setCategory: setCategory,
    applyDrop: applyDrop,
    setRating: setRating,
    setFeedback: setFeedback,
    openFeedbackEditor: openFeedbackEditor,
    openCategoryPicker: openCategoryPicker,
    compressImage: compressImage,
    // 渲染+绑定
    render: render,
    bind: bind
  };
})();
