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
  // 약재 표시: 아이콘 그림이 있으면 그림, 없으면 색 동그라미 + 한 글자
  const herbMark = h => HERBS[h].icon ? `<b class="hic" style="background-image:url('${HERBS[h].icon}')"></b>` : `<b>${HERBS[h].short}</b>`;
  const chip = h => `<span class="chip" style="--c:${HERBS[h].color}">${herbMark(h)}${HERBS[h].name}</span>`;
  const stars = n => '★'.repeat(n) + '☆'.repeat(5 - n);

  function init() {
    E = {
      hud: $('#hud'), day: $('#hud-day'), clock: $('#hud-clock'), timefill: $('#hud-timefill'),
      rep: $('#hud-rep'), coins: $('#hud-coins'), clues: $('#hud-clues'),
      orders: $('#orders'), away: $('#away'), hint: $('#hint'), inv: $('#inventory'),
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
          <li><b>특별한 손님</b>은 한 번에 한 분씩 온다. 이틀 동안 목욕탕 곳곳에 단서를 남기고, 사흘째 밤에 찾아온다.</li>
          <li>그 손님의 단서를 ${CLUES_NEEDED}개 이상 모으면 맞이할 수 있다. 단서가 알려 준 탕을 준비하면 선물을 남긴다.</li>
          <li>${DAYS.length}일차, 마지막 손님에 대한 선택에 따라 엔딩이 달라진다.</li>
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
    // 줄마다 가장 높은 단계만 보여 준다
    const owned = UP_LINES.map(l => UPGRADES.filter(u => u.line === l && meta.upgrades.includes(u.id)).pop()).filter(Boolean);
    const gifts = giftsOf(meta);
    showScreen(`<div class="card">
      <div class="day-num">${day}일차 <small>/ ${DAYS.length}</small></div>
      <div class="day-title">${esc(cfg.title)}</div>
      <p class="day-text">${esc(cfg.intro)}</p>
      <ul class="day-info">
        <li>영업 시간 18:00 ~ 02:00 · 예상 손님 ${cfg.guests}명</li>
        <li>보유 ${meta.coins}냥 · 지금까지의 평판 ${meta.stars.length ? '★' + Util.avg(meta.stars).toFixed(1) : '—'}</li>
        ${cfg.twoHerb ? '<li>약재를 두 가지 찾는 손님이 있다</li>' : ''}
        ${cfg.clues ? `<li class="kao">오늘은 ${esc(specialLabel(specialOfDay(day), meta))}의 단서를 찾을 수 있다 (반짝이는 곳을 살펴보자)</li>` : ''}
        ${cfg.special ? `<li class="kao">특별한 손님 ${esc(specialLabel(cfg.special, meta))}이(가) 찾아온다 · 모은 단서 ${specialClueCount(cfg.special, meta)}/${cluesOf(cfg.special).length}</li>` : ''}
      </ul>
      ${owned.length || gifts.length ? `<div class="owned">${owned.map(u => `<span>${esc(u.name)}</span>`).join('')}${gifts.map(g => `<span class="gift">🎁 ${esc(g.name)}</span>`).join('')}</div>` : ''}
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
        ${specialOfDay(day) ? `<div>${esc(specialLabel(specialOfDay(day), meta))} 단서<b>${specialClueCount(specialOfDay(day), meta)}/${cluesOf(specialOfDay(day)).length}</b></div>` : ''}
      </div>
      <div class="actions"><button class="btn primary" data-act="next">${day < DAYS.length ? '상점으로' : '엔딩 보기'}</button></div>
    </div>`);
    bind(E.screen, { next });
  }

  function shop(meta, next) {
    // 줄마다 다음 단계 하나만 — 다 산 줄은 마지막 단계를 '최고 단계'로 보여 주고 목록 맨 아래로
    const rows = UP_LINES.map(line => {
      const tiers = UPGRADES.filter(u => u.line === line), lv = upLv(line, meta);
      return { tiers, lv, u: tiers[Math.min(lv, tiers.length - 1)], maxed: lv >= tiers.length };
    }).sort((a, b) => a.maxed - b.maxed);
    const items = rows.map(({ tiers, lv, u, maxed }) => {
      const dots = tiers.length > 1 ? `<span class="lv">${tiers.map((_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</span>` : '';
      const poor = !maxed && meta.coins < u.cost;
      return `<div class="shop-item ${maxed ? 'owned-item' : ''}">
        <div class="info"><b>${esc(u.name)}${dots}</b><p>${esc(u.desc)}</p></div>
        <button class="btn ${maxed ? '' : 'primary'}" data-act="buy" data-id="${u.id}" ${maxed || poor ? 'disabled' : ''}>
          ${maxed ? (tiers.length > 1 ? '최고 단계' : '보유 중') : `${u.cost}냥`}</button></div>`;
    }).join('');
    const left = UPGRADES.filter(u => !meta.upgrades.includes(u.id)).length;
    showScreen(`<div class="card shop">
      <h2>목욕탕 상점</h2>
      <p>번 돈으로 내일 영업을 준비하자. <span class="coins-big">보유 ${meta.coins}냥</span></p>
      <p class="shop-sub">${left ? `같은 줄의 물건은 한 단계씩 좋아져요 · 남은 물건 ${left}개` : '모든 물건을 갖췄어요!'}</p>
      <div class="shop-grid">${items}</div>
      <div class="actions"><button class="btn primary" data-act="next">다음 날로</button></div>
    </div>`);
    bind(E.screen, { buy: b => { buyUpgrade(b.dataset.id); shop(meta, next); }, next });
  }

  /* ---------- 엔딩 ---------- */
  // 이름 목록을 "가, 나와 다" 처럼 잇는다
  function joinNames(list) {
    if (list.length <= 1) return list[0] || '';
    const head = list.slice(0, -1);
    head[head.length - 1] = Util.josa(head[head.length - 1], '과', '와');
    return head.join(', ') + ' ' + list[list.length - 1];
  }
  const JOSA = { 은: ['은', '는'], 이: ['이', '가'], 을: ['을', '를'], 과: ['과', '와'] };
  function fillEnding(t, names, gifts) {
    return t.replace(/\{(names|gifts)(?:\|([^}]+))?\}/g, (_, k, p) => {
      const word = joinNames(k === 'names' ? names : gifts);
      if (!p) return word;
      return JOSA[p] ? Util.josa(word, JOSA[p][0], JOSA[p][1]) : word + p;
    });
  }
  // 엔딩 본문 + 선물 선반. healed: 잘 모신 손님 id 목록, epi: 얼굴 없는 손님 후일담 키
  function endingBody(type, healed, epi) {
    const giftOf = id => SPECIALS[id].gift || KAONASHI_GIFT;
    const names = healed.map(id => SPECIALS[id].name), gifts = healed.map(id => giftOf(id).name);
    let paras = ENDING_INFO[type].text.map(t => `<p>${esc(fillEnding(t, names, gifts))}</p>`).join('');
    if (type !== 'h5') paras += `<p class="kao-line">${esc(healed.includes('kaonashi') ? KAONASHI_HEALED_LINE : KAONASHI_LINES[epi || 'none'])}</p>`;
    const shelf = SPECIAL_ORDER.map(id => {
      const ok = healed.includes(id), g = giftOf(id);
      return `<div class="gift ${ok ? 'got' : 'miss'}">
        <canvas data-guest="${id}" data-sil="${ok ? '' : '1'}" width="120" height="120"></canvas>
        <b>${ok ? esc(g.name) : '???'}</b><small>${ok ? esc(SPECIALS[id].name) : esc(SPECIALS[id].alias) + ' · 모시지 못함'}</small></div>`;
    }).join('');
    return `<div class="end-text">${paras}</div>
      <div class="gift-shelf"><div class="gs-title">받은 선물 ${healed.length} / ${SPECIAL_ORDER.length}</div><div class="gs-row">${shelf}</div></div>`;
  }
  function drawGiftPortraits() {
    E.screen.querySelectorAll('canvas[data-guest]').forEach(c => Render.portrait(c, c.dataset.guest, { silhouette: !!c.dataset.sil }));
  }
  const artOf = type => type === 'h5' ? 'special' : 'normal';
  // 엔딩 그림: 일러스트가 있으면 그림, 없으면 코드로 그리는 캔버스
  const artTag = (type, w, h) => ENDING_ART[type]
    ? `<img class="end-img" src="${ENDING_ART[type]}" alt="${esc(ENDING_INFO[type].title)}">`
    : `<canvas data-art="${artOf(type)}" width="${w}" height="${h}"></canvas>`;
  const drawArts = () => E.screen.querySelectorAll('canvas[data-art]').forEach(c => Render.endingArt(c, c.dataset.art));

  function ending(type, data) {
    const m = data.meta, info = ENDING_INFO[type];
    showScreen(`<div class="card ending ${artOf(type)}">
      <div class="end-tag">${esc(info.tag)}</div>${data.newEntry ? '<div class="new-badge">앨범에 새 엔딩이 기록되었어요</div>' : ''}
      <h2>${esc(info.title)}</h2>
      ${artTag(type, 720, 320)}
      ${endingBody(type, healedIds(m), epilogueKey(m))}
      <div class="rank"><b>${data.rank}</b>${esc(RANKS[data.rank].title)}</div>
      <p class="rank-text">${esc(RANKS[data.rank].text)}</p>
      <div class="summary">
        <div>총점<b>${m.score}</b></div>
        <div>평균 평판<b>★${data.avg.toFixed(1)}</b></div>
        <div>맞이한 손님<b>${m.served}명</b></div>
        <div>놓친 손님<b>${m.missed}명</b></div>
      </div>
      ${type !== 'h5' ? `<p class="hint">엔딩은 모두 ${ENDING_TYPES.length}가지 — 특별한 손님을 더 많이 모시면 다른 엔딩이 열립니다.</p>` : ''}
      <div class="actions"><button class="btn primary" data-act="title">타이틀로</button></div>
    </div>`);
    drawArts();
    drawGiftPortraits();
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
          <div class="ac-body"><div class="ac-tag">${esc(info.tag)}</div><b>???</b>
          <p class="ac-hint">${esc(info.hint)}</p></div></div>`;
      }
      const who = (e.lastHealed || []).map(id => SPECIALS[id].name);
      return `<div class="album-card got ${artOf(type)}">
        <div class="ac-art">${artTag(type, 480, 214)}</div>
        <div class="ac-body"><div class="ac-tag">${esc(info.tag)}</div><b>${esc(info.title)}</b>
          <ul class="ac-meta">
            <li>처음 본 날 · ${esc(e.first)}</li>
            <li>본 횟수 · ${e.count}회</li>
            <li>최고 등급 · ${e.bestRank} ${esc(RANKS[e.bestRank].title)} · 최고 점수 ${e.bestScore}</li>
            ${who.length ? `<li>모신 손님 · ${esc(who.join(', '))}</li>` : ''}
          </ul>
          <button class="btn" data-act="view" data-type="${type}">다시 보기</button>
        </div></div>`;
    };
    showScreen(`<div class="card album">
      <h2>엔딩 앨범</h2>
      <p class="album-sub">모은 엔딩 ${got} / ${ENDING_TYPES.length} · 새로 시작해도 기록은 남아요.</p>
      <div class="album-grid">${ENDING_TYPES.map(card).join('')}</div>
      <div class="actions"><button class="btn primary" data-act="back">돌아가기</button></div>
    </div>`);
    drawArts();
    bind(E.screen, { back, view: b => albumView(b.dataset.type, data, back) });
  }
  function albumView(type, data, backToTitle) {
    const e = data.endings[type], info = ENDING_INFO[type];
    showScreen(`<div class="card ending ${artOf(type)}">
      <div class="end-tag">${esc(info.tag)} · 다시 보기</div>
      <h2>${esc(info.title)}</h2>
      ${artTag(type, 720, 320)}
      ${endingBody(type, e.lastHealed || [], e.lastEpilogue)}
      <div class="actions"><button class="btn primary" data-act="back">앨범으로</button></div>
    </div>`);
    drawArts();
    drawGiftPortraits();
    bind(E.screen, { back: () => album(loadAlbum(), backToTitle) });
  }

  /* ---------- 모달 ---------- */
  function closeModal() {
    stopTyping();
    Game.modal = null;
    Game.heating = false;
    currentTub = null;
    dialogButtons = [];
    E.modal.className = 'modal hidden';
    E.modal.innerHTML = '';
  }

  // 손님 말소리와 함께 글자를 한 자씩 찍는다 (동물의 숲 느낌). 「」가 있으면 그 안의 말만 소리 내고, 나머지 서술은 조용히 찍는다
  let typing = null;
  function stopTyping() {
    if (!typing) return false;
    clearTimeout(typing.timer);
    typing.el.innerHTML = typing.html(typing.text.length);
    typing = null;
    return true;
  }
  function typeText(el, text, who) {
    const html = n => esc(text.slice(0, n)).replace(/\n/g, '<br>');
    const quoted = text.includes('「');
    let i = 0, inQuote = false, last = -1;
    typing = { el, text, html, timer: 0 };
    const step = () => {
      if (!typing || typing.el !== el) return;
      const ch = text[i];
      if (ch === '「') inQuote = true;
      const speak = !quoted || inQuote;
      // 문장 끝 글자는 조금 길고 낮게 (말끝 내리기)
      const tail = /[.…!?」\n]/.test(text[i + 1] || '.');
      if (speak) Voice.blip(who, ch, tail);
      if (ch === '」') inQuote = false;
      i++;
      el.innerHTML = html(i);
      if (i >= text.length) { typing = null; return; }
      let wait = speak ? Voice.pause(who, ch) : 0.012;
      if (!speak && ch === '\n') wait = 0.12;
      typing.timer = setTimeout(step, wait * 1000);
    };
    step();
  }

  function dialog({ portrait, name, text, buttons, silhouette = false, voice = null }) {
    hideTooltip();
    stopTyping();
    Game.modal = 'dialog';
    dialogButtons = buttons;
    E.modal.className = 'modal dim';
    E.modal.innerHTML = `<div class="dialog">
      <div class="portrait"><canvas width="240" height="240"></canvas></div>
      <div class="dlg-body">
        <div class="dlg-name">${esc(name)}</div>
        <div class="dlg-text"><span class="dlg-ghost">${esc(text).replace(/\n/g, '<br>')}</span><span class="dlg-typed"></span></div>
        <div class="dlg-btns">${buttons.map((b, i) => `<button class="btn ${b.primary ? 'primary' : ''}" data-i="${i}" ${b.disabled ? 'disabled' : ''}>
          <span class="key">${i + 1}</span>${esc(b.label)}${b.note ? `<small>${esc(b.note)}</small>` : ''}</button>`).join('')}</div>
      </div></div>`;
    Render.portrait(E.modal.querySelector('canvas'), portrait, { silhouette });
    E.modal.querySelectorAll('[data-i]').forEach(btn => btn.addEventListener('click', () => choose(+btn.dataset.i)));
    const typed = E.modal.querySelector('.dlg-typed');
    if (voice) {
      typeText(typed, text, voice);
      E.modal.querySelector('.dlg-text').addEventListener('click', stopTyping);   // 글자를 누르면 바로 다 보여 줌
    } else typed.innerHTML = esc(text).replace(/\n/g, '<br>');
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
        <div class="tp-fuel" id="tp-fuel"><span><i class="ic ic-fire"></i>보일러</span><div class="fuel-bar"><div id="tp-fuel-bar" style="height:100%;background:#f0a050"></div></div><span id="tp-fuel-txt"></span></div>
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
      ? tub.herbs.map((h, i) => `<button class="tp-herb" data-h="${i}" style="--c:${HERBS[h].color}">${herbMark(h)}${HERBS[h].name}</button>`).join('')
      : '<span class="tp-empty">아직 아무것도 넣지 않았다</span>';
    TP.inv.innerHTML = w.inventory.length
      ? w.inventory.map((h, i) => `<button class="tp-herb" data-h="${i}" style="--c:${HERBS[h].color}">${herbMark(h)}${HERBS[h].name}</button>`).join('')
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

  function journal(meta, sel) {
    hideTooltip();
    Game.modal = 'journal';
    E.modal.className = 'modal center';
    const day = meta.day;
    const opened = id => specialSchedule(id).clueDays[0] <= day || specialClueCount(id, meta) > 0;
    if (!sel || !opened(sel)) sel = specialOfDay(day) || [...SPECIAL_ORDER].reverse().find(opened) || null;
    const tabs = SPECIAL_ORDER.map(id => opened(id)
      ? `<button class="j-tab ${id === sel ? 'on' : ''} ${meta.specials && meta.specials[id] && meta.specials[id].result === 'healed' ? 'done' : ''}" data-act="tab" data-id="${id}">${esc(specialLabel(id, meta))}</button>`
      : `<button class="j-tab locked" disabled>???<small>${specialSchedule(id).clueDays[0]}일차~</small></button>`).join('');
    let body;
    if (!sel) {
      body = `<p class="j-intro">아직 기록된 단서가 없다. ${SPECIAL_START}일차부터 목욕탕 곳곳을 살펴보자.</p>`;
    } else {
      const S = SPECIALS[sel], sch = specialSchedule(sel), ids = cluesOf(sel), n = specialClueCount(sel, meta);
      const r = (meta.specials && meta.specials[sel]) || {};
      let status;
      if (r.result === 'healed') status = S.gift ? `맞이함 · 선물 「${S.gift.name}」 — ${S.gift.desc}` : '맞이함 · 마음을 열었다';
      else if (r.result === 'failed') status = '맞이했지만, 맞는 탕을 준비하지 못했다';
      else if (r.choice === 'gold') status = '금을 받았다';
      else if (r.choice === 'refuse') status = '돌려보냈다';
      else if (r.choice === 'none') status = '만나지 못하고 지나갔다';
      else if (r.choice === 'host') status = '오늘 손님으로 맞이했다 — 맞는 탕을 준비하자';
      else status = sch.visit === day ? '오늘 밤 찾아온다' : `${sch.visit}일차 밤에 찾아온다`;
      body = `<div class="j-who"><canvas class="j-portrait" width="96" height="96"></canvas>
          <div><b>${esc(specialLabel(sel, meta))}</b><p>${esc(status)}</p></div></div>
        <div class="j-list">${ids.map((id, i) => {
          const c = CLUES[id], got = meta.clues.includes(id);
          return `<div class="j-item ${got ? 'got' : ''}"><div class="j-num">${i + 1}</div><div><b>${got ? esc(c.name) : '???'}</b>
            <p>${got ? esc(c.text) : `${clueDay(id)}일차, 목욕탕 어딘가에 남아 있다.`}</p></div>${got && c.img ? `<i class="j-img" style="background-image:url('${c.img}')"></i>` : ''}</div>`;
        }).join('')}</div>
        <p class="j-foot">단서 ${n} / ${ids.length} ${n >= CLUES_NEEDED ? '— 이 손님에게 맞는 탕을 떠올릴 수 있다.' : `· ${CLUES_NEEDED}개 모으면 맞이할 수 있다`}</p>`;
    }
    E.modal.innerHTML = `<div class="panel journal">
      <div class="panel-head"><span><i class="ic ic-journal"></i> 단서 수첩</span><button class="x" data-act="close">✕</button></div>
      <div class="j-tabs">${tabs}</div>
      ${body}
    </div>`;
    const pc = E.modal.querySelector('.j-portrait');
    if (pc && sel) Render.portrait(pc, sel, { silhouette: !specialMet(sel, meta) });   // 방문 전에는 외형을 가린다
    bind(E.modal, { close: () => closeModal(), tab: b => journal(meta, b.dataset.id) });
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
    E.day.textContent = `${w.day}일차 / ${DAYS.length}`;
    const frac = w.time / w.length;
    E.clock.textContent = w.closed ? '마감 정리' : Util.fmtClock(frac);
    E.timefill.style.width = (Util.clamp(frac, 0, 1) * 100) + '%';
    E.rep.textContent = m.stars.length ? `평판 ★${Util.avg(m.stars).toFixed(1)}` : '평판 —';
    E.coins.textContent = `${m.coins}냥`;
    const fuel = Util.clamp(w.fuel / BOILER.maxFuel, 0, 1);
    E.fuel.style.width = (fuel * 100) + '%';
    E.fuelTxt.textContent = `${Math.round(fuel * 100)}%`;
    E.fuelRow.classList.toggle('low', w.fuel < BOILER.warnAt);
    const sid = specialOfDay(w.day);
    const showClues = !!sid || m.clues.length > 0;
    E.clues.classList.toggle('hidden', !sid);
    if (sid) E.clues.textContent = `단서 ${specialClueCount(sid, m)}/${cluesOf(sid).length}`;
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
          ? `<div class="slot full" style="--c:${HERBS[h].color}" title="${HERBS[h].name}">${herbMark(h)}<span>${HERBS[h].name}</span><button class="drop" data-drop="${i}" title="버리기">×</button></div>`
          : '<div class="slot"></div>';
      }
      E.inv.innerHTML = html;
    }

    const hv = hintText() || '';
    const h = Array.isArray(hv) ? hv[0] : hv, hk = Array.isArray(hv) ? 'hint-' + hv[1] : 'hint';
    if (h !== hintSig || hk !== hintKind) {
      hintSig = h; hintKind = hk;
      if (!msgCur) showMsg();
    }
  }

  // 안내 메시지는 아래쪽 띠 하나로 통일: 알림(toast)이 오면 잠깐 띠에 띄우고, 다 보여 주면 다시 안내 문구로 돌아간다
  let msgQ = [], msgCur = null, msgTimer = 0, hintKind = 'hint';
  function toast(msg, kind = '') {
    if (msgCur && msgCur.msg === msg) { nextMsgLater(); return; }     // 같은 알림 연타는 시간만 연장
    if (msgQ.some(m => m.msg === msg)) return;
    msgQ.push({ msg, kind });
    if (msgQ.length > 3) msgQ.shift();
    if (!msgCur) nextMsg();
  }
  function nextMsg() {
    msgCur = msgQ.shift() || null;
    if (msgCur) nextMsgLater();
    showMsg();
  }
  function nextMsgLater() {
    clearTimeout(msgTimer);
    const base = msgCur.msg.length > 30 ? 3400 : 2600;
    msgTimer = setTimeout(nextMsg, msgQ.length ? base * 0.7 : base);
  }
  function showMsg() {
    const m = msgCur || (hintSig ? { msg: hintSig, kind: hintKind } : null);
    E.hint.classList.toggle('hidden', !m);
    if (!m) return;
    E.hint.textContent = m.msg;
    E.hint.dataset.kind = m.kind || 'info';
    if (msgCur) { E.hint.classList.remove('pop'); void E.hint.offsetWidth; E.hint.classList.add('pop'); }
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
  function setSoundIcon(muted) { E.btnSound.classList.toggle('muted', muted); }

  return {
    init, showScreen, hideScreen, showHUD, title, help, story, dayIntro, dayEnd, shop, ending, album,
    dialog, choose, closeModal, openTub, refreshTub, journal, pause, updateHUD, toast, tooltip, hideTooltip, setSoundIcon,
    hasDialogButton: i => !!(dialogButtons[i] && !dialogButtons[i].disabled),
    skipTyping: stopTyping,
    primaryIndex: () => dialogButtons.findIndex(b => b.primary && !b.disabled),
  };
})();
