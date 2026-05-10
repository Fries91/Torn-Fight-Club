// ==UserScript==
// @name         Torn Fight Club Launcher - Fries91
// @namespace    Fries91.TornFightClub
// @version      4.2.0
// @description  Header launcher for Torn Fight Club with unread notification badge.
// @author       Fries91
// @match        https://www.torn.com/*
// @match        https://*.torn.com/*
// @updateURL    https://torn-fight-club.onrender.com/static/torn-fight-club.user.js
// @downloadURL  https://torn-fight-club.onrender.com/static/torn-fight-club.user.js
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      torn-fight-club.onrender.com
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';

  const APP_URL = 'https://torn-fight-club.onrender.com/app';
  const STATE_URL = 'https://torn-fight-club.onrender.com/api/state';
  const BTN_ID = 'tfc-header-app-launcher';
  const BADGE_ID = 'tfc-header-notify-badge';
  const STYLE_ID = 'tfc-header-launcher-style';

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const css = `
      #${BTN_ID} {
        display:inline-flex!important;
        align-items:center!important;
        justify-content:center!important;
        gap:4px!important;
        min-height:24px!important;
        max-height:28px!important;
        padding:3px 8px!important;
        margin:0 4px!important;
        border:1px solid rgba(255,70,70,.75)!important;
        border-radius:999px!important;
        background:linear-gradient(135deg,#210000,#111)!important;
        color:#fff!important;
        font-size:12px!important;
        font-weight:900!important;
        line-height:18px!important;
        text-decoration:none!important;
        cursor:pointer!important;
        box-shadow:0 0 10px rgba(180,0,0,.35)!important;
        white-space:nowrap!important;
        z-index:50!important;
        position:relative!important;
        vertical-align:middle!important;
      }
      #${BTN_ID}:hover {
        background:linear-gradient(135deg,#3a0000,#171717)!important;
        border-color:#ff5555!important;
      }
      #${BADGE_ID} {
        display:none;
        position:absolute!important;
        top:-7px!important;
        right:-8px!important;
        min-width:17px!important;
        height:17px!important;
        padding:0 4px!important;
        border-radius:999px!important;
        background:#ff2d2d!important;
        color:#fff!important;
        border:1px solid #fff!important;
        font-size:10px!important;
        line-height:16px!important;
        text-align:center!important;
        font-weight:900!important;
        box-shadow:0 0 10px rgba(255,0,0,.8)!important;
      }
      #tfc-emergency-holder {
        position:fixed!important;
        top:8px!important;
        right:8px!important;
        z-index:2147483646!important;
        display:flex!important;
        align-items:center!important;
        justify-content:center!important;
      }
      @media(max-width:700px){
        #${BTN_ID} {
          font-size:11px!important;
          padding:3px 7px!important;
          max-width:156px!important;
        }
      }
    `;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  function openApp() {
    window.open(APP_URL, '_blank', 'noopener,noreferrer');
  }

  function makeButton() {
    injectStyle();
    let btn = document.getElementById(BTN_ID);
    if (!btn) {
      btn = document.createElement('button');
      btn.id = BTN_ID;
      btn.type = 'button';
      btn.title = 'Open Torn Fight Club';
      btn.setAttribute('aria-label', 'Open Torn Fight Club');
      btn.innerHTML = '<span>🥊 Torn Fight Club 🥊</span><span id="' + BADGE_ID + '">0</span>';
      btn.addEventListener('click', openApp);
    }
    return btn;
  }

  function visible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function findTextNodeElement(patterns) {
    const all = Array.from(document.querySelectorAll('a,button,span,div,li'));
    for (const el of all) {
      const text = (el.textContent || '').trim().toLowerCase();
      if (!text) continue;
      if (patterns.some(p => text.includes(p))) return el;
    }
    return null;
  }

  function findHeaderRow() {
    const gender = findTextNodeElement(['gender']);
    if (gender) {
      let p = gender;
      for (let i = 0; i < 6 && p; i++, p = p.parentElement) {
        if (visible(p) && p.children && p.children.length >= 2) return p;
      }
    }

    const candidates = Array.from(document.querySelectorAll(
      '#topbar, #header, header, [class*="header"], [class*="top"], [class*="status"], [class*="menu"], [class*="bar"]'
    ));

    let best = null;
    let bestScore = -1;
    for (const el of candidates) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.top > 160) continue;
      const text = (el.textContent || '').toLowerCase();
      let score = 0;
      ['money','points','merits','gender','level','donator','energy','happy','nerve'].forEach(k => {
        if (text.includes(k)) score += 2;
      });
      score += Math.min(6, el.children ? el.children.length : 0);
      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    }
    return best;
  }

  function findBankIconNearbyRow() {
    const bankish = findTextNodeElement(['bank', 'faction banking', 'banker']);
    if (!bankish) return null;
    let p = bankish;
    for (let i = 0; i < 6 && p; i++, p = p.parentElement) {
      if (visible(p) && p.children && p.children.length >= 2) return p;
    }
    return null;
  }

  function placeInEmergencyDock(btn) {
    let holder = document.getElementById('tfc-emergency-holder');
    if (!holder) {
      holder = document.createElement('div');
      holder.id = 'tfc-emergency-holder';
      document.body.appendChild(holder);
    }
    if (!holder.contains(btn)) holder.appendChild(btn);
  }

  function mountButton() {
    if (!document.body) return;
    const btn = makeButton();

    const bankRow = findBankIconNearbyRow();
    if (bankRow && !bankRow.contains(btn)) {
      try {
        bankRow.appendChild(btn);
        return;
      } catch(e) {}
    }

    const row = findHeaderRow();
    if (row && !row.contains(btn)) {
      try {
        row.appendChild(btn);
        return;
      } catch(e) {}
    }

    placeInEmergencyDock(btn);
  }

  function getToken() {
    try {
      return localStorage.getItem('tfc_token') || GM_getValue('tfc_token', '') || '';
    } catch(e) {
      try { return GM_getValue('tfc_token', '') || ''; } catch(e2) { return ''; }
    }
  }

  function setBadge(count) {
    const badge = document.getElementById(BADGE_ID);
    const btn = document.getElementById(BTN_ID);
    if (!badge || !btn) return;
    count = Number(count || 0);
    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : String(count);
      badge.style.display = 'inline-block';
      btn.title = 'Open Torn Fight Club — ' + count + ' unread notification' + (count === 1 ? '' : 's');
    } else {
      badge.style.display = 'none';
      btn.title = 'Open Torn Fight Club';
    }
  }

  function fetchUnreadCount() {
    const token = getToken();
    if (!token) {
      setBadge(0);
      return;
    }

    GM_xmlhttpRequest({
      method: 'GET',
      url: STATE_URL,
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      timeout: 15000,
      onload: function (res) {
        try {
          const data = JSON.parse(res.responseText || '{}');
          const list = data.my_notifications || [];
          const unread = list.filter(n => Number(n.is_read || 0) === 0).length;
          setBadge(unread);
        } catch(e) {
          setBadge(0);
        }
      },
      onerror: function () { setBadge(0); },
      ontimeout: function () { setBadge(0); }
    });
  }

  function boot() {
    mountButton();
    fetchUnreadCount();

    let tries = 0;
    const mountTimer = setInterval(function () {
      mountButton();
      tries++;
      if (tries > 180) clearInterval(mountTimer);
    }, 1000);

    setInterval(fetchUnreadCount, 30000);

    const obs = new MutationObserver(function () {
      mountButton();
    });
    obs.observe(document.documentElement || document.body, { childList:true, subtree:true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
