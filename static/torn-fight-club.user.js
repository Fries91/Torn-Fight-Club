// ==UserScript==
// @name         Torn Fight Club - Fries91
// @namespace    Fries91.TornFightClub
// @version      1.1.8
// @description  Auto-updating Torn Fight Club organizer. Supports PDA, desktop browser, and mobile browser headers.
// @author       Fries91
// @match        https://www.torn.com/*
// @match        https://*.torn.com/*
// @updateURL    https://torn-fight-club.onrender.com/static/torn-fight-club.user.js
// @downloadURL  https://torn-fight-club.onrender.com/static/torn-fight-club.user.js
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      torn-fight-club.onrender.com
// @connect      api.torn.com
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';

  const APP = {
    base: GM_getValue('tfc_base', 'https://torn-fight-club.onrender.com'),
    token: GM_getValue('tfc_token', ''),
    tab: GM_getValue('tfc_tab', 'overview'),
    state: null,
    loading: false
  };

  const ADMIN_IDS = [3679030, 1905671];

  function req(method, path, body) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method,
        url: APP.base.replace(/\/$/, '') + path,
        headers: {
          'Content-Type': 'application/json',
          ...(APP.token ? { 'Authorization': 'Bearer ' + APP.token } : {})
        },
        data: body ? JSON.stringify(body) : undefined,
        timeout: 25000,
        onload: r => {
          let data = {};
          try { data = JSON.parse(r.responseText || '{}'); }
          catch (e) { return reject(new Error('Bad JSON from server')); }
          resolve(data);
        },
        onerror: () => reject(new Error('Connection failed')),
        ontimeout: () => reject(new Error('Request timed out'))
      });
    });
  }

  function id(x) { return document.getElementById(x); }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
  }

  function isAdmin() {
    return APP.state?.user && ADMIN_IDS.includes(Number(APP.state.user.torn_id));
  }

  function injectCss() {
    if (id('tfc-style')) return;
    const style = document.createElement('style');
    style.id = 'tfc-style';
    style.textContent = `
      #tfc-header-btn {
        display:inline-flex!important;
        align-items:center!important;
        justify-content:center!important;
        width:22px!important;
        height:22px!important;
        min-width:22px!important;
        min-height:22px!important;
        max-width:22px!important;
        max-height:22px!important;
        margin:0 4px!important;
        padding:0!important;
        border:0!important;
        outline:0!important;
        background:transparent!important;
        box-shadow:none!important;
        cursor:pointer!important;
        font-size:18px!important;
        line-height:22px!important;
        z-index:12!important;
        position:relative!important;
        vertical-align:middle!important;
        opacity:1!important;
        visibility:visible!important;
        overflow:visible!important;
        transform:none!important;
        flex:0 0 22px!important;
      }
      #tfc-header-btn:hover { transform:scale(1.05)!important; }
      body.tfc-open #tfc-header-btn { z-index:10!important; }

      #tfc-overlay {
        position:fixed!important;top:62px!important;left:50%!important;transform:translateX(-50%)!important;width:min(980px,96vw)!important;
        max-height:86vh!important;overflow:auto!important;background:#090909!important;color:#f5f5f5!important;border:2px solid #b40000!important;
        border-radius:16px!important;box-shadow:0 18px 60px #000!important;z-index:99999!important;font-family:Arial,Helvetica,sans-serif!important;
      }
      #tfc-head {display:flex!important;align-items:center!important;justify-content:space-between!important;gap:10px!important;padding:12px 14px!important;background:linear-gradient(90deg,#260000,#111)!important;position:sticky!important;top:0!important;z-index:2!important;border-bottom:1px solid #8a0000!important;}
      #tfc-title{font-size:20px!important;font-weight:900!important}
      #tfc-close{background:#300!important;color:#fff!important;border:1px solid #900!important;border-radius:10px!important;padding:7px 10px!important;cursor:pointer!important}
      #tfc-tabs{display:flex!important;flex-wrap:wrap!important;gap:6px!important;padding:10px!important;background:#111!important;border-bottom:1px solid #333!important}
      .tfc-tab{border:1px solid #555!important;background:#181818!important;color:#fff!important;border-radius:999px!important;padding:7px 10px!important;font-weight:800!important;cursor:pointer!important}
      .tfc-tab.active{background:#b40000!important;border-color:#ff4545!important}
      #tfc-body{padding:12px!important}
      .tfc-grid{display:grid!important;grid-template-columns:repeat(auto-fit,minmax(235px,1fr))!important;gap:10px!important}
      .tfc-card{background:#141414!important;border:1px solid #333!important;border-radius:14px!important;padding:12px!important}
      .tfc-card h3{margin:0 0 8px!important;font-size:17px!important;color:#ff4b4b!important}
      .tfc-muted{color:#aaa!important;font-size:12px!important}
      .tfc-btn{border:1px solid #666!important;background:#222!important;color:#fff!important;border-radius:10px!important;padding:8px 10px!important;margin:3px!important;cursor:pointer!important;font-weight:800!important}
      .tfc-btn.red{background:#8b0000!important;border-color:#ff3333!important}.tfc-btn.green{background:#064b20!important;border-color:#20c060!important}.tfc-btn.gold{background:#5c4000!important;border-color:#ffc107!important}
      .tfc-input,.tfc-select,.tfc-textarea{width:100%!important;box-sizing:border-box!important;background:#080808!important;color:#fff!important;border:1px solid #555!important;border-radius:10px!important;padding:9px!important;margin:4px 0!important}
      .tfc-textarea{min-height:90px!important;resize:vertical!important}.tfc-row{display:flex!important;gap:8px!important;align-items:center!important;flex-wrap:wrap!important}
      .tfc-pill{display:inline-block!important;border:1px solid #555!important;border-radius:999px!important;padding:3px 8px!important;background:#222!important;margin:2px!important;font-size:12px!important}
      .tfc-warn{border-color:#ffc107!important;background:#332500!important;color:#ffe38a!important}.tfc-good{border-color:#23c55e!important;background:#052e16!important;color:#a7f3d0!important}
      .tfc-vs{font-size:24px!important;font-weight:900!important;color:#ff4b4b!important}
      @media(max-width:620px){#tfc-overlay{top:45px!important;width:98vw!important;max-height:88vh!important}.tfc-grid{grid-template-columns:1fr!important}#tfc-title{font-size:16px!important}.tfc-tab{font-size:12px!important;padding:6px 8px!important}.tfc-card{padding:10px!important}}
    `;
    document.head.appendChild(style);
  }

  function visible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  }

  function isBadAreaText(txt) {
    txt = (txt || '').replace(/\s+/g, ' ').trim();
    return (
      txt.includes('Type your message') ||
      txt.includes('TRAIN') ||
      txt.includes('Balboas') ||
      txt.includes('Job Information') ||
      txt.includes('What would you like') ||
      txt.includes('submit') && txt.includes('apiKey')
    );
  }

  function isBadAreaClass(el) {
    const cls = (el.className || '').toString().toLowerCase();
    const idc = (el.id || '').toLowerCase();
    return (
      cls.includes('chat') ||
      idc.includes('chat') ||
      cls.includes('bottom') ||
      idc.includes('bottom') ||
      cls.includes('modal') ||
      idc.includes('modal')
    );
  }

  function inHeaderZone(el) {
    const r = el.getBoundingClientRect();
    if (r.top < 0) return false;

    // PDA + mobile browser can put the icon row lower than PC,
    // but it should never be inside bottom nav/chat/content panels.
    if (r.top > window.innerHeight * 0.70) return false;

    // Extra mobile browser allowance: if it is above the first large content card,
    // it is probably still a header/status row.
    return true;
  }

  function isSmallIconLike(el) {
    if (!visible(el) || !inHeaderZone(el)) return false;
    if (isBadAreaClass(el)) return false;
    const r = el.getBoundingClientRect();
    return r.width >= 7 && r.width <= 105 && r.height >= 7 && r.height <= 75;
  }

  function getSlot(leaf) {
    if (!leaf) return null;
    let child = leaf;
    let parent = leaf.parentElement;

    for (let depth = 0; parent && parent !== document.body && depth < 12; depth++) {
      if (!visible(parent) || !inHeaderZone(parent)) break;

      const pr = parent.getBoundingClientRect();
      const kids = Array.from(parent.children).filter(isSmallIconLike);
      const txt = (parent.textContent || '').replace(/\s+/g, ' ').trim();

      const goodRow =
        pr.width >= 130 &&
        pr.height <= 105 &&
        kids.length >= 3 &&
        !isBadAreaText(txt) &&
        !isBadAreaClass(parent);

      if (goodRow) return { row: parent, item: child };

      child = parent;
      parent = parent.parentElement;
    }

    return null;
  }

  function findByIconTextOrAttrs(matchFn, minScore) {
    const all = Array.from(document.querySelectorAll('a, button, span, div, i, img, svg, li'));
    let best = null, bestScore = 0;

    for (const el of all) {
      if (!isSmallIconLike(el)) continue;
      const txt = (el.textContent || '').trim();
      const title = (el.getAttribute('title') || '').toLowerCase();
      const aria = (el.getAttribute('aria-label') || '').toLowerCase();
      const cls = (el.className || '').toString().toLowerCase();
      const idc = (el.id || '').toLowerCase();
      const href = (el.getAttribute('href') || '').toLowerCase();

      const score = matchFn({ txt, title, aria, cls, idc, href, el });
      if (score > bestScore) {
        best = el;
        bestScore = score;
      }
    }

    return bestScore >= minScore ? best : null;
  }

  function findBankLeaf() {
    return findByIconTextOrAttrs(({txt,title,aria,cls,idc}) => {
      let score = 0;
      if (txt.includes('🪙')) score += 130;
      if (txt.includes('💰') || txt.includes('🏦')) score += 60;
      if (title.includes('bank') || aria.includes('bank')) score += 100;
      if (title.includes('faction') && title.includes('bank')) score += 130;
      if (aria.includes('faction') && aria.includes('bank')) score += 130;
      if (cls.includes('bank') || idc.includes('bank')) score += 90;
      if (cls.includes('faction') || idc.includes('faction')) score += 25;
      return score;
    }, 65);
  }

  function findGenderLeaf() {
    return findByIconTextOrAttrs(({txt,title,aria,cls,href}) => {
      let score = 0;
      if (txt === '♂' || txt === '♀' || txt === '⚥') score += 130;
      if (txt.includes('♂') || txt.includes('♀') || txt.includes('⚥')) score += 100;
      if (title.includes('gender') || aria.includes('gender')) score += 110;
      if (cls.includes('gender') || href.includes('gender')) score += 90;
      if (title.includes('male') || title.includes('female') || aria.includes('male') || aria.includes('female')) score += 70;
      if (cls.includes('male') || cls.includes('female')) score += 50;
      return score;
    }, 50);
  }

  function rowScore(row) {
    if (!visible(row) || !inHeaderZone(row)) return -999;
    if (isBadAreaClass(row)) return -999;

    const r = row.getBoundingClientRect();
    if (r.width < 130 || r.height < 12 || r.height > 110) return -999;

    const txt = (row.textContent || '').replace(/\s+/g, ' ').trim();
    if (isBadAreaText(txt)) return -999;

    const cls = (row.className || '').toString().toLowerCase();
    const idc = (row.id || '').toLowerCase();
    const kids = Array.from(row.children).filter(isSmallIconLike);
    const links = Array.from(row.querySelectorAll('a,button')).filter(isSmallIconLike);

    let score = 0;

    // PDA / mobile browser money & stat strip
    if (txt.includes('$')) score += 70;
    if (txt.includes('♂') || txt.includes('♀') || txt.includes('⚥')) score += 95;
    if (txt.includes('P') || txt.toLowerCase().includes('points')) score += 35;
    if (txt.includes('/')) score += 20;

    // Desktop / mobile browser icon-only top strips
    if (kids.length >= 3) score += 35;
    if (kids.length >= 5) score += 35;
    if (links.length >= 3) score += 30;
    if (r.height <= 55) score += 25;

    if (cls.includes('status') || idc.includes('status')) score += 45;
    if (cls.includes('header') || idc.includes('header')) score += 30;
    if (cls.includes('top') || idc.includes('top')) score += 25;
    if (cls.includes('icon') || idc.includes('icon')) score += 25;
    if (cls.includes('menu') || idc.includes('menu')) score += 15;

    // Prefer upper-ish rows, but don't exclude mobile browser's shifted layout.
    if (r.top < 90) score += 20;
    if (r.top > window.innerHeight * 0.55) score -= 180;

    return score;
  }

  function findBestHeaderRow() {
    const rows = Array.from(document.querySelectorAll('div, section, nav, header, ul, li'));
    let best = null, bestScore = -999;

    for (const row of rows) {
      const score = rowScore(row);
      if (score > bestScore) {
        best = row;
        bestScore = score;
      }
    }

    return bestScore >= 65 ? best : null;
  }

  function findMobileBrowserIconRow() {
    // Mobile browser often has a Torn logo/menu/search/icon strip that lacks money/gender text.
    // This finds the compact top row with several clickable icons.
    const rows = Array.from(document.querySelectorAll('div, nav, header, ul'));
    let best = null, bestScore = -999;

    for (const row of rows) {
      if (!visible(row) || !inHeaderZone(row) || isBadAreaClass(row)) continue;

      const r = row.getBoundingClientRect();
      const txt = (row.textContent || '').replace(/\s+/g, ' ').trim();
      if (isBadAreaText(txt)) continue;
      if (r.width < 180 || r.height < 20 || r.height > 95) continue;

      const icons = Array.from(row.querySelectorAll('a,button,span,div,i,img,svg')).filter(isSmallIconLike);
      const clickable = Array.from(row.querySelectorAll('a,button')).filter(isSmallIconLike);

      let score = 0;
      if (icons.length >= 4) score += 50;
      if (icons.length >= 6) score += 35;
      if (clickable.length >= 2) score += 25;
      if (r.top < 220) score += 30;
      if ((row.className || '').toString().toLowerCase().includes('header')) score += 25;
      if ((row.id || '').toLowerCase().includes('header')) score += 25;
      if (txt.length > 120) score -= 40;

      if (score > bestScore) {
        best = row;
        bestScore = score;
      }
    }

    return bestScore >= 65 ? best : null;
  }

  function makeButton() {
    let btn = id('tfc-header-btn');
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'tfc-header-btn';
      btn.type = 'button';
      btn.textContent = '🥊';
      btn.title = 'Torn Fight Club';
      btn.setAttribute('aria-label', 'Torn Fight Club');
      btn.addEventListener('click', toggle);
    }
    return btn;
  }

  function removeBadCopies() {
    const real = id('tfc-header-btn');
    document.querySelectorAll('#tfc-fixed-btn, #tfc-btn').forEach(x => x.remove());
    document.querySelectorAll('#tfc-header-btn').forEach(x => {
      if (real && x !== real) x.remove();
    });
  }

  function insertAfterSlot(slot, btn, lockName) {
    if (!slot || !slot.row || !slot.item || !btn) return false;
    try {
      if (slot.item.nextSibling !== btn) slot.row.insertBefore(btn, slot.item.nextSibling);
      btn.dataset.lockedTo = lockName;
      return true;
    } catch (e) {
      return false;
    }
  }

  function mountHeaderButton() {
    injectCss();
    removeBadCopies();

    const btn = makeButton();

    // 1) Best for your setup: next to faction banking icon.
    const bankSlot = getSlot(findBankLeaf());
    if (insertAfterSlot(bankSlot, btn, 'faction-bank-header-slot')) return true;

    // 2) Next to gender icon.
    const genderSlot = getSlot(findGenderLeaf());
    if (insertAfterSlot(genderSlot, btn, 'gender-header-slot')) return true;

    // 3) Money/points/status row.
    const row = findBestHeaderRow();
    if (row) {
      try {
        if (!row.contains(btn)) row.appendChild(btn);
        btn.dataset.lockedTo = 'best-status-header-row';
        return true;
      } catch (e) {}
    }

    // 4) Mobile-browser compact icon row.
    const mobileRow = findMobileBrowserIconRow();
    if (mobileRow) {
      try {
        if (!mobileRow.contains(btn)) mobileRow.appendChild(btn);
        btn.dataset.lockedTo = 'mobile-browser-icon-row';
        return true;
      } catch (e) {}
    }

    return false;
  }

  async function refresh() {
    if (APP.loading) return;
    APP.loading = true;
    try { APP.state = await req('GET', '/api/state'); }
    finally { APP.loading = false; }
  }

  async function toggle() {
    const old = id('tfc-overlay');
    if (old) { old.remove(); document.body.classList.remove('tfc-open'); return; }
    await openOverlay();
  }

  async function openOverlay() {
    injectCss();
    try { await refresh(); }
    catch (e) { APP.state = { ok:false, error:e.message }; }

    const box = document.createElement('div');
    box.id = 'tfc-overlay';
    box.innerHTML = `
      <div id="tfc-head">
        <div><div id="tfc-title">🥊🔥 THE TORN FIGHT CLUB</div><div class="tfc-muted">Fight cards • chaos rules • rankings • fun prediction points only</div></div>
        <button id="tfc-close">✕</button>
      </div>
      <div id="tfc-tabs"></div><div id="tfc-body">Loading...</div>`;
    document.body.appendChild(box);
    document.body.classList.add('tfc-open');
    id('tfc-close').onclick = () => { box.remove(); document.body.classList.remove('tfc-open'); };
    renderTabs(); render();
  }

  function setTab(tab) { APP.tab = tab; GM_setValue('tfc_tab', tab); renderTabs(); render(); }

  function renderTabs() {
    const tabs = ['overview','login','fighters','fightcard','predictions','ideas','leaderboard','settings'];
    if (isAdmin()) tabs.push('admin');
    id('tfc-tabs').innerHTML = tabs.map(t => `<button class="tfc-tab ${APP.tab===t?'active':''}" data-tab="${t}">${tabLabel(t)}</button>`).join('');
    id('tfc-tabs').querySelectorAll('button').forEach(btn => btn.onclick = () => setTab(btn.dataset.tab));
  }

  function tabLabel(t) {
    return {overview:'Overview',login:'Login',fighters:'Fighters',fightcard:'Fight Card',predictions:'Picks',ideas:'Ideas',leaderboard:'Ranks',settings:'Settings',admin:'Admin'}[t] || t;
  }

  function render() {
    const body = id('tfc-body');
    if (!body) return;
    const s = APP.state || {};
    if (s.ok === false && APP.tab !== 'settings') {
      body.innerHTML = `<div class="tfc-card"><h3>Connection Issue</h3><p>${esc(s.error || 'Could not reach backend.')}</p><p class="tfc-muted">Check Render URL in Settings.</p></div>`;
      bind(); return;
    }
    if (APP.tab === 'overview') body.innerHTML = overview(s);
    if (APP.tab === 'login') body.innerHTML = loginHtml(s);
    if (APP.tab === 'fighters') body.innerHTML = fightersHtml(s);
    if (APP.tab === 'fightcard') body.innerHTML = fightcardHtml(s);
    if (APP.tab === 'predictions') body.innerHTML = predictionsHtml(s);
    if (APP.tab === 'ideas') body.innerHTML = ideasHtml(s);
    if (APP.tab === 'leaderboard') body.innerHTML = leaderboardHtml(s);
    if (APP.tab === 'settings') body.innerHTML = settingsHtml();
    if (APP.tab === 'admin') body.innerHTML = adminHtml(s);
    bind();
  }

  function userLine(s) { return s.user ? `${esc(s.user.name)} [${esc(s.user.torn_id)}] • ${esc(s.user.role)} • ${esc(s.user.prediction_points)} pts` : 'Not logged in'; }

  function overview(s) {
    return `<div class="tfc-grid">
      <div class="tfc-card"><h3>Welcome to the underground</h3><p>Organize Fight Club nights with fighters, funny rules, rankings, fight cards, and community ideas.</p><p><span class="tfc-pill tfc-good">Fries91 admin</span><span class="tfc-pill tfc-good">Slimyfleshlite admin</span><span class="tfc-pill tfc-warn">Prediction points only</span></p><div class="tfc-muted">Logged in: ${userLine(s)}</div></div>
      <div class="tfc-card"><h3>Current Numbers</h3><div class="tfc-pill">🥊 ${(s.fighters||[]).length} fighters</div><div class="tfc-pill">🔥 ${(s.fights||[]).filter(f=>f.status==='live'||f.status==='scheduled').length} open fights</div><div class="tfc-pill">💡 ${(s.ideas||[]).length} ideas</div><div class="tfc-pill">📅 ${(s.events||[]).length} events</div></div>
      <div class="tfc-card"><h3>Looking For</h3><div class="tfc-pill">🥊 Fighters</div><div class="tfc-pill">📋 Organizers</div><div class="tfc-pill">⚖️ Referees</div><div class="tfc-pill">😂 Chaos ideas</div></div>
    </div>
    <div class="tfc-card" style="margin-top:10px"><h3>Events</h3>${(s.events||[]).map(e=>`<div><b>${esc(e.title)}</b> <span class="tfc-pill">${esc(e.status)}</span><br><span class="tfc-muted">${esc(e.theme)} ${e.starts_at?'• '+esc(e.starts_at):''}</span></div>`).join('<hr>') || 'No events yet.'}</div>`;
  }

  function loginHtml(s) {
    return `<div class="tfc-card"><h3>API Key Login</h3><p class="tfc-muted">Used only to identify the Torn player for registration, picks, and admin access.</p><input id="tfc-api" class="tfc-input" placeholder="Paste Torn API key"><button id="tfc-login" class="tfc-btn green">Login</button><button id="tfc-logout" class="tfc-btn">Logout</button><div class="tfc-muted">Current: ${userLine(s)}</div></div>`;
  }

  function fightersHtml(s) {
    return `<div class="tfc-grid"><div class="tfc-card"><h3>Register as Fighter</h3><select id="tfc-reg-event" class="tfc-select">${(s.events||[]).map(e=>`<option value="${e.id}">${esc(e.title)}</option>`).join('')}</select><input id="tfc-nick" class="tfc-input" placeholder="Fighter nickname"><input id="tfc-range" class="tfc-input" placeholder="Similar stats range / class"><input id="tfc-loadout" class="tfc-input" placeholder="Funny loadout / rule idea"><button id="tfc-register" class="tfc-btn green">Register</button></div>${(s.fighters||[]).map(f=>fighterCard(f)).join('') || '<div class="tfc-card">No fighters yet.</div>'}</div>`;
  }

  function fighterCard(f) {
    return `<div class="tfc-card"><h3>${esc(f.nickname||f.name)}</h3><div>${esc(f.name)} [${esc(f.torn_id)}]</div><div class="tfc-muted">${esc(f.stats_range||'No stats range set')}</div><div>${esc(f.loadout||'No loadout set')}</div><div><span class="tfc-pill">ID ${esc(f.id)}</span><span class="tfc-pill">Record ${esc(f.record_w)}-${esc(f.record_l)}</span><span class="tfc-pill">Rank ${esc(f.rank_points)}</span></div></div>`;
  }

  function fightcardHtml(s) { return `<div class="tfc-grid">${(s.fights||[]).map(f=>fightCard(f,false)).join('') || '<div class="tfc-card">No fights scheduled.</div>'}</div>`; }

  function fightCard(f, pickMode) {
    const nameA = f.fighter_a_nick || f.fighter_a_name;
    const nameB = f.fighter_b_nick || f.fighter_b_name;
    return `<div class="tfc-card"><h3>${esc(f.round_name)} <span class="tfc-pill">${esc(f.status)}</span></h3><div class="tfc-row"><b>${esc(nameA)}</b><span class="tfc-vs">VS</span><b>${esc(nameB)}</b></div><div class="tfc-muted">${esc(f.rule_set)}</div><div><span class="tfc-pill">A odds ${esc(f.odds_a)}</span><span class="tfc-pill">B odds ${esc(f.odds_b)}</span><span class="tfc-pill">Fight ID ${esc(f.id)}</span></div>${f.winner_fighter_id?`<div class="tfc-pill tfc-good">Winner fighter ID ${esc(f.winner_fighter_id)} • ${esc(f.result_method)}</div>`:''}${pickMode&&['scheduled','live'].includes(f.status)?`<div class="tfc-row"><input class="tfc-input tfc-points" data-fight="${f.id}" type="number" min="1" max="100" value="10" style="max-width:120px"><button class="tfc-btn green tfc-pick" data-fight="${f.id}" data-pick="${f.fighter_a_id}">Pick ${esc(nameA)}</button><button class="tfc-btn green tfc-pick" data-fight="${f.id}" data-pick="${f.fighter_b_id}">Pick ${esc(nameB)}</button></div>`:''}</div>`;
  }

  function predictionsHtml(s) { return `<div class="tfc-card"><h3>Make a Pick</h3><p class="tfc-muted">Fun prediction points only. This does not move Torn cash or items.</p><div class="tfc-pill">Your points: ${s.user?esc(s.user.prediction_points):'Login needed'}</div></div><div class="tfc-grid" style="margin-top:10px">${(s.fights||[]).map(f=>fightCard(f,true)).join('') || '<div class="tfc-card">No fights open.</div>'}</div>`; }

  function ideasHtml(s) { return `<div class="tfc-card"><h3>Submit Stupid/Funny Ideas</h3><textarea id="tfc-idea" class="tfc-textarea" placeholder="Example: pillow fight championship, only melee night, drunk themed chaos, randomized gear battle..."></textarea><button id="tfc-idea-btn" class="tfc-btn green">Submit Idea</button></div><div class="tfc-grid" style="margin-top:10px">${(s.ideas||[]).map(i=>`<div class="tfc-card"><b>${esc(i.name||'Someone')}</b><p>${esc(i.idea)}</p><div class="tfc-muted">${esc(i.created_at)}</div></div>`).join('') || '<div class="tfc-card">No ideas yet.</div>'}</div>`; }

  function leaderboardHtml(s) { return `<div class="tfc-card"><h3>Prediction Points Leaderboard</h3>${(s.leaderboard||[]).map((u,idx)=>`<div>${idx+1}. <b>${esc(u.name)}</b> [${esc(u.torn_id)}] — ${esc(u.prediction_points)} pts <span class="tfc-pill">${esc(u.role)}</span></div>`).join('') || 'No leaderboard yet.'}</div>`; }

  function settingsHtml() { return `<div class="tfc-card"><h3>Settings</h3><label>Render backend URL</label><input id="tfc-base" class="tfc-input" value="${esc(APP.base)}"><button id="tfc-save-base" class="tfc-btn green">Save Backend URL</button><button id="tfc-refresh" class="tfc-btn">Refresh Data</button><button id="tfc-health" class="tfc-btn gold">Test Health</button><div class="tfc-muted">Auto update URL: https://torn-fight-club.onrender.com/static/torn-fight-club.user.js</div><div id="tfc-settings-msg" class="tfc-muted"></div></div>`; }

  function adminHtml(s) {
    return `<div class="tfc-grid"><div class="tfc-card"><h3>Create Event</h3><input id="tfc-ev-title" class="tfc-input" placeholder="Event title"><input id="tfc-ev-theme" class="tfc-input" placeholder="Theme"><input id="tfc-ev-start" class="tfc-input" placeholder="Start time text"><button id="tfc-create-event" class="tfc-btn green">Create Event</button></div><div class="tfc-card"><h3>Create Fight</h3><input id="tfc-f-event" class="tfc-input" placeholder="Event ID" value="${(s.events&&s.events[0]&&s.events[0].id)||1}"><input id="tfc-fa" class="tfc-input" placeholder="Fighter A ID"><input id="tfc-fb" class="tfc-input" placeholder="Fighter B ID"><input id="tfc-rname" class="tfc-input" placeholder="Round name"><input id="tfc-rules" class="tfc-input" placeholder="Rules"><input id="tfc-start" class="tfc-input" placeholder="Start time text"><div class="tfc-row"><input id="tfc-odda" class="tfc-input" placeholder="Odds A" value="1.9" style="max-width:120px"><input id="tfc-oddb" class="tfc-input" placeholder="Odds B" value="1.9" style="max-width:120px"></div><button id="tfc-create-fight" class="tfc-btn green">Create Fight</button></div><div class="tfc-card"><h3>Set Fight Status</h3><input id="tfc-status-fight" class="tfc-input" placeholder="Fight ID"><select id="tfc-status-val" class="tfc-select"><option value="scheduled">Scheduled</option><option value="live">Live</option><option value="done">Done</option><option value="cancelled">Cancelled</option></select><button id="tfc-status-save" class="tfc-btn gold">Save Status</button></div><div class="tfc-card"><h3>Set Result</h3><input id="tfc-res-fight" class="tfc-input" placeholder="Fight ID"><input id="tfc-res-winner" class="tfc-input" placeholder="Winner fighter ID"><input id="tfc-res-method" class="tfc-input" placeholder="KO / Lowest HP / Surrender"><button id="tfc-result" class="tfc-btn red">Save Result</button></div></div><div class="tfc-card" style="margin-top:10px"><h3>Fighter IDs</h3>${(s.fighters||[]).map(f=>`<span class="tfc-pill">${f.id}: ${esc(f.nickname||f.name)}</span>`).join('') || 'No fighters yet.'}</div><div class="tfc-card" style="margin-top:10px"><h3>Fight IDs</h3>${(s.fights||[]).map(f=>`<span class="tfc-pill">${f.id}: ${esc(f.fighter_a_nick||f.fighter_a_name)} vs ${esc(f.fighter_b_nick||f.fighter_b_name)} — ${esc(f.status)}</span>`).join('') || 'No fights yet.'}</div>`;
  }

  function bind() {
    const on = (name, fn) => { const x = id(name); if (x) x.onclick = fn; };
    on('tfc-login', async () => { const api_key=id('tfc-api').value.trim(); const r=await req('POST','/api/login',{api_key}).catch(e=>({ok:false,error:e.message})); if(!r.ok)return alert(r.error||'Login failed'); APP.token=r.token; GM_setValue('tfc_token',APP.token); await refresh(); renderTabs(); render(); });
    on('tfc-logout', async () => { APP.token=''; GM_setValue('tfc_token',''); await refresh().catch(()=>null); renderTabs(); render(); });
    on('tfc-register', async () => { const r=await req('POST','/api/fighters/register',{event_id:id('tfc-reg-event').value,nickname:id('tfc-nick').value,stats_range:id('tfc-range').value,loadout:id('tfc-loadout').value}).catch(e=>({ok:false,error:e.message})); if(!r.ok)return alert(r.error||'Register failed'); await refresh(); render(); });
    on('tfc-idea-btn', async () => { const idea=id('tfc-idea').value.trim(); const r=await req('POST','/api/ideas',{idea}).catch(e=>({ok:false,error:e.message})); if(!r.ok)return alert(r.error||'Idea failed'); await refresh(); render(); });
    document.querySelectorAll('.tfc-pick').forEach(btn => { btn.onclick = async () => { const fight_id=btn.dataset.fight; const points=document.querySelector(`.tfc-points[data-fight="${fight_id}"]`)?.value||10; const r=await req('POST','/api/predictions',{fight_id,pick_fighter_id:btn.dataset.pick,points}).catch(e=>({ok:false,error:e.message})); if(!r.ok)return alert(r.error||'Pick failed'); await refresh(); render(); }; });
    on('tfc-save-base', () => { APP.base=id('tfc-base').value.trim().replace(/\/$/,''); GM_setValue('tfc_base',APP.base); id('tfc-settings-msg').textContent='Saved backend URL: '+APP.base; });
    on('tfc-refresh', async () => { await refresh().catch(e=>alert(e.message)); renderTabs(); render(); });
    on('tfc-health', async () => { const r=await req('GET','/health').catch(e=>({ok:false,error:e.message})); id('tfc-settings-msg').textContent=r.ok?'Health OK. Database OK.':('Health failed: '+(r.error||'unknown')); });
    on('tfc-create-event', async () => { const r=await req('POST','/api/admin/events',{title:id('tfc-ev-title').value,theme:id('tfc-ev-theme').value,starts_at:id('tfc-ev-start').value}).catch(e=>({ok:false,error:e.message})); if(!r.ok)return alert(r.error||'Create event failed'); await refresh(); render(); });
    on('tfc-create-fight', async () => { const r=await req('POST','/api/admin/fights',{event_id:id('tfc-f-event').value,fighter_a_id:id('tfc-fa').value,fighter_b_id:id('tfc-fb').value,round_name:id('tfc-rname').value,rule_set:id('tfc-rules').value,starts_at:id('tfc-start').value,odds_a:id('tfc-odda').value,odds_b:id('tfc-oddb').value}).catch(e=>({ok:false,error:e.message})); if(!r.ok)return alert(r.error||'Create fight failed'); await refresh(); render(); });
    on('tfc-status-save', async () => { const fight_id=id('tfc-status-fight').value.trim(); const status=id('tfc-status-val').value; const r=await req('POST',`/api/admin/fights/${fight_id}/status`,{status}).catch(e=>({ok:false,error:e.message})); if(!r.ok)return alert(r.error||'Status failed'); await refresh(); render(); });
    on('tfc-result', async () => { const fight_id=id('tfc-res-fight').value.trim(); const r=await req('POST',`/api/admin/fights/${fight_id}/result`,{winner_fighter_id:id('tfc-res-winner').value,result_method:id('tfc-res-method').value}).catch(e=>({ok:false,error:e.message})); if(!r.ok)return alert(r.error||'Result failed'); await refresh(); render(); });
  }

  function boot() {
    mountHeaderButton();
    let ticks = 0;
    const interval = setInterval(() => {
      mountHeaderButton();
      ticks++;
      if (ticks > 240) clearInterval(interval);
    }, 1000);

    const observer = new MutationObserver(() => mountHeaderButton());
    observer.observe(document.documentElement || document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
