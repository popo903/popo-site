/**
 * home.js —— 首页聚合
 * 职责：三个卡片渲染 + 拖拽排序
 */

(function () {
  'use strict';

  // 卡片 key → 渲染函数
  var RENDERERS = {
    top5: renderTop5Card,
    dailySentence: renderDailySentenceCard,
    memoPreview: renderMemoPreviewCard
  };

  // 卡片显示名（T4：去图标，英文/中文 格式）
  var CARD_TITLES = {
    top5: 'Must Do/今日必做',
    dailySentence: 'Knowledge/今日一言',
    memoPreview: 'Memo/备忘'
  };

  var layoutKey = Storage.KEYS.SETTINGS;

  function getLayout() {
    var settings = Storage.load(layoutKey, { homeLayout: ['top5', 'dailySentence', 'memoPreview'] });
    // 确保三个 key 都在里面
    var defaults = ['top5', 'dailySentence', 'memoPreview'];
    var layout = (settings.homeLayout || defaults).slice();
    defaults.forEach(function (k) {
      if (layout.indexOf(k) < 0) layout.push(k);
    });
    return layout;
  }

  function saveLayout(layout) {
    var settings = Storage.load(layoutKey, {});
    settings.homeLayout = layout;
    Storage.save(layoutKey, settings);
  }

  function render() {
    // 问候语 + 日期
    var greeting = Utils.$('#greeting-text');
    if (greeting) greeting.textContent = getGreeting();
    var dateSub = Utils.$('#home-date');
    if (dateSub) dateSub.textContent = Utils.DateUtil.formatCN(Utils.DateUtil.todayStr());

    // 三个卡片
    var container = Utils.$('#home-modules');
    if (!container) return;
    container.innerHTML = '';

    var layout = getLayout();
    layout.forEach(function (key) {
      var html = RENDERERS[key] ? RENDERERS[key]() : '';
      // T6：今日必做卡片标题行带调色按钮（与计划页共用同一颜色设置）
      var titleHtml;
      if (key === 'top5' && window.PlanModule && PlanModule.noteDotsHtml) {
        titleHtml =
          '<div class="card-title-row">' +
            '<span class="card-title">' + CARD_TITLES[key] + '</span>' +
            '<div class="note-palette-wrap">' +
              '<button class="note-palette-btn" id="btn-note-palette-home" title="更换便利贴颜色">' + Utils.ICONS.palette + '</button>' +
              '<div class="note-palette-pop" id="note-palette-pop-home" hidden>' + PlanModule.noteDotsHtml() + '</div>' +
            '</div>' +
          '</div>';
      } else {
        titleHtml = '<div class="card-title">' + CARD_TITLES[key] + '</div>';
      }
      var card = Utils.el('div', 'card home-card',
        '<div class="drag-handle" title="拖动排序">⋮⋮</div>' + titleHtml + html
      );
      card.dataset.key = key;
      // 五件事全部完成 → 卡片边框变绿
      if (key === 'top5' && PlanModule.isTop5AllDone(Utils.DateUtil.todayStr())) {
        card.classList.add('all-done');
      }
      container.appendChild(card);
    });

    // 绑定拖拽
    bindDrag();

    // 绑定跳转
    bindClicks();

    // T6：绑定首页调色按钮（每次重渲染后元素是新的，需重新绑定）
    bindHomeNotePalette();

    // T1：重渲染后恢复便利贴颜色状态（深色 class 等）
    if (window.PlanModule && PlanModule.applyNoteColor) {
      PlanModule.applyNoteColor(PlanModule.getNoteColor());
    }
  }

  // 每日鼓励语语料：按日期确定选取，一天一句
  var ENCOURAGEMENTS = [
    '今天也要元气满满哦！',
    '慢慢来，比较快。',
    '你比昨天更接近目标了！',
    '把小事做好，就是了不起。',
    '今天的你，值得表扬！',
    '别急，花朵有它的花期。',
    '行动是治愈焦虑的良药。',
    '累了就歇歇，别硬撑。',
    '每一次坚持都算数。',
    '保持热爱，奔赴山海。',
    '微风正好，出发吧！',
    '把今天过成自己喜欢的样子。',
    '你认真生活的样子真好看。',
    '星星不会辜负赶路的人。',
    '慢慢走，欣赏啊。',
    '今天也要记得喝水哦！',
    '所有的美好都会如约而至。',
    '你的努力，时间看得见。',
    '生活明朗，万物可爱。',
    '此刻开始，一切都不晚。'
  ];

  /** 根据日期确定性地选取一句鼓励语（同一天固定不变） */
  function dailyEncouragement(dateStr) {
    var d = dateStr || Utils.DateUtil.todayStr();
    var hash = 0;
    for (var i = 0; i < d.length; i++) {
      hash = (hash * 31 + d.charCodeAt(i)) >>> 0;
    }
    return ENCOURAGEMENTS[hash % ENCOURAGEMENTS.length];
  }

  function getGreeting() {
    return 'popo，' + dailyEncouragement();
  }

  // ========== 三个卡片渲染 ==========

  function renderTop5Card() {
    var today = Utils.DateUtil.todayStr();
    var plan = PlanModule.getPlan(today);
    var done = 0, total = 0;
    var itemsHtml = plan.top5.map(function (t, idx) {
      if (t.content) total++;
      if (t.content && t.done) done++;
      // T3：行首空白方格子（点击勾选），替代原序号与末尾圆圈
      return '<div class="home-top5-item">' +
        '<span class="home-top5-check ' + (t.done ? 'on' : '') + '" data-idx="' + idx + '" data-action="toggle">' +
          (t.done ? '✓' : '') + '</span>' +
        '<span class="home-top5-text ' + (t.done ? 'done' : '') + '">' + Utils.esc(t.content || '（空）') + '</span>' +
      '</div>';
    }).join('');

    return itemsHtml +
      '<div style="margin-top:8px;font-size:12px;color:var(--color-text-muted);" id="home-top5-progress">' +
        (total > 0 ? '已完成 ' + done + '/' + total : '还没有计划') +
      '</div>';
  }

  function renderDailySentenceCard() {
    var s = KnowledgeModule.pickDailySentence();
    if (!s) {
      return '<div style="color:var(--color-text-muted);font-size:13px;">知识库还是空的，去知识库添加第一条吧</div>';
    }
    return '<div class="home-sentence-quote">' + Utils.esc(s.content) + '</div>' +
      (s.source ? '<div class="home-sentence-source">— ' + Utils.esc(s.source) + '</div>' : '');
  }

  function renderMemoPreviewCard() {
    var recent = MemoModule.getRecent(3);
    if (recent.length === 0) {
      return '<div style="color:var(--color-text-muted);font-size:13px;">还没有备忘</div>';
    }
    var html = recent.map(function (m) {
      return '<div class="home-memo-preview-item">' +
        Utils.DateUtil.formatDateTime(m.createdAt) + ' · ' +
        Utils.esc(m.content.length > 30 ? m.content.slice(0, 30) + '…' : m.content) +
      '</div>';
    }).join('');
    return html + '<div style="text-align:right;margin-top:6px;"><a href="#" id="home-memo-more" style="color:var(--color-primary);font-size:13px;text-decoration:none;">查看全部 →</a></div>';
  }

  // ========== 拖拽（HTML5 Drag and Drop）==========

  function bindDrag() {
    var container = Utils.$('#home-modules');
    var cards = container.querySelectorAll('.home-card');
    var dragKey = null;

    cards.forEach(function (card) {
      card.setAttribute('draggable', 'true');

      card.addEventListener('dragstart', function (e) {
        dragKey = card.dataset.key;
        card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', dragKey);
      });

      card.addEventListener('dragend', function () {
        card.classList.remove('dragging');
        container.querySelectorAll('.home-card').forEach(function (c) {
          c.classList.remove('drag-over');
        });
        dragKey = null;
      });

      card.addEventListener('dragover', function (e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        card.classList.add('drag-over');
      });

      card.addEventListener('dragleave', function () {
        card.classList.remove('drag-over');
      });

      card.addEventListener('drop', function (e) {
        e.preventDefault();
        card.classList.remove('drag-over');
        var dropKey = card.dataset.key;
        if (!dragKey || dragKey === dropKey) return;

        // 交换顺序
        var layout = getLayout();
        var fromIdx = layout.indexOf(dragKey);
        var toIdx = layout.indexOf(dropKey);
        if (fromIdx >= 0 && toIdx >= 0) {
          layout.splice(fromIdx, 1);
          layout.splice(toIdx, 0, dragKey);
          saveLayout(layout);
          render(); // 重新渲染
          Utils.toast('✓ 顺序已保存');
        }
      });
    });
  }

  // ========== T6 首页便利贴调色 ==========

  var homePaletteDocBound = false; // document 级监听只挂一次（render 会反复执行）

  function bindHomeNotePalette() {
    var btn = Utils.$('#btn-note-palette-home');
    var pop = Utils.$('#note-palette-pop-home');
    if (!btn || !pop) return;
    btn.addEventListener('click', function (e) {
      e.stopPropagation(); // 阻止冒泡到卡片跳转
      pop.hidden = !pop.hidden;
    });
    pop.addEventListener('click', function (e) {
      e.stopPropagation();
      var dot = e.target.closest ? e.target.closest('.note-dot') : null;
      if (!dot) return;
      PlanModule.setNoteColor(dot.dataset.bg || ''); // 与计划页共用同一设置，自动同步
      pop.hidden = true; // 选色后收起
    });
    if (!homePaletteDocBound) {
      homePaletteDocBound = true;
      document.addEventListener('click', function (e) {
        var p = Utils.$('#note-palette-pop-home');
        if (p && !p.hidden && !(e.target.closest && e.target.closest('.note-palette-wrap'))) {
          p.hidden = true;
        }
      });
    }
  }

  // ========== 跳转绑定 ==========

  function bindClicks() {
    // 五件事勾选 → 直接切计划页 toggle
    var container = Utils.$('#home-modules');
    container.addEventListener('click', function (e) {
      var target = e.target;

      // 点击五件事的勾选框（只勾选，不跳转）
      var toggleBtn = target.closest ? target.closest('[data-action="toggle"]') : null;
      if (toggleBtn) {
        var idx = parseInt(toggleBtn.dataset.idx);
        var today = Utils.DateUtil.todayStr();
        var plan = PlanModule.getPlan(today);
        var wasAllDone = PlanModule.isTop5AllDone(today);
        plan.top5[idx].done = !plan.top5[idx].done;
        PlanModule.savePlan(today, plan);
        // 从"未全部完成"变为"全部完成"的瞬间，烟花庆祝
        if (!wasAllDone && PlanModule.isTop5AllDone(today)) {
          Utils.fireworks();
          Utils.toast('🎉 今日五事全部完成！');
        }
        render();
        return;
      }

      // F10: 点击卡片整体跳转到对应模块（今日五事→计划、每日一句→知识库、备忘预览→备忘）
      if (target.tagName === 'A') e.preventDefault(); // 卡内"查看全部"链接不再走 href
      var card = target.closest ? target.closest('.home-card') : null;
      if (card && typeof App !== 'undefined' && App.switchPage) {
        var pageMap = { top5: 'plan', dailySentence: 'knowledge', memoPreview: 'memo' };
        var page = pageMap[card.dataset.key];
        if (page) App.switchPage(page);
      }
    });
  }

  window.HomeModule = { render: render, getLayout: getLayout, saveLayout: saveLayout, dailyEncouragement: dailyEncouragement };
})();
