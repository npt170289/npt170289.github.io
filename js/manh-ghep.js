/* Mảnh ghép — tile-assembly reveal cho ảnh Spa Khải Hoàn (Nguyễn chốt 2026-11-26).
   Mỗi ảnh dựng lại từ 20 mảnh (5x4, mobile 4x3) bay vào từ lệch nhỏ + mờ dần,
   lệch nhau ~30ms, tổng ~1s, ease-out cubic. Chạy 1 lần khi ảnh vào viewport
   (IntersectionObserver, rootMargin 80px); ảnh đã trong khung hình thì chạy ngay.
   Không JS / không IntersectionObserver / prefers-reduced-motion → ảnh gốc
   <img> hiển thị bình thường. Không đổi file ảnh, không thêm chữ/nhãn. */
(function () {
  'use strict';

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!('IntersectionObserver' in window)) return;

  var COLS = 5, ROWS = 4;      /* desktop: 20 mảnh */
  var COLS_M = 4, ROWS_M = 3;  /* mobile (<=560px): 12 mảnh, nhẹ hơn */
  var STAGGER_MS = 30;         /* lệch nhau mỗi mảnh */

  function isMobile() { return window.matchMedia('(max-width: 560px)').matches; }
  function grid() {
    return isMobile() ? { cols: COLS_M, rows: ROWS_M } : { cols: COLS, rows: ROWS };
  }
  function rand(min, max) { return min + Math.random() * (max - min); }

  function shuffled(n) {
    var a = [], i, j, t;
    for (i = 0; i < n; i++) a.push(i);
    for (i = n - 1; i > 0; i--) { j = Math.floor(Math.random() * (i + 1)); t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      var st = entry.target._mg;
      if (!st) return;
      io.unobserve(entry.target);
      st.inView = true;
      playIfReady(st);
    });
  }, { rootMargin: '80px 0px' });

  /* Đặt vị trí + lát cắt background cho từng mảnh, khớp object-fit: cover của ảnh gốc. */
  function layoutTiles(st) {
    var wrap = st.wrap, img = st.img;
    var rect = wrap.getBoundingClientRect();
    var cw = rect.width, ch = rect.height;
    var nw = img.naturalWidth, nh = img.naturalHeight;
    if (!cw || !ch || !nw || !nh) return false;
    var scale = Math.max(cw / nw, ch / nh);
    var dw = nw * scale, dh = nh * scale;
    var ox = (cw - dw) / 2, oy = (ch - dh) / 2;
    var tiles = st.tilesEl.children;
    var k = 0;
    for (var r = 0; r < st.rows; r++) {
      for (var c = 0; c < st.cols; c++) {
        var tile = tiles[k++];
        if (!tile) return true;
        var left = (c * cw) / st.cols, top = (r * ch) / st.rows;
        tile.style.left = left + 'px';
        tile.style.top = top + 'px';
        tile.style.width = (cw / st.cols) + 'px';
        tile.style.height = (ch / st.rows) + 'px';
        tile.style.backgroundSize = dw + 'px ' + dh + 'px';
        tile.style.backgroundPosition = (ox - left) + 'px ' + (oy - top) + 'px';
      }
    }
    return true;
  }

  function buildTiles(st) {
    var g = grid();
    st.cols = g.cols; st.rows = g.rows;
    var src = st.img.currentSrc || st.img.src;
    var total = g.cols * g.rows;
    var order = shuffled(total);
    var frag = document.createDocumentFragment();
    for (var k = 0; k < total; k++) {
      var tile = document.createElement('div');
      tile.className = 'mg-tile';
      tile.style.backgroundImage = 'url("' + src + '")';
      tile.style.setProperty('--dx', ((Math.random() < 0.5 ? -1 : 1) * rand(10, 30)).toFixed(1) + 'px');
      tile.style.setProperty('--dy', ((Math.random() < 0.5 ? -1 : 1) * rand(10, 30)).toFixed(1) + 'px');
      tile.style.setProperty('--d', (order[k] * STAGGER_MS + rand(0, 12)).toFixed(0) + 'ms');
      frag.appendChild(tile);
    }
    st.tilesEl.innerHTML = '';
    st.tilesEl.appendChild(frag);
    return layoutTiles(st);
  }

  function playIfReady(st) {
    if (!st.built || !st.inView || st.played) return;
    st.played = true;
    void st.tilesEl.offsetWidth; /* ép trình duyệt nhận trạng thái đầu rồi mới chạy */
    st.tilesEl.classList.add('mg-play');
  }

  function setup(img) {
    var st = { img: img, built: false, played: false, inView: false, wrap: null, tilesEl: null, cols: 0, rows: 0 };
    function tryBuild() {
      if (st.built || !img.complete || !img.naturalWidth) return;
      var wrap = document.createElement('div');
      wrap.className = 'mg-wrap';
      img.parentNode.insertBefore(wrap, img);
      wrap.appendChild(img);
      img.classList.add('mg-src');
      var tilesEl = document.createElement('div');
      tilesEl.className = 'mg-tiles';
      tilesEl.setAttribute('aria-hidden', 'true');
      wrap.appendChild(tilesEl);
      st.wrap = wrap; st.tilesEl = tilesEl;
      wrap._mg = st;
      if (!buildTiles(st)) {
        /* Khung chưa đo được (hiếm) — thử lại sau 300ms, không thì trả ảnh gốc. */
        setTimeout(function () {
          if (st.built) return;
          if (buildTiles(st)) { st.built = true; io.observe(wrap); playIfReady(st); }
          else { tilesEl.remove(); img.classList.remove('mg-src'); wrap.replaceWith(img); }
        }, 300);
        return;
      }
      st.built = true;
      io.observe(wrap);
      playIfReady(st);
    }
    if (img.complete) tryBuild();
    else {
      img.addEventListener('load', tryBuild);
      img.addEventListener('error', function () { /* giữ ảnh gốc */ });
    }
    return st;
  }

  function init() {
    var states = [];
    var imgs = document.querySelectorAll('img[data-mg]');
    for (var i = 0; i < imgs.length; i++) states.push(setup(imgs[i]));
    /* Xoay màn hình / đổi cửa sổ: đo lại lát cắt, đổi số mảnh theo breakpoint. */
    var timer = null;
    window.addEventListener('resize', function () {
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () {
        states.forEach(function (st) {
          if (!st.built) return;
          var g = grid();
          if (g.cols !== st.cols || g.rows !== st.rows) {
            var wasPlayed = st.played;
            st.tilesEl.classList.remove('mg-play');
            buildTiles(st);
            if (wasPlayed) st.tilesEl.classList.add('mg-play'); /* cùng 1 frame, không chạy lại */
          } else {
            layoutTiles(st);
          }
        });
      }, 150);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
