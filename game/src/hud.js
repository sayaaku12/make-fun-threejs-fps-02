// HUD: every DOM readout — health, armour, money, ammo, timer, score,
// kill feed, banners, the buy menu and the plant/defuse bar. The game
// never writes to the DOM anywhere else, so a readout is always one call
// away and the 3D code never knows the page exists.
export function createHud() {
  const el = (id) => document.getElementById(id);
  const healthFill = el('health-fill');
  const healthNum = el('health-num');
  const armorFill = el('armor-fill');
  const armorNum = el('armor-num');
  const moneyEl = el('money');
  const ammoMag = el('ammo-mag');
  const ammoReserve = el('ammo-reserve');
  const weaponName = el('weapon-name');
  const grenadeEl = el('grenades');
  const timerEl = el('timer');
  const scoreEl = el('score');
  const roundEl = el('round');
  const feedEl = el('feed');
  const bannerEl = el('banner');
  const bannerTitle = el('banner-title');
  const bannerSub = el('banner-sub');
  const crosshair = el('crosshair');
  const hitmarker = el('hitmarker');
  const overlay = el('overlay');
  const overlayTitle = el('overlay-title');
  const overlayCopy = el('overlay-copy');
  const playBtn = el('play');
  const buyMenu = el('buy-menu');
  const buyList = el('buy-list');
  const buyMoney = el('buy-money');
  const progressWrap = el('progress-wrap');
  const progressLabel = el('progress-label');
  const progressFill = el('progress-fill');
  const vignette = el('vignette');
  const siteHint = el('site-hint');
  const objectiveEl = el('objective');
  let bannerTimer = 0;
  let hitTimer = 0;

  function setHealth(hp) {
    const v = Math.max(0, Math.round(hp));
    healthFill.style.width = v + '%';
    healthNum.textContent = String(v);
    healthFill.style.background = v > 50 ? 'var(--health)' : v > 25 ? 'var(--accent)' : 'var(--danger)';
  }
  function setArmor(a) {
    const v = Math.max(0, Math.round(a));
    armorFill.style.width = v + '%';
    armorNum.textContent = String(v);
  }
  function setMoney(m) { moneyEl.textContent = '$' + m.toLocaleString('en-US'); }
  function setAmmo(mag, reserve) {
    ammoMag.textContent = String(mag);
    ammoReserve.textContent = '/ ' + reserve;
    ammoMag.parentElement.classList.toggle('empty', mag === 0);
  }
  function setWeapon(name) { weaponName.textContent = name; }
  function setGrenades(n) { grenadeEl.textContent = '◉ ×' + n; }
  function setTimer(seconds, planted) {
    const s = Math.max(0, Math.ceil(seconds));
    timerEl.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    timerEl.classList.toggle('planted', !!planted);
  }
  function setScore(v, e) {
    scoreEl.innerHTML = '';
    const b1 = document.createElement('b');
    b1.className = 'team-v';
    b1.textContent = 'V ' + v;
    const sep = document.createElement('span');
    sep.textContent = ' — ';
    const b2 = document.createElement('b');
    b2.className = 'team-e';
    b2.textContent = 'E ' + e;
    scoreEl.append(b1, sep, b2);
  }
  function setRound(n) { roundEl.textContent = 'ROUND ' + n + ' / 13'; }
  function setObjective(text) { objectiveEl.textContent = text; }
  function setSiteHint(text) {
    siteHint.textContent = text || '';
    siteHint.hidden = !text;
  }
  function setSpread(px) {
    crosshair.style.setProperty('--gap', Math.round(px) + 'px');
  }
  function hitMarker(kill) {
    hitmarker.classList.add('on');
    hitmarker.classList.toggle('kill', !!kill);
    hitTimer = kill ? 0.35 : 0.12;
  }
  function damageFlash() {
    vignette.classList.add('on');
    window.setTimeout(() => vignette.classList.remove('on'), 140);
  }
  function feed(killer, victim, head) {
    const line = document.createElement('div');
    line.className = 'feed-line';
    line.innerHTML = '';
    const k = document.createElement('span');
    k.textContent = killer;
    const x = document.createElement('span');
    x.className = 'feed-x';
    x.textContent = head ? ' ⌖ ' : ' ✕ ';
    const v = document.createElement('span');
    v.textContent = victim;
    line.append(k, x, v);
    feedEl.prepend(line);
    while (feedEl.children.length > 5) feedEl.lastChild.remove();
    window.setTimeout(() => line.remove(), 6000);
  }
  function banner(title, sub, ms = 2600) {
    bannerTitle.textContent = title;
    bannerSub.textContent = sub || '';
    bannerEl.hidden = false;
    bannerTimer = ms / 1000;
  }
  function hideBanner() { bannerEl.hidden = true; }
  function showProgress(label, frac) {
    progressWrap.hidden = false;
    progressLabel.textContent = label;
    progressFill.style.width = Math.round(Math.max(0, Math.min(1, frac)) * 100) + '%';
  }
  function hideProgress() { progressWrap.hidden = true; }
  function showOverlay(kind, score) {
    overlay.hidden = false;
    if (kind === 'start') {
      overlayTitle.textContent = 'DUSTFALL';
      overlayCopy.textContent = 'A round-based tactical shooter in the Ember Yard. Plant the charge at Site A or B — or drop every Ember defender. Click to play.';
      playBtn.textContent = 'Click to play';
    } else if (kind === 'paused') {
      overlayTitle.textContent = 'Paused';
      overlayCopy.textContent = 'Score ' + score + '. Click to keep playing.';
      playBtn.textContent = 'Resume';
    } else if (kind === 'match') {
      overlayTitle.textContent = score.title;
      overlayCopy.textContent = score.sub;
      playBtn.textContent = 'Play again';
    }
  }
  function hideOverlay() { overlay.hidden = true; }
  function showBuy(items, money, ownedWeapon) {
    buyMenu.hidden = false;
    buyMoney.textContent = '$' + money.toLocaleString('en-US');
    buyList.innerHTML = '';
    for (const item of items) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'buy-row';
      row.dataset.id = item.id;
      const owned = item.id === ownedWeapon;
      row.disabled = owned || money < item.price;
      row.innerHTML = '';
      const key = document.createElement('kbd');
      key.textContent = item.key;
      const label = document.createElement('span');
      label.className = 'buy-label';
      label.textContent = item.label;
      const price = document.createElement('span');
      price.className = 'buy-price';
      price.textContent = owned ? 'OWNED' : '$' + item.price.toLocaleString('en-US');
      row.append(key, label, price);
      buyList.appendChild(row);
    }
  }
  function hideBuy() { buyMenu.hidden = true; }

  function step(dt) {
    if (bannerTimer > 0) {
      bannerTimer -= dt;
      if (bannerTimer <= 0) hideBanner();
    }
    if (hitTimer > 0) {
      hitTimer -= dt;
      if (hitTimer <= 0) hitmarker.classList.remove('on', 'kill');
    }
  }

  return {
    setHealth, setArmor, setMoney, setAmmo, setWeapon, setGrenades, setTimer,
    setScore, setRound, setObjective, setSiteHint, setSpread, hitMarker,
    damageFlash, feed, banner, hideBanner, showProgress, hideProgress,
    showOverlay, hideOverlay, showBuy, hideBuy, step,
    onPlay(cb) { playBtn.addEventListener('click', cb); },
    onBuy(cb) { buyList.addEventListener('click', (e) => { const row = e.target.closest('.buy-row'); if (row) cb(row.dataset.id); }); },
  };
}
