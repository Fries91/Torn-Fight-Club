// ==UserScript==
// @name         Torn Fight Club - Fries91
// @namespace    Fries91.TornFightClub
// @version      2.1.1
// @description  Auto-updating Torn Fight Club organizer. Private battle stats with always-visible launcher fix.
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
        display:inline-flex!important;align-items:center!important;justify-content:center!important;
        width:22px!important;height:22px!important;min-width:22px!important;min-height:22px!important;max-width:22px!important;max-height:22px!important;
        margin:0 4px!important;padding:0!important;border:0!important;outline:0!important;background:transparent!important;box-shadow:none!important;
        cursor:pointer!important;font-size:18px!important;line-height:22px!important;z-index:12!important;position:relative!important;vertical-align:middle!important;
        opacity:1!important;visibility:visible!important;overflow:visible!important;transform:none!important;flex:0 0 22px!important;
      }
      #tfc-header-btn:hover { transform:scale(1.05)!important; }
      body.tfc-open #tfc-header-btn { z-index:10!important; }

      #tfc-header-dock {
        position:fixed!important;
        top:8px!important;
        right:8px!important;
        width:34px!important;
        height:34px!important;
        display:flex!important;
        align-items:center!important;
        justify-content:center!important;
        background:rgba(12,0,0,.88)!important;
        border:2px solid rgba(255,70,70,.85)!important;
        border-radius:10px!important;
        z-index:999970!important;
        box-shadow:0 4px 18px rgba(0,0,0,.75)!important;
        pointer-events:auto!important;
        opacity:1!important;
        visibility:visible!important;
      }
      #tfc-header-dock #tfc-header-btn {
        margin:0!important;
        width:30px!important;
        height:30px!important;
        min-width:30px!important;
        min-height:30px!important;
        font-size:22px!important;
        line-height:30px!important;
      }
      body.tfc-open #tfc-header-dock { z-index:10!important; }

      #tfc-overlay {
        position:fixed!important;top:62px!important;left:50%!important;transform:translateX(-50%)!important;width:min(1040px,96vw)!important;
        max-height:86vh!important;overflow:auto!important;background:#090909!important;color:#f5f5f5!important;border:2px solid #b40000!important;
        border-radius:16px!important;box-shadow:0 18px 60px #000!important;z-index:99999!important;font-family:Arial,Helvetica,sans-serif!important;
      }
      #tfc-head {
        display:flex!important;align-items:center!important;justify-content:space-between!important;gap:10px!important;padding:12px 14px!important;
        background:linear-gradient(90deg,#260000,#111)!important;position:sticky!important;top:0!important;z-index:2!important;border-bottom:1px solid #8a0000!important;
      }
      #tfc-title{font-size:20px!important;font-weight:900!important}
      #tfc-close{background:#300!important;color:#fff!important;border:1px solid #900!important;border-radius:10px!important;padding:7px 10px!important;cursor:pointer!important}
      #tfc-tabs{display:flex!important;flex-wrap:wrap!important;gap:6px!important;padding:10px!important;background:#111!important;border-bottom:1px solid #333!important}
      .tfc-tab{border:1px solid #555!important;background:#181818!important;color:#fff!important;border-radius:999px!important;padding:7px 10px!important;font-weight:800!important;cursor:pointer!important}
      .tfc-tab.active{background:#b40000!important;border-color:#ff4545!important}
      #tfc-body{padding:12px!important}
      .tfc-grid{display:grid!important;grid-template-columns:repeat(auto-fit,minmax(235px,1fr))!important;gap:10px!important}
      .tfc-grid.wide{grid-template-columns:repeat(auto-fit,minmax(310px,1fr))!important}
      .tfc-card{background:#141414!important;border:1px solid #333!important;border-radius:14px!important;padding:12px!important}
      .tfc-card.hero{background:linear-gradient(135deg,#230000,#141414)!important;border-color:#a10000!important}
      .tfc-card h3{margin:0 0 8px!important;font-size:17px!important;color:#ff4b4b!important}
      .tfc-card h4{margin:6px 0!important;font-size:14px!important;color:#fff!important}
      .tfc-muted{color:#aaa!important;font-size:12px!important}
      .tfc-btn{border:1px solid #666!important;background:#222!important;color:#fff!important;border-radius:10px!important;padding:8px 10px!important;margin:3px!important;cursor:pointer!important;font-weight:800!important}
      .tfc-btn.red{background:#8b0000!important;border-color:#ff3333!important}
      .tfc-btn.green{background:#064b20!important;border-color:#20c060!important}
      .tfc-btn.gold{background:#5c4000!important;border-color:#ffc107!important}
      .tfc-btn.blue{background:#07365c!important;border-color:#3aa5ff!important}
      .tfc-input,.tfc-select,.tfc-textarea{width:100%!important;box-sizing:border-box!important;background:#080808!important;color:#fff!important;border:1px solid #555!important;border-radius:10px!important;padding:9px!important;margin:4px 0!important}
      .tfc-textarea{min-height:90px!important;resize:vertical!important}
      .tfc-row{display:flex!important;gap:8px!important;align-items:center!important;flex-wrap:wrap!important}
      .tfc-between{display:flex!important;justify-content:space-between!important;gap:10px!important;align-items:center!important;flex-wrap:wrap!important}
      .tfc-pill{display:inline-block!important;border:1px solid #555!important;border-radius:999px!important;padding:3px 8px!important;background:#222!important;margin:2px!important;font-size:12px!important}
      .tfc-warn{border-color:#ffc107!important;background:#332500!important;color:#ffe38a!important}
      .tfc-good{border-color:#23c55e!important;background:#052e16!important;color:#a7f3d0!important}
      .tfc-live{border-color:#ef4444!important;background:#3b0505!important;color:#fecaca!important}
      .tfc-vs{font-size:24px!important;font-weight:900!important;color:#ff4b4b!important}
      .tfc-admin-grid{display:grid!important;grid-template-columns:repeat(auto-fit,minmax(280px,1fr))!important;gap:10px!important}
      .tfc-mini-list{display:grid!important;gap:6px!important}
      .tfc-mini-item{background:#0c0c0c!important;border:1px solid #2a2a2a!important;border-radius:10px!important;padding:8px!important}
      .tfc-searchbar{display:grid!important;grid-template-columns:1fr 160px 160px!important;gap:8px!important;align-items:center!important}
      .tfc-statline{display:flex!important;gap:6px!important;flex-wrap:wrap!important;margin-top:7px!important}
      .tfc-ranknum{font-size:22px!important;font-weight:900!important;color:#ff4b4b!important;margin-right:4px!important}
      .tfc-empty{padding:14px!important;border:1px dashed #555!important;border-radius:12px!important;color:#aaa!important;text-align:center!important}
      .tfc-bracket{display:grid!important;gap:8px!important}
      .tfc-bracket-entry{border:1px solid #444!important;background:#0a0a0a!important;border-radius:10px!important;padding:8px!important}
      .tfc-belt{background:linear-gradient(135deg,#3a2600,#111)!important;border-color:#c79a22!important}
      .tfc-ref{background:linear-gradient(135deg,#081b2f,#111)!important;border-color:#3aa5ff!important}
      .tfc-private-stats{background:linear-gradient(135deg,#111827,#0b0b0b)!important;border-color:#60a5fa!important}
      .tfc-stat-big{font-size:18px!important;font-weight:900!important;color:#fff!important}
      .tfc-stat-grid{display:grid!important;grid-template-columns:repeat(auto-fit,minmax(130px,1fr))!important;gap:8px!important;margin-top:8px!important}
      @media(max-width:620px){.tfc-searchbar{grid-template-columns:1fr!important}}
      @media(max-width:620px){
        #tfc-overlay{top:45px!important;width:98vw!important;max-height:88vh!important}
        .tfc-grid,.tfc-grid.wide,.tfc-admin-grid{grid-template-columns:1fr!important}
        #tfc-title{font-size:16px!important}
        .tfc-tab{font-size:12px!important;padding:6px 8px!important}
        .tfc-card{padding:10px!important}
      }
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
    return txt.includes('Type your message') || txt.includes('TRAIN') || txt.includes('Balboas') || txt.includes('Job Information');
  }

  function isBadAreaClass(el) {
    const cls = (el.className || '').toString().toLowerCase();
    const idc = (el.id || '').toLowerCase();
    return cls.includes('chat') || idc.includes('chat') || cls.includes('bottom') || idc.includes('bottom') || cls.includes('modal') || idc.includes('modal');
  }

  function inHeaderZone(el) {
    const r = el.getBoundingClientRect();
    if (r.top < 0) return false;
    if (r.top > window.innerHeight * 0.70) return false;
    return true;
  }

  function isSmallIconLike(el) {
    if (!visible(el) || !inHeaderZone(el) || isBadAreaClass(el)) return false;
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

      if (pr.width >= 130 && pr.height <= 105 && kids.length >= 3 && !isBadAreaText(txt) && !isBadAreaClass(parent)) {
        return { row: parent, item: child };
      }

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
      if (score > bestScore) { best = el; bestScore = score; }
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
    if (!visible(row) || !inHeaderZone(row) || isBadAreaClass(row)) return -999;
    const r = row.getBoundingClientRect();
    if (r.width < 130 || r.height < 12 || r.height > 110) return -999;
    const txt = (row.textContent || '').replace(/\s+/g, ' ').trim();
    if (isBadAreaText(txt)) return -999;
    const cls = (row.className || '').toString().toLowerCase();
    const idc = (row.id || '').toLowerCase();
    const kids = Array.from(row.children).filter(isSmallIconLike);
    const links = Array.from(row.querySelectorAll('a,button')).filter(isSmallIconLike);
    let score = 0;

    if (txt.includes('$')) score += 70;
    if (txt.includes('♂') || txt.includes('♀') || txt.includes('⚥')) score += 95;
    if (txt.includes('P') || txt.toLowerCase().includes('points')) score += 35;
    if (txt.includes('/')) score += 20;
    if (kids.length >= 3) score += 35;
    if (kids.length >= 5) score += 35;
    if (links.length >= 3) score += 30;
    if (r.height <= 55) score += 25;
    if (cls.includes('status') || idc.includes('status')) score += 45;
    if (cls.includes('header') || idc.includes('header')) score += 30;
    if (cls.includes('top') || idc.includes('top')) score += 25;
    if (cls.includes('icon') || idc.includes('icon')) score += 25;
    if (r.top < 90) score += 20;
    if (r.top > window.innerHeight * 0.55) score -= 180;

    return score;
  }

  function findBestHeaderRow() {
    const rows = Array.from(document.querySelectorAll('div, section, nav, header, ul, li'));
    let best = null, bestScore = -999;
    for (const row of rows) {
      const score = rowScore(row);
      if (score > bestScore) { best = row; bestScore = score; }
    }
    return bestScore >= 65 ? best : null;
  }

  function findMobileBrowserIconRow() {
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

      if (score > bestScore) { best = row; bestScore = score; }
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

  function getOrCreateHeaderDock() {
    let dock = id('tfc-header-dock');
    if (dock) return dock;
    dock = document.createElement('div');
    dock.id = 'tfc-header-dock';
    dock.title = 'Torn Fight Club';
    document.body.appendChild(dock);
    return dock;
  }

  function removeDockIfButtonPlaced() {
    const dock = id('tfc-header-dock');
    const btn = id('tfc-header-btn');
    if (dock && btn && !dock.contains(btn)) dock.remove();
  }

  function placeInEmergencyTopDock(btn) {
    const dock = getOrCreateHeaderDock();
    if (!dock.contains(btn)) dock.appendChild(btn);
    btn.dataset.lockedTo = 'emergency-top-header-dock';
    return true;
  }

  function mountHeaderButton() {
    injectCss();
    removeBadCopies();

    const btn = makeButton();

    // Safety first: put it in the top dock immediately so it never disappears.
    // After that, try to move it into the real Torn header if a clean slot exists.
    placeInEmergencyTopDock(btn);

    // If the user wants it in Torn's header, these attempts move the same button
    // from the dock into the detected header slot. If detection fails, dock remains.
    const bankSlot = getSlot(findBankLeaf());
    if (insertAfterSlot(bankSlot, btn, 'faction-bank-header-slot')) {
      removeDockIfButtonPlaced();
      return true;
    }

    const genderSlot = getSlot(findGenderLeaf());
    if (insertAfterSlot(genderSlot, btn, 'gender-header-slot')) {
      removeDockIfButtonPlaced();
      return true;
    }

    const row = findBestHeaderRow();
    if (row) {
      try {
        if (!row.contains(btn)) row.appendChild(btn);
        btn.dataset.lockedTo = 'best-status-header-row';
        removeDockIfButtonPlaced();
        return true;
      } catch (e) {}
    }

    const mobileRow = findMobileBrowserIconRow();
    if (mobileRow) {
      try {
        if (!mobileRow.contains(btn)) mobileRow.appendChild(btn);
        btn.dataset.lockedTo = 'mobile-browser-icon-row';
        removeDockIfButtonPlaced();
        return true;
      } catch (e) {}
    }

    // If nothing matched, the icon remains visible in top dock.
    return true;
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

    const old = id('tfc-overlay');
    if (old) old.remove();

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
    const tabs = ['overview','fightcard','fighters','predictions','leaderboard','tournaments','belts','teams','refs','ideas','rules','settings'];
    if (isAdmin()) tabs.push('admin');
    id('tfc-tabs').innerHTML = tabs.map(t => `<button class="tfc-tab ${APP.tab===t?'active':''}" data-tab="${t}">${tabLabel(t)}</button>`).join('');
    id('tfc-tabs').querySelectorAll('button').forEach(btn => btn.onclick = () => setTab(btn.dataset.tab));
  }

  function tabLabel(t) {
    return {
      overview:'Overview',
      fightcard:'Fight Card',
      fighters:'Fighters',
      predictions:'Picks',
      leaderboard:'Ranks',
      ideas:'Ideas',
      rules:'Rules',
      settings:'Settings',
      tournaments:'Brackets',
      belts:'Belts',
      teams:'Teams',
      refs:'Refs',
      admin:'Admin'
    }[t] || t;
  }

  function render() {
    const body = id('tfc-body');
    if (!body) return;
    const s = APP.state || {};
    if (s.ok === false && APP.tab !== 'settings') {
      body.innerHTML = `<div class="tfc-card"><h3>Connection Issue</h3><p>${esc(s.error || 'Could not reach backend.')}</p><p class="tfc-muted">Check Render URL in Settings.</p></div>`;
      bind(); return;
    }

    if (APP.tab === 'overview') body.innerHTML = overviewHtml(s);
    if (APP.tab === 'fightcard') body.innerHTML = fightCardTabHtml(s);
    if (APP.tab === 'fighters') body.innerHTML = fightersHtml(s);
    if (APP.tab === 'predictions') body.innerHTML = predictionsHtml(s);
    if (APP.tab === 'leaderboard') body.innerHTML = leaderboardHtml(s);
    if (APP.tab === 'tournaments') body.innerHTML = tournamentsHtml(s);
    if (APP.tab === 'belts') body.innerHTML = beltsHtml(s);
    if (APP.tab === 'teams') body.innerHTML = teamsHtml(s);
    if (APP.tab === 'refs') body.innerHTML = refsHtml(s);
    if (APP.tab === 'ideas') body.innerHTML = ideasHtml(s);
    if (APP.tab === 'rules') body.innerHTML = rulesHtml();
    if (APP.tab === 'settings') body.innerHTML = settingsHtml();
    if (APP.tab === 'admin') body.innerHTML = adminHtml(s);
    bind();
  }

  function userLine(s) {
    return s.user ? `${esc(s.user.name)} [${esc(s.user.torn_id)}] • ${esc(s.user.role)} • ${esc(s.user.prediction_points)} pts` : 'Not logged in';
  }

  function eventName(s, eventId) {
    const e = (s.events || []).find(x => Number(x.id) === Number(eventId));
    return e ? e.title : `Event ${eventId || '?'}`;
  }

  function getFights(s, status) {
    return (s.fights || []).filter(f => !status || f.status === status);
  }

  function nextOpenFight(s) {
    return (s.fights || []).find(f => f.status === 'live') || (s.fights || []).find(f => f.status === 'scheduled') || null;
  }

  function topFighter(s) {
    const fighters = [...(s.fighters || [])];
    fighters.sort((a,b) => Number(b.rank_points || 0) - Number(a.rank_points || 0) || Number(b.record_w || 0) - Number(a.record_w || 0));
    return fighters[0] || null;
  }

  function overviewHtml(s) {
    const live = getFights(s, 'live');
    const scheduled = getFights(s, 'scheduled');
    const done = getFights(s, 'done');
    const next = nextOpenFight(s);
    const champ = topFighter(s);
    const currentEvent = (s.events || [])[0];

    return `
      <div class="tfc-grid wide">
        <div class="tfc-card hero">
          <h3>🥊 Fight Night Control</h3>
          <p>Run funny loadout fights, build cards, track records, and let viewers make fun-point picks.</p>
          <div class="tfc-row">
            <span class="tfc-pill tfc-good">Prediction points only</span>
            <span class="tfc-pill">Logged: ${userLine(s)}</span>
          </div>
          <div class="tfc-row" style="margin-top:8px">
            <button class="tfc-btn green tfc-go" data-tab="fightcard">Open Fight Card</button>
            <button class="tfc-btn blue tfc-go" data-tab="fighters">Register Fighter</button>
            <button class="tfc-btn gold tfc-go" data-tab="predictions">Make Picks</button>
            ${isAdmin() ? '<button class="tfc-btn red tfc-go" data-tab="admin">Admin Control</button>' : ''}
          </div>
        </div>

        <div class="tfc-card">
          <h3>📅 Current Event</h3>
          ${currentEvent ? `
            <h4>${esc(currentEvent.title)}</h4>
            <div class="tfc-muted">${esc(currentEvent.theme || 'Chaos Night')}</div>
            <div>
              <span class="tfc-pill">${esc(currentEvent.status)}</span>
              ${currentEvent.starts_at ? `<span class="tfc-pill">${esc(currentEvent.starts_at)}</span>` : ''}
            </div>
          ` : 'No event yet.'}
        </div>

        <div class="tfc-card">
          <h3>⚡ Live Numbers</h3>
          <div class="tfc-pill tfc-live">Live ${live.length}</div>
          <div class="tfc-pill tfc-warn">Scheduled ${scheduled.length}</div>
          <div class="tfc-pill tfc-good">Completed ${done.length}</div>
          <div class="tfc-pill">Fighters ${(s.fighters || []).length}</div>
          <div class="tfc-pill">Ideas ${(s.ideas || []).length}</div>
        </div>

        <div class="tfc-card">
          <h3>👑 Top Ranked Fighter</h3>
          ${champ ? `
            <h4>${esc(champ.nickname || champ.name)}</h4>
            <div>${esc(champ.name)} [${esc(champ.torn_id)}]</div>
            <div>
              <span class="tfc-pill">Rank ${esc(champ.rank_points)}</span>
              <span class="tfc-pill">Record ${esc(champ.record_w)}-${esc(champ.record_l)}</span>
              <span class="tfc-pill">ID ${esc(champ.id)}</span>
            </div>
          ` : 'No fighters yet.'}
        </div>
      </div>

      <div class="tfc-card" style="margin-top:10px">
        <h3>🔥 Next Fight</h3>
        ${next ? fightCardHtml(next, false, true) : '<div class="tfc-muted">No live or scheduled fights yet.</div>'}
      </div>

      <div class="tfc-grid" style="margin-top:10px">
        <div class="tfc-card">
          <h3>📋 Recent Fight Card</h3>
          <div class="tfc-mini-list">
            ${(s.fights || []).slice(0,5).map(f => miniFightLine(f)).join('') || '<div class="tfc-muted">No fights created yet.</div>'}
          </div>
        </div>
        <div class="tfc-card">
          <h3>😂 Newest Ideas</h3>
          <div class="tfc-mini-list">
            ${(s.ideas || []).slice(0,5).map(i => `<div class="tfc-mini-item"><b>${esc(i.name || 'Someone')}</b><br>${esc(i.idea)}</div>`).join('') || '<div class="tfc-muted">No ideas yet.</div>'}
          </div>
        </div>
      </div>
    `;
  }

  function miniFightLine(f) {
    const a = f.fighter_a_nick || f.fighter_a_name;
    const b = f.fighter_b_nick || f.fighter_b_name;
    const statusClass = f.status === 'live' ? 'tfc-live' : (f.status === 'done' ? 'tfc-good' : 'tfc-warn');
    return `<div class="tfc-mini-item"><b>${esc(a)}</b> vs <b>${esc(b)}</b> <span class="tfc-pill ${statusClass}">${esc(f.status)}</span><br><span class="tfc-muted">${esc(f.round_name || 'Fight Card')} • Fight ID ${esc(f.id)}</span></div>`;
  }

  function fightCardTabHtml(s) {
    const live = getFights(s, 'live');
    const scheduled = getFights(s, 'scheduled');
    const done = getFights(s, 'done');
    const cancelled = getFights(s, 'cancelled');

    return `
      <div class="tfc-card hero">
        <div class="tfc-between">
          <div>
            <h3>🥊 Fight Card</h3>
            <div class="tfc-muted">Live fights first, then scheduled, completed, and cancelled.</div>
          </div>
          <button class="tfc-btn" id="tfc-refresh-card">Refresh Card</button>
        </div>
      </div>

      ${fightSectionHtml('🔥 Live Now', live, 'No fights are live right now.')}
      ${fightSectionHtml('📅 Scheduled', scheduled, 'No scheduled fights yet.')}
      ${fightSectionHtml('✅ Completed', done, 'No completed fights yet.')}
      ${cancelled.length ? fightSectionHtml('🚫 Cancelled', cancelled, '') : ''}
    `;
  }

  function fightSectionHtml(title, fights, emptyMsg) {
    return `
      <div class="tfc-card" style="margin-top:10px">
        <h3>${title} <span class="tfc-pill">${fights.length}</span></h3>
        <div class="tfc-grid wide">
          ${fights.map(f => fightCardHtml(f, false, false)).join('') || `<div class="tfc-muted">${emptyMsg}</div>`}
        </div>
      </div>
    `;
  }

  function fightCardHtml(f, pickMode, compact) {
    const nameA = f.fighter_a_nick || f.fighter_a_name;
    const nameB = f.fighter_b_nick || f.fighter_b_name;
    const statusClass = f.status === 'live' ? 'tfc-live' : (f.status === 'done' ? 'tfc-good' : 'tfc-warn');

    return `
      <div class="tfc-card">
        <div class="tfc-between">
          <h3>${esc(f.round_name || 'Fight Card')}</h3>
          <span class="tfc-pill ${statusClass}">${esc(f.status)}</span>
        </div>
        <div class="tfc-row">
          <b>${esc(nameA)}</b>
          <span class="tfc-vs">VS</span>
          <b>${esc(nameB)}</b>
        </div>
        <div class="tfc-muted">${esc(f.rule_set || 'No rule set')}</div>
        <div class="tfc-row">
          <span class="tfc-pill">Fight ID ${esc(f.id)}</span>
          <span class="tfc-pill">Event ${esc(f.event_id)}</span>
          <span class="tfc-pill">A odds ${esc(f.odds_a)}</span>
          <span class="tfc-pill">B odds ${esc(f.odds_b)}</span>
        </div>
        ${f.starts_at ? `<div class="tfc-muted">Starts: ${esc(f.starts_at)}</div>` : ''}
        ${f.winner_fighter_id ? `<div class="tfc-pill tfc-good">Winner fighter ID ${esc(f.winner_fighter_id)} • ${esc(f.result_method)}</div>` : ''}
        ${pickMode && ['scheduled','live'].includes(f.status) ? `
          <div class="tfc-row">
            <input class="tfc-input tfc-points" data-fight="${f.id}" type="number" min="1" max="100" value="10" style="max-width:120px">
            <button class="tfc-btn green tfc-pick" data-fight="${f.id}" data-pick="${f.fighter_a_id}">Pick ${esc(nameA)}</button>
            <button class="tfc-btn green tfc-pick" data-fight="${f.id}" data-pick="${f.fighter_b_id}">Pick ${esc(nameB)}</button>
          </div>
        ` : ''}
      </div>
    `;
  }


  function formatStat(n) {
    try {
      const num = Number(n || 0);
      return num.toLocaleString();
    } catch (e) {
      return String(n || 0);
    }
  }

  function getPrivateBattleStats() {
    try {
      const raw = GM_getValue('tfc_private_battle_stats', '');
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function setPrivateBattleStats(stats) {
    if (!stats) return;
    try {
      GM_setValue('tfc_private_battle_stats', JSON.stringify(stats));
    } catch (e) {}
  }

  function clearPrivateBattleStats() {
    try {
      GM_setValue('tfc_private_battle_stats', '');
    } catch (e) {}
  }

  function privateBattleStatsBox() {
    const stats = getPrivateBattleStats();
    if (!stats) {
      return `
        <div class="tfc-card tfc-private-stats">
          <h3>🔒 My Private Battle Stats</h3>
          <div class="tfc-empty">No battle stats loaded yet. Login with an API key that has access to your battle stats.</div>
          <div class="tfc-muted">Only you can see this box on your own device. These stats are not shown on public fighter cards.</div>
        </div>
      `;
    }

    return `
      <div class="tfc-card tfc-private-stats">
        <h3>🔒 My Private Battle Stats</h3>
        <div class="tfc-muted">Only visible to you on this device after API login. Not shown to other users.</div>
        <div class="tfc-stat-grid">
          <div class="tfc-mini-item"><div class="tfc-muted">Strength</div><div class="tfc-stat-big">${formatStat(stats.strength)}</div></div>
          <div class="tfc-mini-item"><div class="tfc-muted">Defense</div><div class="tfc-stat-big">${formatStat(stats.defense)}</div></div>
          <div class="tfc-mini-item"><div class="tfc-muted">Speed</div><div class="tfc-stat-big">${formatStat(stats.speed)}</div></div>
          <div class="tfc-mini-item"><div class="tfc-muted">Dexterity</div><div class="tfc-stat-big">${formatStat(stats.dexterity)}</div></div>
          <div class="tfc-mini-item"><div class="tfc-muted">Total Battle Stats</div><div class="tfc-stat-big">${formatStat(stats.total)}</div></div>
        </div>
      </div>
    `;
  }

  function myFighterProfiles(s) {
    if (!s.user) return [];
    return (s.fighters || []).filter(f => Number(f.torn_id) === Number(s.user.torn_id));
  }

  function fighterPowerSort(a, b) {
    return Number(b.rank_points || 0) - Number(a.rank_points || 0) ||
           Number(b.record_w || 0) - Number(a.record_w || 0) ||
           String(a.nickname || a.name).localeCompare(String(b.nickname || b.name));
  }

  function fightersHtml(s) {
    const fighters = [...(s.fighters || [])].sort(fighterPowerSort);
    const mine = myFighterProfiles(s);
    const champ = fighters[0] || null;

    return `
      <div class="tfc-grid wide">
        <div class="tfc-card hero">
          <h3>🥊 Fighters</h3>
          <p class="tfc-muted">Register your fighter, build a record, climb rankings, and become the least embarrassing pillow menace in Torn.</p>
          <div class="tfc-statline">
            <span class="tfc-pill">Total fighters ${fighters.length}</span>
            <span class="tfc-pill">Your profiles ${mine.length}</span>
            ${champ ? `<span class="tfc-pill tfc-good">Current #1: ${esc(champ.nickname || champ.name)}</span>` : ''}
          </div>
        </div>

        <div class="tfc-card">
          <h3>📝 Register as Fighter</h3>
          ${s.user ? `
            <select id="tfc-reg-event" class="tfc-select">${(s.events||[]).map(e=>`<option value="${e.id}">${esc(e.title)}</option>`).join('')}</select>
            <input id="tfc-nick" class="tfc-input" placeholder="Fighter nickname">
            <input id="tfc-range" class="tfc-input" placeholder="Stats class/range, e.g. Rookie / Mid / Heavy">
            <input id="tfc-loadout" class="tfc-input" placeholder="Funny loadout / rule idea">
            <button id="tfc-register" class="tfc-btn green">Register Fighter</button>
          ` : `
            <div class="tfc-empty">Login in Settings first so the app knows who is registering.</div>
            <button class="tfc-btn blue tfc-go" data-tab="settings">Go to Settings</button>
          `}
        </div>

        <div class="tfc-card">
          <h3>👤 My Fighter Profile</h3>
          ${mine.length ? mine.map(f => fighterCard(f, s, true)).join('') : `
            <div class="tfc-empty">You have no fighter profile yet.</div>
            <div class="tfc-muted">Register once you are ready to get bonked by pillows in public.</div>
          `}
        </div>

        ${privateBattleStatsBox()}
      </div>

      <div class="tfc-card" style="margin-top:10px">
        <h3>🔎 Fighter Search & Filters</h3>
        <div class="tfc-searchbar">
          <input id="tfc-fighter-search" class="tfc-input" placeholder="Search name, nickname, loadout, stats class...">
          <select id="tfc-fighter-sort" class="tfc-select">
            <option value="rank">Sort: Rank</option>
            <option value="wins">Sort: Wins</option>
            <option value="name">Sort: Name</option>
            <option value="mine">Show: Mine First</option>
          </select>
          <button id="tfc-fighter-apply" class="tfc-btn gold">Apply</button>
        </div>
      </div>

      <div id="tfc-fighter-list" class="tfc-grid wide" style="margin-top:10px">
        ${renderFighterList(s, fighters)}
      </div>
    `;
  }

  function renderFighterList(s, fighters) {
    if (!fighters.length) return '<div class="tfc-card"><div class="tfc-empty">No fighters yet.</div></div>';
    return fighters.map((f, idx) => fighterCard(f, s, false, idx + 1)).join('');
  }

  function fighterCard(f, s, compact, rankNum) {
    const mine = s && s.user && Number(f.torn_id) === Number(s.user.torn_id);
    const adminControls = isAdmin() ? `<button class="tfc-btn red tfc-remove-fighter" data-fighter="${esc(f.id)}">Remove</button>` : '';
    const rank = rankNum ? `<span class="tfc-ranknum">#${rankNum}</span>` : '';

    return `
      <div class="tfc-card" data-fighter-card="1"
           data-search="${esc(`${f.name || ''} ${f.nickname || ''} ${f.stats_range || ''} ${f.loadout || ''}`.toLowerCase())}"
           data-rank="${esc(f.rank_points || 0)}"
           data-wins="${esc(f.record_w || 0)}"
           data-name="${esc((f.nickname || f.name || '').toLowerCase())}"
           data-mine="${mine ? '1' : '0'}">
        <div class="tfc-between">
          <div>
            <h3>${rank}${esc(f.nickname || f.name)}</h3>
            <div>${esc(f.name)} [${esc(f.torn_id)}] ${mine ? '<span class="tfc-pill tfc-good">You</span>' : ''}</div>
          </div>
          <span class="tfc-pill">ID ${esc(f.id)}</span>
        </div>
        <div class="tfc-muted">${esc(f.stats_range || 'No stats range set')}</div>
        <div style="margin-top:6px">${esc(f.loadout || 'No loadout set')}</div>
        <div class="tfc-statline">
          <span class="tfc-pill">Record ${esc(f.record_w)}-${esc(f.record_l)}</span>
          <span class="tfc-pill">Rank ${esc(f.rank_points)}</span>
          <span class="tfc-pill">Event ${esc(f.event_id || '?')}</span>
          ${adminControls}
        </div>
      </div>
    `;
  }

  function applyFighterFilter() {
    const q = (id('tfc-fighter-search')?.value || '').trim().toLowerCase();
    const sort = id('tfc-fighter-sort')?.value || 'rank';
    const list = id('tfc-fighter-list');
    if (!list) return;

    const cards = Array.from(list.querySelectorAll('[data-fighter-card="1"]'));

    cards.forEach(card => {
      const hay = card.getAttribute('data-search') || '';
      card.style.display = !q || hay.includes(q) ? '' : 'none';
    });

    const sorted = cards.sort((a,b) => {
      if (sort === 'wins') return Number(b.dataset.wins || 0) - Number(a.dataset.wins || 0);
      if (sort === 'name') return String(a.dataset.name || '').localeCompare(String(b.dataset.name || ''));
      if (sort === 'mine') return Number(b.dataset.mine || 0) - Number(a.dataset.mine || 0) || Number(b.dataset.rank || 0) - Number(a.dataset.rank || 0);
      return Number(b.dataset.rank || 0) - Number(a.dataset.rank || 0);
    });

    sorted.forEach(card => list.appendChild(card));
  }


  function fighterCard(f) {
    return `<div class="tfc-card"><h3>${esc(f.nickname||f.name)}</h3><div>${esc(f.name)} [${esc(f.torn_id)}]</div><div class="tfc-muted">${esc(f.stats_range||'No stats range set')}</div><div>${esc(f.loadout||'No loadout set')}</div><div><span class="tfc-pill">ID ${esc(f.id)}</span><span class="tfc-pill">Record ${esc(f.record_w)}-${esc(f.record_l)}</span><span class="tfc-pill">Rank ${esc(f.rank_points)}</span></div></div>`;
  }

  function myPickForFight(s, fightId) {
    return (s.my_predictions || []).find(p => Number(p.fight_id) === Number(fightId));
  }

  function predictionsHtml(s) {
    const open = (s.fights || []).filter(f => f.status === 'live' || f.status === 'scheduled');
    const live = open.filter(f => f.status === 'live');
    const scheduled = open.filter(f => f.status === 'scheduled');
    const mine = s.my_predictions || [];

    return `
      <div class="tfc-grid wide">
        <div class="tfc-card hero">
          <h3>💰 Fun Picks</h3>
          <p class="tfc-muted">Pick winners using fun prediction points only. No Torn cash/items are handled by this app.</p>
          <div class="tfc-statline">
            <span class="tfc-pill">Your points: ${s.user ? esc(s.user.prediction_points) : 'Login needed'}</span>
            <span class="tfc-pill tfc-live">Live open: ${live.length}</span>
            <span class="tfc-pill tfc-warn">Scheduled open: ${scheduled.length}</span>
            <span class="tfc-pill">Your picks: ${mine.length}</span>
          </div>
          ${!s.user ? `<button class="tfc-btn blue tfc-go" data-tab="settings">Login in Settings</button>` : ''}
        </div>

        <div class="tfc-card">
          <h3>📌 Pick Rules</h3>
          <div class="tfc-mini-list">
            <div class="tfc-mini-item">🎲 Pick between 1 and 100 fun points per fight.</div>
            <div class="tfc-mini-item">🔒 One pick per fight per user.</div>
            <div class="tfc-mini-item">🏆 Winning picks pay based on admin odds.</div>
            <div class="tfc-mini-item">🚫 No real Torn cash, items, or off-platform gambling.</div>
          </div>
        </div>
      </div>

      <div class="tfc-card" style="margin-top:10px">
        <h3>🔥 Open Fights</h3>
        <div class="tfc-grid wide">
          ${open.map(f => pickFightCardHtml(f, s)).join('') || '<div class="tfc-empty">No fights are open for picks.</div>'}
        </div>
      </div>

      <div class="tfc-card" style="margin-top:10px">
        <h3>🧾 My Pick History</h3>
        <div class="tfc-mini-list">
          ${mine.length ? mine.slice(0,10).map(p => `
            <div class="tfc-mini-item">
              Fight ID ${esc(p.fight_id)} • Picked fighter ID ${esc(p.pick_fighter_id)} • ${esc(p.points)} pts
              <br><span class="tfc-muted">${esc(p.status || '')} • ${esc(p.created_at || '')}</span>
            </div>
          `).join('') : '<div class="tfc-empty">No picks yet.</div>'}
        </div>
      </div>
    `;
  }

  function pickFightCardHtml(f, s) {
    const picked = myPickForFight(s, f.id);
    const nameA = f.fighter_a_nick || f.fighter_a_name;
    const nameB = f.fighter_b_nick || f.fighter_b_name;
    const statusClass = f.status === 'live' ? 'tfc-live' : 'tfc-warn';

    return `
      <div class="tfc-card">
        <div class="tfc-between">
          <h3>${esc(f.round_name || 'Fight Card')}</h3>
          <span class="tfc-pill ${statusClass}">${esc(f.status)}</span>
        </div>
        <div class="tfc-row">
          <b>${esc(nameA)}</b>
          <span class="tfc-vs">VS</span>
          <b>${esc(nameB)}</b>
        </div>
        <div class="tfc-muted">${esc(f.rule_set || 'No rule set')}</div>
        <div class="tfc-statline">
          <span class="tfc-pill">Fight ID ${esc(f.id)}</span>
          <span class="tfc-pill">A odds ${esc(f.odds_a)}</span>
          <span class="tfc-pill">B odds ${esc(f.odds_b)}</span>
          ${f.starts_at ? `<span class="tfc-pill">${esc(f.starts_at)}</span>` : ''}
        </div>
        ${picked ? `
          <div class="tfc-pill tfc-good">You picked fighter ID ${esc(picked.pick_fighter_id)} for ${esc(picked.points)} pts</div>
        ` : s.user ? `
          <div class="tfc-row" style="margin-top:8px">
            <input class="tfc-input tfc-points" data-fight="${f.id}" type="number" min="1" max="100" value="10" style="max-width:120px">
            <button class="tfc-btn green tfc-pick" data-fight="${f.id}" data-pick="${f.fighter_a_id}">Pick ${esc(nameA)}</button>
            <button class="tfc-btn green tfc-pick" data-fight="${f.id}" data-pick="${f.fighter_b_id}">Pick ${esc(nameB)}</button>
          </div>
        ` : `
          <button class="tfc-btn blue tfc-go" data-tab="settings">Login to Pick</button>
        `}
      </div>
    `;
  }


  function leaderboardHtml(s) {
    const fightersByRank = [...(s.fighters || [])].sort((a,b)=>Number(b.rank_points||0)-Number(a.rank_points||0) || Number(b.record_w||0)-Number(a.record_w||0));
    const fightersByWins = [...(s.fighters || [])].sort((a,b)=>Number(b.record_w||0)-Number(a.record_w||0) || Number(b.rank_points||0)-Number(a.rank_points||0));
    const champ = fightersByRank[0] || null;
    const bestRecord = fightersByWins[0] || null;
    const topPicker = (s.leaderboard || [])[0] || null;

    return `
      <div class="tfc-grid wide">
        <div class="tfc-card hero">
          <h3>🏆 Leaderboards</h3>
          <p class="tfc-muted">Track champions, winners, records, and the people who keep betting imaginary points on pillow violence.</p>
          <div class="tfc-statline">
            ${champ ? `<span class="tfc-pill tfc-good">Champion: ${esc(champ.nickname || champ.name)}</span>` : '<span class="tfc-pill">No champion yet</span>'}
            ${bestRecord ? `<span class="tfc-pill">Most wins: ${esc(bestRecord.nickname || bestRecord.name)}</span>` : ''}
            ${topPicker ? `<span class="tfc-pill tfc-warn">Top picker: ${esc(topPicker.name)}</span>` : ''}
          </div>
        </div>

        <div class="tfc-card">
          <h3>👑 Champion Box</h3>
          ${champ ? `
            <h4>${esc(champ.nickname || champ.name)}</h4>
            <div>${esc(champ.name)} [${esc(champ.torn_id)}]</div>
            <div class="tfc-statline">
              <span class="tfc-pill">Rank ${esc(champ.rank_points)}</span>
              <span class="tfc-pill">Record ${esc(champ.record_w)}-${esc(champ.record_l)}</span>
              <span class="tfc-pill">Fighter ID ${esc(champ.id)}</span>
            </div>
            <div class="tfc-muted">${esc(champ.loadout || 'No known cursed loadout')}</div>
          ` : '<div class="tfc-empty">No champion yet.</div>'}
        </div>
      </div>

      
      <div class="tfc-admin-grid" style="margin-top:10px">
        <div class="tfc-card">
          <h3>✏️ Edit Fight</h3>
          <select id="tfc-edit-fight" class="tfc-select">${fightOptions(s, 'Choose fight')}</select>
          <input id="tfc-edit-round" class="tfc-input" placeholder="New round name">
          <input id="tfc-edit-rules" class="tfc-input" placeholder="New rule set">
          <input id="tfc-edit-start" class="tfc-input" placeholder="New start time">
          <button id="tfc-edit-fight-btn" class="tfc-btn gold">Save Fight Edits</button>
          <button id="tfc-delete-fight-btn" class="tfc-btn red">Delete Fight</button>
        </div>

        <div class="tfc-card">
          <h3>📅 Edit Event</h3>
          <select id="tfc-edit-event" class="tfc-select">${(s.events||[]).map(e=>`<option value="${e.id}">${esc(e.id)} — ${esc(e.title)}</option>`).join('')}</select>
          <input id="tfc-edit-event-title" class="tfc-input" placeholder="New event title">
          <input id="tfc-edit-event-theme" class="tfc-input" placeholder="New theme">
          <input id="tfc-edit-event-start" class="tfc-input" placeholder="New start time">
          <select id="tfc-edit-event-status" class="tfc-select">
            <option value="">Leave status unchanged</option>
            <option value="planned">Planned</option>
            <option value="open">Open</option>
            <option value="live">Live</option>
            <option value="done">Done</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <button id="tfc-edit-event-btn" class="tfc-btn gold">Save Event Edits</button>
        </div>

        <div class="tfc-card">
          <h3>💰 Adjust Fun Points</h3>
          <input id="tfc-points-user" class="tfc-input" placeholder="User Torn ID">
          <input id="tfc-points-amount" class="tfc-input" type="number" placeholder="+/- points amount">
          <input id="tfc-points-reason" class="tfc-input" placeholder="Reason">
          <button id="tfc-adjust-points" class="tfc-btn green">Adjust Points</button>
        </div>

        <div class="tfc-card">
          <h3>🧾 Admin Audit</h3>
          <div class="tfc-mini-list">
            ${(s.audit||[]).slice(0,8).map(a=>`<div class="tfc-mini-item"><b>${esc(a.action)}</b> — ${esc(a.target || '')}<br><span class="tfc-muted">${esc(a.created_at)}</span></div>`).join('') || '<div class="tfc-empty">No admin actions yet.</div>'}
          </div>
        </div>
      </div>

<div class="tfc-grid wide" style="margin-top:10px">
        <div class="tfc-card">
          <h3>💰 Prediction Points</h3>
          <div class="tfc-mini-list">
            ${(s.leaderboard||[]).map((u,idx)=>`
              <div class="tfc-mini-item">
                <span class="tfc-ranknum">#${idx+1}</span>
                <b>${esc(u.name)}</b> [${esc(u.torn_id)}]
                <br><span class="tfc-pill">${esc(u.prediction_points)} pts</span><span class="tfc-pill">${esc(u.role)}</span>
              </div>
            `).join('') || '<div class="tfc-empty">No prediction leaderboard yet.</div>'}
          </div>
        </div>

        <div class="tfc-card">
          <h3>🥊 Fighter Rank</h3>
          <div class="tfc-mini-list">
            ${fightersByRank.map((f,idx)=>`
              <div class="tfc-mini-item">
                <span class="tfc-ranknum">#${idx+1}</span>
                <b>${esc(f.nickname || f.name)}</b>
                <br><span class="tfc-pill">Rank ${esc(f.rank_points)}</span><span class="tfc-pill">Record ${esc(f.record_w)}-${esc(f.record_l)}</span><span class="tfc-pill">ID ${esc(f.id)}</span>
              </div>
            `).join('') || '<div class="tfc-empty">No fighter rankings yet.</div>'}
          </div>
        </div>

        <div class="tfc-card">
          <h3>✅ Most Wins</h3>
          <div class="tfc-mini-list">
            ${fightersByWins.map((f,idx)=>`
              <div class="tfc-mini-item">
                <span class="tfc-ranknum">#${idx+1}</span>
                <b>${esc(f.nickname || f.name)}</b>
                <br><span class="tfc-pill">${esc(f.record_w)} wins</span><span class="tfc-pill">${esc(f.record_l)} losses</span><span class="tfc-pill">Rank ${esc(f.rank_points)}</span>
              </div>
            `).join('') || '<div class="tfc-empty">No win records yet.</div>'}
          </div>
        </div>
      </div>
    `;
  }



  function tournamentEntries(s, tournamentId) {
    return (s.tournament_entries || []).filter(e => Number(e.tournament_id) === Number(tournamentId))
      .sort((a,b) => Number(a.seed || 0) - Number(b.seed || 0) || Number(a.id || 0) - Number(b.id || 0));
  }

  function tournamentsHtml(s) {
    const tournaments = s.tournaments || [];
    return `
      <div class="tfc-grid wide">
        <div class="tfc-card hero">
          <h3>🏆 Brackets & Tournaments</h3>
          <p class="tfc-muted">Create King of the Hill nights, pillow championships, faction vs faction cards, and single-elim chaos brackets.</p>
          <div class="tfc-statline">
            <span class="tfc-pill">Tournaments ${tournaments.length}</span>
            <span class="tfc-pill">Entries ${(s.tournament_entries || []).length}</span>
            <span class="tfc-pill tfc-warn">Admin builds brackets</span>
          </div>
        </div>
        ${isAdmin() ? `
        <div class="tfc-card">
          <h3>➕ Create Tournament</h3>
          <select id="tfc-tour-event" class="tfc-select">${(s.events||[]).map(e=>`<option value="${e.id}">${esc(e.title)}</option>`).join('')}</select>
          <input id="tfc-tour-title" class="tfc-input" placeholder="Tournament title">
          <select id="tfc-tour-format" class="tfc-select">
            <option value="single_elim">Single Elimination</option>
            <option value="king_hill">King of the Hill</option>
            <option value="round_robin">Round Robin</option>
            <option value="faction_vs_faction">Faction vs Faction</option>
          </select>
          <input id="tfc-tour-notes" class="tfc-input" placeholder="Notes / theme">
          <button id="tfc-create-tour" class="tfc-btn green">Create Tournament</button>
        </div>
        <div class="tfc-card">
          <h3>➕ Add Fighter to Bracket</h3>
          <select id="tfc-entry-tour" class="tfc-select">${tournaments.map(t=>`<option value="${t.id}">${esc(t.id)} — ${esc(t.title)}</option>`).join('')}</select>
          <select id="tfc-entry-fighter" class="tfc-select">${fighterOptions(s, 'Choose fighter')}</select>
          <input id="tfc-entry-seed" class="tfc-input" type="number" placeholder="Seed number">
          <button id="tfc-add-entry" class="tfc-btn green">Add Entry</button>
        </div>` : ''}
      </div>

      <div class="tfc-grid wide" style="margin-top:10px">
        ${tournaments.map(t => tournamentCard(s, t)).join('') || '<div class="tfc-card"><div class="tfc-empty">No tournaments yet.</div></div>'}
      </div>
    `;
  }

  function tournamentCard(s, t) {
    const entries = tournamentEntries(s, t.id);
    return `
      <div class="tfc-card">
        <div class="tfc-between">
          <h3>${esc(t.title)}</h3>
          <span class="tfc-pill ${t.status === 'live' ? 'tfc-live' : 'tfc-warn'}">${esc(t.status)}</span>
        </div>
        <div class="tfc-muted">${esc(t.format)} • Event ${esc(t.event_id)} • ${esc(t.notes || '')}</div>
        <div class="tfc-bracket" style="margin-top:8px">
          ${entries.map(e => `
            <div class="tfc-bracket-entry">
              <b>Seed ${esc(e.seed || '-')}</b> — ${esc(e.nickname || e.name)} [${esc(e.torn_id)}]
              <span class="tfc-pill">Rank ${esc(e.rank_points)}</span>
              <span class="tfc-pill">Record ${esc(e.record_w)}-${esc(e.record_l)}</span>
            </div>
          `).join('') || '<div class="tfc-empty">No bracket entries yet.</div>'}
        </div>
        ${isAdmin() ? `
          <div class="tfc-row" style="margin-top:8px">
            <select class="tfc-select tfc-tour-status" data-tour="${t.id}" style="max-width:180px">
              <option value="planned">Planned</option>
              <option value="open">Open</option>
              <option value="live">Live</option>
              <option value="done">Done</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <button class="tfc-btn gold tfc-set-tour-status" data-tour="${t.id}">Set Status</button>
          </div>
        ` : ''}
      </div>
    `;
  }

  function beltsHtml(s) {
    const belts = s.belts || [];
    return `
      <div class="tfc-grid wide">
        <div class="tfc-card hero">
          <h3>👑 Championship Belts</h3>
          <p class="tfc-muted">Crown your Pillow King, Chaos Champion, Meme Weapon Menace, or whatever cursed title the crowd demands.</p>
          <span class="tfc-pill">Belts ${belts.length}</span>
        </div>
        ${isAdmin() ? `
        <div class="tfc-card">
          <h3>➕ Create Belt</h3>
          <input id="tfc-belt-name" class="tfc-input" placeholder="Belt name, e.g. Pillowweight Champion">
          <input id="tfc-belt-division" class="tfc-input" placeholder="Division, e.g. Open Chaos">
          <select id="tfc-belt-holder" class="tfc-select">${fighterOptions(s, 'Optional starting holder')}</select>
          <button id="tfc-create-belt" class="tfc-btn green">Create Belt</button>
        </div>
        <div class="tfc-card">
          <h3>👑 Assign Belt</h3>
          <select id="tfc-assign-belt" class="tfc-select">${belts.map(b=>`<option value="${b.id}">${esc(b.id)} — ${esc(b.name)}</option>`).join('')}</select>
          <select id="tfc-assign-holder" class="tfc-select">${fighterOptions(s, 'New holder')}</select>
          <input id="tfc-assign-note" class="tfc-input" placeholder="Note, e.g. Won main event">
          <button id="tfc-assign-belt-btn" class="tfc-btn gold">Assign Belt</button>
        </div>` : ''}
      </div>

      <div class="tfc-grid wide" style="margin-top:10px">
        ${belts.map(b => `
          <div class="tfc-card tfc-belt">
            <h3>👑 ${esc(b.name)}</h3>
            <div class="tfc-muted">${esc(b.division || 'Open Chaos')}</div>
            <div>${b.holder_fighter_id ? `Holder: <b>${esc(b.holder_nick || b.holder_name)}</b> [${esc(b.holder_torn_id || '')}]` : 'Vacant'}</div>
            <div class="tfc-statline">
              <span class="tfc-pill">Belt ID ${esc(b.id)}</span>
              <span class="tfc-pill">${esc(b.status)}</span>
              <span class="tfc-pill">History ${(b.history || []).length}</span>
            </div>
          </div>
        `).join('') || '<div class="tfc-card"><div class="tfc-empty">No belts yet.</div></div>'}
      </div>
    `;
  }

  function teamsHtml(s) {
    const teams = s.teams || [];
    return `
      <div class="tfc-grid wide">
        <div class="tfc-card hero">
          <h3>⚔️ Team / Faction Events</h3>
          <p class="tfc-muted">Build teams for faction vs faction nights, squad challenges, and full chaos battles.</p>
          <span class="tfc-pill">Teams ${teams.length}</span>
        </div>
        ${isAdmin() ? `
        <div class="tfc-card">
          <h3>➕ Create Team</h3>
          <select id="tfc-team-event" class="tfc-select">${(s.events||[]).map(e=>`<option value="${e.id}">${esc(e.title)}</option>`).join('')}</select>
          <input id="tfc-team-name" class="tfc-input" placeholder="Team / faction name">
          <input id="tfc-team-captain" class="tfc-input" placeholder="Captain Torn ID">
          <input id="tfc-team-members" class="tfc-input" placeholder="Members list, comma separated">
          <input id="tfc-team-notes" class="tfc-input" placeholder="Notes">
          <button id="tfc-create-team" class="tfc-btn green">Create Team</button>
        </div>` : ''}
      </div>

      <div class="tfc-grid wide" style="margin-top:10px">
        ${teams.map(t => `
          <div class="tfc-card">
            <h3>⚔️ ${esc(t.name)}</h3>
            <div class="tfc-muted">Event ${esc(t.event_id)} • Captain ${esc(t.captain_torn_id || 'unset')}</div>
            <div>${esc(t.notes || '')}</div>
            <div class="tfc-statline">
              ${(t.members || []).map(m => `<span class="tfc-pill">${esc(m)}</span>`).join('') || '<span class="tfc-pill">No members listed</span>'}
            </div>
          </div>
        `).join('') || '<div class="tfc-card"><div class="tfc-empty">No teams yet.</div></div>'}
      </div>
    `;
  }

  function refsHtml(s) {
    const refs = s.referees || [];
    return `
      <div class="tfc-grid wide">
        <div class="tfc-card hero">
          <h3>⚖️ Referee Tools</h3>
          <p class="tfc-muted">Track refs, event notes, judging helpers, and who is responsible when pillow violence becomes legal paperwork.</p>
          <span class="tfc-pill">Refs ${refs.length}</span>
        </div>
        ${isAdmin() ? `
        <div class="tfc-card">
          <h3>➕ Add Referee</h3>
          <select id="tfc-ref-event" class="tfc-select">${(s.events||[]).map(e=>`<option value="${e.id}">${esc(e.title)}</option>`).join('')}</select>
          <input id="tfc-ref-name" class="tfc-input" placeholder="Referee name">
          <input id="tfc-ref-torn" class="tfc-input" placeholder="Torn ID optional">
          <input id="tfc-ref-notes" class="tfc-input" placeholder="Notes / duties">
          <button id="tfc-create-ref" class="tfc-btn green">Add Referee</button>
        </div>` : ''}
      </div>

      <div class="tfc-grid wide" style="margin-top:10px">
        ${refs.map(r => `
          <div class="tfc-card tfc-ref">
            <h3>⚖️ ${esc(r.name)}</h3>
            <div class="tfc-muted">Event ${esc(r.event_id)} • Torn ID ${esc(r.torn_id || 'unset')} • ${esc(r.status)}</div>
            <div>${esc(r.notes || '')}</div>
          </div>
        `).join('') || '<div class="tfc-card"><div class="tfc-empty">No referees yet.</div></div>'}
      </div>
    `;
  }

  function ideasHtml(s) {
    return `
      <div class="tfc-card hero">
        <h3>😂 Submit Stupid/Funny Ideas</h3>
        <textarea id="tfc-idea" class="tfc-textarea" placeholder="Example: pillow fight championship, only melee night, drunk themed chaos, randomized gear battle..."></textarea>
        <button id="tfc-idea-btn" class="tfc-btn green">Submit Idea</button>
      </div>
      <div class="tfc-grid" style="margin-top:10px">
        ${(s.ideas||[]).map(i=>`<div class="tfc-card"><b>${esc(i.name||'Someone')}</b><p>${esc(i.idea)}</p><div class="tfc-muted">${esc(i.created_at)}</div></div>`).join('') || '<div class="tfc-card">No ideas yet.</div>'}
      </div>
    `;
  }

  function rulesHtml() {
    return `
      <div class="tfc-grid wide">
        <div class="tfc-card hero">
          <h3>📜 Fight Club Rules</h3>
          <p>Two players enter with similar stats and funny restrictions. The point is entertainment, chaos, and community rivalry.</p>
          <div class="tfc-pill tfc-good">Prediction points only</div>
          <div class="tfc-pill tfc-warn">No real Torn cash/items betting</div>
        </div>
        <div class="tfc-card">
          <h3>🏁 Win Conditions</h3>
          <div>💀 KO</div>
          <div>🩸 Lowest HP at the end</div>
          <div>🏳️ Surrender</div>
        </div>
        <div class="tfc-card">
          <h3>🎭 Theme Ideas</h3>
          <div>🛏️ Pillow fight championships</div>
          <div>⚔️ Only melee weapons</div>
          <div>🍺 Drunk fight events</div>
          <div>🎲 Randomized gear battles</div>
          <div>👑 King of the Hill</div>
        </div>
      </div>
    `;
  }

  function settingsHtml() {
    return `
      <div class="tfc-grid wide">
        <div class="tfc-card hero">
          <h3>🔐 API Key Login</h3>
          <p class="tfc-muted">Used only to identify your Torn player so you can register, make picks, submit ideas, and get the right access level. If your key allows battle stats, it will also show your private total battle stats only to you.</p>
          <input id="tfc-api" class="tfc-input" placeholder="Paste Torn limited API key">
          <button id="tfc-login" class="tfc-btn green">Login</button>
          <button id="tfc-logout" class="tfc-btn">Logout</button>
          <div class="tfc-muted">Current: ${userLine(APP.state || {})}</div>
          <div id="tfc-settings-msg" class="tfc-muted"></div>
        </div>

        <div class="tfc-card">
          <h3>📜 Fight Club ToS</h3>
          <p><b>First rule of Torn Fight Club:</b> you absolutely talk about Fight Club.</p>
          <p><b>Second rule:</b> do not be a clown with real money, real items, scams, harassment, or rule-breaking nonsense.</p>
          <div class="tfc-mini-list">
            <div class="tfc-mini-item">🥊 This app is for organizing funny community fights, fighter lists, fight cards, rankings, and chaos ideas.</div>
            <div class="tfc-mini-item">💰 Picks use <b>fun prediction points only</b>. No real Torn cash, items, or off-platform gambling is handled by this app.</div>
            <div class="tfc-mini-item">⚖️ Ref/admin decisions are for event organization. Don’t abuse the system, spam people, or use it to cause drama outside the event.</div>
            <div class="tfc-mini-item">😂 Trash talk is expected. Personal attacks, threats, or anything that breaks Torn/faction rules is not.</div>
            <div class="tfc-mini-item">🛠️ Admins can remove, cancel, or correct fights/results if something is wrong, fake, duplicated, or obviously cursed.</div>
          </div>
        </div>

        <div class="tfc-card">
          <h3>🗝️ API Key Use & Torn Rules</h3>
          <p>This app is built around a <b>limited API key</b>. It only uses the key to confirm who you are in Torn.</p>
          <div class="tfc-mini-list">
            <div class="tfc-mini-item">✅ Reads basic identity so the app can show your Torn name and player ID.</div>
            <div class="tfc-mini-item">✅ If your key permits it, reads your battle stats once on login so only you can see your private stat box.</div>
            <div class="tfc-mini-item">✅ Uses your identity for fighter registration, picks, ideas, and admin checks.</div>
            <div class="tfc-mini-item">✅ Admin access is checked by Torn ID: Fries91 [3679030] and Slimyfleshlite [1905671].</div>
            <div class="tfc-mini-item">❌ The app does not use your key to move money, send items, attack, trade, message, or change your Torn account.</div>
            <div class="tfc-mini-item">❌ Battle stats are not posted to public leaderboards, public fighter cards, or other users’ overlays.</div>
            <div class="tfc-mini-item">❌ Your key is not shown to other users in the overlay.</div>
            <div class="tfc-mini-item">📌 Use a limited key where possible, keep your key private, and revoke/regenerate it if you ever think it was shared somewhere it should not be.</div>
          </div>
        </div>
      </div>
    `;
  }

  function adminHtml(s) {
    return `
      <div class="tfc-card hero">
        <div class="tfc-between">
          <div>
            <h3>🛠️ Admin Control Center</h3>
            <div class="tfc-muted">Create events, build fights, set live status, and save results.</div>
          </div>
          <button class="tfc-btn" id="tfc-admin-refresh">Refresh Admin</button>
        </div>
      </div>

      <div class="tfc-admin-grid" style="margin-top:10px">
        <div class="tfc-card">
          <h3>📅 Create Event</h3>
          <input id="tfc-ev-title" class="tfc-input" placeholder="Event title, e.g. Opening Chaos Night">
          <input id="tfc-ev-theme" class="tfc-input" placeholder="Theme, e.g. Pillow Fight Championship">
          <input id="tfc-ev-start" class="tfc-input" placeholder="Start time text">
          <button id="tfc-create-event" class="tfc-btn green">Create Event</button>
        </div>

        <div class="tfc-card">
          <h3>🥊 Create Fight</h3>
          <select id="tfc-f-event" class="tfc-select">
            ${(s.events || []).map(e=>`<option value="${e.id}">${esc(e.title)} — ${esc(e.status)}</option>`).join('')}
          </select>
          <select id="tfc-fa" class="tfc-select">${fighterOptions(s, 'Fighter A')}</select>
          <select id="tfc-fb" class="tfc-select">${fighterOptions(s, 'Fighter B')}</select>
          <input id="tfc-rname" class="tfc-input" placeholder="Round name, e.g. Main Event">
          <input id="tfc-rules" class="tfc-input" placeholder="Rules, e.g. pillows only, no armor">
          <input id="tfc-start" class="tfc-input" placeholder="Start time text">
          <div class="tfc-row">
            <input id="tfc-odda" class="tfc-input" placeholder="Odds A" value="1.9" style="max-width:120px">
            <input id="tfc-oddb" class="tfc-input" placeholder="Odds B" value="1.9" style="max-width:120px">
          </div>
          <button id="tfc-create-fight" class="tfc-btn green">Create Fight</button>
        </div>

        <div class="tfc-card">
          <h3>📡 Set Fight Status</h3>
          <select id="tfc-status-fight" class="tfc-select">${fightOptions(s, 'Choose fight')}</select>
          <select id="tfc-status-val" class="tfc-select">
            <option value="scheduled">Scheduled</option>
            <option value="live">Live</option>
            <option value="done">Done</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <button id="tfc-status-save" class="tfc-btn gold">Save Status</button>
        </div>

        <div class="tfc-card">
          <h3>🏆 Save Result</h3>
          <select id="tfc-res-fight" class="tfc-select">${fightOptions(s, 'Choose fight')}</select>
          <select id="tfc-res-winner" class="tfc-select">${fighterOptions(s, 'Winner fighter')}</select>
          <input id="tfc-res-method" class="tfc-input" placeholder="KO / Lowest HP / Surrender">
          <button id="tfc-result" class="tfc-btn red">Save Result</button>
        </div>
      </div>

      <div class="tfc-grid wide" style="margin-top:10px">
        <div class="tfc-card">
          <h3>🥊 Fighter IDs</h3>
          ${(s.fighters||[]).map(f=>`<span class="tfc-pill">${f.id}: ${esc(f.nickname||f.name)} (${esc(f.record_w)}-${esc(f.record_l)})</span>`).join('') || 'No fighters yet.'}
        </div>
        <div class="tfc-card">
          <h3>📋 Fight IDs</h3>
          ${(s.fights||[]).map(f=>`<span class="tfc-pill">${f.id}: ${esc(f.fighter_a_nick||f.fighter_a_name)} vs ${esc(f.fighter_b_nick||f.fighter_b_name)} — ${esc(f.status)}</span>`).join('') || 'No fights yet.'}
        </div>
      </div>
    `;
  }

  function fighterOptions(s, label) {
    return `<option value="">${esc(label)}</option>` + (s.fighters || []).map(f => `<option value="${f.id}">${esc(f.id)} — ${esc(f.nickname || f.name)} [${esc(f.torn_id)}]</option>`).join('');
  }

  function fightOptions(s, label) {
    return `<option value="">${esc(label)}</option>` + (s.fights || []).map(f => `<option value="${f.id}">${esc(f.id)} — ${esc(f.fighter_a_nick || f.fighter_a_name)} vs ${esc(f.fighter_b_nick || f.fighter_b_name)} — ${esc(f.status)}</option>`).join('');
  }

  function bind() {
    const on = (name, fn) => { const x = id(name); if (x) x.onclick = fn; };

    document.querySelectorAll('.tfc-go').forEach(b => b.onclick = () => setTab(b.dataset.tab));

    on('tfc-fighter-apply', applyFighterFilter);
    const fighterSearch = id('tfc-fighter-search');
    if (fighterSearch) fighterSearch.oninput = applyFighterFilter;
    const fighterSort = id('tfc-fighter-sort');
    if (fighterSort) fighterSort.onchange = applyFighterFilter;

    document.querySelectorAll('.tfc-remove-fighter').forEach(btn => {
      btn.onclick = async () => {
        const fighterId = btn.dataset.fighter;
        if (!fighterId) return;
        if (!confirm('Remove this fighter from active listings?')) return;
        const r = await req('POST', `/api/admin/fighters/${fighterId}/remove`, {}).catch(e => ({ok:false,error:e.message}));
        if (!r.ok) return alert(r.error || 'Remove failed');
        await refresh();
        render();
      };
    });

    on('tfc-login', async () => {
      const api_key = id('tfc-api')?.value?.trim() || '';
      const r = await req('POST','/api/login',{api_key}).catch(e=>({ok:false,error:e.message}));
      if(!r.ok) return alert(r.error || 'Login failed');
      APP.token = r.token;
      GM_setValue('tfc_token', APP.token);
      if (r.private_battle_stats) {
        setPrivateBattleStats(r.private_battle_stats);
      } else {
        clearPrivateBattleStats();
        if (r.battle_stats_error) {
          alert('Login worked, but battle stats were not available with this key: ' + r.battle_stats_error);
        }
      }
      await refresh();
      renderTabs();
      render();
    });

    on('tfc-logout', async () => {
      APP.token='';
      GM_setValue('tfc_token','');
      clearPrivateBattleStats();
      await refresh().catch(()=>null);
      renderTabs();
      render();
    });

    on('tfc-register', async () => {
      const r = await req('POST','/api/fighters/register',{
        event_id:id('tfc-reg-event').value,
        nickname:id('tfc-nick').value,
        stats_range:id('tfc-range').value,
        loadout:id('tfc-loadout').value
      }).catch(e=>({ok:false,error:e.message}));
      if(!r.ok) return alert(r.error || 'Register failed');
      await refresh();
      render();
    });

    on('tfc-idea-btn', async () => {
      const idea = id('tfc-idea').value.trim();
      const r = await req('POST','/api/ideas',{idea}).catch(e=>({ok:false,error:e.message}));
      if(!r.ok) return alert(r.error || 'Idea failed');
      await refresh();
      render();
    });

    document.querySelectorAll('.tfc-pick').forEach(btn => {
      btn.onclick = async () => {
        const fight_id = btn.dataset.fight;
        const points = document.querySelector(`.tfc-points[data-fight="${fight_id}"]`)?.value || 10;
        const r = await req('POST','/api/predictions',{fight_id,pick_fighter_id:btn.dataset.pick,points}).catch(e=>({ok:false,error:e.message}));
        if(!r.ok) return alert(r.error || 'Pick failed');
        await refresh();
        render();
      };
    });

    on('tfc-save-base', () => {
      APP.base = id('tfc-base').value.trim().replace(/\/$/,'');
      GM_setValue('tfc_base', APP.base);
      id('tfc-settings-msg').textContent = 'Saved backend URL: ' + APP.base;
    });

    on('tfc-refresh', async () => { await refresh().catch(e=>alert(e.message)); renderTabs(); render(); });
    on('tfc-refresh-card', async () => { await refresh().catch(e=>alert(e.message)); render(); });
    on('tfc-admin-refresh', async () => { await refresh().catch(e=>alert(e.message)); render(); });

    on('tfc-health', async () => {
      const r = await req('GET','/health').catch(e=>({ok:false,error:e.message}));
      id('tfc-settings-msg').textContent = r.ok ? 'Health OK. Database OK.' : ('Health failed: ' + (r.error || 'unknown'));
    });

    on('tfc-create-event', async () => {
      const r = await req('POST','/api/admin/events',{
        title:id('tfc-ev-title').value,
        theme:id('tfc-ev-theme').value,
        starts_at:id('tfc-ev-start').value
      }).catch(e=>({ok:false,error:e.message}));
      if(!r.ok) return alert(r.error || 'Create event failed');
      await refresh();
      render();
    });

    on('tfc-create-fight', async () => {
      const r = await req('POST','/api/admin/fights',{
        event_id:id('tfc-f-event').value,
        fighter_a_id:id('tfc-fa').value,
        fighter_b_id:id('tfc-fb').value,
        round_name:id('tfc-rname').value,
        rule_set:id('tfc-rules').value,
        starts_at:id('tfc-start').value,
        odds_a:id('tfc-odda').value,
        odds_b:id('tfc-oddb').value
      }).catch(e=>({ok:false,error:e.message}));
      if(!r.ok) return alert(r.error || 'Create fight failed');
      await refresh();
      render();
    });

    on('tfc-status-save', async () => {
      const fight_id = id('tfc-status-fight').value;
      const status = id('tfc-status-val').value;
      const r = await req('POST',`/api/admin/fights/${fight_id}/status`,{status}).catch(e=>({ok:false,error:e.message}));
      if(!r.ok) return alert(r.error || 'Status failed');
      await refresh();
      render();
    });

    on('tfc-result', async () => {
      const fight_id = id('tfc-res-fight').value;
      const r = await req('POST',`/api/admin/fights/${fight_id}/result`,{
        winner_fighter_id:id('tfc-res-winner').value,
        result_method:id('tfc-res-method').value
      }).catch(e=>({ok:false,error:e.message}));
      if(!r.ok) return alert(r.error || 'Result failed');
      await refresh();
      render();
    });
  }

    on('tfc-create-tour', async () => {
      const r = await req('POST','/api/admin/tournaments',{
        event_id:id('tfc-tour-event').value,
        title:id('tfc-tour-title').value,
        format:id('tfc-tour-format').value,
        notes:id('tfc-tour-notes').value
      }).catch(e=>({ok:false,error:e.message}));
      if(!r.ok) return alert(r.error || 'Create tournament failed');
      await refresh(); render();
    });

    on('tfc-add-entry', async () => {
      const tour = id('tfc-entry-tour').value;
      const r = await req('POST',`/api/admin/tournaments/${tour}/entries`,{
        fighter_id:id('tfc-entry-fighter').value,
        seed:id('tfc-entry-seed').value || 0
      }).catch(e=>({ok:false,error:e.message}));
      if(!r.ok) return alert(r.error || 'Add entry failed');
      await refresh(); render();
    });

    document.querySelectorAll('.tfc-set-tour-status').forEach(btn => {
      btn.onclick = async () => {
        const tour = btn.dataset.tour;
        const status = document.querySelector(`.tfc-tour-status[data-tour="${tour}"]`)?.value || 'planned';
        const r = await req('POST',`/api/admin/tournaments/${tour}/status`,{status}).catch(e=>({ok:false,error:e.message}));
        if(!r.ok) return alert(r.error || 'Status failed');
        await refresh(); render();
      };
    });

    on('tfc-create-belt', async () => {
      const holder = id('tfc-belt-holder').value;
      const r = await req('POST','/api/admin/belts',{
        name:id('tfc-belt-name').value,
        division:id('tfc-belt-division').value,
        holder_fighter_id: holder || null
      }).catch(e=>({ok:false,error:e.message}));
      if(!r.ok) return alert(r.error || 'Create belt failed');
      await refresh(); render();
    });

    on('tfc-assign-belt-btn', async () => {
      const belt = id('tfc-assign-belt').value;
      const r = await req('POST',`/api/admin/belts/${belt}/assign`,{
        holder_fighter_id:id('tfc-assign-holder').value,
        note:id('tfc-assign-note').value
      }).catch(e=>({ok:false,error:e.message}));
      if(!r.ok) return alert(r.error || 'Assign belt failed');
      await refresh(); render();
    });

    on('tfc-create-team', async () => {
      const r = await req('POST','/api/admin/teams',{
        event_id:id('tfc-team-event').value,
        name:id('tfc-team-name').value,
        captain_torn_id:id('tfc-team-captain').value,
        members:id('tfc-team-members').value,
        notes:id('tfc-team-notes').value
      }).catch(e=>({ok:false,error:e.message}));
      if(!r.ok) return alert(r.error || 'Create team failed');
      await refresh(); render();
    });

    on('tfc-create-ref', async () => {
      const r = await req('POST','/api/admin/referees',{
        event_id:id('tfc-ref-event').value,
        name:id('tfc-ref-name').value,
        torn_id:id('tfc-ref-torn').value,
        notes:id('tfc-ref-notes').value
      }).catch(e=>({ok:false,error:e.message}));
      if(!r.ok) return alert(r.error || 'Add ref failed');
      await refresh(); render();
    });

    on('tfc-edit-fight-btn', async () => {
      const fight = id('tfc-edit-fight').value;
      const body = {};
      if (id('tfc-edit-round').value) body.round_name = id('tfc-edit-round').value;
      if (id('tfc-edit-rules').value) body.rule_set = id('tfc-edit-rules').value;
      if (id('tfc-edit-start').value || id('tfc-edit-start').value === '') body.starts_at = id('tfc-edit-start').value;
      const r = await req('POST',`/api/admin/fights/${fight}/update`,body).catch(e=>({ok:false,error:e.message}));
      if(!r.ok) return alert(r.error || 'Edit fight failed');
      await refresh(); render();
    });

    on('tfc-delete-fight-btn', async () => {
      const fight = id('tfc-edit-fight').value;
      if (!fight || !confirm('Delete this fight and its picks?')) return;
      const r = await req('POST',`/api/admin/fights/${fight}/delete`,{}).catch(e=>({ok:false,error:e.message}));
      if(!r.ok) return alert(r.error || 'Delete fight failed');
      await refresh(); render();
    });

    on('tfc-edit-event-btn', async () => {
      const eventId = id('tfc-edit-event').value;
      const body = {};
      if (id('tfc-edit-event-title').value) body.title = id('tfc-edit-event-title').value;
      if (id('tfc-edit-event-theme').value) body.theme = id('tfc-edit-event-theme').value;
      if (id('tfc-edit-event-start').value) body.starts_at = id('tfc-edit-event-start').value;
      if (id('tfc-edit-event-status').value) body.status = id('tfc-edit-event-status').value;
      const r = await req('POST',`/api/admin/events/${eventId}/update`,body).catch(e=>({ok:false,error:e.message}));
      if(!r.ok) return alert(r.error || 'Edit event failed');
      await refresh(); render();
    });

    on('tfc-adjust-points', async () => {
      const r = await req('POST','/api/admin/points/adjust',{
        torn_id:id('tfc-points-user').value,
        amount:id('tfc-points-amount').value,
        reason:id('tfc-points-reason').value
      }).catch(e=>({ok:false,error:e.message}));
      if(!r.ok) return alert(r.error || 'Adjust points failed');
      await refresh(); render();
    });


  function boot() {
    // First visible attempt immediately.
    try { mountHeaderButton(); } catch (e) {}

    let ticks = 0;
    const interval = setInterval(() => {
      try { mountHeaderButton(); } catch (e) {}
      ticks++;
      if (ticks > 360) clearInterval(interval);
    }, 500);

    const observer = new MutationObserver(() => {
      try { mountHeaderButton(); } catch (e) {}
    });
    observer.observe(document.documentElement || document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
