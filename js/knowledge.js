/**
 * knowledge.js —— popo 知识库模块
 * 职责：文件夹+标签+句子 CRUD + 搜索 + 每日一句
 */

(function () {
  'use strict';

  var KEY = Storage.KEYS.KNOWLEDGE;

  // ============== 数据 API ==============

  function get() {
    return Storage.load(KEY, {
      folders: [],
      tags: [],
      sentences: [],
      sortMode: 'time', // 'time' = 按最新时间；'custom' = 自定义（数组顺序）
      lastDailySentenceDate: '',
      lastDailySentenceId: null
    });
  }

  function save(data) {
    Storage.save(KEY, data);
  }

  // ============== 排序（S2） ==============

  function getSortMode() {
    var m = get().sortMode;
    return m === 'custom' ? 'custom' : 'time';
  }

  function setSortMode(mode) {
    if (mode !== 'time' && mode !== 'custom') return false;
    var k = get();
    k.sortMode = mode;
    save(k);
    return true;
  }

  /** 按当前排序模式对句子排序 */
  function sortSentences(list) {
    var arr = list.slice();
    if (getSortMode() === 'time') {
      arr.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    }
    // custom：保持 sentences 数组原始顺序，不做排序
    return arr;
  }

  /** 同步 folders + tags 池（从所有 sentences 自动提取） */
  function syncCollections(data) {
    var fromSentencesFolders = new Set();
    var fromSentencesTags = new Set();
    (data.sentences || []).forEach(function (s) {
      if (s.folder) fromSentencesFolders.add(s.folder);
      (s.tags || []).forEach(function (t) { fromSentencesTags.add(t); });
    });
    data.folders = Array.from(new Set((data.folders || []).concat(Array.from(fromSentencesFolders))));
    data.tags = Array.from(new Set((data.tags || []).concat(Array.from(fromSentencesTags))));
    return data;
  }

  function addFolder(name) {
    name = (name || '').trim();
    if (!name) return null;
    var data = get();
    if (data.folders.indexOf(name) >= 0) return name; // 已存在
    data.folders.push(name);
    save(data);
    return name;
  }

  function addSentence(data) {
    var k = get();
    var content = (data.content || '').trim();
    if (!content) return null;  // 空内容拒绝
    var obj = {
      id: Utils.uid(),
      content: content,
      source: (data.source || '').trim(),
      folder: (data.folder || '').trim(),
      tags: (data.tags || []).map(function (t) { return t.trim(); }).filter(Boolean),
      createdAt: Date.now()
    };
    k.sentences.push(obj);
    syncCollections(k);
    save(k);
    return obj;
  }

  function editSentence(id, newData) {
    var k = get();
    var found = null;
    for (var i = 0; i < k.sentences.length; i++) {
      if (String(k.sentences[i].id) === String(id)) {
        k.sentences[i].content = (newData.content || '').trim();
        k.sentences[i].source = (newData.source || '').trim();
        k.sentences[i].folder = (newData.folder || '').trim();
        k.sentences[i].tags = (newData.tags || []).map(function (t) { return t.trim(); }).filter(Boolean);
        found = k.sentences[i];
        break;
      }
    }
    if (found) { syncCollections(k); save(k); }
    return found;
  }

  function removeSentence(id) {
    var k = get();
    var before = k.sentences.length;
    k.sentences = k.sentences.filter(function (s) { return String(s.id) !== String(id); });
    var removed = before - k.sentences.length;
    if (removed > 0) { syncCollections(k); save(k); }
    return removed > 0;
  }

  /**
   * 搜索句子
   * @param {object} opts
   *   - keyword: string，同时搜 content / source / folder / tags
   *   - folder: string，文件夹筛选
   *   - tags: string[]，标签多选筛选（AND：必须包含所有）
   */
  function search(opts) {
    opts = opts || {};
    var k = get();
    var list = k.sentences || [];
    var kw = (opts.keyword || '').trim().toLowerCase();
    var folder = opts.folder || '';
    var tags = opts.tags || [];

    return list.filter(function (s) {
      // folder 筛选
      if (folder && s.folder !== folder) return false;
      // tags AND 筛选
      if (tags.length > 0) {
        var sTags = (s.tags || []);
        for (var i = 0; i < tags.length; i++) {
          if (sTags.indexOf(tags[i]) < 0) return false;
        }
      }
      // keyword 全文匹配
      if (kw) {
        var haystack = [
          s.content || '',
          s.source || '',
          s.folder || '',
          (s.tags || []).join(' ')
        ].join(' ').toLowerCase();
        if (haystack.indexOf(kw) < 0) return false;
      }
      return true;
    });
  }

  // ============== 每日一句 ==============

  function pickDailySentence() {
    var k = get();
    var today = Utils.DateUtil.todayStr();

    // 今天已经选过 → 返回已选的那条
    if (k.lastDailySentenceDate === today && k.lastDailySentenceId) {
      for (var i = 0; i < k.sentences.length; i++) {
        if (String(k.sentences[i].id) === String(k.lastDailySentenceId)) {
          return k.sentences[i];
        }
      }
    }

    // 从 sentences 里排除上次选过的，随机选一个
    var pool = k.sentences.slice();
    if (pool.length <= 1) {
      k.lastDailySentenceDate = today;
      if (pool.length === 1) {
        k.lastDailySentenceId = pool[0].id;
        save(k);
        return pool[0];
      }
      k.lastDailySentenceId = null;
      save(k);
      return null; // 库为空
    }

    // 排除昨天选的那个避免重复
    var lastId = k.lastDailySentenceId;
    if (lastId) {
      pool = pool.filter(function (s) { return String(s.id) !== String(lastId); });
    }
    if (pool.length === 0) {
      // 全被排除了（只有一条），那还是用它
      pool = k.sentences.slice();
    }

    var idx = Math.floor(Math.random() * pool.length);
    var picked = pool[idx];
    k.lastDailySentenceDate = today;
    k.lastDailySentenceId = picked.id;
    save(k);
    return picked;
  }

  // ============== 渲染 ==============

  var _filterState = { keyword: '', folder: '', tags: [] };

  function render() {
    renderFilters();
    renderSortBar();
    renderSentences();
  }

  // ============== 排序切换栏（S2） ==============

  function renderSortBar() {
    var box = Utils.$('#knowledge-sort');
    if (!box) return;
    var mode = getSortMode();
    box.innerHTML =
      '<span class="sort-label">排序</span>' +
      '<span class="sort-btn' + (mode === 'time' ? ' active' : '') + '" data-sort="time">' + Utils.ICONS.clock + ' 最新时间</span>' +
      '<span class="sort-btn' + (mode === 'custom' ? ' active' : '') + '" data-sort="custom">↕ 自定义</span>' +
      (mode === 'custom' ? '<span class="sort-hint">拖动句子卡片调整顺序</span>' : '');
    box.querySelectorAll('.sort-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (btn.dataset.sort === mode) return;
        setSortMode(btn.dataset.sort);
        render();
      });
    });
  }

  function renderFilters() {
    var k = get();
    var folderBox = Utils.$('#folder-chips');
    var tagBox = Utils.$('#tag-chips');
    if (!folderBox || !tagBox) return;

    // 文件夹
    folderBox.innerHTML = '';
    var allChip = makeChip('全部', !_filterState.folder, function () {
      _filterState.folder = ''; renderSentences();
    });
    allChip.dataset.folder = '';
    folderBox.appendChild(allChip);
    (k.folders || []).forEach(function (f) {
      var chip = makeChip(f, _filterState.folder === f, function () {
        _filterState.folder = (_filterState.folder === f ? '' : f);
        renderSentences();
      });
      chip.dataset.folder = f;
      // S3：文件夹 chip 本身可拖动，拖到句子卡片即完成分类
      chip.draggable = true;
      chip.classList.add('folder-chip-drag');
      chip.title = '拖动到句子进行分类';
      chip.addEventListener('dragstart', function (e) {
        e.dataTransfer.setData('text/plain', 'folder:' + f);
        e.dataTransfer.effectAllowed = 'move';
        _dragType = 'folder';
        chip.classList.add('dragging');
      });
      chip.addEventListener('dragend', function () {
        chip.classList.remove('dragging');
        clearDragMarks();
      });
      folderBox.appendChild(chip);
    });

    // 标签
    tagBox.innerHTML = '';
    (k.tags || []).forEach(function (t) {
      var active = _filterState.tags.indexOf(t) >= 0;
      tagBox.appendChild(makeChip(t, active, function () {
        var idx = _filterState.tags.indexOf(t);
        if (idx >= 0) _filterState.tags.splice(idx, 1);
        else _filterState.tags.push(t);
        renderSentences();
      }));
    });
  }

  function makeChip(label, active, onClick) {
    var chip = Utils.el('span', 'chip' + (active ? ' active' : ''), label);
    chip.addEventListener('click', onClick);
    return chip;
  }

  // ============== 拖拽归类 / 排序（F8 + S3） ==============

  /** 当前拖拽类型：'folder'（文件夹拖到句子）| 'sentence'（句子间排序）| '' */
  var _dragType = '';

  /** 仅移动句子到指定文件夹（保留其他字段），'' = 移回未分类 */
  function moveToFolder(id, folder) {
    folder = (folder || '').trim();
    var k = get();
    var found = null;
    for (var i = 0; i < k.sentences.length; i++) {
      if (String(k.sentences[i].id) === String(id)) {
        k.sentences[i].folder = folder;
        found = k.sentences[i];
        break;
      }
    }
    if (found) save(k);
    return found;
  }

  /** 清除所有卡片上的拖拽放置标记 */
  function clearDragMarks() {
    _dragType = '';
    Utils.$$('.sentence-card.drop-before,.sentence-card.drop-after,.sentence-card.folder-drop-target')
      .forEach(function (el) {
        el.classList.remove('drop-before', 'drop-after', 'folder-drop-target');
      });
  }

  /**
   * S3：句子间拖拽排序 —— 把 dragId 移到 targetId 之前/之后
   * 自动切换为自定义排序；返回是否成功
   * @param place 'before' | 'after'
   */
  function reorderSentence(dragId, targetId, place) {
    dragId = String(dragId); targetId = String(targetId);
    if (dragId === targetId) return false;
    var k = get();
    var from = -1, to = -1;
    for (var i = 0; i < k.sentences.length; i++) {
      var sid = String(k.sentences[i].id);
      if (sid === dragId) from = i;
      if (sid === targetId) to = i;
    }
    if (from < 0 || to < 0) return false;
    var moving = k.sentences.splice(from, 1)[0];
    if (from < to) to -= 1; // 删除源元素后目标索引前移
    var insertAt = to + (place === 'after' ? 1 : 0);
    k.sentences.splice(insertAt, 0, moving);
    k.sortMode = 'custom'; // 手动排序即进入自定义模式
    save(k);
    return true;
  }

  /**
   * S3 移动端兜底：在当前可见列表中把句子上移/下移一步
   * @param dir -1 = 上移，1 = 下移
   */
  function moveSentenceStep(id, dir) {
    var visible = sortSentences(search(_filterState));
    var ids = visible.map(function (s) { return String(s.id); });
    var idx = ids.indexOf(String(id));
    var swap = idx + dir;
    if (idx < 0 || swap < 0 || swap >= ids.length) return false;
    return reorderSentence(id, ids[swap], dir < 0 ? 'before' : 'after');
  }

  /** S3 移动端兜底：点按选择文件夹进行分类（参照备忘的分类选择） */
  function openFolderPicker(id) {
    var k = get();
    var btns = [{ label: Utils.ICONS.classify + ' 未分类', v: '' }].concat((k.folders || []).map(function (f) {
      return { label: Utils.ICONS.folder + ' ' + f, v: f };
    }));
    var html = '<h3>归入文件夹</h3><div class="cat-picker">' + btns.map(function (b) {
      return '<button class="cat-pick-btn" data-v="' + Utils.esc(b.v) + '">' + b.label + '</button>';
    }).join('') + '</div>';
    Utils.showModal({ bodyHTML: html });
    document.querySelectorAll('.cat-pick-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        Utils.closeModal();
        if (moveToFolder(id, btn.dataset.v)) {
          render();
          Utils.toast(btn.dataset.v ? '📁 已移入「' + btn.dataset.v + '」' : '已移出文件夹');
        }
      });
    });
  }

  function renderSentences() {
    var list = Utils.$('#knowledge-list');
    if (!list) return;
    list.innerHTML = '';

    var sentences = sortSentences(search(_filterState));
    if (sentences.length === 0) {
      list.innerHTML = '<div class="timeblock-empty">没有匹配的句子，点击右下角 + 添加第一条</div>';
      return;
    }

    sentences.forEach(function (s) { list.appendChild(renderSentence(s)); });
  }

  function renderSentence(s) {
    var card = Utils.el('div', 'sentence-card');
    card.dataset.id = s.id;
    card.draggable = true; // S3：句子可拖动到另一句子上调整顺序

    card.addEventListener('dragstart', function (e) {
      if (e.target.tagName === 'INPUT') { e.preventDefault(); return; }
      e.dataTransfer.setData('text/plain', s.id);
      e.dataTransfer.effectAllowed = 'move';
      _dragType = 'sentence';
      card.classList.add('dragging');
    });
    card.addEventListener('dragend', function () {
      card.classList.remove('dragging');
      clearDragMarks();
    });

    // S3：卡片作为放置目标
    card.addEventListener('dragover', function (e) {
      if (!_dragType) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (_dragType === 'folder') {
        card.classList.add('folder-drop-target');
      } else {
        // 句子排序：按鼠标位于卡片上/下半部决定插入线
        var rect = card.getBoundingClientRect();
        var before = (e.clientY || 0) < rect.top + rect.height / 2;
        card.classList.toggle('drop-before', before);
        card.classList.toggle('drop-after', !before);
      }
    });
    card.addEventListener('dragleave', function () {
      card.classList.remove('drop-before', 'drop-after', 'folder-drop-target');
    });
    card.addEventListener('drop', function (e) {
      if (!_dragType) return;
      e.preventDefault();
      e.stopPropagation();
      var payload = e.dataTransfer.getData('text/plain') || '';
      var type = _dragType;
      card.classList.remove('drop-before', 'drop-after', 'folder-drop-target');
      _dragType = '';
      if (type === 'folder' && payload.indexOf('folder:') === 0) {
        // 文件夹拖到句子 → 分类
        var folder = payload.slice('folder:'.length);
        if (moveToFolder(s.id, folder)) {
          render();
          Utils.toast('📁 已移入「' + folder + '」');
        }
      } else if (type === 'sentence') {
        // 句子拖到句子 → 排序
        var rect = card.getBoundingClientRect();
        var place = (e.clientY || 0) < rect.top + rect.height / 2 ? 'before' : 'after';
        if (payload && String(payload) !== String(s.id) && reorderSentence(payload, s.id, place)) {
          render();
          Utils.toast('↕ 顺序已调整（自定义排序）');
        }
      }
    });

    // 左上角：填写日期（S1：2026/10/17 形式）
    card.appendChild(Utils.el('div', 'sentence-date', Utils.DateUtil.formatSlashDate(s.createdAt || Date.now())));

    var content = Utils.el('div', 'sentence-content', Utils.esc(s.content));

    // S3：分类按钮（移动端点按兜底）；自定义模式额外显示上移/下移
    var actionHTML = '<span class="classify" title="归入文件夹">' + Utils.ICONS.classify + '</span>';
    if (getSortMode() === 'custom') {
      actionHTML += '<span class="move-up" title="上移">↑</span>' +
                    '<span class="move-down" title="下移">↓</span>';
    }
    actionHTML += '<span class="edit" title="编辑">' + Utils.ICONS.edit + '</span>' +
                  '<span class="del" title="删除">' + Utils.ICONS.del + '</span>';
    var actions = Utils.el('div', 'sentence-actions', actionHTML);

    card.appendChild(content);
    if (s.source) card.appendChild(Utils.el('div', 'sentence-source', '— ' + Utils.esc(s.source)));

    var meta = Utils.el('div', 'sentence-meta');
    if (s.folder) {
      meta.appendChild(Utils.el('span', 'chip', Utils.ICONS.folder + ' <span class="chip-text">' + Utils.esc(s.folder) + '</span>'));
    }
    (s.tags || []).forEach(function (t) {
      meta.appendChild(Utils.el('span', 'chip', '#<span class="chip-text">' + Utils.esc(t) + '</span>'));
    });
    card.appendChild(meta);
    card.appendChild(actions);

    return card;
  }

  // ============== 事件绑定 ==============

  function bind() {
    var page = Utils.$('#page-knowledge');
    if (!page) return;

    // 搜索
    var searchInput = Utils.$('#knowledge-search', page);
    var searchTimer = null;
    if (searchInput) searchInput.addEventListener('input', function () {
      if (searchTimer) clearTimeout(searchTimer);
      searchTimer = setTimeout(function () {
        _filterState.keyword = searchInput.value.trim();
        renderSentences();
      }, 200);
    });

    // FAB 添加句子
    var fab = Utils.$('#fab-add-sentence', page);
    if (fab) fab.addEventListener('click', openAddModal);

    // 新建文件夹
    var newFolderBtn = Utils.$('#btn-new-folder', page);
    if (newFolderBtn) newFolderBtn.addEventListener('click', function () {
      var name = prompt('新文件夹名称：');
      if (name && name.trim()) { addFolder(name.trim()); renderFilters(); Utils.toast('✓ 已创建'); }
    });

    // 列表内事件（委托）
    var list = Utils.$('#knowledge-list', page);
    list.addEventListener('click', function (e) {
      var target = e.target;
      var card = target.closest ? target.closest('.sentence-card') : null;
      if (!card) return;
      var id = card.dataset.id;
      if (target.classList.contains('del')) {
        Utils.confirm('确定删除这条句子吗？').then(function (ok) {
          if (!ok) return;
          removeSentence(id);
          render();
          Utils.toast('已删除');
        });
      } else if (target.classList.contains('edit')) {
        openEditModal(id);
      } else if (target.classList.contains('classify')) {
        openFolderPicker(id); // S3 移动端点按分类
      } else if (target.classList.contains('move-up')) {
        if (moveSentenceStep(id, -1)) { renderSentences(); Utils.toast('已上移'); }
      } else if (target.classList.contains('move-down')) {
        if (moveSentenceStep(id, 1)) { renderSentences(); Utils.toast('已下移'); }
      }
    });
  }

  function openAddModal() { openEditModal(null); }

  function openEditModal(id) {
    var k = get();
    var editing = id ? k.sentences.find(function (s) { return String(s.id) === String(id); }) : null;
    var isNew = !editing;
    var data = editing ? editing : { content: '', source: '', folder: (k.folders[0] || ''), tags: [] };

    // 收集所有文件夹和标签供选择
    var folderOptions = (k.folders || []).map(function (f) {
      return '<option ' + (f === data.folder ? 'selected' : '') + '>' + Utils.esc(f) + '</option>';
    }).join('');

    var tagChips = (data.tags || []).map(function (t, idx) {
      return '<span class="chip active" data-tg="' + Utils.esc(t) + '" data-idx="' + idx + '">' + Utils.esc(t) + ' <span class="chip-remove">✕</span></span>';
    }).join('');

    var body = '' +
      '<div class="form-row"><label class="form-label">句子内容</label>' +
      '<textarea class="form-input" id="k-sentence-content" placeholder="写下你想记住的句子...">' + Utils.esc(data.content) + '</textarea></div>' +
      '<div class="form-row"><label class="form-label">来源（可选）</label>' +
      '<input class="form-input" id="k-sentence-source" value="' + Utils.esc(data.source) + '" placeholder="作者、书名等"></div>' +
      '<div class="form-row"><label class="form-label">文件夹</label>' +
      '<select class="form-input" id="k-sentence-folder">' + folderOptions + '</select></div>' +
      '<div class="form-row"><label class="form-label">标签（回车添加）</label>' +
      '<div id="k-tag-area" class="filter-chips">' + tagChips + '</div>' +
      '<input class="form-input" id="k-sentence-tags" placeholder="输入标签，回车添加">' +
      '<div class="form-label" style="margin-top:8px;">历史标签（点击选用）</div>' +
      '<div id="k-tag-suggest" class="filter-chips"></div></div>';

    var actions = '<button class="btn-ghost" id="k-cancel">取消</button>' +
                  '<button class="btn-primary" id="k-save">保存</button>';

    Utils.showModal({
      title: isNew ? '添加句子' : '编辑句子',
      bodyHTML: body,
      actions: actions,
      onClose: null
    });

    var currentTags = (data.tags || []).slice();

    // 历史标签建议区：点击即选用
    function renderTagSuggest() {
      var box = Utils.$('#k-tag-suggest');
      if (!box) return;
      var avail = (k.tags || []).filter(function (t) { return currentTags.indexOf(t) < 0; });
      if (avail.length === 0) {
        box.innerHTML = '<span style="font-size:12px;color:#9ca3af;">暂无可选的历史标签</span>';
        return;
      }
      box.innerHTML = avail.map(function (t) {
        return '<span class="chip" data-suggest="' + Utils.esc(t) + '">+ ' + Utils.esc(t) + '</span>';
      }).join('');
      box.querySelectorAll('[data-suggest]').forEach(function (chip) {
        chip.addEventListener('click', function () {
          var t = chip.dataset.suggest;
          if (currentTags.indexOf(t) < 0) {
            currentTags.push(t);
            renderTagChips();
            renderTagSuggest();
          }
        });
      });
    }

    // 标签输入
    var tagInput = Utils.$('#k-sentence-tags');
    tagInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        var val = tagInput.value.trim();
        if (val && currentTags.indexOf(val) < 0) {
          currentTags.push(val);
          renderTagChips();
          renderTagSuggest();
        }
        tagInput.value = '';
      }
    });

    function renderTagChips() {
      var box = Utils.$('#k-tag-area');
      box.innerHTML = currentTags.map(function (t, i) {
        return '<span class="chip active" data-idx="' + i + '">' + Utils.esc(t) + ' <span class="chip-remove">✕</span></span>';
      }).join('');
      box.querySelectorAll('.chip-remove').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var idx = parseInt(btn.parentElement.dataset.idx);
          currentTags.splice(idx, 1);
          renderTagChips();
          renderTagSuggest();
        });
      });
    }

    renderTagChips();
    renderTagSuggest();

    Utils.$('#k-cancel').addEventListener('click', Utils.closeModal);
    Utils.$('#k-save').addEventListener('click', function () {
      var content = Utils.$('#k-sentence-content').value.trim();
      var source = Utils.$('#k-sentence-source').value.trim();
      var folder = Utils.$('#k-sentence-folder').value;
      if (!content) { Utils.toast('句子内容不能为空'); return; }
      var payload = { content: content, source: source, folder: folder, tags: currentTags };
      if (isNew) addSentence(payload);
      else editSentence(id, payload);
      Utils.closeModal();
      render();
      Utils.toast('✓ 已保存');
    });
  }

  // 暴露
  window.KnowledgeModule = {
    get: get,
    addFolder: addFolder,
    addSentence: addSentence,
    editSentence: editSentence,
    removeSentence: removeSentence,
    search: search,
    pickDailySentence: pickDailySentence,
    moveToFolder: moveToFolder,
    reorderSentence: reorderSentence,
    moveSentenceStep: moveSentenceStep,
    openFolderPicker: openFolderPicker,
    getSortMode: getSortMode,
    setSortMode: setSortMode,
    sortSentences: sortSentences,
    render: render,
    bind: bind,
    openAddModal: openAddModal,
    openEditModal: openEditModal
  };
})();
