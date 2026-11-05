/* ============================================
   app.js — 像素待办 v0.2
   主线：金币自由（百万金币 / 3 年）
   待办：合并为单一列表，可设「每日」重复
   资讯：GitHub / Hacker News 实时拉取 AI 动态
   ============================================ */
(function () {
  'use strict';

  var KEY = 'pixel-todo-v2';

  /* ---------- 工具 ---------- */
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function key(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function today() { return key(new Date()); }
  function parseKey(k) { var p = k.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function dayDiff(a, b) { return Math.round((parseKey(b) - parseKey(a)) / 86400000); }
  function addDays(k, n) { var d = parseKey(k); d.setDate(d.getDate() + n); return key(d); }
  function fmt(n) { return Number(n || 0).toLocaleString('en-US'); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function $(s) { return document.querySelector(s); }

  /* ---------- 状态 ---------- */
  var state;

  function blank() {
    var d = new Date();
    d.setFullYear(d.getFullYear() + 3);
    return {
      v: 3,
      goal: {
        target: 1000000, deadline: key(d), income: 0, log: [],
        channels: [
          { id: 'ch1', name: '工资', monthly: 0, color: '#5b8cff' },
          { id: 'ch2', name: '副业', monthly: 0, color: '#5ee07a' },
          { id: 'ch3', name: '投资', monthly: 0, color: '#ffc53d' }
        ]
      },
      opps: [],
      player: { level: 1, hp: 100, maxHp: 100, exp: 0, expMax: 100 },
      leave: { count: 2, month: today().slice(0, 7), days: [] },
      tasks: [],
      marked: [],
      ideas: [],
      history: {},
      meta: { lastDay: today(), streak: 0, best: 0 },
      settings: { remind: false, remindTime: '21:00' }
    };
  }

  var LOAD_FAILED = false;

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return blank();
      var s = JSON.parse(raw);
      var b = blank();
      // v2 升 v3：补 player / leave
      if (s.v === 2) {
        s.v = 3;
        s.player = b.player;
        s.leave = b.leave;
      }
      // 版本号不认识但结构还在：就地升级，绝不丢数据
      if (s.v !== 3) {
        if (s.goal && Array.isArray(s.tasks)) {
          s.v = 3;
        } else {
          try { localStorage.setItem(KEY + '-rescue', raw); } catch (e0) {}
          LOAD_FAILED = true;
          return b;
        }
      }
      s.goal = Object.assign(b.goal, s.goal || {});
      s.goal.log = Array.isArray(s.goal.log) ? s.goal.log : [];
      s.player = Object.assign(b.player, s.player || {});
      s.leave = Object.assign(b.leave, s.leave || {});
      s.leave.days = Array.isArray(s.leave.days) ? s.leave.days : [];
      s.meta = Object.assign(b.meta, s.meta || {});
      s.settings = Object.assign(b.settings, s.settings || {});
      s.tasks = Array.isArray(s.tasks) ? s.tasks : [];
      s.marked = Array.isArray(s.marked) ? s.marked : [];
      s.ideas = Array.isArray(s.ideas) ? s.ideas : [];
      s.opps = Array.isArray(s.opps) ? s.opps : [];
      if (!Array.isArray(s.goal.channels) || !s.goal.channels.length) s.goal.channels = b.goal.channels;
      // 迁移：老任务没有归属日期，用创建那天补上
      s.tasks.forEach(function (x) {
        if (x.repeat) { x.date = null; }
        else if (!x.date) { x.date = x.createdAt ? key(new Date(x.createdAt)) : today(); }
      });
      s.history = s.history || {};
      return s;
    } catch (e) {
      // 解析失败时先把原文塞进救援槽，并禁止本回合写回，避免把真数据冲掉
      try { localStorage.setItem(KEY + '-rescue', localStorage.getItem(KEY) || ''); } catch (e0) {}
      LOAD_FAILED = true;
      console.warn('读取失败，已停止写回，原文存入 -rescue', e);
      return blank();
    }
  }

  function save() {
    if (LOAD_FAILED) return;
    try {
      var next = JSON.stringify(state);
      var prev = localStorage.getItem(KEY);
      // 空数据不许顶掉备份，否则连回滚的机会都没了
      var empty = !(state.tasks || []).length &&
                  !((state.goal && state.goal.log) || []).length &&
                  !(state.opps || []).length;
      if (prev && prev !== next && !empty) {
        try { localStorage.setItem(KEY + '-prev', prev); } catch (e1) {}
      }
      localStorage.setItem(KEY, next);
    } catch (e) { toast('保存失败：存储空间满', 'bad'); }
  }

  /* ---------- 数据体检与恢复 ---------- */
  function dataCheck() {
    var raw = localStorage.getItem(KEY) || '';
    var prev = localStorage.getItem(KEY + '-prev') || '';
    var rescue = localStorage.getItem(KEY + '-rescue') || '';
    var s = null;
    try { s = JSON.parse(raw); } catch (e) {}
    var kb = function (t) { return t ? (t.length / 1024).toFixed(1) + ' KB' : '无'; };
    var lines = ['【当前数据】' + kb(raw)];
    if (s) {
      lines.push('任务 ' + (s.tasks || []).length + ' 条 · 进账 ' +
        ((s.goal && s.goal.log) || []).length + ' 笔 · 机会 ' +
        (s.opps || []).length + ' 个 · 灵感 ' + (s.ideas || []).length + ' 条');
    } else {
      lines.push('（解析失败）');
    }
    lines.push('【上一份备份】' + kb(prev));
    lines.push('【救援槽】' + kb(rescue));
    alert(lines.join('\n'));
  }

  function restorePrev() {
    var prev = localStorage.getItem(KEY + '-prev');
    if (!prev) { toast('没有备份可恢复', 'bad'); return; }
    if (!confirm('用上一份备份覆盖当前数据？当前这份会先存进救援槽。')) return;
    try { localStorage.setItem(KEY + '-rescue', localStorage.getItem(KEY) || ''); } catch (e) {}
    try {
      localStorage.setItem(KEY, prev);
      toast('已恢复，正在重载', 'good');
      setTimeout(function () { location.reload(); }, 600);
    } catch (e) { toast('恢复失败', 'bad'); }
  }

  /* ---------- 提示 ---------- */
  var toastEl = $('#toast'), toastTimer = null;
  function toast(msg, kind, ms, undoable) {
    toastEl.textContent = msg;
    toastEl.className = 'toast on' + (kind ? ' ' + kind : '') + (undoable ? ' undo' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.className = 'toast'; }, ms || 2200);
  }
  function flash(kind) {
    var f = $('#flash');
    f.className = 'flash';
    void f.offsetWidth;
    f.className = 'flash ' + kind;
  }

  /* ---------- 历史 ---------- */
  function todayTasks() {
    var t = today();
    return state.tasks.filter(function (x) { return x.repeat || x.date === t; });
  }
  function touchHistory() {
    var k = today();
    var list = todayTasks();
    state.history[k] = {
      total: list.length,
      done: list.filter(function (t) { return t.done; }).length,
      items: list.map(function (t) { return { t: t.text, d: !!t.done }; })
    };
  }

  /* ---------- 请假条 / 数值 ---------- */
  var LEAVE_MAX = 999;

  function monthDiff(a, b) {
    var pa = a.split('-'), pb = b.split('-');
    return (+pb[0] - +pa[0]) * 12 + (+pb[1] - +pa[1]);
  }

  // 每月补 2 张，可无限叠加，上限 999
  function grantLeave() {
    var m = today().slice(0, 7);
    if (!state.leave.month) {
      state.leave.month = m;
      if (!state.leave.count) state.leave.count = 2;
      return null;
    }
    var diff = monthDiff(state.leave.month, m);
    if (diff <= 0) return null;

    state.leave.month = m;
    if (state.leave.count >= LEAVE_MAX) {
      return { capped: true, added: 0, total: state.leave.count };
    }
    var willAdd = 2 * Math.min(diff, 2);
    var before = state.leave.count;
    state.leave.count = Math.min(LEAVE_MAX, before + willAdd);
    return { capped: state.leave.count >= LEAVE_MAX, added: state.leave.count - before, total: state.leave.count };
  }

  function useLeave() {
    var t = today();
    if (state.leave.days.indexOf(t) >= 0) { toast('今天已经请过假了'); return; }
    if (state.leave.count <= 0) { toast('请假条用完了', 'bad'); return; }
    if (!confirm('用掉一张请假条？今天任务可以不做，也不扣血。')) return;
    state.leave.count--;
    state.leave.days.push(t);
    if (state.leave.days.length > 90) state.leave.days = state.leave.days.slice(-90);
    render();
    toast('今天请假 · 不扣血', 'good');
  }

  function damage(n, undone) {
    var p = state.player;
    p.hp -= n;
    if (window.Hero) Hero.hurt();
    if (p.hp <= 0) {
      p.level = Math.max(1, p.level - 1);
      p.hp = Math.round(p.maxHp * 0.5);
      toast('你倒下了，掉回 LV.' + p.level, 'bad');
    } else {
      toast('漏做 ' + undone + ' 件每日 · −' + n + ' HP', 'bad');
    }
  }

  function gain(exp) {
    var p = state.player;
    p.exp += exp;
    p.hp = Math.min(p.maxHp, p.hp + 4);
    while (p.exp >= p.expMax) {
      p.exp -= p.expMax;
      p.level++;
      p.maxHp += 10;
      p.expMax = Math.round(p.expMax * 1.3);
      p.hp = p.maxHp;
      flash('gold');
      toast('LV.' + p.level + ' · 血量上限 +10', 'good');
    }
  }

  /* ---------- 跨天结算 ---------- */
  function settle() {
    var t = today();
    var last = state.meta.lastDay;
    if (!last) { state.meta.lastDay = t; return null; }
    if (last === t) return null;

    var onLeave = state.leave.days.indexOf(last) >= 0;
    var dailies = state.tasks.filter(function (x) { return x.repeat; });
    var undone = dailies.filter(function (x) { return !x.done; }).length;

    // 请假当天不扣血
    if (!onLeave && undone > 0) damage(undone * 15, undone);

    // 昨天全清才算连续 +1；没全清且没请假则归零
    var y = state.history[last];
    if (y && y.total > 0) {
      if (y.done === y.total) state.meta.streak = (state.meta.streak || 0) + 1;
      else if (!onLeave) state.meta.streak = 0;
    } else if (!onLeave && undone > 0) {
      // 没留下历史但昨天确实有每日任务没做
      state.meta.streak = 0;
    }
    if (state.meta.streak > (state.meta.best || 0)) state.meta.best = state.meta.streak;

    // 重置「每日」任务
    state.tasks.forEach(function (x) { if (x.repeat) x.done = false; });
    state.meta.lastDay = t;
    return null;
  }

  /* ---------- 渲染：顶栏 + 主线 ---------- */
  function renderTop() {
    var now = new Date();
    $('#topDate').textContent = (now.getMonth() + 1) + '月' + now.getDate() + '日';
    $('#streakTxt').textContent = state.meta.streak || 0;
  }

  function renderGoal() {
    var g = state.goal;
    $('#goalNow').textContent = fmt(g.income);
    $('#goalTarget').textContent = fmt(g.target);
    var pct = g.target > 0 ? Math.min(100, (g.income / g.target) * 100) : 0;
    $('#goalFill').style.width = pct + '%';
    $('#goalPct').textContent = (pct < 0.1 && pct > 0 ? '<0.1' : pct.toFixed(1)) + '%';

    var left = dayDiff(today(), g.deadline);
    $('#goalDays').textContent = left > 0 ? left : 0;
  }

  /* ---------- 渲染：血条 ---------- */
  function renderVitals() {
    var p = state.player;
    $('#lvNum').textContent = p.level;
    $('#hpFill').style.width = Math.max(0, (p.hp / p.maxHp) * 100) + '%';
    $('#hpTxt').textContent = Math.max(0, Math.round(p.hp)) + '/' + p.maxHp;
    $('#expFill').style.width = Math.min(100, (p.exp / p.expMax) * 100) + '%';
    $('#expTxt').textContent = Math.round(p.exp) + '/' + p.expMax;

    var btn = $('#leaveBtn');
    var onLeave = state.leave.days.indexOf(today()) >= 0;
    $('#leaveNum').textContent = state.leave.count;
    $('#leaveLabel').textContent = onLeave ? '已请假' : '请假';
    btn.classList.toggle('used', onLeave);
    btn.disabled = onLeave || state.leave.count <= 0;

    if (window.Hero) Hero.set({ hp: p.hp / p.maxHp });
  }

  /* ---------- 渲染：任务 ---------- */
  function taskRow(t) {
    var li = document.createElement('li');
    li.className = 'task' + (t.done ? ' done' : '') + (t.repeat ? ' daily' : '');
    li.dataset.id = t.id;

    var box = document.createElement('div');
    box.className = 'box';

    var body = document.createElement('div');
    body.className = 'task-body';

    var tx = document.createElement('div');
    tx.className = 'task-text';
    tx.textContent = t.text;

    var meta = document.createElement('div');
    meta.className = 'task-meta';
    var bits = [];
    if (t.repeat) bits.push('<span class="rep">♻ 每日</span>');
    if (!t.done && !t.repeat && t.date) {
      var age = dayDiff(t.date, today());
      if (age >= 3) {
        bits.push('<span class="age-warn">挂了 ' + age + ' 天</span>');
        li.classList.add('aged');
      }
    }
    meta.innerHTML = bits.join('');

    body.appendChild(tx);
    if (bits.length) body.appendChild(meta);

    var del = document.createElement('button');
    del.className = 'task-del';
    del.textContent = '×';
    del.setAttribute('aria-label', '删除');
    del.addEventListener('click', function (e) { e.stopPropagation(); removeTask(t.id); });

    li.appendChild(box);
    li.appendChild(body);
    li.appendChild(del);
    li.addEventListener('click', function () { toggleTask(t.id); });
    return li;
  }

  function renderTasks() {
    var all = todayTasks();
    var open = all.filter(function (t) { return !t.done; });
    var done = all.filter(function (t) { return t.done; });

    var list = $('#todoList');
    list.textContent = '';
    open.concat(done).forEach(function (t) { list.appendChild(taskRow(t)); });

    $('#todoEmpty').hidden = all.length > 0;
    $('#todoCount').textContent = all.length + ' 项';

    var win = all.length > 0 && done.length === all.length;
    if (window.Hero) Hero.set({ win: win });
  }

  function render() {
    renderTop();
    renderGoal();
    renderVitals();
    renderTasks();
    renderCarry();
    touchHistory();
    save();
    renderOppEntry();
    if (curView === 'year') { renderYear(); renderDayPanel(); }
  }

  /* ---------- 昨日遗留提示 ---------- */
  function renderCarry() {
    var y = addDays(today(), -1);
    var left = state.tasks.filter(function (x) {
      return !x.repeat && x.date === y && !x.done;
    }).length;
    var tip = $('#carryTip');
    if (!tip) return;
    tip.hidden = left <= 0;
    if (left > 0) {
      tip.dataset.date = y;
      $('#carryTxt').textContent = '昨天还剩 ' + left + ' 件没做完';
    }
  }

  /* ---------- 交互：任务 ---------- */
  function toggleTask(id) {
    var t = state.tasks.find(function (x) { return x.id === id; });
    if (!t) return;
    t.done = !t.done;
    t.doneAt = t.done ? Date.now() : null;
    if (t.done) {
      gain(t.repeat ? 8 : 12);
      if (window.Hero) Hero.cheer();
    }
    if (navigator.vibrate) navigator.vibrate(12);
    render();
  }

  var lastDeleted = null;
  function removeTask(id) {
    var i = state.tasks.findIndex(function (x) { return x.id === id; });
    if (i < 0) return;
    lastDeleted = { task: state.tasks[i], index: i };
    state.tasks.splice(i, 1);
    render();
    toast('已删除 · 点此撤销', 'bad', 4500, true);
    setTimeout(function () {
      if (lastDeleted && lastDeleted.task.id === id) lastDeleted = null;
    }, 5000);
  }
  function undoDelete() {
    if (!lastDeleted) return;
    state.tasks.splice(lastDeleted.index, 0, lastDeleted.task);
    lastDeleted = null;
    render();
    toast('已恢复', 'good');
  }

  var repeatOn = false;
  function addTask() {
    var input = $('#addInput');
    var text = input.value.trim();
    if (!text) { input.focus(); return; }
    state.tasks.push({
      id: uid(), text: text, repeat: repeatOn,
      date: repeatOn ? null : today(),
      done: false, createdAt: Date.now(), doneAt: null
    });
    input.value = '';
    render();
    if (navigator.vibrate) navigator.vibrate(8);
  }

  /* ---------- 交互：进账 ---------- */
  var incomeChSel = '';
  function renderIncomeCh() {
    var wrap = $('#incomeCh');
    if (!wrap) return;
    var chs = state.goal.channels || [];
    if (!incomeChSel || !chs.some(function (c) { return c.id === incomeChSel; })) {
      incomeChSel = chs[0] ? chs[0].id : '';
    }
    wrap.textContent = '';
    chs.forEach(function (c) {
      var b = document.createElement('button');
      b.className = 'ch-chip' + (c.id === incomeChSel ? ' on' : '');
      b.textContent = c.name;
      if (c.id === incomeChSel) b.style.borderColor = c.color;
      b.addEventListener('click', function () {
        incomeChSel = c.id;
        renderIncomeCh();
      });
      wrap.appendChild(b);
    });
  }

  function toggleIncome() {
    var p = $('#incomePanel');
    p.hidden = !p.hidden;
    if (!p.hidden) { renderIncomeCh(); $('#incomeAmt').focus(); }
  }
  function addIncome() {
    var amt = parseFloat($('#incomeAmt').value);
    if (!amt || amt <= 0) { toast('填一个正数', 'bad'); return; }
    var note = $('#incomeNote').value.trim();
    var ch = incomeChSel || '';
    state.goal.income += amt;
    state.goal.log.push({ d: today(), amt: amt, note: note, ch: ch });
    $('#incomeAmt').value = '';
    $('#incomeNote').value = '';
    $('#incomePanel').hidden = true;
    flash('gold');
    var cname = (state.goal.channels || []).filter(function (c) { return c.id === ch; })[0];
    toast('+ ' + fmt(amt) + ' 金币' + (cname ? ' · ' + cname.name : ''), 'good');
    render();
  }

  /* ---------- 年历 ---------- */
  /* ---------- 勇士赛程 / 库里状态 ---------- */
  var GAMES_KEY = 'pixel-games-cache';
  var gamesCache = { ts: 0, list: [] };
  var curryCache = { ts: 0, data: null };
  var curryInfo = null;
  var liveUpdated = '';

  function fetchJSON(url, ms) {
    return Promise.race([
      fetch(url).then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); }),
      new Promise(function (_, rej) { setTimeout(function () { rej('timeout'); }, ms); })
    ]);
  }

  function loadGamesCache() {
    try {
      var c = JSON.parse(localStorage.getItem(GAMES_KEY) || 'null');
      if (c && Array.isArray(c.list)) gamesCache = c;
    } catch (e) {}
  }

  function gameOn(k) {
    for (var i = 0; i < gamesCache.list.length; i++) {
      if (gamesCache.list[i].date === k) return gamesCache.list[i];
    }
    return null;
  }

  function isMarked(k) {
    return (state.marked || []).indexOf(k) >= 0;
  }

  function fetchGames() {
    function pullEspn() {
      if (gamesCache.ts && Date.now() - gamesCache.ts < 30 * 60 * 1000) return;
      fetchJSON('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/gsw/schedule', 8000)
        .then(function (j) {
          var byDate = {};
          (j.events || []).forEach(function (e) {
            var d = new Date(e.date);
            if (isNaN(d.getTime())) return;
            var c = (e.competitions || [])[0] || {};
            var me = null, foe = null;
            (c.competitors || []).forEach(function (t) {
              var ab = (t.team && t.team.abbreviation) || '';
              if (ab === 'GS' || ab === 'GSW') me = t; else foe = t;
            });
            var st = (c.status && c.status.type) || {};
            byDate[key(d)] = {
              time: pad(d.getHours()) + ':' + pad(d.getMinutes()),
              opp: foe ? foe.team.abbreviation : '?',
              home: me ? me.homeAway === 'home' : false,
              state: st.state || 'pre',
              done: !!st.completed,
              score: ((me && me.score && me.score.displayValue) || '') + '-' +
                     ((foe && foe.score && foe.score.displayValue) || ''),
              win: !!(me && me.winner)
            };
          });
          gamesCache.list.forEach(function (g) {
            var u = byDate[g.date];
            if (u) {
              g.time = u.time || g.time;
              g.opp = u.opp; g.home = u.home; g.state = u.state;
              g.done = u.done; g.score = u.score; g.win = u.win;
            }
          });

          // ESPN 有、本地没有的场次（改期或新增）补进来
          var have = {};
          gamesCache.list.forEach(function (g) { have[g.date] = 1; });
          Object.keys(byDate).forEach(function (d) {
            if (have[d]) return;
            var u = byDate[d];
            gamesCache.list.push({
              date: d, time: u.time, opp: u.opp, home: u.home,
              state: u.state, done: u.done, score: u.score, win: u.win, note: ''
            });
          });
          gamesCache.list.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
          gamesCache.ts = Date.now();
          try { localStorage.setItem(GAMES_KEY, JSON.stringify(gamesCache)); } catch (e) {}
          renderYear();
          renderDayPanel();
        })
        .catch(function () {});
    }

    // 已有缓存（上次实时结果）就直接用，后台刷新；冷启动才读发布时打进来的快照
    if (gamesCache.list.length) { pullEspn(); return; }

    fetch('assets/gsw-live.json')
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !Array.isArray(d.games) || !d.games.length) throw new Error('empty');
        gamesCache = { ts: 0, list: d.games };
        curryInfo = d.curry || null;
        liveUpdated = d.updated || '';
        try { localStorage.setItem(GAMES_KEY, JSON.stringify(gamesCache)); } catch (e) {}
        renderYear();
        renderDayPanel();
        pullEspn();
      })
      .catch(function () { fallback(); });

    function fallback() {
    if (gamesCache.list.length) { pullEspn(); return; }

    fetch('assets/gsw-schedule.json')
      .then(function (r) { return r.json(); })
      .then(function (arr) {
        if (!Array.isArray(arr) || !arr.length) { pullEspn(); return; }
        gamesCache.list = arr.map(function (g) {
          return {
            date: g.date, time: g.time || '', opp: g.opp, home: !!g.home,
            state: 'pre', done: false, score: '', win: false, note: g.note || ''
          };
        });
        try { localStorage.setItem(GAMES_KEY, JSON.stringify(gamesCache)); } catch (e) {}
        renderYear();
        renderDayPanel();
        pullEspn();
      })
      .catch(function () { pullEspn(); });
    }
  }

  function fetchCurry(cb) {
    if (Date.now() - curryCache.ts < 30 * 60 * 1000) { cb(curryCache.data); return; }
    fetchJSON('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries', 6000)
      .then(function (j) {
        var out = null;
        (j.injuries || []).forEach(function (t) {
          if ((t.displayName || '').indexOf('Warriors') < 0) return;
          (t.injuries || []).forEach(function (p) {
            var n = (p.athlete && p.athlete.displayName) || '';
            if (n.indexOf('Curry') >= 0) {
              out = { status: p.status || '', note: p.shortComment || p.longComment || '' };
            }
          });
        });
        curryCache = { ts: Date.now(), data: out };
        cb(out);
      })
      .catch(function () { cb('err'); });
  }

  function toggleMark() {
    var k = selectedDate;
    if (!k) return;
    state.marked = state.marked || [];
    var i = state.marked.indexOf(k);
    if (i >= 0) state.marked.splice(i, 1);
    else state.marked.push(k);
    save();
    renderYear();
    renderDayPanel();
  }

  /* ---------- 任务日历 ---------- */
  var calCursor = null;
  var selectedDate = null;

  function ensureCal() {
    var t = today();
    if (!calCursor) calCursor = t.slice(0, 7);
    if (!selectedDate) selectedDate = t;
  }

  function taskByDate() {
    var map = {};
    state.tasks.forEach(function (x) {
      if (x.repeat || !x.date) return;
      var c = map[x.date] || (map[x.date] = { total: 0, done: 0 });
      c.total++;
      if (x.done) c.done++;
    });
    return map;
  }

  function renderYear() {
    ensureCal();
    var p = calCursor.split('-');
    var y = +p[0], mo = +p[1] - 1;

    $('#calTitle').textContent = y + ' 年 ' + (mo + 1) + ' 月';

    var grid = $('#calGrid');
    grid.textContent = '';

    var lead = (new Date(y, mo, 1).getDay() + 6) % 7;
    for (var i = 0; i < lead; i++) {
      var b = document.createElement('div');
      b.className = 'cal-cell blank';
      grid.appendChild(b);
    }

    var days = new Date(y, mo + 1, 0).getDate();
    var tKey = today();
    var counts = taskByDate();

    for (var d = 1; d <= days; d++) {
      (function (dd) {
        var dk = y + '-' + pad(mo + 1) + '-' + pad(dd);
        var cell = document.createElement('div');
        cell.className = 'cal-cell';
        if (dk < tKey) cell.classList.add('past');
        if (dk === tKey) cell.classList.add('today');
        if (dk === selectedDate) cell.classList.add('sel');
        if (isMarked(dk)) cell.classList.add('important');

        var num = document.createElement('span');
        num.className = 'd';
        num.textContent = dd;
        cell.appendChild(num);

        var c = counts[dk];
        if (c && c.total) {
          var dot = document.createElement('i');
          dot.className = 'dot';
          if (c.done === c.total) dot.classList.add('done');
          else if (dk > tKey) dot.classList.add('plan');
          cell.appendChild(dot);
        }

        if (gameOn(dk)) {
          var gs = document.createElement('i');
          gs.className = 'gsw';
          cell.appendChild(gs);
        }

        cell.addEventListener('click', function () { selectDay(dk); });
        grid.appendChild(cell);
      })(d);
    }
  }

  function selectDay(k) {
    selectedDate = k;
    calCursor = k.slice(0, 7);
    renderYear();
    renderDayPanel();
  }

  function renderDayPanel() {
    ensureCal();
    var k = selectedDate;
    var dt = parseKey(k);
    $('#dayHead').textContent = (dt.getMonth() + 1) + '月' + dt.getDate() + '日 · 周' +
      '日一二三四五六'[dt.getDay()];

    var list = state.tasks.filter(function (x) { return !x.repeat && x.date === k; });
    var done = list.filter(function (x) { return x.done; }).length;
    $('#dayCount').textContent = list.length ? (done + '/' + list.length + ' 完成') : '';

    var ul = $('#dayList');
    ul.textContent = '';
    list.forEach(function (x) { ul.appendChild(taskRow(x)); });

    $('#dayEmpty').hidden = list.length > 0;

    renderGameCard(k);
  }

  /* ---------- 比赛卡 ---------- */
  function renderGameCard(k) {
    var card = $('#gameCard');
    var mb = $('#markBtn');
    var marked = isMarked(k);
    mb.textContent = marked ? '取消重要' : '标为重要';
    mb.classList.toggle('on', marked);

    var g = gameOn(k);
    if (!g) { card.hidden = true; return; }

    card.hidden = false;
    $('#gcTitle').textContent = (g.home ? '主场 vs ' : '客场 @ ') + g.opp;

    var parts = [g.time + ' 开赛'];
    if (g.done) parts.push((g.win ? '胜 ' : '负 ') + g.score);
    else if (g.state === 'in') parts.push('进行中');
    else parts.push('未开始');
    if (g.note) parts.push(g.note);
    $('#gcMeta').textContent = parts.join(' · ');

    var cd = $('#gcCurry');
    cd.className = 'gc-curry';

    if (g.done) {
      cd.innerHTML = '库里：<b>本场已结束</b>，出场情况看技术统计';
      return;
    }

    // 用当天 12:00 估算距开赛时间
    var start = parseKey(k).getTime() + 12 * 3600000;
    var hours = (start - Date.now()) / 3600000;
    var tip = hours > 48 ? ' · 赛前 48 小时才有最终确认' : '';

    // 库里状态：先用快照垫底，再拉 ESPN 实时覆盖（手机能直连，以实时为准）
    function paintCurry(d, live) {
      var isRest = /rest/i.test(d.note || '') || /rest/i.test(d.status || '');
      var label = isRest ? '轮休/伤停' : (d.status || '未知');
      cd.className = 'gc-curry' + ((isRest || d.status === 'Out') ? ' warn' : ' ok');
      var stamp = live
        ? '实时 · ' + new Date().toTimeString().slice(0, 5)
        : (d.asOf ? '更新于 ' + d.asOf.slice(5, 16).replace('T', ' ') : '');
      cd.innerHTML = '库里：<b>' + label + '</b> · ' + (d.note || '').slice(0, 56) +
        (stamp ? '<br><span class="gc-as">' + stamp + tip + '</span>' : '');
    }

    var hasSnap = false;
    if (curryInfo) { paintCurry(curryInfo, false); hasSnap = true; }

    fetchCurry(function (res) {
      if (!document.body.contains(cd) || selectedDate !== k) return;
      if (res === 'err' || typeof res === 'undefined') {
        if (!hasSnap) {
          cd.innerHTML = hours > 48
            ? '库里：<b>赛前 48 小时才公布名单</b>，现在还查不到轮休'
            : '库里：<b>查询失败</b>，稍后再试';
        }
        return;
      }
      if (!res) {
        cd.className = 'gc-curry ok';
        cd.innerHTML = '库里：<b>无伤病记录</b>，预计出战' +
          (hours > 48 ? '<br><span class="gc-as">当前状态 · 赛前 48 小时才有最终确认</span>' : '');
        return;
      }
      paintCurry(res, true);
    });
  }

  function shiftMonth(n) {
    ensureCal();
    var p = calCursor.split('-');
    var d = new Date(+p[0], +p[1] - 1 + n, 1);
    calCursor = key(d).slice(0, 7);
    renderYear();
  }

  function addDayTask() {
    var inp = $('#dayAddInput');
    var text = inp.value.trim();
    if (!text) { inp.focus(); return; }
    state.tasks.push({
      id: uid(), text: text, repeat: false,
      date: selectedDate, done: false, createdAt: Date.now(), doneAt: null
    });
    inp.value = '';
    save();
    renderYear();
    renderDayPanel();
  }

  /* ---------- 回顾 ---------- */
  function renderReview() {
    var g = state.goal;
    var now = new Date();
    var monthKey = today().slice(0, 7);

    var pct = g.target > 0 ? Math.min(100, g.income / g.target * 100) : 0;
    $('#rvNow').textContent = fmt(g.income);
    $('#rvTarget').textContent = fmt(g.target);
    $('#rvFill').style.width = pct + '%';

    var left = dayDiff(today(), g.deadline);
    $('#rvDays').textContent = left > 0 ? left : 0;

    // 按当前速度外推：起点优先取第一笔进账那天，没有才退回周期起点
    var logs = (g.log || []).slice().sort(function (a, b) { return a.d < b.d ? -1 : 1; });
    var startKey = logs.length ? logs[0].d : addDays(g.deadline, -1095);
    var passed = Math.max(1, dayDiff(startKey, today()));
    var perDay = g.income / passed;
    var eta = $('#rvEta');
    if (g.income >= g.target) {
      eta.textContent = '目标已达成';
    } else if (!g.income || perDay <= 0) {
      eta.textContent = '按当前速度：还没开始攒';
    } else {
      var need = Math.ceil((g.target - g.income) / perDay);
      var d = parseKey(addDays(today(), need));
      var late = dayDiff(g.deadline, key(d));
      eta.textContent = '预计 ' + d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月' +
        (late > 0 ? '（晚 ' + Math.max(1, Math.round(late / 30)) + ' 个月）' : '（在计划内）');
    }

    // 本月
    var mIn = 0;
    (g.log || []).forEach(function (x) {
      if ((x.d || '').slice(0, 7) === monthKey) mIn += x.amt || 0;
    });
    var should = g.target / 36;
    $('#rvIn').textContent = fmt(mIn);
    $('#rvShould').textContent = fmt(Math.round(should));
    var diff = mIn - should;
    var de = $('#rvDiff');
    de.textContent = (diff >= 0 ? '+' : '-') + fmt(Math.abs(Math.round(diff)));
    de.parentNode.className = 'rv-row ' + (diff >= 0 ? 'pos' : 'neg');

    // 近 6 个月
    var chart = $('#rvChart');
    chart.textContent = '';
    var months = [];
    for (var i = 5; i >= 0; i--) {
      var dd = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ k: key(dd).slice(0, 7), m: dd.getMonth() + 1, v: 0 });
    }
    (g.log || []).forEach(function (x) {
      var mk = (x.d || '').slice(0, 7);
      months.forEach(function (mo) { if (mo.k === mk) mo.v += x.amt || 0; });
    });
    var max = 1;
    months.forEach(function (mo) { if (mo.v > max) max = mo.v; });
    months.forEach(function (mo) {
      var col = document.createElement('div');
      col.className = 'rv-col' + (mo.v ? '' : ' zero');
      var bar = document.createElement('i');
      bar.className = 'bar';
      bar.style.height = Math.max(2, Math.round((mo.v / max) * 62)) + 'px';
      var lab = document.createElement('span');
      lab.className = 'm';
      lab.textContent = mo.m;
      col.appendChild(bar);
      col.appendChild(lab);
      chart.appendChild(col);
    });

    // 任务
    var done = 0;
    Object.keys(state.history || {}).forEach(function (k) {
      if (k.slice(0, 7) === monthKey) done += state.history[k].done || 0;
    });
    $('#rvDone').textContent = done;
    $('#rvStreak').textContent = state.meta.streak || 0;
    var lv = (state.leave.days || []).filter(function (d) { return d.slice(0, 7) === monthKey; }).length;
    $('#rvLeave').textContent = lv;

    renderReviewChannels(monthKey);
  }

  /* ---------- 灵感 ---------- */
  function renderIdeas() {
    var list = state.ideas || [];
    $('#ideaCount').textContent = list.length + ' 条';
    var ul = $('#ideaList');
    ul.textContent = '';

    list.slice().reverse().forEach(function (it) {
      var li = document.createElement('li');
      li.className = 'idea-item';

      var body = document.createElement('div');
      body.className = 'idea-body';
      var tx = document.createElement('div');
      tx.className = 'idea-text';
      tx.textContent = it.text;
      var tm = document.createElement('div');
      tm.className = 'idea-time';
      tm.textContent = timeAgo(it.createdAt);
      body.appendChild(tx);
      body.appendChild(tm);

      var act = document.createElement('div');
      act.className = 'idea-act';
      var toT = document.createElement('button');
      toT.className = 'to-today';
      toT.textContent = '→ 今天';
      toT.addEventListener('click', function () { ideaToTask(it.id); });
      var toO = document.createElement('button');
      toO.className = 'to-opp';
      toO.textContent = '→ 机会';
      toO.addEventListener('click', function () { ideaToOpp(it.id); });
      var del = document.createElement('button');
      del.className = 'del';
      del.textContent = '删';
      del.addEventListener('click', function () { delIdea(it.id); });
      act.appendChild(toT);
      act.appendChild(toO);
      act.appendChild(del);

      li.appendChild(body);
      li.appendChild(act);
      ul.appendChild(li);
    });

    $('#ideaEmpty').hidden = list.length > 0;
  }

  function addIdea() {
    var ta = $('#ideaInput');
    var t = ta.value.trim();
    if (!t) { ta.focus(); return; }
    state.ideas = state.ideas || [];
    state.ideas.push({ id: uid(), text: t, createdAt: Date.now() });
    ta.value = '';
    save();
    renderIdeas();
    toast('已存下', 'good');
  }

  function delIdea(id) {
    state.ideas = (state.ideas || []).filter(function (x) { return x.id !== id; });
    save();
    renderIdeas();
  }

  function ideaToTask(id) {
    var list = state.ideas || [];
    var i = list.findIndex(function (x) { return x.id === id; });
    if (i < 0) return;
    var it = list[i];
    state.tasks.push({
      id: uid(), text: it.text.slice(0, 80), repeat: false,
      date: today(), done: false, createdAt: Date.now(), doneAt: null
    });
    list.splice(i, 1);
    save();
    renderIdeas();
    render();
    toast('已加到今天的待办', 'good');
  }

  /* ---------- 收入渠道 ---------- */
  var CH_COLORS = ['#5b8cff', '#5ee07a', '#ffc53d', '#ff7a59', '#b47cff', '#4dd6c8'];

  function renderReviewChannels(monthKey) {
    var wrap = $('#rvChannels');
    if (!wrap) return;
    var chs = state.goal.channels || [];
    var sums = {}, total = 0;
    (state.goal.log || []).forEach(function (x) {
      if ((x.d || '').slice(0, 7) !== monthKey) return;
      var k = x.ch || '_none';
      sums[k] = (sums[k] || 0) + (x.amt || 0);
      total += (x.amt || 0);
    });

    wrap.textContent = '';

    if (!total) {
      var e = document.createElement('div');
      e.className = 'ch-empty';
      e.textContent = '本月还没记进账。记的时候选一下渠道，这里就能看出哪条腿在撑。';
      wrap.appendChild(e);
      return;
    }

    var rows = chs.map(function (c) {
      return { name: c.name, color: c.color, amt: sums[c.id] || 0, plan: c.monthly || 0 };
    });
    if (sums._none) rows.push({ name: '未分类', color: '#6d6c84', amt: sums._none, plan: 0 });

    rows.forEach(function (r) {
      r.share = r.amt / total * 100;
      var row = document.createElement('div');
      row.className = 'ch-row' + (r.amt ? '' : ' zero');

      var top = document.createElement('div');
      top.className = 'ch-top';
      var dot = document.createElement('i');
      dot.className = 'ch-dot';
      dot.style.background = r.color;
      var nm = document.createElement('span');
      nm.className = 'ch-name';
      nm.textContent = r.name;
      var am = document.createElement('b');
      am.className = 'ch-amt';
      am.textContent = fmt(r.amt);
      top.appendChild(dot); top.appendChild(nm); top.appendChild(am);

      var bar = document.createElement('div');
      bar.className = 'ch-bar';
      var fill = document.createElement('i');
      fill.style.width = Math.max(r.amt ? 2 : 0, r.share) + '%';
      fill.style.background = r.color;
      bar.appendChild(fill);

      row.appendChild(top);
      row.appendChild(bar);

      if (r.plan > 0) {
        var pl = document.createElement('div');
        pl.className = 'ch-plan' + (r.amt >= r.plan ? ' ok' : '');
        pl.textContent = '月目标 ' + fmt(r.plan) + ' · ' +
          (r.amt >= r.plan ? '已达成' : '差 ' + fmt(Math.round(r.plan - r.amt)));
        row.appendChild(pl);
      }
      wrap.appendChild(row);
    });
  }

  function renderChEditor() {
    var wrap = $('#chEditor');
    if (!wrap) return;
    var chs = state.goal.channels || [];
    wrap.textContent = '';

    chs.forEach(function (c) {
      var row = document.createElement('div');
      row.className = 'ch-edit-row';

      var dot = document.createElement('i');
      dot.className = 'ch-dot';
      dot.style.background = c.color;

      var nm = document.createElement('input');
      nm.type = 'text';
      nm.className = 'ch-edit-name';
      nm.value = c.name;
      nm.maxLength = 8;
      nm.autocomplete = 'off';
      nm.addEventListener('change', function () {
        c.name = this.value.trim() || '未命名';
        save(); renderIncomeCh(); renderReview();
      });

      var mo = document.createElement('input');
      mo.type = 'number';
      mo.className = 'ch-edit-plan';
      mo.inputMode = 'numeric';
      mo.placeholder = '月目标';
      mo.value = c.monthly ? c.monthly : '';
      mo.addEventListener('change', function () {
        c.monthly = Math.max(0, parseInt(this.value, 10) || 0);
        save(); renderReview();
      });

      var del = document.createElement('button');
      del.className = 'ch-edit-del';
      del.textContent = '×';
      del.setAttribute('aria-label', '删除渠道');
      del.addEventListener('click', function () {
        var list = state.goal.channels || [];
        if (list.length <= 1) { toast('至少留一条渠道', 'bad'); return; }
        state.goal.channels = list.filter(function (x) { return x.id !== c.id; });
        // 该渠道的历史进账归到未分类
        (state.goal.log || []).forEach(function (x) { if (x.ch === c.id) x.ch = ''; });
        if (incomeChSel === c.id) incomeChSel = '';
        save(); renderChEditor(); renderIncomeCh(); renderReview();
      });

      row.appendChild(dot);
      row.appendChild(nm);
      row.appendChild(mo);
      row.appendChild(del);
      wrap.appendChild(row);
    });
  }

  /* ---------- 机会库 ---------- */
  var STAGES = {
    idea: { label: '想法', cls: 'idea' },
    trying: { label: '在试', cls: 'trying' },
    feedback: { label: '有反馈', cls: 'feedback' },
    won: { label: '成了', cls: 'won' },
    dead: { label: '废了', cls: 'dead' }
  };

  function oppStats() {
    var list = state.opps || [];
    return {
      doing: list.filter(function (o) { return o.stage !== 'won' && o.stage !== 'dead'; }).length,
      won: list.filter(function (o) { return o.stage === 'won'; }).length,
      earned: list.reduce(function (a, o) { return a + (o.settled ? (o.earned || 0) : 0); }, 0)
    };
  }

  function renderOppEntry() {
    var sub = $('#oppSub');
    if (!sub) return;
    var st = oppStats();
    sub.textContent = '在试 ' + st.doing + ' · 成了 ' + st.won + ' · 已赚 ' + fmt(st.earned);
  }

  function renderOpps() {
    renderOppEntry();
    var list = state.opps || [];
    var byTime = function (a, b) { return (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0); };
    var doing = list.filter(function (o) { return o.stage !== 'won' && o.stage !== 'dead'; }).sort(byTime);
    var done = list.filter(function (o) { return o.stage === 'won' || o.stage === 'dead'; }).sort(byTime);

    var st = oppStats();
    if ($('#oppDoingNum')) {
      $('#oppDoingNum').textContent = st.doing;
      $('#oppWonNum').textContent = st.won;
      $('#oppEarnNum').textContent = fmt(st.earned);
    }
    $('#oppDoing').textContent = doing.length;
    $('#oppDone').textContent = done.length;

    var ulD = $('#oppDoingList');
    var ulF = $('#oppDoneList');
    ulD.textContent = '';
    ulF.textContent = '';
    doing.forEach(function (o) { ulD.appendChild(oppCard(o)); });
    done.forEach(function (o) { ulF.appendChild(oppCard(o)); });

    $('#oppEmpty').hidden = list.length > 0;
    $('#oppDoneSec').hidden = done.length === 0;
  }

  function oppCard(o) {
    var li = document.createElement('li');
    li.className = 'opp-item stage-' + o.stage;

    var top = document.createElement('div');
    top.className = 'opp-top';
    var t = document.createElement('div');
    t.className = 'opp-title';
    t.textContent = o.title;
    var tag = document.createElement('span');
    tag.className = 'opp-tag ' + STAGES[o.stage].cls;
    tag.textContent = STAGES[o.stage].label;
    top.appendChild(t);
    top.appendChild(tag);
    li.appendChild(top);

    var meta = document.createElement('div');
    meta.className = 'opp-meta';
    meta.textContent = '建于 ' + timeAgo(o.createdAt);
    li.appendChild(meta);

    // 预期金额：进行中的机会可随时改
    if (o.stage !== 'won' && o.stage !== 'dead') {
      var ex = document.createElement('div');
      ex.className = 'opp-expect';
      var lb = document.createElement('span');
      lb.textContent = '预期';
      var ip = document.createElement('input');
      ip.type = 'number';
      ip.className = 'opp-expect-in';
      ip.inputMode = 'numeric';
      ip.placeholder = '0';
      ip.value = o.expect ? o.expect : '';
      ip.addEventListener('change', function () {
        o.expect = Math.max(0, parseFloat(this.value) || 0);
        save();
      });
      var un = document.createElement('span');
      un.className = 'opp-unit';
      un.textContent = '金币';
      ex.appendChild(lb);
      ex.appendChild(ip);
      ex.appendChild(un);
      li.appendChild(ex);
    }

    if (o.url) {
      var lk = document.createElement('a');
      lk.className = 'opp-link';
      lk.href = o.url;
      lk.target = '_blank';
      lk.rel = 'noopener';
      lk.textContent = '看来源 ›';
      li.appendChild(lk);
    }

    if (o.stage === 'won') {
      if (o.settled) {
        var c = (state.goal.channels || []).filter(function (x) { return x.id === o.ch; })[0];
        var sd = document.createElement('div');
        sd.className = 'opp-settled';
        sd.textContent = '已入账 ' + fmt(o.earned) + (c ? ' → ' + c.name : '');
        li.appendChild(sd);
      } else {
        var box = document.createElement('div');
        box.className = 'opp-settle';

        var amt = document.createElement('input');
        amt.type = 'number';
        amt.className = 'opp-earn';
        amt.inputMode = 'numeric';
        amt.placeholder = '实收';
        amt.value = o.earned || o.expect || '';
        amt.addEventListener('change', function () {
          o.earned = Math.max(0, parseFloat(this.value) || 0);
          save();
        });

        var sel = document.createElement('select');
        sel.className = 'opp-ch';
        (state.goal.channels || []).forEach(function (ch) {
          var op = document.createElement('option');
          op.value = ch.id;
          op.textContent = ch.name;
          if (o.ch === ch.id) op.selected = true;
          sel.appendChild(op);
        });
        if (!o.ch) {
          var dch = state.goal.channels[1] || state.goal.channels[0];
          if (dch) o.ch = dch.id;
        }
        sel.addEventListener('change', function () { o.ch = this.value; save(); });

        var go = document.createElement('button');
        go.className = 'opp-go';
        go.textContent = '记入主线';
        go.addEventListener('click', function () { settleOpp(o.id); });

        box.appendChild(amt);
        box.appendChild(sel);
        box.appendChild(go);
        li.appendChild(box);
      }
    }

    var act = document.createElement('div');
    act.className = 'opp-act';

    function mkAct(label, cls, fn) {
      var b = document.createElement('button');
      b.className = 'opp-btn ' + cls;
      b.textContent = label;
      b.addEventListener('click', fn);
      act.appendChild(b);
    }

    if (o.stage === 'idea') {
      mkAct('开始试', 'primary', function () { advOpp(o.id, 'trying'); });
    } else if (o.stage === 'trying') {
      mkAct('有反馈了', 'primary', function () { advOpp(o.id, 'feedback'); });
      mkAct('废了', 'ghost', function () { advOpp(o.id, 'dead'); });
    } else if (o.stage === 'feedback') {
      mkAct('成了', 'primary', function () { advOpp(o.id, 'won'); });
      mkAct('废了', 'ghost', function () { advOpp(o.id, 'dead'); });
    } else if (o.stage === 'dead') {
      mkAct('重新捡起', 'primary', function () { advOpp(o.id, 'trying'); });
    }
    if (o.stage === 'dead' || o.stage === 'won') {
      mkAct('删', 'ghost', function () { delOpp(o.id); });
    }

    if (act.children.length) li.appendChild(act);
    return li;
  }

  function advOpp(id, to) {
    var o = (state.opps || []).filter(function (x) { return x.id === id; })[0];
    if (!o) return;
    o.stage = to;
    o.updatedAt = Date.now();
    save();
    renderOpps();
    if (to === 'won') toast('成了 · 填个实收，记进主线', 'good');
    else if (to === 'dead') toast('记下了', 'bad');
  }

  function delOpp(id) {
    state.opps = (state.opps || []).filter(function (x) { return x.id !== id; });
    save();
    renderOpps();
  }

  function addOpp(title, url) {
    var t = (title || '').trim();
    if (!t) return false;
    state.opps = state.opps || [];
    var dup = state.opps.some(function (o) { return o.title === t; });
    if (dup) { toast('这个已经在库里了', 'bad'); return false; }
    state.opps.push({
      id: uid(), title: t.slice(0, 90), stage: 'idea',
      expect: 0, earned: 0, url: url || '',
      createdAt: Date.now(), updatedAt: Date.now(), settled: false, ch: ''
    });
    save();
    renderOppEntry();
    return true;
  }

  function addOppFromInput() {
    var inp = $('#oppInput');
    if (!inp) return;
    if (addOpp(inp.value, '')) {
      inp.value = '';
      renderOpps();
      toast('已存进机会库', 'good');
    }
  }

  function settleOpp(id) {
    var o = (state.opps || []).filter(function (x) { return x.id === id; })[0];
    if (!o || o.settled) return;
    var amt = o.earned || 0;
    if (amt <= 0) { toast('先填实收金额', 'bad'); return; }
    var chs = state.goal.channels || [];
    if (!o.ch) o.ch = (chs[1] || chs[0] || {}).id || '';
    state.goal.income += amt;
    state.goal.log.push({ d: today(), amt: amt, note: o.title.slice(0, 30), ch: o.ch });
    o.settled = true;
    o.updatedAt = Date.now();
    save();
    flash('gold');
    var c = chs.filter(function (x) { return x.id === o.ch; })[0];
    toast('已记入主线 +' + fmt(amt) + (c ? ' · ' + c.name : ''), 'good');
    render();
    renderOpps();
  }

  function ideaToOpp(id) {
    var list = state.ideas || [];
    var i = list.findIndex(function (x) { return x.id === id; });
    if (i < 0) return;
    if (addOpp(list[i].text, '')) {
      list.splice(i, 1);
      save();
      renderIdeas();
      toast('已移进机会库', 'good');
    }
  }

  /* ---------- 翻译与资讯详情 ---------- */
  var TR_CACHE = 'pixel-tr-v1';
  var trQueue = [], trBusy = false;

  function hasCJK(t) { return /[\u4e00-\u9fa5]/.test(t || ''); }

  function loadTr() {
    try { return JSON.parse(localStorage.getItem(TR_CACHE) || '{}'); } catch (e) { return {}; }
  }
  function saveTr(o) {
    try {
      var keys = Object.keys(o);
      if (keys.length > 800) {
        keys.slice(0, 400).forEach(function (k) { delete o[k]; });
      }
      localStorage.setItem(TR_CACHE, JSON.stringify(o));
    } catch (e) {}
  }

  function translateOne(text, cb) {
    if (!text) { cb(null); return; }
    if (hasCJK(text)) { cb(text); return; }

    var cache = loadTr();
    var key = text.slice(0, 140);
    if (cache[key]) { cb(cache[key]); return; }

    var q = encodeURIComponent(text.slice(0, 460));
    fetch('https://api.mymemory.translated.net/get?q=' + q + '&langpair=en|zh-CN')
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var t = j && j.responseData && j.responseData.translatedText;
        if (!t || typeof t !== 'string') { cb(null); return; }
        if (/MYMEMORY WARNING/i.test(t) || t.trim() === text.trim()) { cb(null); return; }
        cache[key] = t;
        saveTr(cache);
        cb(t);
      })
      .catch(function () { cb(null); });
  }

  // 串行 + 间隔，避免免费接口限流
  function enqueueTranslate(text, cb) {
    trQueue.push({ t: text, cb: cb });
    pumpTranslate();
  }
  function pumpTranslate() {
    if (trBusy || !trQueue.length) return;
    trBusy = true;
    var job = trQueue.shift();
    translateOne(job.t, function (r) {
      try { job.cb(r); } catch (e) {}
      trBusy = false;
      setTimeout(pumpTranslate, 220);
    });
  }

  var curArticle = null;

  function openArticle(it) {
    curArticle = it;
    switchView('article');
    $('#artSrc').textContent = it.tag;
    $('#artTime').textContent = it.foot || '';
    $('#artEn').textContent = it.title;
    $('#artZh').textContent = hasCJK(it.title) ? it.title : '正在翻译…';
    $('#artSum').textContent = '';
    $('#artOpen').href = it.url;

    if (!hasCJK(it.title)) {
      translateOne(it.title, function (t) {
        if (curArticle !== it) return;
        $('#artZh').textContent = t || it.title;
      });
    }

    if (it.summary) {
      if (hasCJK(it.summary)) {
        $('#artSum').textContent = it.summary;
      } else {
        translateOne(it.summary, function (t) {
          if (curArticle !== it) return;
          $('#artSum').textContent = t || it.summary;
        });
      }
    }

    renderInsight(it);
  }

  var insightData = null;

  function loadInsight(cb) {
    if (insightData) { cb(insightData); return; }
    fetch('assets/ai-insight.json')
      .then(function (r) { return r.json(); })
      .then(function (j) { insightData = j; cb(j); })
      .catch(function () { cb(null); });
  }

  function matchCat(it, data) {
    var text = ((it.title || '') + ' ' + (it.summary || '')).toLowerCase();
    var best = null, bestScore = 0;
    (data.cats || []).forEach(function (c) {
      if (!c.kw || !c.kw.length) return;
      var sc = 0;
      c.kw.forEach(function (k) { if (text.indexOf(String(k).toLowerCase()) >= 0) sc++; });
      if (sc > bestScore) { bestScore = sc; best = c; }
    });
    if (best) return best;
    var list = data.cats || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === 'default') return list[i];
    }
    return null;
  }

  function insBlock(kind, label, text) {
    var b = document.createElement('div');
    b.className = 'ins-block ' + kind;
    var k = document.createElement('div');
    k.className = 'ins-k';
    k.textContent = label;
    var v = document.createElement('div');
    v.className = 'ins-v';
    v.textContent = text;
    b.appendChild(k);
    b.appendChild(v);
    return b;
  }

  function renderInsight(it) {
    var box = $('#artInsight');
    box.textContent = '';
    loadInsight(function (data) {
      if (curArticle !== it) return;
      box.textContent = '';
      if (!data) {
        box.appendChild(insBlock('trend', '解读', '解读文件没加载出来，稍后再试。'));
        return;
      }
      var c = matchCat(it, data);
      if (!c) return;

      var tag = $('#artTag');
      if (tag) tag.textContent = c.name;

      box.appendChild(insBlock('trend', '这条的趋势', c.trend));
      box.appendChild(insBlock('biz', '能怎么用', c.biz));

      var note = document.createElement('p');
      note.className = 'ins-note';
      note.textContent = '按主题匹配的判断：同主题的条目共用一段趋势与用法。具体怎么落地，还得结合你自己的处境。';
      box.appendChild(note);
    });
  }

  /* ---------- 视图切换 ---------- */
  var curView = 'today';
  function switchView(v) {
    curView = v;
    ['today', 'year', 'review', 'more', 'feed', 'opps', 'article'].forEach(function (n) {
      $('#view-' + n).hidden = n !== v;
    });
    document.querySelectorAll('.tab').forEach(function (b) {
      var on = b.dataset.view === v ||
        ((v === 'feed' || v === 'opps' || v === 'article') && b.dataset.view === 'today');
      b.classList.toggle('on', on);
    });
    if (v === 'year') { renderYear(); renderDayPanel(); }
    if (v === 'review') renderReview();
    if (v === 'more') { renderIdeas(); renderSettings(); renderOppEntry(); }
    if (v === 'opps') renderOpps();
    if (v === 'feed') {
      var d = new Date();
      $('#feedDate').textContent = (d.getMonth() + 1) + '月' + d.getDate() + '日';
    }
    window.scrollTo(0, 0);
  }

  /* ---------- AI 资讯 ---------- */
  var AI_CACHE = 'pixel-ai-cache-v3';
  var AI_TTL = 15 * 60 * 1000;
  var N_FRESH = 10;
  var N_RISING = 10;

  function parseRssDate(s) {
    if (!s) return 0;
    var t = String(s).trim().replace(' ', 'T');
    if (!/Z|[+-]\d\d:?\d\d$/.test(t)) t += 'Z';
    var v = Date.parse(t);
    return isNaN(v) ? 0 : v;
  }

  function stripHtml(s) {
    return String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function timeAgo(ts) {
    var d = Date.now() - ts;
    if (d < 60000) return '刚刚';
    var m = Math.floor(d / 60000);
    if (m < 60) return m + ' 分钟前';
    var h = Math.floor(m / 60);
    if (h < 24) return h + ' 小时前';
    return Math.floor(h / 24) + ' 天前';
  }

  function loadAI() {
    var feed = $('#aiFeed');
    var hint = $('#aiHint');
    var sub = $('#feSub');
    var cnt = $('#feCount');
    var pool = [];
    var srcStat = {};

    function setEntry(n) {
      cnt.textContent = n + ' 条';
      sub.textContent = n ? (n + ' 条 · 前 10 最新，后 10 涨最快') : '今天没拉到内容';
    }

    function card(it, i) {
      var div = document.createElement('div');
      div.className = 'ai-item';
      div.dataset.idx = String(i + 1);

      var head = document.createElement('div');
      head.className = 'ai-item-head';
      var src = document.createElement('span');
      src.className = 'ai-src ' + it.src;
      src.textContent = it.tag;

      var titles = document.createElement('div');
      titles.className = 'ai-item-titles';
      var zh = document.createElement('div');
      zh.className = 'ai-item-title-zh';
      zh.textContent = '翻译中…';
      var en = document.createElement('div');
      en.className = 'ai-item-title';
      en.textContent = it.title;
      titles.appendChild(zh);
      titles.appendChild(en);

      head.appendChild(src);
      head.appendChild(titles);
      div.appendChild(head);

      var foot = document.createElement('div');
      foot.className = 'ai-item-foot';
      var ch = document.createElement('span');
      ch.className = 'ch';
      ch.textContent = it.foot;

      var go = document.createElement('span');
      go.className = 'ai-open';
      go.textContent = '看解读 ›';

      var opp = document.createElement('button');
      opp.type = 'button';
      opp.className = 'ai-opp';
      opp.textContent = '＋机会';
      opp.addEventListener('click', function (e) {
        e.stopPropagation();
        if (addOpp(it.title, it.url)) {
          toast('已存进机会库', 'good');
          opp.textContent = '✓ 已存';
          opp.disabled = true;
          opp.classList.add('on');
        }
      });

      foot.appendChild(ch);
      foot.appendChild(go);
      foot.appendChild(opp);
      div.appendChild(foot);

      div.addEventListener('click', function () { openArticle(it); });

      // 标题异步翻译，中文在上、英文在下
      if (hasCJK(it.title)) {
        zh.textContent = it.title;
        en.textContent = '';
      } else {
        enqueueTranslate(it.title, function (t) {
          zh.textContent = t || it.title;
        });
      }
      return div;
    }

    function section(title, note, list, cls) {
      var sec = document.createElement('div');
      sec.className = 'ai-sec ' + cls;
      var head = document.createElement('div');
      head.className = 'ai-sec-head';
      var dot = document.createElement('i');
      dot.className = 'sec-dot';
      var t = document.createElement('span');
      t.className = 'sec-t';
      t.textContent = title;
      var n = document.createElement('span');
      n.className = 'sec-n';
      n.textContent = note;
      head.appendChild(dot);
      head.appendChild(t);
      head.appendChild(n);
      sec.appendChild(head);
      list.forEach(function (it, i) { sec.appendChild(card(it, i)); });
      return sec;
    }

    function render() {
      if (!pool.length) return;

      // 「刚刚发生」也要够火：官方/论文无门槛，社区源设最低热度
      var byTime = pool.filter(function (x) {
        if (x.src === 'hn') return (x.hot || 0) >= 20;
        if (x.src === 'gh') return (x.hot || 0) >= 50;
        return true;
      }).sort(function (a, b) { return b.ts - a.ts; });

      // 先每个来源保底 1 条，剩下的按时间补，单源最多 3 条
      var fresh = [], quota = {}, picked = {};
      byTime.forEach(function (x) {
        if (fresh.length >= 4 || picked[x.src]) return;
        picked[x.src] = 1;
        quota[x.src] = 1;
        fresh.push(x);
      });
      for (var qi = 0; qi < byTime.length && fresh.length < N_FRESH; qi++) {
        var cand = byTime[qi];
        if (fresh.indexOf(cand) >= 0) continue;
        var take = quota[cand.src] || 0;
        if (take >= 3) continue;
        quota[cand.src] = take + 1;
        fresh.push(cand);
      }
      // 某源挂了就放开配额，补满 10 条
      for (var qj = 0; qj < byTime.length && fresh.length < N_FRESH; qj++) {
        if (fresh.indexOf(byTime[qj]) >= 0) continue;
        fresh.push(byTime[qj]);
      }
      fresh.sort(function (a, b) { return b.ts - a.ts; });
      var used = {};
      fresh.forEach(function (x) { used[x.url] = 1; });

      var rising = pool.filter(function (x) { return !used[x.url] && x.rate > 0; })
        .sort(function (a, b) { return b.rate - a.rate; })
        .slice(0, N_RISING);

      feed.textContent = '';
      if (fresh.length) feed.appendChild(section('刚刚发生', '按发布时间倒序', fresh, 'fresh'));
      if (rising.length) feed.appendChild(section('正在起飞', '按单位时间涨速', rising, 'rising'));

      var total = fresh.length + rising.length;
      var zeros = Object.keys(srcStat).filter(function (k) { return !srcStat[k]; });
      hint.textContent = '今天 ' + total + ' 条：' + fresh.length + ' 条最新 + ' +
        rising.length + ' 条涨得快。' +
        (zeros.length ? '没连上：' + zeros.join('、') + '。下拉刷新可重拉。' : '') +
        '点任意一条看中英对照与解读。';
      hint.hidden = false;
      setEntry(total);

      // 只缓存完整结果：残缺的一写进去，就把人锁在这里 15 分钟
      if (fresh.length >= 6 && rising.length >= 3) {
        try {
          localStorage.setItem(AI_CACHE, JSON.stringify({ ts: Date.now(), fresh: fresh, rising: rising }));
        } catch (e) {}
      }
    }

    // 缓存 15 分钟
    try {
      var c = JSON.parse(localStorage.getItem(AI_CACHE) || 'null');
      if (c && Array.isArray(c.fresh) && Array.isArray(c.rising) &&
          c.fresh.length >= 6 && c.rising.length >= 3 &&
          (Date.now() - c.ts) < AI_TTL) {
        feed.textContent = '';
        if (c.fresh.length) feed.appendChild(section('刚刚发生', '按发布时间倒序', c.fresh, 'fresh'));
        if (c.rising.length) feed.appendChild(section('正在起飞', '按单位时间涨速', c.rising, 'rising'));
        setEntry(c.fresh.length + c.rising.length);
        hint.textContent = '今天 ' + (c.fresh.length + c.rising.length) + ' 条：' +
          c.fresh.length + ' 条最新 + ' + c.rising.length + ' 条涨得快。点任意一条看中英对照与解读。';
        hint.hidden = false;
        return;
      }
    } catch (e) {}

    function fetchWithTimeout(url, ms) {
      return Promise.race([
        fetch(url).then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); }),
        new Promise(function (_, rej) { setTimeout(function () { rej('timeout'); }, ms); })
      ]);
    }

    var timer = null;
    function bump() {
      clearTimeout(timer);
      timer = setTimeout(render, 260);
    }

    // 三个 RSS：经 rss2json 代理绕开跨域
    function pullRss(url, tag, src) {
      var api = 'https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent(url);
      fetchWithTimeout(api, 12000)
        .then(function (j) {
          if (!j || j.status !== 'ok') return;
          (j.items || []).forEach(function (it) {
            var ts = parseRssDate(it.pubDate);
            if (!ts || !it.link) return;
            var txt = stripHtml(it.description);
            srcStat[tag] = (srcStat[tag] || 0) + 1;
            pool.push({
              src: src, tag: tag,
              title: stripHtml(it.title) || '(无标题)',
              url: it.link,
              summary: txt ? (txt.slice(0, 120) + (txt.length > 120 ? '…' : '')) : '这条没有摘要，点开看原文。',
              ts: ts,
              rate: 0,
              foot: (src === 'official' ? '官方发布 · ' : '论文 · ') + timeAgo(ts)
            });
          });
        })
        .catch(function () {})
        .then(bump);
    }

    pullRss('https://openai.com/news/rss.xml', 'OPENAI', 'official');
    pullRss('https://deepmind.google/blog/rss.xml', 'DEEPMIND', 'official');
    pullRss('http://export.arxiv.org/api/query?search_query=cat:cs.AI&sortBy=submittedDate&sortOrder=descending&max_results=15', 'ARXIV', 'paper');

    // GitHub：近 90 天新建，池子放大
    var since = (function () { var d = new Date(); d.setDate(d.getDate() - 90); return d.toISOString().slice(0, 10); })();
    fetchWithTimeout('https://api.github.com/search/repositories?q=topic:ai+created:%3E' + since + '+stars:%3E30&sort=stars&order=desc&per_page=30', 12000)
      .then(function (j) {
        (j.items || []).forEach(function (it) {
          var created = Date.parse(it.created_at) || Date.now();
          var days = Math.max(1, (Date.now() - created) / 86400000);
          var perDay = (it.stargazers_count || 0) / days;
          srcStat.GH = (srcStat.GH || 0) + 1;
          pool.push({
            src: 'gh', tag: 'GH',
            title: it.full_name,
            url: it.html_url,
            summary: 'AI 新项目，' + (it.language || '多语言') + ' 写的，' + fmt(it.stargazers_count) + ' 星。' +
              (it.description ? '项目自述：' + it.description.slice(0, 100) : '作者没写简介。'),
            ts: created,
            rate: perDay,
            hot: it.stargazers_count || 0,
            foot: '★ ' + fmt(it.stargazers_count) + ' · 日均 +' + perDay.toFixed(1) + ' 星'
          });
        });
      })
      .catch(function () {})
      .then(bump);

    // Hacker News：近 48 小时
    var ts48 = Math.floor(Date.now() / 1000) - 48 * 3600;
    fetchWithTimeout('https://hn.algolia.com/api/v1/search?query=AI&tags=story&numericFilters=created_at_i%3E' + ts48 + '&hitsPerPage=30', 12000)
      .then(function (j) {
        (j.hits || []).forEach(function (it) {
          var created = (it.created_at_i || 0) * 1000;
          if (!created) return;
          var hours = Math.max(1, (Date.now() - created) / 3600000);
          var perHour = (it.points || 0) / hours;
          srcStat.HN = (srcStat.HN || 0) + 1;
          pool.push({
            src: 'hn', tag: 'HN',
            title: it.title || '(无标题)',
            url: it.url || ('https://news.ycombinator.com/item?id=' + it.objectID),
            summary: '社区热度 ' + (it.points || 0) + ' 分、' + (it.num_comments || 0) + ' 条评论。',
            ts: created,
            rate: perHour,
            hot: it.points || 0,
            foot: '▲ ' + (it.points || 0) + ' · 每小时 +' + perHour.toFixed(1) + ' 点'
          });
        });
      })
      .catch(function () {})
      .then(bump);

    setTimeout(function () {
      if (!pool.length) {
        feed.innerHTML = '<div class="ai-skeleton">没拉到内容。检查网络后重新打开这一页。</div>';
        cnt.textContent = '0 条';
        sub.textContent = '今天没拉到内容';
      } else {
        render();
      }
    }, 15000);
  }

  /* ---------- 提醒 ---------- */
  var remindedOn = '';
  function tickRemind() {
    if (!state.settings.remind) return;
    var now = new Date();
    var hm = pad(now.getHours()) + ':' + pad(now.getMinutes());
    var tk = today();
    if (hm !== state.settings.remindTime) return;
    if (remindedOn === tk) return;
    remindedOn = tk;

    var left = todayTasks().filter(function (t) { return !t.done; }).length;
    if (left === 0) return;
    if (window.Notification && Notification.permission === 'granted') {
      try { new Notification('像素待办', { body: '还有 ' + left + ' 件事没做。', tag: 'pixel-todo' }); }
      catch (e) {}
    }
    toast('还有 ' + left + ' 件事没做', 'bad');
  }

  /* ---------- 设置 ---------- */
  function renderSettings() {
    $('#goalTargetInput').value = state.goal.target;
    $('#goalDeadlineInput').value = state.goal.deadline;
    $('#goalNowInput').value = state.goal.income;
    renderChEditor();
    renderIncomeCh();
    $('#remindTime').value = state.settings.remindTime;
    $('#remindSwitch').setAttribute('aria-checked', state.settings.remind ? 'true' : 'false');
  }

  /* ---------- 导入导出 ---------- */
  function exportData() {
    var blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '像素待办-' + today() + '.json';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 3000);
    toast('已导出', 'good');
  }
  function importData(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var s = JSON.parse(reader.result);
        if (s.v !== 2 || !s.goal || !Array.isArray(s.tasks)) throw new Error('格式不对');
        state = Object.assign(blank(), s);
        render(); renderSettings();
        toast('已导入', 'good');
      } catch (e) { toast('导入失败：文件格式不对', 'bad'); }
    };
    reader.readAsText(file);
  }

  /* ---------- 绑定 ---------- */
  function bind() {
    $('#addBtn').addEventListener('click', addTask);
    $('#addInput').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); addTask(); this.blur(); }
    });
    $('#repeatToggle').addEventListener('click', function () {
      var c = $('#repeatChk');
      c.checked = !c.checked;
      repeatOn = c.checked;
      this.classList.toggle('on', repeatOn);
    });

    $('#incomeBtn').addEventListener('click', toggleIncome);
    $('#incomeOk').addEventListener('click', addIncome);
    $('#incomeAmt').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); addIncome(); }
    });

    $('#leaveBtn').addEventListener('click', useLeave);

    $('#feedEntry').addEventListener('click', function () { switchView('feed'); });
    $('#feedBack').addEventListener('click', function () { switchView('today'); });

    // 日历
    $('#calPrev').addEventListener('click', function () { shiftMonth(-1); });
    $('#calNext').addEventListener('click', function () { shiftMonth(1); });
    $('#markBtn').addEventListener('click', toggleMark);

    $('#oppEntry').addEventListener('click', function () { switchView('opps'); });
    $('#oppBack').addEventListener('click', function () { switchView('more'); });
    $('#artBack').addEventListener('click', function () { switchView('feed'); });
    $('#oppAdd').addEventListener('click', addOppFromInput);
    $('#oppInput').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); addOppFromInput(); this.blur(); }
    });
    $('#chAdd').addEventListener('click', function () {
      var chs = state.goal.channels || [];
      if (chs.length >= 6) { toast('最多 6 条渠道', 'bad'); return; }
      chs.push({
        id: 'ch' + uid(), name: '新渠道',
        monthly: 0, color: CH_COLORS[chs.length % CH_COLORS.length]
      });
      save(); renderChEditor(); renderIncomeCh(); renderReview();
      toast('加了一条，改个名字', 'good');
    });

    $('#ideaSave').addEventListener('click', addIdea);
    $('#ideaInput').addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); addIdea(); }
    });
    $('#dayAddBtn').addEventListener('click', addDayTask);
    $('#dayAddInput').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); addDayTask(); this.blur(); }
    });
    $('#carryGo').addEventListener('click', function () {
      var y = $('#carryTip').dataset.date;
      if (!y) return;
      selectedDate = y;
      calCursor = y.slice(0, 7);
      switchView('year');
    });

    document.querySelectorAll('.tab').forEach(function (b) {
      b.addEventListener('click', function () { switchView(b.dataset.view); });
    });

    toastEl.addEventListener('click', undoDelete);

    $('#goalTargetInput').addEventListener('change', function () {
      var v = parseInt(this.value, 10);
      if (v > 0) { state.goal.target = v; renderGoal(); save(); }
    });
    $('#goalDeadlineInput').addEventListener('change', function () {
      if (this.value) { state.goal.deadline = this.value; renderGoal(); save(); }
    });
    $('#goalNowInput').addEventListener('change', function () {
      var v = parseFloat(this.value);
      if (!isNaN(v) && v >= 0) { state.goal.income = v; renderGoal(); save(); }
    });

    $('#remindTime').addEventListener('change', function () {
      state.settings.remindTime = this.value || '21:00'; save();
    });
    $('#remindSwitch').addEventListener('click', function () {
      var on = state.settings.remind;
      if (!on && window.Notification && Notification.permission !== 'granted') {
        Notification.requestPermission();
      }
      state.settings.remind = !on;
      this.setAttribute('aria-checked', state.settings.remind ? 'true' : 'false');
      save();
    });

    $('#checkBtn').addEventListener('click', dataCheck);
    $('#restorePrevBtn').addEventListener('click', restorePrev);
    $('#exportBtn').addEventListener('click', exportData);
    $('#importBtn').addEventListener('click', function () { $('#importFile').click(); });
    $('#importFile').addEventListener('change', function () {
      if (this.files && this.files[0]) importData(this.files[0]);
      this.value = '';
    });
    $('#resetBtn').addEventListener('click', function () {
      if (confirm('清空所有数据？目标、任务、历史全没了，且无法撤销。')) {
        state = blank();
        render(); renderSettings();
        toast('已清空', 'bad');
      }
    });
  }

  /* ---------- 启动 ---------- */
  function boot() {
    state = load();
    loadGamesCache();
    settle();
    var lv = grantLeave();
    bind();
    render();
    renderSettings();
    loadAI();
    fetchGames();

    if (lv && lv.capped && lv.added === 0) {
      setTimeout(function () {
        toast('请假条已满 ' + LEAVE_MAX + ' 张，本月新增不发放', 'bad');
      }, 600);
    }

    setInterval(tickRemind, 20000);

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) {
        settle();
        render();
      }
    });

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
