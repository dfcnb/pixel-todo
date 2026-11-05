/* ============================================
   hero.js — 像素勇者
   20x20 字符网格，每格 7px，画在 140x140 canvas 上
   ============================================ */
(function () {
  var GRID = 20;
  var PX = 7;
  var canvas = document.getElementById('hero');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  /* 字符 → 颜色 */
  var C = {
    H: '#3d5a80', // 头巾
    J: '#2b4360', // 头巾暗部
    S: '#f0c49b', // 皮肤
    T: '#d19c72', // 皮肤暗部
    E: '#1a1a24', // 眼睛
    M: '#b5545a', // 嘴
    C: '#2a5f4a', // 披风
    D: '#1d4536', // 披风暗部
    B: '#3f6ec4', // 上衣
    N: '#2c4f92', // 上衣暗部
    R: '#d24b4e', // 腰带
    F: '#3b3228'  // 靴子
  };

  var BODY = [
    '....................',
    '.......HHHHHH.......',
    '......HHHHHHHH......',
    '.....HHHHHHHHHH.....',
    '.....HHSSSSSSHH.....',
    '.....SSSSSSSSSS.....',
    '.....SEESSSSEES.....',
    '.....SEESSSSEES.....',
    '.....SSSSSSSSSS.....',
    '......SSMMMMSS......',
    '....CCCCCCCCCCCC....',
    '...CCBBBBBBBBBBCC...',
    '...CBBBBBBBBBBBBC...',
    '...CBBBRRRRRRBBBC...',
    '....BBBBBBBBBBBB....',
    '....BBBBBBBBBBBB....',
    '....BBB......BBB....',
    '....BBB......BBB....',
    '....FFF......FFF....',
    '....................'
  ];

  /* 全部完成时：举手 + 头顶闪光 */
  var BODY_WIN = BODY.slice();
  BODY_WIN[11] = '..SCCBBBBBBBBBBCCS..';
  BODY_WIN[12] = '..SCBBBBBBBBBBBBCS..';
  BODY_WIN[13] = '..SCBBBRRRRRRBBBCS..';

  var hpRatio = 1;
  var win = false;
  var state = 'idle'; // idle | hurt
  var hurtUntil = 0;

  function drawSprite(rows, bob, dim) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 地面阴影
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.fillRect(3 * PX, 19 * PX + 3, 14 * PX, 3);

    for (var r = 0; r < rows.length; r++) {
      var line = rows[r];
      for (var c = 0; c < line.length; c++) {
        var ch = line[c];
        if (ch === '.') continue;
        var col = C[ch];
        if (!col) continue;
        ctx.fillStyle = col;
        ctx.fillRect(c * PX, (r + bob) * PX, PX, PX);
      }
    }

    // 低血量：整体压暗泛红
    if (dim > 0) {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = 'rgba(160,20,25,' + (0.42 * dim) + ')';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  function drawWinStars(t) {
    // 头顶三颗跳动的小星
    var stars = [[7, 0], [10, -1], [13, 0]];
    for (var i = 0; i < stars.length; i++) {
      var on = (Math.floor(t / 220) + i) % 3 !== 0;
      if (!on) continue;
      ctx.fillStyle = i === 1 ? '#ffe27a' : '#ffc53d';
      ctx.fillRect(stars[i][0] * PX, (1 + stars[i][1]) * PX, PX, PX);
      ctx.fillRect((stars[i][0] - 0.4) * PX, (1.6 + stars[i][1]) * PX, PX * 0.8, PX * 0.8);
    }
  }

  function loop(ts) {
    var bob = Math.floor(ts / 820) % 2; // 呼吸
    var now = Date.now();
    var hurting = now < hurtUntil;

    if (hurting) {
      bob = Math.floor(ts / 60) % 2 ? 1 : 0; // 抖动
      ctx.save();
      ctx.translate(Math.floor(ts / 60) % 2 ? 2 : -2, 0);
    }

    var dim = hpRatio < 0.3 ? (1 - hpRatio / 0.3) : 0;
    drawSprite(win ? BODY_WIN : BODY, bob, dim);
    if (win) drawWinStars(ts);

    if (hurting) ctx.restore();

    requestAnimationFrame(loop);
  }

  window.Hero = {
    set: function (opts) {
      if (typeof opts.hp === 'number') hpRatio = Math.max(0, Math.min(1, opts.hp));
      if (typeof opts.win === 'boolean') win = opts.win;
    },
    hurt: function () {
      hurtUntil = Date.now() + 420;
      canvas.classList.remove('hurt');
      void canvas.offsetWidth;
      canvas.classList.add('hurt');
    },
    cheer: function () {
      canvas.classList.remove('hit');
      void canvas.offsetWidth;
      canvas.classList.add('hit');
    }
  };

  requestAnimationFrame(loop);
})();
