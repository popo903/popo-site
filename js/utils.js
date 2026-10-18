/**
 * utils.js —— 工具函数层
 * 职责：日期格式化、Toast、Modal、DOM 快捷方法
 * 绝不做：碰业务数据
 */

(function () {
  'use strict';

  // ============== DOM 快捷 ==============
  function $(selector, root) {
    return (root || document).querySelector(selector);
  }
  function $$(selector, root) {
    return Array.from((root || document).querySelectorAll(selector));
  }
  function el(tag, className, innerHTML) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (innerHTML !== undefined && innerHTML !== null) node.innerHTML = innerHTML;
    return node;
  }
  function esc(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  // ============== 日期工具 ==============
  const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  const WEEKDAYS_SHORT = ['日', '一', '二', '三', '四', '五', '六'];

  const DateUtil = {
    /** 今天的 YYYY-MM-DD */
    todayStr() {
      const d = new Date();
      return this.dateToStr(d);
    },

    /** Date → YYYY-MM-DD */
    dateToStr(d) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    },

    /** YYYY-MM-DD → Date（本地时区，避免 UTC 偏移坑） */
    strToDate(str) {
      const [y, m, d] = str.split('-').map(Number);
      return new Date(y, m - 1, d);
    },

    /** 中文格式 "10月16日 星期四" */
    formatCN(dateStr) {
      const d = this.strToDate(dateStr);
      return `${d.getMonth() + 1}月${d.getDate()}日 ${WEEKDAYS[d.getDay()]}`;
    },

    /** "星期四" */
    weekdayCN(dateStr) {
      const d = this.strToDate(dateStr);
      return WEEKDAYS[d.getDay()];
    },

    /** 两个 YYYY-MM-DD 是否同一天 */
    isSameDay(a, b) {
      return a === b;
    },

    /** dateStr 是否早于今天 */
    isPast(dateStr) {
      return dateStr < this.todayStr();
    },

    /** dateStr 是否就是今天 */
    isToday(dateStr) {
      return dateStr === this.todayStr();
    },

    /** YYYY-MM-DD → 明天的 YYYY-MM-DD */
    tomorrowStr(dateStr) {
      const d = this.strToDate(dateStr);
      d.setDate(d.getDate() + 1);
      return this.dateToStr(d);
    },

    /** YYYY-MM-DD → 昨天的 YYYY-MM-DD */
    yesterdayStr(dateStr) {
      const d = this.strToDate(dateStr);
      d.setDate(d.getDate() - 1);
      return this.dateToStr(d);
    },

    /** 当前小时数（0-23） */
    currentHour() {
      return new Date().getHours();
    },

    /** 10月16日 → month=9, day=16, year=2026, weekday=4 */
    getMonthData(year, month /* 0-11 */) {
      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);
      const firstWeekday = firstDay.getDay(); // 0-6
      const daysInMonth = lastDay.getDate();
      return { year, month, firstWeekday, daysInMonth };
    },

    /** 短星期 "一" */
    weekdayShort(dateStr) {
      const d = this.strToDate(dateStr);
      return WEEKDAYS_SHORT[d.getDay()];
    },

    /** 格式化时间显示 2026-10-16T15:30 → 10月16日 15:30 */
    formatDateTime(isoString) {
      const d = new Date(isoString);
      return `${d.getMonth()+1}月${d.getDate()}日 ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    },

    /** 时间戳 → 2026/10/17 形式的日期 */
    formatSlashDate(ts) {
      const d = new Date(ts || Date.now());
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}/${m}/${day}`;
    }
  };

  // ============== Toast ==============
  let toastTimer = null;
  function toast(msg, duration = 2200) {
    let box = document.getElementById('toast');
    if (!box) {
      box = document.createElement('div');
      box.id = 'toast';
      box.className = 'toast';
      document.body.appendChild(box);
    }
    box.textContent = msg;
    box.hidden = false;
    box.style.opacity = '1';
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      box.style.opacity = '0';
      setTimeout(() => { box.hidden = true; }, 250);
    }, duration);
  }

  // ============== Modal ==============
  function ensureModalRoot() {
    let root = document.getElementById('modal-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'modal-root';
      root.className = 'modal';
      root.hidden = true;
      document.body.appendChild(root);
    }
    return root;
  }

  let currentModalClose = null;

  function showModal(opts) {
    // opts: {title, bodyHTML, actions, className, onClose}
    const root = ensureModalRoot();
    const content = el('div', 'modal-content ' + (opts.className || ''));
    content.innerHTML = `
      <div class="modal-close" title="关闭">✕</div>
      ${opts.title ? `<div class="modal-title">${esc(opts.title)}</div>` : ''}
      <div class="modal-body">${opts.bodyHTML || ''}</div>
      ${opts.actions ? `<div class="modal-actions">${opts.actions}</div>` : ''}
    `;

    // 点遮罩或 ✕ 关闭
    const mask = el('div', 'modal-mask');
    mask.addEventListener('click', closeModal);
    content.querySelector('.modal-close').addEventListener('click', closeModal);

    root.innerHTML = '';
    root.appendChild(mask);
    root.appendChild(content);
    root.hidden = false;

    currentModalClose = () => {
      root.hidden = true;
      root.innerHTML = '';
      if (typeof opts.onClose === 'function') opts.onClose();
      currentModalClose = null;
    };

    return root;
  }

  function closeModal() {
    if (currentModalClose) currentModalClose();
  }

  /** 确认弹窗：返回 Promise<boolean> */
  function confirm(msg, title) {
    return new Promise(resolve => {
      showModal({
        title: title || '确认',
        bodyHTML: `<p>${esc(msg)}</p>`,
        actions: `<button class="btn-ghost" id="cfm-cancel">取消</button>
                  <button class="btn-danger" id="cfm-ok">确定</button>`
      });
      const okBtn = document.getElementById('cfm-ok');
      const cancelBtn = document.getElementById('cfm-cancel');
      okBtn.onclick = () => { closeModal(); resolve(true); };
      cancelBtn.onclick = () => { closeModal(); resolve(false); };
    });
  }

  // ============== 音效 ==============

  let audioCtx = null;
  let lastTickAt = 0;

  /** 轻微"咔哒"声：滚轮拨动反馈（Web Audio 合成，无外部音频文件） */
  function playTick() {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const now = Date.now();
      if (now - lastTickAt < 35) return; // 快速滑动时限流，避免连成噪音
      lastTickAt = now;
      const t = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'square';
      osc.frequency.value = 2200;
      gain.gain.setValueAtTime(0.05, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.03);
    } catch (e) { /* 环境不支持音频时静默忽略 */ }
  }

  // ============== 时间选择器（闹钟滚轮 + 数字键盘） ==============

  /**
   * 时间选择弹窗：默认滚轮模式（闹钟式上下滑动），可切换数字键盘快速输入
   * opts: { title, initial: 'HH:MM', onConfirm: function('HH:MM') }
   */
  function timePicker(opts) {
    const ITEM_H = 40; // 每个选项高度，需与 CSS 一致
    const valid = /^([01]\d|2[0-3]):[0-5]\d$/.test(opts.initial || '');
    const init = valid ? opts.initial : '07:00';
    let mode = 'wheel';
    let wheelH = parseInt(init.slice(0, 2), 10);
    let wheelM = parseInt(init.slice(3, 5), 10);
    let digits = ''; // 键盘模式已输入数字（最多 4 位）

    function pad2(n) { return (n < 10 ? '0' : '') + n; }

    /** 键盘输入解析：7→07:00，730→07:30，1730→17:30 */
    function parseDigits() {
      if (!digits) return null;
      let h, m;
      if (digits.length <= 2) { h = parseInt(digits, 10); m = 0; }
      else if (digits.length === 3) { h = parseInt(digits[0], 10); m = parseInt(digits.slice(1), 10); }
      else { h = parseInt(digits.slice(0, 2), 10); m = parseInt(digits.slice(2), 10); }
      if (h > 23 || m > 59) return null;
      return pad2(h) + ':' + pad2(m);
    }

    function wheelHTML() {
      let hours = '', mins = '';
      for (let h = 0; h < 24; h++) hours += `<div class="tp-item${h === wheelH ? ' active' : ''}" data-v="${h}">${pad2(h)}</div>`;
      for (let m = 0; m < 60; m++) mins += `<div class="tp-item${m === wheelM ? ' active' : ''}" data-v="${m}">${pad2(m)}</div>`;
      return `
        <div class="tp-wheels">
          <div class="tp-wheel" id="tp-wh"><div class="tp-pad"></div>${hours}<div class="tp-pad"></div></div>
          <div class="tp-sep">:</div>
          <div class="tp-wheel" id="tp-wm"><div class="tp-pad"></div>${mins}<div class="tp-pad"></div></div>
          <div class="tp-band"></div>
        </div>`;
    }

    function keypadHTML() {
      const parsed = parseDigits();
      const shown = digits ? (parsed || '无效时间') : '--:--';
      return `
        <div class="tp-display${digits && !parsed ? ' invalid' : ''}">${shown}</div>
        <div class="tp-hint">直接输数字：7=07:00，730=07:30，1730=17:30</div>
        <div class="tp-keys">
          ${[1,2,3,4,5,6,7,8,9].map(n => `<div class="tp-key" data-k="${n}">${n}</div>`).join('')}
          <div class="tp-key tp-key-fn" data-k="back">⌫</div>
          <div class="tp-key" data-k="0">0</div>
          <div class="tp-key tp-key-fn" data-k="clear">清空</div>
        </div>`;
    }

    function render() {
      showModal({
        title: opts.title || '选择时间',
        bodyHTML: `
          <div class="tp-toggle">
            <button class="tp-mode${mode === 'wheel' ? ' on' : ''}" data-m="wheel">🎡 滚轮</button>
            <button class="tp-mode${mode === 'keypad' ? ' on' : ''}" data-m="keypad">🔢 键盘</button>
          </div>
          ${mode === 'wheel' ? wheelHTML() : keypadHTML()}
        `,
        actions: `<button class="btn-ghost" id="tp-cancel">取消</button>
                  <button class="btn-primary" id="tp-ok">确定</button>`
      });
      bind();
    }

    function bind() {
      $('#tp-cancel').addEventListener('click', closeModal);
      $$('.tp-mode').forEach(b => b.addEventListener('click', () => {
        mode = b.dataset.m;
        render();
      }));
      $('#tp-ok').addEventListener('click', () => {
        const v = mode === 'wheel' ? pad2(wheelH) + ':' + pad2(wheelM) : parseDigits();
        if (!v) { toast('输入的时间无效，请检查'); return; }
        closeModal();
        if (typeof opts.onConfirm === 'function') opts.onConfirm(v);
      });

      if (mode === 'wheel') {
        bindWheel($('#tp-wh'), v => { wheelH = v; }, wheelH);
        bindWheel($('#tp-wm'), v => { wheelM = v; }, wheelM);
      } else {
        $$('.tp-key').forEach(k => k.addEventListener('click', () => {
          const key = k.dataset.k;
          playTick();
          if (key === 'back') digits = digits.slice(0, -1);
          else if (key === 'clear') digits = '';
          else if (digits.length < 4) digits += key;
          render();
        }));
      }
    }

    /** 绑定一个滚轮列：滚动吸附定位 + 点击直达 + 拨动音效 */
    function bindWheel(wheel, onChange, current) {
      wheel.scrollTop = current * ITEM_H;
      let timer = null;
      let lastIdx = current;
      wheel.addEventListener('scroll', () => {
        const idx = Math.max(0, Math.round(wheel.scrollTop / ITEM_H));
        if (idx !== lastIdx) {
          lastIdx = idx;
          playTick(); // 每滚过一格"咔哒"一声
        }
        wheel.querySelectorAll('.tp-item').forEach(it => {
          it.classList.toggle('active', parseInt(it.dataset.v, 10) === idx);
        });
        clearTimeout(timer);
        timer = setTimeout(() => { onChange(idx); }, 60);
      });
      wheel.querySelectorAll('.tp-item').forEach(it => {
        it.addEventListener('click', () => {
          wheel.scrollTo({ top: parseInt(it.dataset.v, 10) * ITEM_H, behavior: 'smooth' });
        });
      });
    }

    render();
  }

  // ============== 其他 ==============
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // ============== 烟花庆祝 ==============
  // 全屏烟花粒子动画（Web Animations API，零依赖），用于五件事全部完成时庆祝
  function fireworks(duration) {
    duration = duration || 2400;
    var overlay = document.createElement('div');
    overlay.className = 'fireworks-overlay';
    document.body.appendChild(overlay);

    var colors = ['#f43f5e', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#facc15', '#22d3ee'];
    var bursts = 3;

    function launchBurst(b) {
      if (!overlay.isConnected) return;
      var cx = overlay.clientWidth * (0.25 + Math.random() * 0.5);
      var cy = overlay.clientHeight * (0.22 + Math.random() * 0.35);
      for (var i = 0; i < 26; i++) {
        var p = document.createElement('div');
        p.className = 'fw-particle';
        var size = 5 + Math.random() * 6;
        p.style.width = size + 'px';
        p.style.height = size + 'px';
        p.style.background = colors[Math.floor(Math.random() * colors.length)];
        p.style.left = cx + 'px';
        p.style.top = cy + 'px';
        overlay.appendChild(p);
        var ang = Math.random() * Math.PI * 2;
        var dist = 80 + Math.random() * 160;
        var dx = Math.cos(ang) * dist;
        var dy = Math.sin(ang) * dist * 0.6 + 130; // 抛物线下坠
        p.animate([
          { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
          { transform: 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px)) scale(0.35)', opacity: 0 }
        ], { duration: 900 + Math.random() * 700, easing: 'cubic-bezier(0.15, 0.6, 0.4, 1)' });
      }
    }

    // 第一簇同步发射（点击瞬间即有反馈），其余依次跟进
    launchBurst(0);
    for (var b = 1; b < bursts; b++) {
      (function (bb) {
        setTimeout(function () { launchBurst(bb); }, bb * 450);
      })(b);
    }
    setTimeout(function () { overlay.remove(); }, duration + 600);
  }

  // 暴露全局
  // ============== 全局图标库（IC：用户提供的 SVG 图标，fill=currentColor 随文字颜色继承） ==============
  const ICONS = {
    todo: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2048 2048"><path fill="currentColor" d="M128 640v768h256v128H0V128h256V0h128v128h768V0h128v128h256v640h-128V640zm128-384H128v256h1280V256h-128v128h-128V256H384v128H256zm1792 828q0 20-8 39t-23 34q-208 208-412 414t-413 412q-32 30-75 30t-73-30l-411-410q-15-14-23-33t-8-41q0-43 31-74l177-177q31-31 74-31q42 0 73 31l160 160l576-575q30-30 73-30q20 0 40 8t35 22l176 177q14 14 22 33t9 41M885 1642l143-143l-144-144l-143 144zm1025-559l-144-144q-199 200-395 397t-397 397q36 36 71 72t72 72q200-199 397-396t396-398"/></svg>',
    question: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><g fill="currentColor"><path d="M8.05 9.6c.336 0 .504-.24.554-.627c.04-.534.198-.815.847-1.26c.673-.475 1.049-1.09 1.049-1.986c0-1.325-.92-2.227-2.262-2.227c-1.02 0-1.792.492-2.1 1.29A1.7 1.7 0 0 0 6 5.48c0 .393.203.64.545.64c.272 0 .455-.147.564-.51c.158-.592.525-.915 1.074-.915c.61 0 1.03.446 1.03 1.084c0 .563-.208.885-.822 1.325c-.619.433-.926.914-.926 1.64v.111c0 .428.208.745.585.745"/><path d="m10.273 2.513l-.921-.944l.715-.698l.622.637l.89-.011a2.89 2.89 0 0 1 2.924 2.924l-.01.89l.636.622a2.89 2.89 0 0 1 0 4.134l-.637.622l.011.89a2.89 2.89 0 0 1-2.924 2.924l-.89-.01l-.622.636a2.89 2.89 0 0 1-4.134 0l-.622-.637l-.89.011a2.89 2.89 0 0 1-2.924-2.924l.01-.89l-.636-.622a2.89 2.89 0 0 1 0-4.134l.637-.622l-.011-.89a2.89 2.89 0 0 1 2.924-2.924l.89.01l.622-.636a2.89 2.89 0 0 1 4.134 0l-.715.698a1.89 1.89 0 0 0-2.704 0l-.92.944l-1.32-.016a1.89 1.89 0 0 0-1.911 1.912l.016 1.318l-.944.921a1.89 1.89 0 0 0 0 2.704l.944.92l-.016 1.32a1.89 1.89 0 0 0 1.912 1.911l1.318-.016l.921.944a1.89 1.89 0 0 0 2.704 0l.92-.944l1.32.016a1.89 1.89 0 0 0 1.911-1.912l-.016-1.318l.944-.921a1.89 1.89 0 0 0 0-2.704l-.944-.92l.016-1.32a1.89 1.89 0 0 0-1.912-1.911z"/><path d="M7.001 11a1 1 0 1 1 2 0a1 1 0 0 1-2 0"/></g></svg>',
    inbox: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M18 2c3.674 0 6 3.077 6 6.5c0 1.618-.272 2.925-.941 4.115c-.653 1.16-1.637 2.126-2.907 3.144l-5.9 5.445a3 3 0 0 1-2.034.796h-.436a3 3 0 0 1-2.035-.796l-5.9-5.445C1.172 13.608 0 11.243 0 8.5C0 5.077 2.326 2 6 2c3.133 0 5.344 2.27 5.875 4.802c.016.077.055.14.092.175a.1.1 0 0 0 .032.023a.1.1 0 0 0 .034-.023a.34.34 0 0 0 .092-.175C12.655 4.27 14.867 2 18 2"/></svg>',
    edit: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" fill-rule="evenodd" d="M23.957 3.233a3.17 3.17 0 0 0-1.941-2.15a3.9 3.9 0 0 0-2.81-.12a3 3 0 0 0-1 .68a4.8 4.8 0 0 0-1.001 1.43a3.3 3.3 0 0 0-.3.84a.34.34 0 0 0 .22.41a.3.3 0 0 0 .39-.18l.31-.73a4.5 4.5 0 0 1 .75-1a2.26 2.26 0 0 1 .95-.53a3 3 0 0 1 2 .26a2.2 2.2 0 0 1 1.411 1.32c.15.514.178 1.055.08 1.58a6 6 0 0 1-.52 1.531l-.13-.07c-1.06-.54-3.58-1.81-4.35-2.24a.35.35 0 0 0-.471.14a.35.35 0 0 0 .14.47l4.441 2.42c-.09.2-.24.5-.43.87c-1.22 2.421-4.141 7.863-5.181 9.673a11 11 0 0 0-1.36-1.15c-.24-.16-.5-.32-.75-.46a6.5 6.5 0 0 0-.811-.36a8.7 8.7 0 0 0-1.58-.42q.045-.186.12-.36c.92-2.131 3.32-6.832 4.42-9.003c.25-.48.43-.83.51-1c.2-.38-.41-.48-.42-.47a8 8 0 0 0-.66 1.16c-1.21 2.19-3.81 6.792-4.8 8.892c-.23.4-.38.842-.44 1.3c.07.42.51 3.391.8 4.582c.052.318.202.611.43.84c.182.104.39.153.6.14a4.3 4.3 0 0 0 1.33-.39a12.8 12.8 0 0 0 3.07-2c.25-.28 3.262-6.072 4.912-9.473c.49-1 .86-1.79 1-2.17a18 18 0 0 0 .93-2.331a4.7 4.7 0 0 0 .14-1.93M12.824 20.348h-.15s-.68-3.301-.84-4.191c.47.23 1 .54 1.51.84c.31.18.64.34 1 .51s.67.31 1 .48l.78.47c-.566.469-1.18.878-1.83 1.22a7.6 7.6 0 0 1-1.47.67m-.81 2.171a16 16 0 0 1-1.81-.5a5.7 5.7 0 0 1-1.071-.49a1.25 1.25 0 0 1-.58-.74a3.2 3.2 0 0 1 .19-1.3a3 3 0 0 0 0-1.891a1.83 1.83 0 0 0-.79-.82a3.4 3.4 0 0 0-1.37-.42a12.6 12.6 0 0 0-2.571.22c-1.26.256-2.503.59-3.721 1a.311.311 0 0 0-.03.618q.06.007.12-.008c1-.21 2-.42 3.09-.56a12.8 12.8 0 0 1 3.001-.08c.248.027.488.098.71.21c.18.09.37.18.43.33a2 2 0 0 1 0 1.2a3.8 3.8 0 0 0-.08 1.79a2.1 2.1 0 0 0 1.09 1.281q.63.316 1.311.49q.96.252 1.94.39a.35.35 0 0 0 .4-.28a.35.35 0 0 0-.26-.44" clip-rule="evenodd"/></svg>',
    del: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><path fill="currentColor" d="M160 256H96a32 32 0 0 1 0-64h256V96a32 32 0 0 1 32-32h256a32 32 0 0 1 32 32v96h256a32 32 0 1 1 0 64h-64v672a32 32 0 0 1-32 32H192a32 32 0 0 1-32-32zm448-64v-64H416v64zM224 896h576V256H224zm192-128a32 32 0 0 1-32-32V416a32 32 0 0 1 64 0v320a32 32 0 0 1-32 32m192 0a32 32 0 0 1-32-32V416a32 32 0 0 1 64 0v320a32 32 0 0 1-32 32"/></svg>',
    folder: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><path fill="currentColor" d="M216 72h-85.33l-27.74-20.8a16.12 16.12 0 0 0-9.6-3.2H40a16 16 0 0 0-16 16v136a16 16 0 0 0 16 16h176.89A15.13 15.13 0 0 0 232 200.89V88a16 16 0 0 0-16-16m0 128H40V64h53.33l29.87 22.4A8 8 0 0 0 128 88h88Z"/></svg>',
    classify: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><path fill="currentColor" d="M96 208a8 8 0 0 1-8 8H39.38A15.4 15.4 0 0 1 24 200.62V192a8 8 0 0 1 16 0v8h48a8 8 0 0 1 8 8m64-8h-32a8 8 0 0 0 0 16h32a8 8 0 0 0 0-16m64-56a8 8 0 0 0-8 8v48h-16a8 8 0 0 0 0 16h16.89A15.13 15.13 0 0 0 232 200.89V152a8 8 0 0 0-8-8m-8-72h-48a8 8 0 0 0 0 16h48v24a8 8 0 0 0 16 0V88a16 16 0 0 0-16-16M24 80V56a16 16 0 0 1 16-16h52.69A15.86 15.86 0 0 1 104 44.69l29.66 29.65A8 8 0 0 1 128 88H32a8 8 0 0 1-8-8m16-8h68.69l-16-16H40Zm-8 88a8 8 0 0 0 8-8v-32a8 8 0 0 0-16 0v32a8 8 0 0 0 8 8"/></svg>',
    clock: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><path fill="currentColor" d="M128 24a104 104 0 1 0 104 104A104.11 104.11 0 0 0 128 24m0 192a88 88 0 1 1 88-88a88.1 88.1 0 0 1-88 88m64-88a8 8 0 0 1-8 8h-56a8 8 0 0 1-8-8V72a8 8 0 0 1 16 0v48h48a8 8 0 0 1 8 8"/></svg>',
    feedback: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M15.35 9.14c-.87-.86-2.26-.86-3.12 0l-.22.22l-.22-.22c-.87-.86-2.26-.86-3.12 0c-.85.82-.87 2.16-.06 3.01l.06.06l3.35 3.29l3.35-3.29c.85-.82.87-2.16.06-3.01l-.06-.06Z"/><path fill="currentColor" d="M12 2C6.49 2 2 6.49 2 12c0 2.12.68 4.19 1.93 5.9l-1.75 2.53c-.21.31-.24.7-.06 1.03c.17.33.51.54.89.54h9c5.51 0 10-4.49 10-10S17.51 2 12 2m0 18H4.91L6 18.43c.26-.37.23-.88-.06-1.22A7.98 7.98 0 0 1 4.01 12c0-4.41 3.59-8 8-8s8 3.59 8 8s-3.59 8-8 8Z"/></svg>',
    done: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><path fill="currentColor" d="M128 24a104 104 0 1 0 104 104A104.11 104.11 0 0 0 128 24m0 192a88 88 0 1 1 88-88a88.1 88.1 0 0 1-88 88M80 108a12 12 0 1 1 12 12a12 12 0 0 1-12-12m104 0a8 8 0 0 1-8 8h-24a8 8 0 0 1 0-16h24a8 8 0 0 1 8 8m-9.08 48c-10.29 17.79-27.39 28-46.92 28s-36.63-10.2-46.93-28a8 8 0 1 1 13.86-8c7.46 12.91 19.2 20 33.07 20s25.61-7.1 33.08-20a8 8 0 1 1 13.84 8"/></svg>',
    undone: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><path fill="currentColor" d="M128 24a104 104 0 1 0 104 104A104.11 104.11 0 0 0 128 24m0 192a88 88 0 1 1 88-88a88.1 88.1 0 0 1-88 88M80 108a12 12 0 1 1 12 12a12 12 0 0 1-12-12m96 0a12 12 0 1 1-12-12a12 12 0 0 1 12 12m-1.08 64a8 8 0 1 1-13.84 8c-7.47-12.91-19.21-20-33.08-20s-25.61 7.1-33.08 20a8 8 0 1 1-13.84-8c10.29-17.79 27.39-28 46.92-28s36.63 10.2 46.92 28"/></svg>',
    palette: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><path fill="currentColor" d="M200.77 53.89A103.27 103.27 0 0 0 128 24h-1.07A104 104 0 0 0 24 128c0 43 26.58 79.06 69.36 94.17A32 32 0 0 0 136 192a16 16 0 0 1 16-16h46.21a31.81 31.81 0 0 0 31.2-24.88a104.4 104.4 0 0 0 2.59-24a103.28 103.28 0 0 0-31.23-73.23m13 93.71a15.89 15.89 0 0 1-15.56 12.4H152a32 32 0 0 0-32 32a16 16 0 0 1-21.31 15.07C62.49 194.3 40 164 40 128a88 88 0 0 1 87.09-88h.9a88.35 88.35 0 0 1 88 87.25a89 89 0 0 1-2.18 20.35ZM140 76a12 12 0 1 1-12-12a12 12 0 0 1 12 12m-44 24a12 12 0 1 1-12-12a12 12 0 0 1 12 12m0 56a12 12 0 1 1-12-12a12 12 0 0 1 12 12m88-56a12 12 0 1 1-12-12a12 12 0 0 1 12 12"/></svg>',
    idea: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><g fill="none"><rect width="6.11" height="5.25" x="8.81" y="17.05" fill="currentColor" opacity=".2" rx="1" /><path fill="currentColor" d="m17.88 3.67l-.92-1.73l-.93 1.73l-1.77.98l1.77.92l.93 2.02l.92-2.02l1.92-1z" opacity=".2" /><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8.39 17.06a2.4 2.4 0 0 0-1.02-1.84c-1.62-1.26-2.44-3.3-2.44-5.6c0-3.6 2.75-6.57 6.27-6.9M8.4 17.06v1.78c0 1.37 0 2.06.32 2.56a2 2 0 0 0 .58.58c.5.33 1.19.33 2.56.33s2.07 0 2.56-.33a2 2 0 0 0 .59-.58c.32-.5.32-1.19.32-2.56v-1.78m0 0H8.65m5.19-12.24c1.56 0 3.24-1.7 3.24-3.25m3.25 3.25c-1.56 0-3.25-1.69-3.25-3.25m-3.24 3.25c1.55 0 3.24 1.72 3.24 3.25m3.25-3.25c-1.54 0-3.25 1.7-3.25 3.25m-1.75 8.98c0-.73.44-1.38 1.04-1.82a5.8 5.8 0 0 0 2.4-4.36" /><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8.4 9.46c0-.62.13-1.11.41-1.66c.33-.63.75-.97 1.22-1.23" /></g></svg>'
  };

  window.Utils = { $, $$, el, esc, ICONS, DateUtil, toast, showModal, closeModal, confirm, timePicker, playTick, uid, fireworks };
})();
