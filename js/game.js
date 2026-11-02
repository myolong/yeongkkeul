// 영끌말판 메인 로직
(() => {
  const SAVE_KEY = 'yeongkkeul-save-v1';
  const BEST_KEY = 'yeongkkeul-best-v1';
  const $ = (s) => document.querySelector(s);

  let S = null; // 게임 상태

  // ---------- 유틸 ----------
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function won(v) {
    const neg = v < 0;
    let a = Math.round(Math.abs(v));
    const eok = Math.floor(a / 10000);
    const man = a % 10000;
    let s = '';
    if (eok) s += eok + '억';
    if (man || !eok) s += (eok ? ' ' : '') + man.toLocaleString() + '만';
    return (neg ? '-' : '') + s + '원';
  }

  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) {}
  }
  function load() {
    try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { return null; }
  }
  function clearSave() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
  }
  function getBest() {
    try { return JSON.parse(localStorage.getItem(BEST_KEY)); } catch (e) { return null; }
  }
  function setBest(v) {
    try { localStorage.setItem(BEST_KEY, JSON.stringify(v)); } catch (e) {}
  }

  // ---------- 상태 계산 ----------
  const region = () => REGIONS[S.region];
  const has = (f) => S.home && S.home.f.includes(f);
  const age = () => Math.floor(S.quarter / 4) + 28;
  const quarterOfYear = () => (S.quarter % 4) + 1;

  function featureMult(f) {
    return 1 + f.reduce((sum, k) => sum + FEATURES[k].pct, 0);
  }
  function priceOf(ri, size, f) {
    const r = REGIONS[ri];
    const base = size === 84 ? r.price84 : r.price59;
    return Math.round(base * featureMult(f) * S.idx[ri]);
  }
  function rate() {
    return S.effects.reduce((r, e) => r + (e.rate || 0), BASE_RATE);
  }
  function ltv() {
    let v = BASE_LTV;
    S.effects.forEach((e) => { if (e.ltv) v = e.ltv; });
    return v;
  }
  function marketDrift() {
    return S.effects.reduce((d, e) => d + (e.drift || 0), 0);
  }
  function salary() {
    let s = region().salary * S.salaryMult;
    if (S.effects.some((e) => e.key === 'layoff')) s *= 0.5;
    return Math.round(s);
  }
  function equity() {
    const homeVal = S.home ? S.home.value : 0;
    return S.cash + homeVal - S.loan - S.credit;
  }
  function creditLimit() {
    const homeEq = S.home ? Math.max(0, S.home.value - S.loan) : 0;
    return Math.round(region().salary * S.salaryMult * 6 + homeEq * 0.15);
  }

  // ---------- 새 게임 ----------
  function buildBoard(ri) {
    const n = REGIONS[ri].squares;
    const w = TILE_WEIGHTS[ri];
    const bag = [];
    Object.keys(w).forEach((k) => { for (let i = 0; i < w[k]; i++) bag.push(k); });
    const tiles = ['start'];
    let last = '';
    for (let i = 1; i < n; i++) {
      let t;
      let tries = 0;
      do { t = pick(bag); tries++; } while (t === last && tries < 5);
      tiles.push(t);
      last = t;
    }
    tiles.push('finish');
    return tiles;
  }

  function newGame() {
    S = {
      quarter: 0,
      region: 0,
      pos: 0,
      board: buildBoard(0),
      cash: 6000,
      loan: 0,
      credit: 0,
      health: 80,
      family: 70,
      salaryMult: 1,
      home: null, // {ri, name, f, size, value, paid}
      renting: true,
      idx: [1, 1, 1, 1],
      effects: [],
      pendingTax: null,
      subscription: false,
      log: [],
      over: false,
      won: false,
    };
    addLog('스물여덟, 지방에서 영끌 인생을 시작합니다. 모은 돈 6,000만원.');
    save();
    render();
    showStartChoice();
  }

  function addLog(text) {
    S.log.unshift(`${age()}세 ${quarterOfYear()}분기 · ${text}`);
    S.log = S.log.slice(0, 30);
  }

  // ---------- 모달 ----------
  function modal({ title, body, buttons }) {
    const m = $('#modal');
    $('#modal-title').textContent = title;
    $('#modal-body').innerHTML = body;
    const box = $('#modal-buttons');
    box.innerHTML = '';
    (buttons || [{ label: '확인' }]).forEach((b) => {
      const el = document.createElement('button');
      el.className = 'btn ' + (b.cls || '');
      el.innerHTML = b.label;
      if (b.disabled) el.disabled = true;
      el.onclick = () => {
        m.classList.add('hidden');
        if (b.onClick) b.onClick();
        else afterAction();
      };
      box.appendChild(el);
    });
    m.classList.remove('hidden');
  }

  function afterAction() {
    S.health = clamp(S.health, 0, 100);
    S.family = clamp(S.family, 0, 100);
    checkEnd();
    save();
    render();
  }

  // ---------- 집 고르기 ----------
  function complexOptions(ri) {
    const opts = [];
    COMPLEXES[ri].forEach((c) => {
      [59, 84].forEach((size) => {
        opts.push({ ri, name: c.name, f: c.f, size, price: priceOf(ri, size, c.f) });
      });
    });
    return opts;
  }

  function featureTags(f) {
    return f.map((k) => `<span class="tag ${k === 'none' ? 'tag-none' : ''}">${FEATURES[k].label}</span>`).join('');
  }

  function moveCost(price) {
    return Math.round(price * 0.01);
  }

  // 이 집을 살 때 필요한 내 돈
  function needOwn(price) {
    let p = price;
    if (S.subscription) p = Math.round(p * 0.9);
    return { price: p, need: Math.round(p * (1 - ltv())) + moveCost(p) };
  }

  function complexListHtml(ri, onlyBest) {
    const eq = equity();
    let opts = complexOptions(ri);
    if (onlyBest) opts = opts.filter((o) => o.size === 84);
    return opts.map((o, i) => {
      const n = needOwn(o.price);
      const ok = eq >= n.need;
      return `<button class="complex ${ok ? '' : 'locked'}" data-i="${i}" ${ok ? '' : 'disabled'}>
        <div class="cx-top"><b>${o.name}</b> <span class="size">${o.size}㎡</span></div>
        <div class="cx-tags">${featureTags(o.f)}</div>
        <div class="cx-price">집값 ${won(n.price)} · 필요한 내 돈 <b>${won(n.need)}</b></div>
      </button>`;
    }).join('');
  }

  function buyHome(o) {
    const n = needOwn(o.price);
    // 지금 집 팔기
    if (S.home) {
      S.cash += S.home.value;
      addLog(`${S.home.name} ${S.home.size}㎡를 ${won(S.home.value)}에 팔았어요.`);
    }
    S.cash -= S.loan;
    S.loan = 0;
    // 신용대출 먼저 정리
    const repay = Math.min(S.credit, Math.max(0, S.cash));
    S.cash -= repay;
    S.credit -= repay;
    const mc = moveCost(n.price);
    // 내 돈에서 여윳돈 500만원은 남기고, 나머지는 대출
    const required = n.need;
    const reserve = clamp(S.cash - required, 0, 500);
    const useOwn = S.cash - reserve;
    S.loan = Math.max(0, n.price + mc - useOwn);
    S.cash = reserve + Math.max(0, useOwn - (n.price + mc - S.loan));
    S.home = { ri: o.ri, name: o.name, f: o.f, size: o.size, value: n.price };
    S.renting = false;
    if (S.subscription) {
      addLog('청약 당첨 혜택으로 10% 싸게 샀어요!');
      S.subscription = false;
    }
    addLog(`${o.name} ${o.size}㎡ 매수! 집값 ${won(n.price)}, 대출 ${won(S.loan)}.`);
  }

  function showStartChoice() {
    const body = `<p>지방(청주시 시세 기준)에서 시작해요. 영끌해서 집을 살까요, 원룸 월세로 버틸까요?</p>
      <p class="small">대출은 집값의 ${Math.round(ltv() * 100)}%까지 가능해요. 집을 사면 집값이 오르내리고, 원룸은 매 분기 월세 ${won(RENT_COST)}가 나가요.</p>
      <div class="complex-list">${complexListHtml(0)}</div>`;
    modal({
      title: '첫 집 고르기',
      body,
      buttons: [{ label: '원룸 월세로 버티기', cls: 'ghost', onClick: () => { addLog('원룸 월세로 시작합니다.'); afterAction(); } }],
    });
    bindComplexButtons(0, false, (o) => { buyHome(o); afterAction(); });
  }

  function bindComplexButtons(ri, onlyBest, cb) {
    let opts = complexOptions(ri);
    if (onlyBest) opts = opts.filter((o) => o.size === 84);
    document.querySelectorAll('#modal-body .complex').forEach((el) => {
      el.onclick = () => {
        $('#modal').classList.add('hidden');
        cb(opts[Number(el.dataset.i)]);
      };
    });
  }

  // ---------- 턴 진행 ----------
  let busy = false;

  function roll(overtime) {
    if (busy || S.over) return;
    busy = true;
    const dice = overtime ? [randInt(1, 6), randInt(1, 6)] : [randInt(1, 6)];
    const total = dice.reduce((a, b) => a + b, 0);
    animateDice(dice, () => {
      startOfTurn(overtime);
      if (S.over) { busy = false; afterAction(); return; }
      moveToken(total, () => {
        busy = false;
        landOn(S.board[S.pos]);
      });
    });
  }

  function startOfTurn(overtime) {
    S.quarter++;
    let income = salary();
    if (overtime) {
      income = Math.round(income * 1.3);
      S.health -= 6;
      S.family -= 5;
    }
    let cost = region().living;
    if (S.renting) cost += RENT_COST;
    const interest = Math.round((S.loan * rate() + S.credit * (rate() + 0.03)) / 4);
    let tax = 0;
    if (S.home && S.effects.some((e) => e.key === 'holdtax')) {
      const e = S.effects.find((x) => x.key === 'holdtax');
      tax = Math.round(S.home.value * 0.0015 * (e.half ? 0.5 : 1));
    }
    S.cash += income - cost - interest - tax;

    // 체력·가족
    S.health += 1; // 자연 회복
    if (!has('subway')) S.health -= region().commute;
    if (has('school')) S.family += 1;
    if (S.home && S.home.size === 84) S.family += 1;
    if (S.renting) S.family -= 1;

    // 집값 변동 (모든 지역)
    const md = marketDrift();
    for (let i = 0; i < 4; i++) {
      const ch = REGIONS[i].drift + md + rand(-0.02, 0.02);
      S.idx[i] *= 1 + ch;
      if (S.home && S.home.ri === i) {
        let own = ch;
        if (own < 0 && has('big')) own *= 0.6;
        if (own > 0 && has('none')) own *= 0.7;
        S.home.value = Math.round(S.home.value * (1 + own));
      }
    }

    // 뉴스 효과 기간 줄이기
    S.effects.forEach((e) => e.turns--);
    const ended = S.effects.filter((e) => e.turns <= 0);
    S.effects = S.effects.filter((e) => e.turns > 0);
    ended.forEach((e) => addLog(`'${e.label}' 효과가 끝났어요.`));

    // 세법개정안 → 확정 판정
    if (S.pendingTax) {
      S.pendingTax.turns--;
      if (S.pendingTax.turns <= 0) {
        const prepared = S.pendingTax.prepared;
        S.pendingTax = null;
        if (Math.random() < 0.6) {
          addEffect({ key: 'holdtax', label: '세법개정 확정: 보유세 강화', turns: 6, drift: -0.004, half: prepared });
          queueNotice('📰 세법개정 확정!', `발표됐던 보유세 강화안이 확정됐어요. 6분기 동안 집을 가진 사람은 매 분기 보유세를 더 내요.${prepared ? ' 미리 대비해서 부담이 절반이에요.' : ''}`);
        } else {
          queueNotice('📰 세법개정안 무산', '국회 논의 끝에 보유세 강화안이 무산됐어요. 휴, 다행이에요.');
        }
      }
    }

    settleCash();
    S.health = clamp(S.health, 0, 100);
    S.family = clamp(S.family, 0, 100);
    if (overtime) addLog(`야근 모드! 월급 ${won(income)}.`);
  }

  function settleCash() {
    if (S.cash < 0) {
      S.credit += -S.cash;
      S.cash = 0;
    } else if (S.credit > 0) {
      const r = Math.min(S.credit, S.cash);
      S.credit -= r;
      S.cash -= r;
    }
  }

  let notices = [];
  function queueNotice(title, body) { notices.push({ title, body }); }

  function addEffect(e) {
    S.effects = S.effects.filter((x) => x.key !== e.key && !(e.group && x.group === e.group));
    S.effects.push(e);
  }

  function moveToken(steps, done) {
    const n = S.board.length - 1; // finish 인덱스
    let left = steps;
    const step = () => {
      if (left <= 0 || S.pos >= n) { done(); return; }
      S.pos++;
      left--;
      renderBoard();
      setTimeout(step, 160);
    };
    step();
  }

  // ---------- 칸 효과 ----------
  function landOn(type) {
    const queued = notices.slice();
    notices = [];
    const run = () => {
      switch (type) {
        case 'pay': return tilePay();
        case 'good': return (S.family < 30 && Math.random() < 0.3) ? tileBad(true) : tileGood();
        case 'bad': return tileBad();
        case 'news': return tileNews();
        case 'invest': return tileInvest();
        case 'fork': return tileFork();
        case 'rest': return tileRest();
        case 'finish': return tileFinish();
        default: return afterAction();
      }
    };
    showQueue(queued, run);
  }

  function showQueue(list, then) {
    if (!list.length) { save(); render(); then(); return; }
    const n = list.shift();
    modal({ title: n.title, body: `<p>${n.body}</p>`, buttons: [{ label: '확인', onClick: () => showQueue(list, then) }] });
  }

  function tilePay() {
    const b = salary();
    S.cash += b;
    settleCash();
    addLog(`월급날 보너스 ${won(b)}!`);
    modal({ title: '💰 월급날', body: `<p>분기 보너스로 <b>${won(b)}</b>을 받았어요.</p>` });
  }

  const GOOD = [
    { t: '승진!', w: 3, run: () => { S.salaryMult *= 1.1; return '월급이 10% 영구히 올랐어요.'; } },
    { t: '중고거래 대박', w: 2, run: () => { S.cash += 300; return `안 쓰던 물건을 팔아 ${won(300)}을 벌었어요.`; } },
    { t: '부모님 용돈', w: 2, run: () => { S.cash += 500; S.family += 5; return `명절에 ${won(500)}을 받았어요. 가족 만족도 +5`; } },
    { t: '개발 호재 발표', w: 3, run: () => {
      if (!S.home) { S.family -= 3; return '옆 동네에 지하철역이 생긴대요. 내 집이 없어서 배만 아파요. 가족 만족도 -3'; }
      const p = has('subway') ? 0.16 : 0.08;
      const gain = Math.round(S.home.value * p);
      S.home.value += gain;
      return `우리 동네에 새 지하철역 계획이 발표됐어요! 집값 +${Math.round(p * 100)}% (${won(gain)})`;
    } },
    { t: '청약 당첨!', w: 1, cond: () => S.region < 3 && !S.subscription, run: () => { S.subscription = true; return '다음 이사 심사 때 집을 10% 싸게 살 수 있어요.'; } },
    { t: '건강검진 이상 없음', w: 1, run: () => { S.health += 10; return '몸 상태가 좋아요. 건강 +10'; } },
  ];

  const BAD = [
    { t: '갑작스런 병원비', w: 3, run: () => { S.cash -= 400; S.health += 5; return `입원 치료로 ${won(400)}이 나갔어요.`; } },
    { t: '회사 구조조정', w: 2, run: () => { addEffect({ key: 'layoff', label: '구조조정: 월급 절반', turns: 2 }); return '2분기 동안 월급이 절반이에요.'; } },
    { t: '차 수리비', w: 2, run: () => { S.cash -= 250; return `차가 고장 나서 ${won(250)}이 나갔어요.`; } },
    { t: '경조사 시즌', w: 2, run: () => { S.cash -= 200; return `결혼식이 몰려서 축의금 ${won(200)}.`; } },
    { t: '업무 폭탄', w: 2, run: () => { S.health -= 15; return '일이 너무 많아요. 건강 -15'; } },
    { t: '집주인 연락', w: 2, cond: () => S.renting, run: () => { S.cash -= 300; S.family -= 5; return `집주인이 방을 뺀대요. 이사비 ${won(300)}, 가족 만족도 -5`; } },
    { t: '윗집 누수', w: 2, cond: () => !S.renting, run: () => { S.cash -= 200; S.family -= 3; return `천장에서 물이 새요. 수리비 ${won(200)}, 가족 만족도 -3`; } },
    { t: '가족 다툼', w: 1, run: () => { S.family -= 10; return '집 문제로 크게 다퉜어요. 가족 만족도 -10'; } },
  ];

  function weighted(list) {
    const ok = list.filter((x) => !x.cond || x.cond());
    const total = ok.reduce((a, b) => a + b.w, 0);
    let r = Math.random() * total;
    for (const x of ok) { r -= x.w; if (r <= 0) return x; }
    return ok[0];
  }

  function tileGood() {
    const e = weighted(GOOD);
    const msg = e.run();
    settleCash();
    addLog(`🍀 ${e.t}`);
    modal({ title: `🍀 ${e.t}`, body: `<p>${msg}</p>` });
  }

  function tileBad(flipped) {
    const e = weighted(BAD);
    const msg = e.run();
    settleCash();
    addLog(`⚡ ${e.t}`);
    modal({ title: `⚡ ${e.t}`, body: `${flipped ? '<p class="small">가족 만족도가 낮아서 좋은 일이 나쁜 일로 바뀌었어요.</p>' : ''}<p>${msg}</p>` });
  }

  function tileNews() {
    const opts = [
      { w: 3, run: newsRateUp },
      { w: 2, run: newsRateDown },
      { w: 2, cond: () => !S.pendingTax && !S.effects.some((e) => e.key === 'holdtax'), run: newsTaxBill },
      { w: 2, run: newsElection },
      { w: 1, run: newsSupply },
    ];
    weighted(opts).run();
  }

  function newsRateUp() {
    addEffect({ key: 'rateup', group: 'rate', label: '대출금리 상승', turns: 4, rate: 0.015, drift: -0.02 });
    addLog('📰 대출금리 상승');
    modal({ title: '📰 대출금리 상승', body: '<p>4분기 동안 대출금리가 1.5%p 오르고 집값이 약세예요.</p>' });
  }
  function newsRateDown() {
    addEffect({ key: 'ratedown', group: 'rate', label: '대출금리 인하', turns: 4, rate: -0.01, drift: 0.015 });
    addLog('📰 대출금리 인하');
    modal({ title: '📰 대출금리 인하', body: '<p>4분기 동안 대출금리가 1%p 내리고 집값이 강세예요.</p>' });
  }
  function newsSupply() {
    addEffect({ key: 'supply', label: '대규모 공급 발표', turns: 4, drift: -0.01 });
    addLog('📰 대규모 공급 발표');
    modal({ title: '📰 대규모 공급 발표', body: '<p>새 아파트를 많이 짓는대요. 4분기 동안 집값이 조금 약세예요.</p>' });
  }
  function newsTaxBill() {
    addLog('📰 세법개정안 발표');
    modal({
      title: '📰 세법개정안 발표',
      body: '<p>"보유세 강화안"이 발표됐어요. 3분기 뒤 확정될지 결정돼요. 확정되면 집을 가진 사람은 6분기 동안 보유세를 더 내요.</p><p class="small">미리 대비하면 지금 비용이 들지만, 확정돼도 부담이 절반이에요.</p>',
      buttons: [
        { label: `미리 대비하기 (-${won(300)})`, onClick: () => { S.cash -= 300; settleCash(); S.pendingTax = { turns: 3, prepared: true }; afterAction(); } },
        { label: '그냥 버티기', cls: 'ghost', onClick: () => { S.pendingTax = { turns: 3, prepared: false }; afterAction(); } },
      ],
    });
  }
  function newsElection() {
    const strict = Math.random() < 0.5;
    if (strict) {
      addEffect({ key: 'strict', group: 'policy', label: '선거 후 규제 강화', turns: 8, ltv: 0.6, drift: -0.01 });
    } else {
      addEffect({ key: 'loose', group: 'policy', label: '선거 후 규제 완화', turns: 8, ltv: 0.85, drift: 0.015 });
    }
    addLog(`📰 대통령선거: 규제 ${strict ? '강화' : '완화'}`);
    modal({
      title: '📰 대통령선거',
      body: `<p>선거 시즌이 끝나고 새 부동산 정책이 나왔어요.</p><p><b>${strict ? '규제 강화' : '규제 완화'}</b>: 8분기 동안 대출 한도가 집값의 ${strict ? 60 : 85}%로 바뀌고 집값이 ${strict ? '약세' : '강세'}예요.</p>`,
    });
  }

  const FORKS = [
    { t: '이직 제안', q: '연봉을 20% 더 주는 회사에서 연락이 왔어요. 대신 일이 훨씬 많대요.',
      a: { label: '이직한다 (월급 +20%, 건강 -10)', run: () => { S.salaryMult *= 1.2; S.health -= 10; } },
      b: { label: '남는다 (가족 만족도 +5)', run: () => { S.family += 5; } } },
    { t: '친구의 주식 권유', q: '친구가 "이건 무조건 오른다"며 1,000만원 투자를 권해요.',
      a: { label: '투자한다 (반반 확률)', run: () => {
        if (Math.random() < 0.5) { S.cash += 1000; return '대박! 1,000만원을 벌었어요.'; }
        S.cash -= 500; return '쪽박… 500만원을 잃었어요.';
      } },
      b: { label: '거절한다', run: () => {} } },
    { t: '차 바꾸기', q: '가족들이 새 차를 원해요.',
      a: { label: `바꾼다 (-${won(1500)}, 가족 +10)`, run: () => { S.cash -= 1500; S.family += 10; } },
      b: { label: '참는다 (가족 -3)', run: () => { S.family -= 3; } } },
    { t: '해외여행', q: '휴가철이에요. 가족과 해외여행을 갈까요?',
      a: { label: `간다 (-${won(400)}, 건강·가족 +15)`, run: () => { S.cash -= 400; S.health += 15; S.family += 15; } },
      b: { label: '집에서 쉰다 (건강 +5)', run: () => { S.health += 5; } } },
    { t: '자격증 공부', q: '퇴근 후 자격증 공부를 해볼까요?',
      a: { label: '한다 (건강 -8, 월급 +5%)', run: () => { S.health -= 8; S.salaryMult *= 1.05; } },
      b: { label: '안 한다', run: () => {} } },
  ];

  function tileFork() {
    const f = pick(FORKS);
    const choose = (opt) => () => {
      const msg = opt.run();
      settleCash();
      addLog(`🔀 ${f.t}: ${opt.label.split(' (')[0]}`);
      if (msg) modal({ title: `🔀 ${f.t}`, body: `<p>${msg}</p>` });
      else afterAction();
    };
    modal({ title: `🔀 ${f.t}`, body: `<p>${f.q}</p>`, buttons: [
      { label: f.a.label, onClick: choose(f.a) },
      { label: f.b.label, cls: 'ghost', onClick: choose(f.b) },
    ] });
  }

  function tileRest() {
    const m = has('mall') ? 2 : 1;
    S.health += 15 * m;
    S.family += 10 * m;
    S.cash -= 100;
    settleCash();
    addLog('☕ 휴식');
    modal({ title: '☕ 휴식', body: `<p>주말에 푹 쉬었어요. 건강 +${15 * m}, 가족 만족도 +${10 * m}, 비용 ${won(100)}${m > 1 ? '<br><span class="small">상가 근처라 효과 2배!</span>' : ''}</p>` });
  }

  function tileInvest() {
    const pcts = [0.1, 0.3, 0.5];
    const md = marketDrift();
    const mood = md > 0.005 ? '지금은 상승장이에요 📈' : md < -0.005 ? '지금은 하락장이에요 📉' : '시장은 보합이에요';
    const btns = pcts.map((p) => {
      const stake = Math.round(S.cash * p);
      return { label: `${Math.round(p * 100)}% 투자 (${won(stake)})`, disabled: stake < 10, onClick: () => runGraph(stake, md) };
    });
    btns.push({ label: '건너뛰기', cls: 'ghost' });
    modal({ title: '📈 투자 기회', body: `<p>집값 그래프를 타고 달려요. 화면을 누르면 점프! 동전을 모으고 폭락 구멍을 피하세요.</p><p class="small">${mood}. 결과에 따라 투자금이 0.5배~2배가 돼요.</p>`, buttons: btns });
  }

  function runGraph(stake, md) {
    S.cash -= stake;
    save();
    window.GraphRide.start({ bias: md, seconds: 25 }, (mult) => {
      const back = Math.round(stake * mult);
      S.cash += back;
      settleCash();
      const diff = back - stake;
      addLog(`📈 투자 결과 ×${mult.toFixed(2)} (${diff >= 0 ? '+' : ''}${won(diff)})`);
      modal({ title: '📈 투자 결과', body: `<p>수익률 <b>×${mult.toFixed(2)}</b></p><p>${won(stake)} → <b>${won(back)}</b></p>` });
    });
  }

  // ---------- 이사 심사 ----------
  function tileFinish() {
    const last = S.region === 3;
    const ri = last ? 3 : S.region + 1;
    const eq = equity();
    const ownBest = last && S.home && S.home.ri === 3 && S.home.size === 84;
    if (ownBest) return winGame();
    const title = last ? '🏁 최종 심사: 강남 84㎡' : `🏁 이사 심사: ${REGIONS[ri].name}로!`;
    const body = `<p>내 순자산(현금+집값-대출) <b>${won(eq)}</b> · 대출 한도 ${Math.round(ltv() * 100)}%</p>
      ${S.subscription ? '<p class="small">청약 당첨 혜택: 10% 할인 적용</p>' : ''}
      <p class="small">${REGIONS[ri].name} 기준 시세: ${REGIONS[ri].ref} 실거래가 평균</p>
      <div class="complex-list">${complexListHtml(ri, last)}</div>`;
    modal({
      title,
      body,
      buttons: [{ label: '돈이 부족해요… 한 바퀴 더', cls: 'ghost', onClick: () => {
        addLog('이사 심사 탈락. 같은 동네에서 한 바퀴 더.');
        S.pos = 0;
        afterAction();
      } }],
    });
    bindComplexButtons(ri, last, (o) => {
      buyHome(o);
      if (last) return winGame();
      S.region = ri;
      S.pos = 0;
      S.board = buildBoard(ri);
      addLog(`${REGIONS[ri].name}로 이사했어요!`);
      afterAction();
      modal({ title: `🚚 ${REGIONS[ri].name} 입성!`, body: `<p>${o.name} ${o.size}㎡로 이사했어요. 새 말판이 시작돼요.</p>${ri === 3 ? '<p>마지막 목표: 강남 84㎡! 이 말판 끝에서 강남 84㎡를 사면 성공이에요.</p>' : ''}` });
    });
  }

  function winGame() {
    S.over = true;
    S.won = true;
    const a = age();
    const q = quarterOfYear();
    addLog('🎉 강남 84㎡ 입성!');
    const best = getBest();
    const score = S.quarter;
    const isBest = !best || score < best.quarter;
    if (isBest) setBest({ quarter: score, age: a, q });
    clearSave();
    render();
    modal({
      title: '🎉 강남 입성 성공!',
      body: `<p><b>${a}세 ${q}분기</b>에 강남 84㎡에 입성했어요.</p>
        <p>순자산 ${won(equity())} · 대출 ${won(S.loan)}</p>
        ${isBest ? '<p class="best">🏆 내 최고 기록!</p>' : `<p class="small">내 최고 기록: ${best.age}세 ${best.q}분기</p>`}`,
      buttons: [{ label: '새 게임', onClick: () => newGame() }],
    });
  }

  function checkEnd() {
    if (S.over) return;
    if (S.health <= 0) {
      S.over = true;
      clearSave();
      render();
      modal({ title: '😵 번아웃', body: `<p>${age()}세, 무리하다 쓰러졌어요. 영끌도 건강이 먼저예요.</p>`, buttons: [{ label: '새 게임', onClick: () => newGame() }] });
    } else if (S.credit > creditLimit()) {
      S.over = true;
      clearSave();
      render();
      modal({ title: '💸 파산', body: `<p>${age()}세, 신용대출이 한도(${won(creditLimit())})를 넘었어요. 영끌의 끝…</p>`, buttons: [{ label: '새 게임', onClick: () => newGame() }] });
    }
  }

  // ---------- 화면 ----------
  function render() {
    if (!S) return;
    const r = region();
    document.documentElement.style.setProperty('--region', r.color);
    $('#age').textContent = `${age()}세 ${quarterOfYear()}분기`;
    $('#region').textContent = r.name;
    $('#cash').textContent = won(S.cash);
    $('#loan').textContent = won(S.loan + S.credit);
    $('#loan-sub').textContent = `금리 ${(rate() * 100).toFixed(1)}%${S.credit ? ` · 신용 ${won(S.credit)}` : ''}`;
    $('#home').textContent = S.home ? won(S.home.value) : '원룸 월세';
    $('#home-sub').textContent = S.home ? `${S.home.name} ${S.home.size}㎡` : `분기 ${won(RENT_COST)}`;
    $('#equity').textContent = won(equity());
    $('#health-bar').style.width = S.health + '%';
    $('#family-bar').style.width = S.family + '%';
    $('#health-num').textContent = S.health;
    $('#family-num').textContent = S.family;

    const news = S.effects.map((e) => `<span class="chip">${e.label} · ${e.turns}분기</span>`);
    if (S.pendingTax) news.push(`<span class="chip warn">세법개정안 심사 중 · ${S.pendingTax.turns}분기</span>`);
    if (S.subscription) news.push('<span class="chip good">청약 당첨 혜택</span>');
    $('#news').innerHTML = news.join('') || '<span class="chip muted">조용한 시장</span>';

    const nextRi = Math.min(S.region + 1, 3);
    const target = S.region === 3 ? priceOf(3, 84, COMPLEXES[3][2].f) : priceOf(nextRi, 59, COMPLEXES[nextRi][2].f);
    const need = needOwn(target).need;
    $('#goal').innerHTML = S.region === 3
      ? `최종 목표: 강남 84㎡ · 가장 싼 곳도 내 돈 ${won(need)} 필요`
      : `다음 목표: ${REGIONS[nextRi].name} · 가장 싼 집도 내 돈 ${won(need)} 필요`;

    renderBoard();
    $('#log').innerHTML = S.log.slice(0, 6).map((l) => `<li>${l}</li>`).join('');
    $('#btn-roll').disabled = S.over;
    $('#btn-over').disabled = S.over;
  }

  function renderBoard() {
    const el = $('#board');
    const cols = 6;
    const tiles = S.board;
    let html = '';
    tiles.forEach((t, i) => {
      const row = Math.floor(i / cols);
      const c = i % cols;
      const col = row % 2 === 0 ? c : cols - 1 - c;
      const cls = ['tile', 't-' + t];
      if (i === S.pos) cls.push('here');
      html += `<div class="${cls.join(' ')}" style="grid-row:${row + 1};grid-column:${col + 1}">
        <span class="tn">${i}</span><span class="ti">${TILE[t].icon}</span>${i === S.pos ? '<span class="token">🧑</span>' : ''}</div>`;
    });
    el.innerHTML = html;
  }

  function animateDice(dice, done) {
    const el = $('#dice');
    const faces = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
    let n = 0;
    el.classList.add('rolling');
    const t = setInterval(() => {
      el.textContent = dice.map(() => pick(faces)).join(' ');
      if (++n > 8) {
        clearInterval(t);
        el.textContent = dice.map((d) => faces[d - 1]).join(' ');
        el.classList.remove('rolling');
        setTimeout(done, 250);
      }
    }, 60);
  }

  // ---------- 시작 ----------
  function showTitle() {
    const saved = load();
    const best = getBest();
    $('#title-best').textContent = best ? `🏆 내 최고 기록: ${best.age}세 ${best.q}분기 강남 입성` : '';
    $('#btn-continue').classList.toggle('hidden', !(saved && !saved.over));
    $('#title').classList.remove('hidden');
  }

  function init() {
    $('#btn-new').onclick = () => { $('#title').classList.add('hidden'); newGame(); };
    $('#btn-continue').onclick = () => {
      S = load();
      $('#title').classList.add('hidden');
      render();
    };
    $('#btn-roll').onclick = () => roll(false);
    $('#btn-over').onclick = () => roll(true);
    $('#btn-menu').onclick = () => { if (!busy) showTitle(); };
    $('#btn-help').onclick = () => $('#help').classList.remove('hidden');
    $('#btn-help-close').onclick = () => $('#help').classList.add('hidden');
    showTitle();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
