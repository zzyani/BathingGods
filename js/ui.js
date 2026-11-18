'use strict';
/* =========================================================
 * UI — HUD, 대화창, 탕 패널, 단서 수첩, 화면 전환 (DOM)
 * ========================================================= */

const UI = (() => {
  const $ = s => document.querySelector(s);
  let E = {};
  let dialogButtons = [];
  let currentTub = null;
  let TP = {};
  let tubSig = '', ordersSig = '', invSig = '', hintSig = '', awaySig = '';

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const chip = h => `<span class="chip" style="--c:${HERBS[h].color}"><b>${HERBS[h].short}</b>${HERBS[h].name}</span>`;
  const stars = n => '★'.repeat(n) + '☆'.repeat(5 - n);

  function init() {
    E = {
      hud: $('#hud'), day: $('#hud-day'), clock: $('#hud-clock'), timefill: $('#hud-timefill'),
      rep: $('#hud-rep'), coins: $('#hud-coins'), clues: $('#hud-clues'),
      orders: $('#orders'), away: $('#away'), hint: $('#hint'), inv: $('#inventory'), toasts: $('#toasts'),
      tooltip: $('#tooltip'), screen: $('#screen'), modal: $('#modal'),
      btnJournal: $('#btn-journal'), fuelRow: $('#hud-fuel-row'), fuel: $('#hud-fuel'), fuelTxt: $('#hud-fuel-txt'), btnSound: $('#btn-sound'), btnPause: $('#btn-pause'),
    };
    E.btnJournal.onclick = () => { E.btnJournal.blur(); if (!Game.modal) openJournal(); else if (Game.modal === 'journal') closeModal(); };
    E.btnSound.onclick = () => { E.btnSound.blur(); toggleSound(); };
    E.btnPause.onclick = () => { E.btnPause.blur(); if (!Game.modal) openPause(); };
    E.modal.addEventListener('mousedown', e => { if (e.target === E.modal && Game.modal === 'tub') closeModal(); });
    E.inv.addEventListener('click', e => {
      const b = e.target.closest('[data-drop]');
      if (b) dropInventory(+b.dataset.drop);
    });
  }

  function bind(root, map) {
    root.querySelectorAll('[data-act]').forEach(b => {
      b.addEventListener('click', ev => {
        Sfx.ensure(); Sfx.play('click'); b.blur();
        const fn = map[b.dataset.act];
        if (fn) fn(b, ev);
      });
    });
  }

  /* ---------- 전체 화면 ---------- */
  function showScreen(html, cls = '') {
    E.screen.className = cls;
    E.screen.innerHTML = html;
    E.screen.scrollTop = 0;
  }
  function hideScreen() { E.screen.className = 'hidden'; E.screen.innerHTML = ''; }
  function showHUD(on) { E.hud.classList.toggle('hidden', !on); if (!on) hideTooltip(); ordersSig = invSig = hintSig = ''; }

  function title(save) {
    showScreen(`
      <div class="title-wrap">
        <h1 class="logo"><img src="assets/title/logo.webp" alt="신들의 손님맞이" width="1774" height="887"></h1>
        <div class="title-menu">
          <button class="btn primary" data-act="new">새 게임</button>
          <button class="btn" data-act="cont" ${save ? '' : 'disabled'}>이어서 하기${save ? `<small>${save.day}일차</small>` : ''}</button>
          <button class="btn" data-act="album">엔딩 앨범</button>
          <button class="btn" data-act="help">조작법</button>
        </div>
        <p class="foot">《센과 치히로의 행방불명》에서 영감을 받은 비영리 팬 창작물입니다.</p>
      </div>`, 'title');
    bind(E.screen, {
      new: () => newGame(), cont: () => continueGame(),
      album: () => openAlbum(() => title(loadSave())),
      help: () => help(() => title(loadSave())),
    });
  }

  function helpHTML() {
    return `
      <div class="help-grid">
        <div><h3>조작</h3><ul>
          <li><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / 방향키 — 이동</li>
          <li><b>마우스 클릭</b> — 손님·탕·약재와 상호작용 (멀리 있으면 그곳까지 걸어감)</li>
          <li><kbd>Space</kbd> / <kbd>E</kbd> — 가장 가까운 대상과 상호작용</li>
          <li><kbd>Space</kbd> 꾹 — 탕 패널에서 불 지피기</li>
          <li><kbd>1</kbd>~<kbd>3</kbd> — 대화 선택지 (<kbd>Space</kbd>·<kbd>Enter</kbd>는 강조된 선택지) · <kbd>J</kbd> 단서 수첩 · <kbd>Esc</kbd> 일시정지 · <kbd>M</kbd> 소리</li>
        </ul></div>
        <div><h3>영업 흐름</h3><ol>
          <li>접수대 방석의 손님(<b>!</b>)을 클릭해 <b>온도와 약재</b> 주문을 듣는다.</li>
          <li>복도 왼쪽 끝의 문으로 <b>정원</b>·<b>약재 창고</b>에 다녀오거나, 보일러실에서 약재를 챙긴다. (구역에 있는 동안 화면 위 "목욕탕 소식"을 확인!)</li>
          <li>빈 탕을 클릭 → 불을 지펴 온도를 맞추고 약재를 넣는다.</li>
          <li>손님을 다시 클릭하면 따라온다 → 준비된 탕을 클릭해 안내.</li>
          <li>목욕이 끝나면 ★1~5 평가. 사용한 탕은 클릭해 <b>청소</b>.</li>
        </ol></div>
        <div><h3>탕 관리</h3><ul>
          <li>물을 받은 탕은 <b>서서히 식는다</b>. 손님이 "차가워!" 하면 탕을 클릭해 다시 데우자.</li>
          <li>불은 <b>보일러 장작</b>을 쓴다. 장작이 떨어지면 가열이 느려지니 보일러실 가마를 클릭해 채우자.</li>
          <li><b>손님 궁합</b>: 사이가 나쁜 손님을 옆 탕에 넣으면 둘 다 별점 −1, 사이가 좋으면 팁이 붙는다. 주문 카드에서 확인!</li>
        </ul></div>
        <div><h3>평가</h3><ul>
          <li>온도 ±1°C 이내면 만점, 벗어날수록 감점</li>
          <li>약재가 빠지면 크게 감점, 엉뚱한 약재도 감점</li>
          <li>인내심이 바닥나면 손님은 화가 나서 돌아간다</li>
          <li>목욕 중 온도가 오래 어긋나면 감점</li>
        </ul></div>
        <div><h3>이야기</h3><ul>
          <li>3~4일차에는 목욕탕 곳곳에 <b>얼굴 없는 손님</b>의 단서가 반짝인다.</li>
          <li>5일차 밤의 선택에 따라 엔딩이 달라진다.</li>
        </ul></div>
      </div>`;
  }
  function help(back) {
    showScreen(`<div class="card"><h2>조작법 · 규칙</h2>${helpHTML()}
      <div class="actions"><button class="btn primary" data-act="back">돌아가기</button></div></div>`);
    bind(E.screen, { back });
  }

  function story(pages, done) {
    let i = 0;
    const render = () => {
      showScreen(`<div class="card story-card">
        <div class="story-text">${esc(pages[i])}</div>
        <div>
          <div class="story-dots">${pages.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div>
          <div class="actions"><button class="btn" data-act="skip">건너뛰기</button><button class="btn primary" data-act="next">${i < pages.length - 1 ? '다음' : '목욕탕으로'}</button></div>
        </div></div>`);
      bind(E.screen, { next: () => { i++; if (i >= pages.length) done(); else render(); }, skip: done });
    };
    render();
  }

  function dayIntro(day, cfg, meta) {
    const owned = UPGRADES.filter(u => meta.upgrades.includes(u.id));
    showScreen(`<div class="card">
      <div class="day-num">${day}일차</div>
      <div class="day-title">${esc(cfg.title)}</div>
      <p class="day-text">${esc(cfg.intro)}</p>
      <ul class="day-info">
        <li>영업 시간 18:00 ~ 02:00 · 예상 손님 ${cfg.guests}명</li>
        <li>보유 ${meta.coins}냥 · 지금까지의 평판 ${meta.stars.length ? '★' + Util.avg(meta.stars).toFixed(1) : '—'}</li>
        ${cfg.twoHerb ? '<li>약재를 두 가지 찾는 손님이 있다</li>' : ''}
        ${cfg.clues ? '<li class="kao">오늘은 얼굴 없는 손님의 단서를 찾을 수 있다 (반짝이는 곳을 살펴보자)</li>' : ''}
        ${cfg.kaonashiAt ? `<li class="kao">특별한 손님이 찾아온다 · 모은 단서 ${meta.clues.length}/4</li>` : ''}
      </ul>
      ${owned.length ? `<div class="owned">${owned.map(u => `<span>${esc(u.name)}</span>`).join('')}</div>` : ''}
      <div class="actions"><button class="btn" data-act="help">조작법</button><button class="btn primary" data-act="go">영업 시작</button></div>
    </div>`);
    bind(E.screen, { go: () => beginPlay(), help: () => help(() => dayIntro(day, cfg, meta)) });
  }

  function dayEnd(stats, meta, day, next) {
    const rows = stats.log.map(l => l.stars > 0
      ? `<tr><td>${esc(l.name)}</td><td class="stars">${stars(l.stars)}</td><td class="note">${esc(l.note)}</td></tr>`
      : `<tr class="miss"><td>${esc(l.name)}</td><td class="stars">—</td><td class="note">${esc(l.note)}</td></tr>`).join('');
    const dayAvg = stats.stars.length ? Util.avg(stats.stars).toFixed(1) : '—';
    showScreen(`<div class="card">
      <div class="day-num small">${day}일차 영업 종료</div>
      ${rows ? `<table class="log">${rows}</table>` : '<p>오늘은 맞이한 손님이 없다.</p>'}
      <div class="summary">
        <div>맞이한 손님<b>${stats.served}명</b></div>
        <div>놓친 손님<b>${stats.missed}명</b></div>
        <div>오늘의 평판<b>★${dayAvg}</b></div>
        <div>번 돈<b>+${stats.coins}냥</b></div>
        <div>총점<b>${meta.score}</b></div>
        ${day >= 3 ? `<div>단서<b>${meta.clues.length}/4</b></div>` : ''}
      </div>
      <div class="actions"><button class="btn primary" data-act="next">${day < 5 ? '상점으로' : '엔딩 보기'}</button></div>
    </div>`);
    bind(E.screen, { next });
  }

  function shop(meta, next) {
    const items = UPGRADES.map(u => {
      const owned = meta.upgrades.includes(u.id);
      return `<div class="shop-item ${owned ? 'owned-item' : ''}">
        <div class="info"><b>${esc(u.name)}</b><p>${esc(u.desc)}</p></div>
        <button class="btn ${owned ? '' : 'primary'}" data-act="buy" data-id="${u.id}" ${owned || meta.coins < u.cost ? 'disabled' : ''}>
          ${owned ? '보유 중' : `${u.cost}냥`}</button></div>`;
    }).join('');
    showScreen(`<div class="card">
      <h2>목욕탕 상점</h2>
      <p>번 돈으로 내일 영업을 준비하자. <span class="coins-big">보유 ${meta.coins}냥</span></p>
      <div class="shop-grid">${items}</div>
      <div class="actions"><button class="btn primary" data-act="next">다음 날로</button></div>
    </div>`);
    bind(E.screen, { buy: b => { buyUpgrade(b.dataset.id); shop(meta, next); }, next });
  }

  function ending(type, data) {
    const m = data.meta;
    let paras;
    if (type === 'special') {
      paras = SPECIAL_ENDING.map(p => `<p>${esc(p)}</p>`).join('');
    } else {
      const k = epilogueKey(m);
      paras = `<p>${esc(RANKS[data.rank].text)}</p><p>${esc(KAONASHI_LINES[k])}</p>
        <p class="hint">숨겨진 결말이 있습니다 — 3·4일차의 단서를 ${CLUES_NEEDED}개 이상 모으고, 마지막 밤에 그를 손님으로 맞이해 보세요.</p>`;
    }
    showScreen(`<div class="card ending ${type}">
      <div class="end-tag">${ENDING_INFO[type].tag}</div>${data.newEntry ? '<div class="new-badge">앨범에 새 엔딩이 기록되었어요</div>' : ''}
      <h2>${ENDING_INFO[type].title}</h2>
      <canvas id="end-art" width="720" height="320"></canvas>
      <div class="end-text">${paras}</div>
      <div class="rank"><b>${data.rank}</b>${esc(RANKS[data.rank].title)}</div>
      <div class="summary">
        <div>총점<b>${m.score}</b></div>
        <div>평균 평판<b>★${data.avg.toFixed(1)}</b></div>
        <div>맞이한 손님<b>${m.served}명</b></div>
        <div>놓친 손님<b>${m.missed}명</b></div>
        <div>단서<b>${m.clues.length}/4</b></div>
      </div>
      <div class="actions"><button class="btn primary" data-act="title">타이틀로</button></div>
    </div>`);
    Render.endingArt(E.screen.querySelector('#end-art'), type);
    bind(E.screen, { title: () => restartToTitle() });
  }

  /* ---------- 엔딩 앨범 ---------- */
  function album(data, back) {
    const got = ENDING_TYPES.filter(t => data.endings[t]).length;
    const card = type => {
      const info = ENDING_INFO[type], e = data.endings[type];
      if (!e) {
        return `<div class="album-card locked">
          <div class="ac-art"><span>?</span></div>
          <div class="ac-body"><div class="ac-tag">${info.tag}</div><b>???</b>
          <p class="ac-hint">${esc(info.hint)}</p></div></div>`;
      }
      const epi = type === 'normal'
        ? `<div class="ac-epi"><div class="ac-epi-title">후일담 ${e.epilogues.length}/${EPILOGUE_ORDER.length}</div>
          ${EPILOGUE_ORDER.map(k => `<span class="${e.epilogues.includes(k) ? 'on' : ''}">${e.epilogues.includes(k) ? esc(EPILOGUE_LABELS[k]) : '???'}</span>`).join('')}</div>`
        : '';
      return `<div class="album-card got ${type}">
        <div class="ac-art"><canvas data-art="${type}" width="480" height="214"></canvas></div>
        <div class="ac-body"><div class="ac-tag">${info.tag}</div><b>${esc(info.title)}</b>
          <ul class="ac-meta">
            <li>처음 본 날 · ${esc(e.first)}</li>
            <li>본 횟수 · ${e.count}회</li>
            <li>최고 등급 · ${e.bestRank} ${esc(RANKS[e.bestRank].title)} · 최고 점수 ${e.bestScore}</li>
          </ul>${epi}
          <button class="btn" data-act="view" data-type="${type}">다시 보기</button>
        </div></div>`;
    };
    showScreen(`<div class="card album">
      <h2>엔딩 앨범</h2>
      <p class="album-sub">모은 엔딩 ${got} / ${ENDING_TYPES.length} · 새로 시작해도 기록은 남아요.</p>
      <div class="album-grid">${ENDING_TYPES.map(card).join('')}</div>
      <div class="actions"><button class="btn primary" data-act="back">돌아가기</button></div>
    </div>`);
    E.screen.querySelectorAll('canvas[data-art]').forEach(c => Render.endingArt(c, c.dataset.art));
    bind(E.screen, { back, view: b => albumView(b.dataset.type, data, back) });
  }
  function albumView(type, data, backToTitle) {
    const e = data.endings[type], info = ENDING_INFO[type];
    const paras = type === 'special'
      ? SPECIAL_ENDING.map(p => `<p>${esc(p)}</p>`).join('')
      : `<p>${esc(RANKS[e.lastRank || e.bestRank].text)}</p><p>${esc(KAONASHI_LINES[e.lastEpilogue || 'none'])}</p>`;
    showScreen(`<div class="card ending ${type}">
      <div class="end-tag">${info.tag} · 다시 보기</div>
      <h2>${esc(info.title)}</h2>
      <canvas id="end-art" width="720" height="320"></canvas>
      <div class="end-text">${paras}</div>
      <div class="actions"><button class="btn primary" data-act="back">앨범으로</button></div>
    </div>`);
    Render.endingArt(E.screen.querySelector('#end-art'), type);
    bind(E.screen, { back: () => album(loadAlbum(), backToTitle) });
  }

  /* ---------- 모달 ---------- */
  function closeModal() {
    Game.modal = null;
    Game.heating = false;
    currentTub = null;
    dialogButtons = [];
    E.modal.className = 'modal hidden';
    E.modal.innerHTML = '';
  }

  function dialog({ portrait, name, text, buttons }) {
    hideTooltip();
    Game.modal = 'dialog';
    dialogButtons = buttons;
    E.modal.className = 'modal dim';
    E.modal.innerHTML = `<div class="dialog">
      <div class="portrait"><canvas width="240" height="240"></canvas></div>
      <div class="dlg-body">
        <div class="dlg-name">${esc(name)}</div>
        <div class="dlg-text">${esc(text).replace(/\n/g, '<br>')}</div>
        <div class="dlg-btns">${buttons.map((b, i) => `<button class="btn ${b.primary ? 'primary' : ''}" data-i="${i}" ${b.disabled ? 'disabled' : ''}>
          <span class="key">${i + 1}</span>${esc(b.label)}${b.note ? `<small>${esc(b.note)}</small>` : ''}</button>`).join('')}</div>
      </div></div>`;
    Render.portrait(E.modal.querySelector('canvas'), portrait);
    E.modal.querySelectorAll('[data-i]').forEach(btn => btn.addEventListener('click', () => choose(+btn.dataset.i)));
  }
  function choose(i) {
    const b = dialogButtons[i];
    if (!b || b.disabled) return;
    Sfx.play('click');
    closeModal();
    if (b.onClick) b.onClick();
  }

  function openTub(tub) {
    hideTooltip();
    currentTub = tub;
    Game.modal = 'tub';
    tubSig = '';
    E.modal.className = 'modal side';
    E.modal.innerHTML = `<div class="panel tub-panel">
      <div class="panel-head"><span>${esc(tub.label)}</span><button class="x" data-act="close" title="닫기 (Esc)">✕</button></div>
      <div class="thermo">
        <div class="thermo-read"><span id="tp-temp">34</span><small>°C</small></div>
        <div class="thermo-bar"><div class="thermo-marks" id="tp-marks"></div><div class="thermo-fill" id="tp-fill"></div></div>
        <div class="thermo-scale"><span>30</span><span>35</span><span>40</span><span>45</span><span>50</span></div>
        <div class="tp-fuel" id="tp-fuel"><span>🔥 보일러</span><div class="fuel-bar"><div id="tp-fuel-bar" style="height:100%;background:#f0a050"></div></div><span id="tp-fuel-txt"></span></div>
      </div>
      <div id="tp-note" class="tp-note hidden"></div>
      <div class="tp-row">
        <button class="btn heat" id="tp-heat">🔥 불 지피기<small>꾹 누르기 · Space</small></button>
        <button class="btn cool" id="tp-cool">💧 찬물 붓기<small>−1°C</small></button>
      </div>
      <div class="tp-label">탕에 넣은 약재 <small>최대 2가지 · 누르면 다시 바구니로</small></div>
      <div class="tp-herbs" id="tp-herbs"></div>
      <div class="tp-label">바구니 <small>누르면 탕에 넣기</small></div>
      <div class="tp-inv" id="tp-inv"></div>
      <div class="tp-label">주문 메모</div>
      <div class="tp-orders" id="tp-orders"></div>
      <div class="tp-foot">
        <button class="btn" data-act="drain" id="tp-drain">물 빼기</button>
        <button class="btn primary hidden" data-act="seat" id="tp-seat">손님 모시기</button>
        <button class="btn primary" data-act="close">완료</button>
      </div>
    </div>`;
    TP = {
      temp: E.modal.querySelector('#tp-temp'), fill: E.modal.querySelector('#tp-fill'), marks: E.modal.querySelector('#tp-marks'),
      herbs: E.modal.querySelector('#tp-herbs'), inv: E.modal.querySelector('#tp-inv'), orders: E.modal.querySelector('#tp-orders'),
      seat: E.modal.querySelector('#tp-seat'), heat: E.modal.querySelector('#tp-heat'),
      fuel: E.modal.querySelector('#tp-fuel'), fuelBar: E.modal.querySelector('#tp-fuel-bar'), fuelTxt: E.modal.querySelector('#tp-fuel-txt'),
      note: E.modal.querySelector('#tp-note'), drain: E.modal.querySelector('#tp-drain'), panel: E.modal.querySelector('.tub-panel'),
    };
    const on = e => { e.preventDefault(); Sfx.ensure(); Game.heating = true; };
    const off = () => { Game.heating = false; };
    TP.heat.addEventListener('pointerdown', on);
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => TP.heat.addEventListener(ev, off));
    E.modal.querySelector('#tp-cool').addEventListener('click', e => { e.currentTarget.blur(); tubCool(); });
    bind(E.modal, { close: () => closeModal(), drain: () => tubDrain(), seat: () => tubSeat() });
    TP.herbs.addEventListener('click', e => { const b = e.target.closest('[data-h]'); if (b) tubRemoveHerb(+b.dataset.h); });
    TP.inv.addEventListener('click', e => { const b = e.target.closest('[data-h]'); if (b) tubAddHerb(+b.dataset.h); });
    refreshTub();
  }

  function refreshTub() {
    const tub = currentTub;
    if (!tub || Game.modal !== 'tub') return;
    const w = Game.world;
    TP.temp.textContent = Math.round(tub.temp);
    TP.fill.style.left = (Util.clamp((tub.temp - 30) / 20, 0, 1) * 100) + '%';
    TP.heat.classList.toggle('on', !!Game.heatOn);
    const fuel = Util.clamp(w.fuel / BOILER.maxFuel, 0, 1);
    TP.fuelBar.style.width = (fuel * 100) + '%';
    TP.fuelTxt.textContent = w.fuel <= 0 ? '장작 없음 — 가열이 느려요' : `${Math.round(fuel * 100)}%`;
    TP.fuel.classList.toggle('low', w.fuel < BOILER.warnAt);
    // 안내/목욕 정보 메모
    const bather = tub.state === 'occupied' && tub.guest && tub.guest.state === 'bathing' ? tub.guest : null;
    let note = '', noteCls = '';
    if (bather) {
      const want = bather.hidden ? '???' : `${bather.request.temp}°C`;
      note = `${guestName(bather)} 목욕 중 · 원하는 온도 ${want}${bather.offNow ? (bather.offNow < 0 ? ' — 물이 식었어요!' : ' — 너무 뜨거워요!') : ''}`;
      noteCls = bather.offNow ? 'bad' : '';
    } else if (w.follower) {
      const comp = companyNotes(tub, w.follower.type);
      if (comp.length) { note = comp.join(' / '); noteCls = comp.some(c => c.includes('나쁨')) ? 'bad' : 'good'; }
    }
    TP.note.textContent = note;
    TP.note.className = 'tp-note ' + noteCls + (note ? '' : ' hidden');
    TP.panel.classList.toggle('locked', !!bather);
    TP.drain.classList.toggle('hidden', tub.state === 'occupied');
    const orders = w.guests.filter(g => g.known && ['waiting', 'following', 'arriving'].includes(g.state));
    const sig = JSON.stringify([tub.herbs, w.inventory, w.follower ? w.follower.id : 0, orders.map(g => g.id)]);
    if (sig === tubSig) return;
    tubSig = sig;
    TP.herbs.innerHTML = tub.herbs.length
      ? tub.herbs.map((h, i) => `<button class="tp-herb" data-h="${i}" style="--c:${HERBS[h].color}"><b>${HERBS[h].short}</b>${HERBS[h].name}</button>`).join('')
      : '<span class="tp-empty">아직 아무것도 넣지 않았다</span>';
    TP.inv.innerHTML = w.inventory.length
      ? w.inventory.map((h, i) => `<button class="tp-herb" data-h="${i}" style="--c:${HERBS[h].color}"><b>${HERBS[h].short}</b>${HERBS[h].name}</button>`).join('')
      : '<span class="tp-empty">바구니가 비었다 — 약재를 먼저 챙겨 오자</span>';
    TP.orders.innerHTML = orders.length
      ? orders.map(g => `<div><span>${esc(guestName(g))}</span>${g.hidden ? '<b>???</b>' : `<b>${g.request.temp}°C</b>${g.request.herbs.map(chip).join('')}`}</div>`).join('')
      : '<span class="tp-empty">들은 주문이 없다</span>';
    TP.marks.innerHTML = orders.filter(g => !g.hidden).map(g =>
      `<span style="left:${(g.request.temp - 30) / 20 * 100}%;--c:${HERBS[g.request.herbs[0]].color}">${g.request.temp}</span>`).join('');
    if (w.follower && tub.state === 'ready') {
      TP.seat.classList.remove('hidden');
      TP.seat.textContent = `${guestName(w.follower)} 모시기`;
    } else TP.seat.classList.add('hidden');
  }

  function journal(meta) {
    hideTooltip();
    Game.modal = 'journal';
    E.modal.className = 'modal center';
    const n = meta.clues.length;
    E.modal.innerHTML = `<div class="panel journal">
      <div class="panel-head"><span>📜 단서 수첩</span><button class="x" data-act="close">✕</button></div>
      <p class="j-intro">${n ? '얼굴 없는 손님에 대해 알게 된 것들.' : '아직 기록된 단서가 없다. 3일차부터 목욕탕 곳곳을 살펴보자.'}</p>
      <div class="j-list">${CLUE_ORDER.map((id, i) => {
        const c = CLUES[id], got = meta.clues.includes(id);
        return `<div class="j-item ${got ? 'got' : ''}"><div class="j-num">${i + 1}</div><div><b>${got ? esc(c.name) : '???'}</b>
          <p>${got ? esc(c.text) : `${c.day}일차, 목욕탕 어딘가에 남아 있다.`}</p></div></div>`;
      }).join('')}</div>
      <p class="j-foot">단서 ${n} / 4 ${n >= CLUES_NEEDED ? '— 마지막 밤, 그에게 건넬 말이 생겼다.' : ''}</p>
    </div>`;
    bind(E.modal, { close: () => closeModal() });
  }

  function pause() {
    hideTooltip();
    Game.modal = 'pause';
    E.modal.className = 'modal center';
    E.modal.innerHTML = `<div class="panel pause-panel">
      <div class="panel-head"><span>일시정지</span><button class="x" data-act="close">✕</button></div>
      <div class="menu">
        <button class="btn primary" data-act="close">계속하기</button>
        <button class="btn" data-act="help">조작법 · 규칙</button>
        <button class="btn" data-act="restart">이 날을 처음부터</button>
        <button class="btn" data-act="title">타이틀로 (오늘 진행은 저장되지 않음)</button>
      </div></div>`;
    bind(E.modal, {
      close: () => closeModal(),
      help: () => {
        E.modal.innerHTML = `<div class="panel journal">${helpHTML()}<div class="actions" style="margin-top:14px;text-align:right"><button class="btn primary" data-act="back">돌아가기</button></div></div>`;
        bind(E.modal, { back: () => pause() });
      },
      restart: () => { closeModal(); restartDay(); },
      title: () => { closeModal(); quitToTitle(); },
    });
  }

  /* ---------- HUD ---------- */
  const STATE_LABEL = { arriving: '도착 중', waiting: '대기', following: '안내 중', toTub: '입욕', bathing: '목욕 중', kWait: '…' };
  function orderCard(g) {
    let req;
    if (g.state === 'kWait') req = '<i>말없이 서 있다…</i>';
    else if (!g.known) req = '<i>주문을 아직 듣지 않음</i>';
    else if (g.hidden) req = '<b>???</b><i>단서를 떠올려 보자 (J)</i>';
    else req = `<b>${g.request.temp}°C</b>${g.request.herbs.map(chip).join('')}`;
    if (g.state === 'bathing' && g.offNow) req += `<em>${g.offNow < 0 ? '물이 식었어요!' : '너무 뜨거워요!'}</em>`;
    let rel = '';
    if (g.known && !g.special && g.state !== 'bathing') {
      const r = relationsOf(g.type), parts = [];
      // 좋아함 → 싫어함 순서, 한 줄에 하나씩
      if (r.like.length) parts.push(`<div><span class="good">좋아함</span> ${r.like.map(t => esc(GUEST_TYPES[t].name)).join(', ')}</div>`);
      if (r.dislike.length) parts.push(`<div><span class="bad">싫어함</span> ${r.dislike.map(t => esc(GUEST_TYPES[t].name)).join(', ')}</div>`);
      if (parts.length) rel = `<div class="o-rel">${parts.join('')}</div>`;
    }
    const pat = g.noPatience || g.state === 'bathing' || g.state === 'toTub' ? '' : '<div class="o-pat"><i></i></div>';
    return `<div class="order s-${g.state}${g.special ? ' special' : ''}" data-g="${g.id}">
      <div class="o-head"><span class="o-name">${esc(guestName(g))}</span><span class="o-state">${STATE_LABEL[g.state] || ''}</span></div>
      <div class="o-req">${req}</div>${rel}${pat}</div>`;
  }

  function updateHUD() {
    const w = Game.world, m = Game.meta;
    if (!w || !m) return;
    E.day.textContent = `${w.day}일차 / 5`;
    const frac = w.time / w.length;
    E.clock.textContent = w.closed ? '마감 정리' : Util.fmtClock(frac);
    E.timefill.style.width = (Util.clamp(frac, 0, 1) * 100) + '%';
    E.rep.textContent = m.stars.length ? `평판 ★${Util.avg(m.stars).toFixed(1)}` : '평판 —';
    E.coins.textContent = `${m.coins}냥`;
    const fuel = Util.clamp(w.fuel / BOILER.maxFuel, 0, 1);
    E.fuel.style.width = (fuel * 100) + '%';
    E.fuelTxt.textContent = `${Math.round(fuel * 100)}%`;
    E.fuelRow.classList.toggle('low', w.fuel < BOILER.warnAt);
    const showClues = w.day >= 3 || m.clues.length > 0;
    E.clues.classList.toggle('hidden', !showClues);
    if (showClues) E.clues.textContent = `단서 ${m.clues.length}/4`;
    E.btnJournal.classList.toggle('hidden', !showClues);

    const list = w.guests.filter(g => STATE_LABEL[g.state] && !(g.state === 'arriving' && g.special && !g.hosted));
    const sig = list.map(g => `${g.id}:${g.state}:${g.known ? 1 : 0}:${g.hidden ? 1 : 0}:${g.offNow || 0}`).join('|');
    if (sig !== ordersSig) { ordersSig = sig; E.orders.innerHTML = list.map(orderCard).join(''); }
    for (const g of list) {
      if (g.noPatience) continue;
      const el = E.orders.querySelector(`[data-g="${g.id}"] .o-pat i`);
      if (!el) continue;
      const r = Util.clamp(g.patience / g.patienceMax, 0, 1);
      el.style.width = (r * 100) + '%';
      el.className = r > 0.5 ? '' : r > 0.25 ? 'mid' : 'low';
    }

    // 탐험 구역에 있을 때: 목욕탕 소식 띠
    if (w.scene !== 'main') {
      const al = awayAlerts();
      const asig = al.map(a => a.text).join('|');
      if (asig !== awaySig || E.away.classList.contains('hidden')) {
        awaySig = asig;
        E.away.innerHTML = `<b>목욕탕 소식</b>${al.length
          ? al.map(a => `<span class="a-item ${a.urgent ? 'urgent' : ''}">${esc(a.text)}</span>`).join('')
          : '<span class="a-calm">목욕탕은 조용하다</span>'}`;
        E.away.classList.remove('hidden');
      }
    } else if (!E.away.classList.contains('hidden')) {
      E.away.classList.add('hidden');
      awaySig = '';
    }

    const cap = invCap();
    const isig = w.inventory.join(',') + '/' + cap;
    if (isig !== invSig) {
      invSig = isig;
      let html = '<div class="inv-label">바구니</div>';
      for (let i = 0; i < cap; i++) {
        const h = w.inventory[i];
        html += h
          ? `<div class="slot full" style="--c:${HERBS[h].color}" title="${HERBS[h].name}"><b>${HERBS[h].short}</b><span>${HERBS[h].name}</span><button class="drop" data-drop="${i}" title="버리기">×</button></div>`
          : '<div class="slot"></div>';
      }
      E.inv.innerHTML = html;
    }

    const h = hintText() || '';
    if (h !== hintSig) {
      hintSig = h;
      E.hint.textContent = h;
      E.hint.classList.toggle('hidden', !h);
    }
  }

  function toast(msg, kind = '') {
    const d = document.createElement('div');
    d.className = 'toast ' + kind;
    d.textContent = msg;
    E.toasts.appendChild(d);
    while (E.toasts.children.length > 4) E.toasts.firstChild.remove();
    setTimeout(() => { d.classList.add('out'); setTimeout(() => d.remove(), 400); }, 2600);
  }

  function tooltip(it, far, x, y) {
    if (!it) { hideTooltip(); return; }
    E.tooltip.innerHTML = `<b>${esc(it.label)}</b><span>${esc(actionLabel(it))}</span>${far ? '<em>클릭하면 그곳까지 걸어갑니다</em>' : ''}`;
    const tw = 230;
    E.tooltip.style.left = Math.min(x + 16, window.innerWidth - tw) + 'px';
    E.tooltip.style.top = Math.min(y + 16, window.innerHeight - 70) + 'px';
    E.tooltip.classList.remove('hidden');
  }
  function hideTooltip() { if (E.tooltip) E.tooltip.classList.add('hidden'); }
  function setSoundIcon(muted) { E.btnSound.textContent = muted ? '🔇' : '🔊'; }

  return {
    init, showScreen, hideScreen, showHUD, title, help, story, dayIntro, dayEnd, shop, ending, album,
    dialog, choose, closeModal, openTub, refreshTub, journal, pause, updateHUD, toast, tooltip, hideTooltip, setSoundIcon,
    hasDialogButton: i => !!(dialogButtons[i] && !dialogButtons[i].disabled),
    primaryIndex: () => dialogButtons.findIndex(b => b.primary && !b.disabled),
  };
})();
