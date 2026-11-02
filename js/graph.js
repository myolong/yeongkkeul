// 작은 게임: 집값 그래프 타기
// 오르내리는 그래프 선 위를 달리며 탭으로 점프, 동전은 수익 +, 폭락 구멍은 수익 -
(() => {
  const STEP = 18;          // 그래프 점 간격(px)
  const SPEED = 130;        // 스크롤 속도(px/s)
  const GRAVITY = 1500;
  const JUMP = -560;

  function start(opts, onDone) {
    const wrap = document.getElementById('graph');
    const canvas = document.getElementById('graph-canvas');
    const ctx = canvas.getContext('2d');
    const info = document.getElementById('graph-info');
    const overlay = document.getElementById('graph-overlay');
    wrap.classList.remove('hidden');

    const dpr = window.devicePixelRatio || 1;
    const W = Math.max(260, Math.min(window.innerWidth - 64, 388));
    const H = Math.round(W * 0.75);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const bias = opts.bias || 0;               // 시장 분위기(+ 상승장, - 하락장)
    const gapChance = 0.035 - bias * 1.2;      // 하락장일수록 구멍 많음
    const coinChance = 0.09 + bias * 2;        // 상승장일수록 동전 많음
    const px = Math.round(W * 0.25);

    // 그래프 점: {y, gap}
    let pts = [];
    let offset = 0;  // 스크롤된 거리
    let lastY = H * 0.6;
    let gapLeft = 0;
    let sinceGap = 0;
    const coins = []; // {x(월드), y}

    function genPoint(i) {
      let gap = false;
      if (gapLeft > 0) { gap = true; gapLeft--; }
      else if (i > 25 && sinceGap > 14 && Math.random() < gapChance) { gapLeft = 3 + Math.floor(Math.random() * 2); gap = true; }
      sinceGap = gap ? 0 : sinceGap + 1;
      const trend = -bias * 120; // 상승장이면 위로(-y)
      lastY += (Math.random() - 0.5) * 26 + trend * 0.1;
      lastY = Math.max(H * 0.28, Math.min(H * 0.88, lastY));
      if (!gap && i > 10 && Math.random() < coinChance) coins.push({ x: i * STEP, y: lastY - 40 - Math.random() * 40, got: false });
      return { y: lastY, gap };
    }
    for (let i = 0; i < Math.ceil(W / STEP) + 4; i++) pts.push(genPoint(i));

    function lineAt(worldX) {
      const i = Math.floor(worldX / STEP);
      while (pts.length < i + 3) pts.push(genPoint(pts.length));
      const a = pts[i];
      const b = pts[i + 1];
      if (!a || !b) return { y: H, gap: true };
      const t = (worldX - i * STEP) / STEP;
      return { y: a.y + (b.y - a.y) * t, gap: a.gap || b.gap };
    }

    let ret = 1.0;            // 수익 배율
    let y = lineAt(px).y;
    let vy = 0;
    let onGround = true;
    let safe = 0;             // 떨어진 뒤 무적 시간
    let flash = 0;
    let timeLeft = opts.seconds || 25;
    let running = false;
    let last = 0;
    let prevLineY = y;
    let raf = 0;

    function jump(e) {
      if (e) e.preventDefault();
      if (!running) { begin(); return; }
      if (onGround) { vy = JUMP; onGround = false; }
    }

    function begin() {
      overlay.classList.add('hidden');
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(loop);
    }

    function loop(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      timeLeft -= dt;
      offset += SPEED * dt;
      const wx = offset + px;
      const ln = lineAt(wx);

      // 그래프를 타는 동안 집값 움직임이 수익에 반영
      if (onGround && !ln.gap) ret += ((prevLineY - ln.y) / H) * 0.35;
      prevLineY = ln.y;

      vy += GRAVITY * dt;
      y += vy * dt;
      const groundOk = !ln.gap || safe > 0;
      if (groundOk && y >= ln.y && vy >= 0) { y = ln.y; vy = 0; onGround = true; }
      else if (y < ln.y - 2) onGround = false;

      if (y > H + 30) {
        ret -= 0.15;
        flash = 0.4;
        safe = 1.0;
        y = Math.min(ln.y, H * 0.5) - 80;
        vy = 0;
      }
      safe = Math.max(0, safe - dt);
      flash = Math.max(0, flash - dt);

      coins.forEach((c) => {
        if (!c.got && Math.abs(c.x - wx) < 16 && Math.abs(c.y - (y - 14)) < 22) { c.got = true; ret += 0.05; }
      });
      ret = Math.max(0.3, ret);

      draw(wx);
      info.textContent = `⏱ ${Math.max(0, timeLeft).toFixed(1)}초 · 수익률 ×${Math.min(2, Math.max(0.5, ret)).toFixed(2)}`;
      if (timeLeft <= 0) return finish();
      raf = requestAnimationFrame(loop);
    }

    function draw(wx) {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = flash > 0 ? '#ffe5e5' : '#f7f9fc';
      ctx.fillRect(0, 0, W, H);
      // 눈금
      ctx.strokeStyle = '#e3e8ef';
      ctx.lineWidth = 1;
      for (let gy = H * 0.2; gy < H; gy += H * 0.2) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke(); }

      // 그래프 선
      const first = Math.floor(offset / STEP);
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      for (let i = first; i < first + Math.ceil(W / STEP) + 2; i++) {
        lineAt(i * STEP + STEP);
        const a = pts[i], b = pts[i + 1];
        if (!a || !b || a.gap || b.gap) continue;
        ctx.strokeStyle = b.y <= a.y ? '#e53935' : '#1e88e5'; // 오름 빨강, 내림 파랑
        ctx.beginPath();
        ctx.moveTo(i * STEP - offset, a.y);
        ctx.lineTo((i + 1) * STEP - offset, b.y);
        ctx.stroke();
      }
      // 구멍 표시
      ctx.fillStyle = '#90a4ae';
      ctx.font = '12px sans-serif';
      for (let i = first; i < first + Math.ceil(W / STEP) + 2; i++) {
        const a = pts[i];
        if (a && a.gap && pts[i - 1] && !pts[i - 1].gap) ctx.fillText('폭락!', i * STEP - offset, H - 8);
      }
      // 동전
      ctx.font = '20px sans-serif';
      ctx.textAlign = 'center';
      coins.forEach((c) => {
        const sx = c.x - offset;
        if (!c.got && sx > -20 && sx < W + 20) ctx.fillText('🪙', sx, c.y + 7);
      });
      // 캐릭터
      ctx.font = '26px sans-serif';
      ctx.globalAlpha = safe > 0 && Math.floor(safe * 10) % 2 ? 0.4 : 1;
      ctx.fillText('🏃', px, y - 4);
      ctx.globalAlpha = 1;
      ctx.textAlign = 'left';
    }

    function finish() {
      running = false;
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown', jump);
      wrap.classList.add('hidden');
      overlay.classList.remove('hidden');
      onDone(Math.min(2, Math.max(0.5, ret)));
    }

    canvas.addEventListener('pointerdown', jump);
    overlay.onclick = () => begin();
    overlay.classList.remove('hidden');
    draw(px);
    info.textContent = `⏱ ${timeLeft.toFixed(1)}초 · 수익률 ×1.00`;
  }

  window.GraphRide = { start };
})();
