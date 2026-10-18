/**
 * plan.js —— 今日计划模块
 * 职责：五件事 + 时间段表格 + 反思 + 日历 + 印章 + 21:00 提醒
 */

(function () {
  'use strict';

  var KEY = Storage.KEYS.PLANS;

  var currentDate = Utils.DateUtil.todayStr();

  // ============== 模板 ==============

  function emptyPlanTemplate() {
    return {
      top5: [
        { content: '', done: false },
        { content: '', done: false },
        { content: '', done: false },
        { content: '', done: false },
        { content: '', done: false }
      ],
      timeBlocks: [],
      reflection: ''
    };
  }

  // ============== 数据 API ==============

  function getPlan(date) {
    date = date || currentDate;
    var all = Storage.load(KEY, {});
    return all[date] || emptyPlanTemplate();
  }

  function savePlan(date, plan) {
    date = date || currentDate;
    var all = Storage.load(KEY, {});
    all[date] = plan;
    Storage.save(KEY, all);
    return all[date];
  }

  function getPlanDatesWithData() {
    var all = Storage.load(KEY, {});
    return Object.keys(all).sort();
  }

  /** 是否所有五件事都完成（且至少有一件事有内容） */
  function isTop5AllDone(date) {
    var plan = getPlan(date);
    var hasContent = plan.top5.some(function (t) { return t.content && t.content.trim(); });
    var allDone = plan.top5.every(function (t) { return !t.content || t.done; });
    return hasContent && allDone;
  }

  /** 所有时间段是否都已完成 */
  function isAllTimeBlocksDone(date) {
    var plan = getPlan(date);
    if (plan.timeBlocks.length === 0) return false;
    return plan.timeBlocks.every(function (tb) {
      // 如果已经盖章，算未完成
      if (tb.actualStamped) return false;
      // 如果实际完成了
      if (tb.actualDone) return true;
      // 或者有 actual 内容（手动填了实际情况也算处理了）
      if (tb.actual && tb.actual.trim()) return true;
      return false;
    });
  }

  // ============== 印章：过期未填的自动盖 "未完成" ==============

  /** 扫描所有已过日期，actual 为空 && 没盖章的 → 盖章 */
  function stampIncompleteBlocks() {
    var all = Storage.load(KEY, {});
    var today = Utils.DateUtil.todayStr();
    var changed = false;
    Object.keys(all).forEach(function (date) {
      if (date >= today) return; // 今天及以后跳过
      var plan = all[date];
      if (!plan.timeBlocks) return;
      plan.timeBlocks.forEach(function (tb) {
        // 还没盖章 且 实际完成内容为空（不是明确勾选也不是填了实际情况）
        if (!tb.actualStamped && !tb.actualDone && !(tb.actual && tb.actual.trim())) {
          tb.actualStamped = true;
          tb.actual = ''; // 保持空白，渲染时只显示印章
          changed = true;
        }
      });
    });
    if (changed) Storage.save(KEY, all);
  }

  // ============== 21:00 提醒检查 ==============

  function checkTomorrowPlanReminder() {
    var meta = Storage.load(Storage.KEYS.META, { firstRun: true, version: '1.0' });
    var now = new Date();
    var todayStr = Utils.DateUtil.todayStr();
    var settings = Storage.load(Storage.KEYS.SETTINGS, { notifyEnabled: true });

    // 开关关了就不检查
    if (settings.notifyEnabled === false) return;

    // 只在 20:00-23:59 之间检查一次（每天最多提醒一次）
    var lastCheck = meta.lastTomorrowCheckDate || '';
    if (lastCheck === todayStr) return; // 今天已经检查过

    if (now.getHours() < 20) return;

    var tomorrow = Utils.DateUtil.tomorrowStr(todayStr);
    var all = Storage.load(KEY, {});

    if (!all[tomorrow] || isEmptyPlan(all[tomorrow])) {
      // 手机通知（PWA）
      sendBrowserNotification('📝 别忘了制定明日计划');
      // 站内也 toast 一下（用户在电脑上时）
      Utils.toast('📝 别忘了制定明日计划 — 点右上角 🌙 快速创建');
    }

    meta.lastTomorrowCheckDate = todayStr;
    Storage.save(Storage.KEYS.META, meta);
  }

  function isEmptyPlan(p) {
    if (!p) return true;
    var hasContent = p.top5.some(function (t) { return t.content && t.content.trim(); });
    var hasBlocks = p.timeBlocks.length > 0;
    return !hasContent && !hasBlocks;
  }

  function sendBrowserNotification(text) {
    if (window.App && window.App.sendNotification) {
      window.App.sendNotification('popo 专属工作台', text);
    }
  }

  // ============== 渲染 ==============

  function render() {
    renderDateDisplay();
    renderTop5();
    renderTimeBlocks();
    renderReflection();
    // top5 all-done 样式
    var top5Card = Utils.$('#top5-card');
    if (isTop5AllDone(currentDate)) {
      top5Card.classList.add('all-done');
    } else {
      top5Card.classList.remove('all-done');
    }
    // T6：切到计划页时同步便利贴颜色（可能在首页被改过）
    applyNoteColor(getNoteColor());
  }

  function renderDateDisplay() {
    var el = Utils.$('#plan-date-display');
    if (currentDate === Utils.DateUtil.todayStr()) {
      el.textContent = '今日：' + Utils.DateUtil.formatCN(currentDate);
    } else {
      var diff = dateDiffDays(currentDate, Utils.DateUtil.todayStr());
      var tag = diff === 1 ? '明天' : diff === -1 ? '昨天' : '';
      el.textContent = tag + Utils.DateUtil.formatCN(currentDate);
    }
  }

  function dateDiffDays(a, b) {
    var da = Utils.DateUtil.strToDate(a);
    var db = Utils.DateUtil.strToDate(b);
    return Math.round((da - db) / (1000 * 60 * 60 * 24));
  }

  function renderTop5() {
    var list = Utils.$('#top5-list');
    if (!list) return;
    list.innerHTML = '';
    var plan = getPlan(currentDate);
    var canEdit = Utils.DateUtil.isPast(currentDate) ? false : true; // 过去的日期只读
    var editable = canEdit;
    var inputsDisabled = Utils.DateUtil.isPast(currentDate);

    plan.top5.forEach(function (item, idx) {
      var row = Utils.el('div', 'top5-row');

      // T3：行首空白方格子（点击勾选），替代原序号圆与末尾圆圈
      var check = Utils.el('div', 'top5-check' + (item.done ? ' on' : ''), item.done ? '✓' : '');
      if (!inputsDisabled) {
        check.addEventListener('click', function () {
          toggleTop5Done(idx);
        });
      } else {
        check.style.cursor = 'default';
      }
      row.appendChild(check);

      // 内容输入框
      var input = document.createElement('input');
      input.type = 'text';
      input.className = 'top5-input' + (item.done ? ' done' : '');
      input.value = item.content || '';
      input.placeholder = '写下最重要的第 ' + (idx + 1) + ' 件事...';
      input.dataset.idx = String(idx);
      input.disabled = inputsDisabled;
      if (!inputsDisabled) {
        input.addEventListener('blur', function () {
          saveTop5Item(idx, input.value);
        });
        input.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') { input.blur(); }
        });
      }
      row.appendChild(input);

      list.appendChild(row);
    });
  }

  // S5：表格始终保留的时间段行数（真实行 + 幽灵添加行）
  var TB_MIN_ROWS = 5;

  function renderTimeBlocks() {
    var tbody = Utils.$('#timeblock-tbody');
    var empty = Utils.$('#timeblock-empty');
    if (!tbody) return;
    tbody.innerHTML = '';

    var plan = getPlan(currentDate);
    var isPastDay = Utils.DateUtil.isPast(currentDate);
    var canEditActual = !isPastDay; // 实际完成只有当天可填
    var canEditPlanned = !isPastDay; // 计划完成也只在当天（或过去日期只读）

    // S5：5 格幽灵行始终占位，旧空态不再需要
    if (empty) empty.hidden = true;

    plan.timeBlocks.forEach(function (tb, idx) {
      var tr = document.createElement('tr');

      // 时间
      var tdTime = document.createElement('td');
      tdTime.className = 'col-time';
      tdTime.appendChild(Utils.el('div', 'time-block-time', Utils.esc(tb.timeStart + '-' + tb.timeEnd)));
      tr.appendChild(tdTime);

      // 计划完成
      var tdPlanned = document.createElement('td');
      tdPlanned.className = 'col-planned';
      var plannedInput = document.createElement('input');
      plannedInput.type = 'text';
      plannedInput.className = 'time-block-input';
      plannedInput.value = tb.planned || '';
      plannedInput.placeholder = '计划内容';
      plannedInput.disabled = isPastDay;
      plannedInput.addEventListener('blur', function () {
        saveTimeBlockField(idx, 'planned', plannedInput.value);
      });
      tdPlanned.appendChild(plannedInput);
      tr.appendChild(tdPlanned);

      // 实际完成
      var tdActual = document.createElement('td');
      tdActual.className = 'col-actual';
      if (tb.actualStamped) {
        // P4：哭脸 SVG 代替「未完成」文字印章
        var sad = Utils.el('span', 'tb-face tb-face-undone', Utils.ICONS.undone);
        sad.title = '未完成';
        tdActual.appendChild(sad);
      } else {
        // T5：实际完成只保留文本输入（去掉勾选按钮）
        var actualInput = document.createElement('input');
        actualInput.type = 'text';
        actualInput.className = 'time-block-input';
        actualInput.value = tb.actual || '';
        actualInput.placeholder = '实际情况';
        actualInput.disabled = !canEditActual;
        actualInput.addEventListener('blur', function () {
          saveTimeBlockField(idx, 'actual', actualInput.value);
          renderTimeBlocks(); // P4：保存后刷新笑脸显示状态
        });
        tdActual.appendChild(actualInput);
        // P4：实际情况已填写 → 输入框旁显示完成任务笑脸
        if ((tb.actual || '').trim()) {
          var smile = Utils.el('span', 'tb-face tb-face-done', Utils.ICONS.done);
          smile.title = '已完成';
          tdActual.appendChild(smile);
        }
      }
      tr.appendChild(tdActual);

      // 删除
      var tdOps = document.createElement('td');
      tdOps.className = 'col-ops';
      if (!isPastDay) {
        var del = Utils.el('span', 'tb-delete', Utils.ICONS.del);
        del.title = '删除';
        del.addEventListener('click', function () {
          Utils.confirm('删除这个时间段？').then(function (ok) {
            if (!ok) return;
            removeTimeBlock(idx);
          });
        });
        tdOps.appendChild(del);
      }
      tr.appendChild(tdOps);

      tbody.appendChild(tr);
    });

    // S5：补足 5 格幽灵添加行（不进数据、不参与提醒/盖章）
    var ghostCount = Math.max(0, TB_MIN_ROWS - plan.timeBlocks.length);
    for (var g = 0; g < ghostCount; g++) {
      var ghost = document.createElement('tr');
      ghost.className = 'tb-ghost-row';

      var ghostTime = document.createElement('td');
      ghostTime.className = 'col-time';
      if (!isPastDay) {
        // 当天：整行点击打开添加时间段弹窗
        var add = Utils.el('div', 'tb-ghost-add', '＋ 添加');
        add.title = '添加时间段';
        ghostTime.appendChild(add);
        (function (row) {
          row.addEventListener('click', function () { openAddTimeBlockModal(); });
        })(ghost);
      } else {
        // 过去日期只读：保留空白格但不响应点击
        ghost.classList.add('readonly');
        ghostTime.appendChild(Utils.el('div', 'tb-ghost-add is-readonly', ''));
      }
      ghost.appendChild(ghostTime);

      var ghostPlanned = document.createElement('td');
      ghostPlanned.className = 'col-planned';
      ghost.appendChild(ghostPlanned);

      var ghostActual = document.createElement('td');
      ghostActual.className = 'col-actual';
      ghost.appendChild(ghostActual);

      var ghostOps = document.createElement('td');
      ghostOps.className = 'col-ops';
      ghost.appendChild(ghostOps);

      tbody.appendChild(ghost);
    }
  }

  function renderReflection() {
    var ta = Utils.$('#reflection-textarea');
    if (!ta) return;
    var plan = getPlan(currentDate);
    ta.value = plan.reflection || '';
    ta.disabled = Utils.DateUtil.isPast(currentDate);
    updateReflectionCount(); // M2：渲染时同步字数
  }

  /** M2：反思边框末尾实时显示输入字数 */
  function updateReflectionCount() {
    var ta = Utils.$('#reflection-textarea');
    var el = Utils.$('#reflection-count');
    if (!ta || !el) return;
    el.textContent = ta.value.length + ' 字';
  }

  // ============== 修改保存 ==============

  function saveTop5Item(idx, value) {
    var plan = getPlan(currentDate);
    plan.top5[idx].content = value.trim();
    savePlan(currentDate, plan);
    // 全完成状态可能变化，重新设置卡片样式
    var top5Card = Utils.$('#top5-card');
    if (isTop5AllDone(currentDate)) top5Card.classList.add('all-done');
    else top5Card.classList.remove('all-done');
  }

  function toggleTop5Done(idx) {
    var plan = getPlan(currentDate);
    var wasAllDone = isTop5AllDone(currentDate);
    plan.top5[idx].done = !plan.top5[idx].done;
    savePlan(currentDate, plan);
    renderTop5();
    var top5Card = Utils.$('#top5-card');
    if (isTop5AllDone(currentDate)) top5Card.classList.add('all-done');
    else top5Card.classList.remove('all-done');
    // 从"未全部完成"变为"全部完成"的瞬间，烟花庆祝
    if (!wasAllDone && isTop5AllDone(currentDate)) {
      Utils.fireworks();
      Utils.toast('🎉 今日五事全部完成！');
    }
  }

  function saveTimeBlockField(idx, field, value) {
    var plan = getPlan(currentDate);
    if (plan.timeBlocks[idx]) {
      plan.timeBlocks[idx][field] = value.trim();
      savePlan(currentDate, plan);
    }
  }

  function addTimeBlock(timeStart, timeEnd, planned) {
    var plan = getPlan(currentDate);
    plan.timeBlocks.push({
      id: Utils.uid(),
      timeStart: timeStart,
      timeEnd: timeEnd,
      planned: planned,
      actual: '',
      actualDone: false,
      actualStamped: false
    });
    savePlan(currentDate, plan);
    renderTimeBlocks();
  }

  function removeTimeBlock(idx) {
    var plan = getPlan(currentDate);
    plan.timeBlocks.splice(idx, 1);
    savePlan(currentDate, plan);
    renderTimeBlocks();
  }

  function saveReflection(value) {
    var plan = getPlan(currentDate);
    plan.reflection = value;
    savePlan(currentDate, plan);
  }

  // ============== 日历弹窗 ==============

  function openCalendar() {
    var now = new Date();
    showCalendar(now.getFullYear(), now.getMonth());
  }

  function showCalendar(year, month) {
    var title = year + '年' + (month + 1) + '月';
    var allDates = getPlanDatesWithData();
    var today = Utils.DateUtil.todayStr();
    var todayDate = Utils.DateUtil.strToDate(today);

    // 计算月份网格
    var firstDay = new Date(year, month, 1).getDay(); // 0=Sunday
    var daysInMonth = new Date(year, month + 1, 0).getDate();
    var prevDaysInMonth = new Date(year, month, 0).getDate();

    // 生成日期格
    var cells = [];
    // 上月补位
    for (var i = firstDay - 1; i >= 0; i--) {
      var d = prevDaysInMonth - i;
      var prevMonthDate = new Date(year, month - 1, d);
      cells.push({
        day: d,
        dateStr: Utils.DateUtil.dateToStr(prevMonthDate),
        otherMonth: true
      });
    }
    // 本月
    for (var d = 1; d <= daysInMonth; d++) {
      var curDate = new Date(year, month, d);
      cells.push({
        day: d,
        dateStr: Utils.DateUtil.dateToStr(curDate),
        otherMonth: false
      });
    }
    // 下月补位到 42 格
    while (cells.length < 42) {
      var nextDate = new Date(year, month + 1, cells.length - (firstDay + daysInMonth) + 1);
      cells.push({
        day: nextDate.getDate(),
        dateStr: Utils.DateUtil.dateToStr(nextDate),
        otherMonth: true
      });
    }

    var daysHtml = cells.map(function (cell) {
      var cls = 'cal-day';
      if (cell.otherMonth) cls += ' other-month';
      if (cell.dateStr === today) cls += ' today';
      var hasPlan = allDates.indexOf(cell.dateStr) >= 0;
      var allDone = hasPlan && isTop5AllDone(cell.dateStr) && isAllTimeBlocksDone(cell.dateStr);
      if (allDone) cls += ' all-done';
      else if (hasPlan) cls += ' has-plan';
      return '<div class="' + cls + '" data-date="' + cell.dateStr + '">' + cell.day + '</div>';
    }).join('');

    var body = '' +
      '<div class="calendar-modal">' +
      '<div class="cal-header">' +
      '<span class="cal-nav" data-prev="1">‹</span>' +
      '<span class="cal-month-title">' + title + '</span>' +
      '<span class="cal-nav" data-next="1">›</span>' +
      '</div>' +
      '<div class="cal-weekdays">' +
      ['日','一','二','三','四','五','六'].map(function (d) {
        return '<span>' + d + '</span>';
      }).join('') +
      '</div>' +
      '<div class="cal-days">' + daysHtml + '</div>' +
      '</div>';

    Utils.showModal({
      title: '选择日期',
      bodyHTML: body,
      className: 'calendar-modal'
    });

    // 日历内事件
    var modal = Utils.$('.calendar-modal');
    modal.addEventListener('click', function (e) {
      var target = e.target;
      if (target.classList.contains('cal-day')) {
        var ds = target.dataset.date;
        Utils.closeModal();
        currentDate = ds;
        render();
      } else if (target.classList.contains('cal-nav')) {
        var nextMonth = month + (target.dataset.next ? 1 : -1);
        var newYear = year;
        var newMonth = nextMonth;
        if (newMonth < 0) { newMonth = 11; newYear--; }
        if (newMonth > 11) { newMonth = 0; newYear++; }
        Utils.closeModal();
        showCalendar(newYear, newMonth);
      }
    });
  }

  // ============== 右上角按钮绑定 ==============

  function bindPageButtons() {
    var calBtn = Utils.$('#btn-calendar');
    if (calBtn) calBtn.addEventListener('click', openCalendar);

    var tomorrowBtn = Utils.$('#btn-new-tomorrow');
    if (tomorrowBtn) tomorrowBtn.addEventListener('click', function () {
      currentDate = Utils.DateUtil.tomorrowStr(Utils.DateUtil.todayStr());
      render();
    });

    var addTBBtn = Utils.$('#btn-add-timeblock');
    if (addTBBtn) addTBBtn.addEventListener('click', openAddTimeBlockModal);

    bindNotePalette();
  }

  // ============== T1 今日必做便利贴调色 ==============

  // 可选背景色 + 同色系深一点的横线色（dark=深色背景需米白文字）
  var NOTE_COLORS = [
    { bg: '#F8C8C8', line: 'rgba(178,105,105,0.5)', strong: 'rgba(178,105,105,0.9)' },
    { bg: '#EEEEAE', line: 'rgba(166,166,92,0.55)', strong: 'rgba(166,166,92,0.9)' },
    { bg: '#CDDC84', line: 'rgba(139,158,79,0.55)', strong: 'rgba(139,158,79,0.9)' },
    { bg: '#E0EEE8', line: 'rgba(105,138,124,0.55)', strong: 'rgba(105,138,124,0.9)' },
    { bg: '#6B6882', line: 'rgba(56,54,74,0.6)', strong: 'rgba(56,54,74,0.95)', dark: true },
    { bg: '#E4C6D0', line: 'rgba(158,104,124,0.55)', strong: 'rgba(158,104,124,0.9)' }
  ];

  function noteColorOf(bg) {
    for (var i = 0; i < NOTE_COLORS.length; i++) {
      if (NOTE_COLORS[i].bg === bg) return NOTE_COLORS[i];
    }
    return null;
  }

  /** 读取保存的便利贴颜色（'' = 默认嫩豆绿） */
  function getNoteColor() {
    return Storage.load(Storage.KEYS.SETTINGS, {}).noteColor || '';
  }

  /** 应用便利贴颜色到 CSS 变量（bg 为空字符串则恢复默认） */
  function applyNoteColor(bg) {
    var c = noteColorOf(bg);
    var rs = document.documentElement.style;
    var dark = !!(c && c.dark);
    var card = Utils.$('#top5-card');
    var homeCard = document.querySelector('#home-modules .home-card[data-key="top5"]');
    if (card) card.classList.toggle('note-dark', dark);
    if (homeCard) homeCard.classList.toggle('note-dark', dark);
    if (!c) {
      rs.removeProperty('--note-bg');
      rs.removeProperty('--note-line');
      rs.removeProperty('--note-line-strong');
      return;
    }
    rs.setProperty('--note-bg', c.bg);
    rs.setProperty('--note-line', c.line);
    rs.setProperty('--note-line-strong', c.strong);
  }

  /** 保存并应用（实时持久化） */
  function setNoteColor(bg) {
    var s = Storage.load(Storage.KEYS.SETTINGS, {});
    s.noteColor = bg || '';
    Storage.save(Storage.KEYS.SETTINGS, s);
    applyNoteColor(s.noteColor);
  }

  /** 生成调色弹层的色点 HTML（6 色 + 默认），首页/计划页共用 */
  function noteDotsHtml() {
    var html = NOTE_COLORS.map(function (c) {
      return '<span class="note-dot" data-bg="' + c.bg + '" style="background:' + c.bg + '"></span>';
    }).join('');
    return html + '<span class="note-dot note-dot-default" data-bg="" style="background:#bcc48f" title="默认嫩豆绿"></span>';
  }

  function bindNotePalette() {
    var btn = Utils.$('#btn-note-palette');
    var pop = Utils.$('#note-palette-pop');
    if (!btn || !pop) return;
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      pop.hidden = !pop.hidden;
    });
    pop.addEventListener('click', function (e) {
      var dot = e.target.closest ? e.target.closest('.note-dot') : null;
      if (!dot) return;
      setNoteColor(dot.dataset.bg || '');
      pop.hidden = true;
    });
    document.addEventListener('click', function (e) {
      if (!pop.hidden && !(e.target.closest && e.target.closest('.note-palette-wrap'))) {
        pop.hidden = true;
      }
    });
  }

  function openAddTimeBlockModal() {
    var plan = getPlan(currentDate);
    // 默认开始时间：当天最后一个时间段的结束时间，否则 07:00
    var startVal = '07:00';
    if (plan.timeBlocks.length > 0) {
      var lastEnd = plan.timeBlocks[plan.timeBlocks.length - 1].timeEnd;
      if (/^([01]\d|2[0-3]):[0-5]\d$/.test(lastEnd || '')) startVal = lastEnd;
    }
    var planText = '';

    function addMinutes(hhmm, mins) {
      var total = parseInt(hhmm.slice(0, 2), 10) * 60 + parseInt(hhmm.slice(3, 5), 10) + mins;
      total = total % 1440;
      var h = Math.floor(total / 60), m = total % 60;
      return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
    }

    var endVal = addMinutes(startVal, 50);

    function renderModal() {
      var body = '' +
        '<div class="form-row"><label class="form-label">开始时间</label>' +
        '<div class="tp-chip" id="tb-start-chip">' + startVal + '</div></div>' +
        '<div class="form-row"><label class="form-label">结束时间</label>' +
        '<div class="tp-chip" id="tb-end-chip">' + endVal + '</div></div>' +
        '<div class="form-row"><label class="form-label">计划内容</label>' +
        '<input class="form-input" id="tb-plan" placeholder="跑步 + 法考"></div>';

      Utils.showModal({
        title: '添加时间段',
        bodyHTML: body,
        actions: '<button class="btn-ghost" id="tb-cancel">取消</button>' +
                 '<button class="btn-primary" id="tb-save">保存</button>'
      });

      Utils.$('#tb-plan').value = planText; // 重渲染后恢复已输入内容
      Utils.$('#tb-plan').addEventListener('input', function () { planText = this.value; });
      Utils.$('#tb-cancel').addEventListener('click', Utils.closeModal);

      Utils.$('#tb-start-chip').addEventListener('click', function () {
        Utils.timePicker({
          title: '开始时间',
          initial: startVal,
          onConfirm: function (v) {
            startVal = v;
            if (startVal >= endVal) endVal = addMinutes(startVal, 50); // 自动顺延结束时间
            renderModal();
          }
        });
      });
      Utils.$('#tb-end-chip').addEventListener('click', function () {
        Utils.timePicker({
          title: '结束时间',
          initial: endVal,
          onConfirm: function (v) { endVal = v; renderModal(); }
        });
      });

      Utils.$('#tb-save').addEventListener('click', function () {
        if (startVal >= endVal) { Utils.toast('结束时间要晚于开始时间'); return; }
        addTimeBlock(startVal, endVal, planText.trim());
        Utils.closeModal();
      });
    }

    renderModal();
  }

  function bindReflection() {
    var ta = Utils.$('#reflection-textarea');
    if (!ta) return;
    ta.addEventListener('blur', function () {
      saveReflection(ta.value);
    });
    ta.addEventListener('input', updateReflectionCount); // M2：输入实时更新字数
  }

  // ============== 初始化入口 ==============

  function init(dateStr) {
    if (dateStr) currentDate = dateStr;
    currentDate = currentDate || Utils.DateUtil.todayStr();
    // 启动时先扫描过期印章
    stampIncompleteBlocks();
    // 然后渲染
    bindPageButtons();
    bindReflection();
    applyNoteColor(getNoteColor()); // T1：恢复上次选择的便利贴颜色
    render();
    // 时间段提醒：启动稍后查一次，之后每分钟轮询
    setTimeout(checkTimeBlockNotifications, 2000);
    setInterval(checkTimeBlockNotifications, 60000);
  }

  // ============== 时间段提醒（F6） ==============

  var NOTIFY_KEY = 'popo_notified_blocks';

  /** 判断 hh:mm 时刻 hm 是否落在时间段 [start, end] 内（支持跨零点） */
  function isNowInBlock(tb, hm) {
    if (!tb || !tb.timeStart || !tb.timeEnd || !hm) return false;
    var s = tb.timeStart, e = tb.timeEnd;
    if (s <= e) return hm >= s && hm <= e;
    return hm >= s || hm <= e; // 跨零点
  }

  function currentHM() {
    var d = new Date();
    return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  }

  /** 检查"今天"已填写计划的时间段：当前正处于其中 → 页面提醒一次（每段每天只提醒一次） */
  function checkTimeBlockNotifications() {
    var today = Utils.DateUtil.todayStr();
    var hm = currentHM();
    var plan = getPlan(today);
    var markers = Storage.load(NOTIFY_KEY, {});
    var todayMarkers = markers[today] || {};
    var changed = false;

    (plan.timeBlocks || []).forEach(function (tb) {
      if (!tb.planned || !tb.planned.trim()) return; // 未填写计划不提醒
      if (tb.actualDone) return;                     // 已完成不提醒
      var key = tb.id || (tb.timeStart + '|' + tb.timeEnd + '|' + tb.planned);
      if (todayMarkers[key]) return;                 // 今天已提醒过
      if (!isNowInBlock(tb, hm)) return;             // 不在当前时间段
      todayMarkers[key] = true;
      changed = true;
      var text = '⏰ ' + tb.timeStart + '-' + tb.timeEnd + '：' + String(tb.planned).trim();
      Utils.toast(text);
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try { new Notification('popo 工作台', { body: text }); } catch (err) { /* 忽略 */ }
      }
    });

    if (changed) {
      var fresh = {};
      fresh[today] = todayMarkers; // 只保留今天的标记，历史自动清理
      Storage.save(NOTIFY_KEY, fresh);
    }
    return changed;
  }

  // 暴露
  window.PlanModule = {
    currentDate: function () { return currentDate; },
    setDate: function (d) { currentDate = d || Utils.DateUtil.todayStr(); render(); },
    getPlan: getPlan,
    savePlan: savePlan,
    emptyPlanTemplate: emptyPlanTemplate,
    isTop5AllDone: isTop5AllDone,
    isAllTimeBlocksDone: isAllTimeBlocksDone,
    stampIncompleteBlocks: stampIncompleteBlocks,
    checkTomorrowPlanReminder: checkTomorrowPlanReminder,
    isEmptyPlan: isEmptyPlan,
    render: render,
    init: init,
    bindReflection: bindReflection, // M2：测试需要单独绑定输入监听
    getNoteColor: getNoteColor,
    setNoteColor: setNoteColor,
    applyNoteColor: applyNoteColor,
    noteDotsHtml: noteDotsHtml,
    isNowInBlock: isNowInBlock,
    checkTimeBlockNotifications: checkTimeBlockNotifications
  };
})();
