// ==UserScript==
// @name         Torn Fight Club Launcher - Fries91
// @namespace    Fries91.TornFightClub
// @version      4.4.0
// @description  Forced news-slot launcher for Torn Fight Club with notification badge.
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

  const WRAP_ID = 'tfc-forced-news-slot-wrap';
  const BTN_ID = 'tfc-forced-news-slot-btn';
  const BADGE_ID = 'tfc-forced-news-slot-badge';
  const STYLE_ID = 'tfc-forced-news-slot-style';

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const css = `
      #${WRAP_ID} {
        position:fixed!important;
        left:0!important;
        right:0!important;
        width:100%!important;
        min-height:31px!important;
        max-height:33px!important;
        display:flex!important;
        align-items:center!important;
        justify-content:center!important;
        background:linear-gradient(90deg,#0b0000,#250000,#0b0000)!important;
        border-top:1px solid rgba(255,70,70,.35)!important;
        border-bottom:1px solid rgba(255,70,70,.55)!important;
        box-shadow:0 2px 8px rgba(0,0,0,.65), inset 0 1px 0 rgba(255,255,255,.05)!important;
        z-index:2147483000!important;
        box-sizing:border-box!important;
        padding:3px 6px!important;
        opacity:1!important;
        visibility:visible!important;
        pointer-events:auto!important;
      }

      #${BTN_ID} {
        display:inline-flex!important;
        align-items:center!important;
        justify-content:center!important;
        gap:6px!important;
        width:auto!important;
        max-width:94vw!important;
        min-height:24px!important;
        padding:3px 16px!important;
        border:1px solid rgba(255,70,70,.9)!important;
        border-radius:999px!important;
        background:linear-gradient(135deg,#280000,#111)!important;
        color:#fff!important;
        font-size:13px!important;
        font-weight:900!important;
        line-height:18px!important;
        text-decoration:none!important;
        cursor:pointer!important;
        box-shadow:0 0 12px rgba(180,0,0,.55)!important;
        white-space:nowrap!important;
        position:relative!important;
        font-family:Arial,Helvetica,sans-serif!important;
      }

      #${BTN_ID}:hover {
        background:linear-gradient(135deg,#420000,#171717)!important;
        border-color:#ff6666!important;
      }

      #${BADGE_ID} {
        display:none;
        position:absolute!important;
        top:-8px!important;
        right:-8px!important;
        min-width:18px!important;
        height:18px!important;
        padding:0 4px!important;
        border-radius:999px!important;
        background:#ff2d2d!important;
        color:#fff!important;
        border:1px solid #fff!important;
        font-size:10px!important;
        line-height:17px!important;
        text-align:center!important;
        font-weight:900!important;
        box-shadow:0 0 10px rgba(255,0,0,.85)!important;
        box-sizing:border-box!important;
      }

      @media(max-width:700px){
        #${WRAP_ID} {
          min-height:30px!important;
          max-height:32px!important;
          padding:2px 4px!important;
        }
        #${BTN_ID} {
          font-size:12px!important;
          padding:3px 13px!important;
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

  function makeWrap() {
    injectStyle();

    let wrap = document.getElementById(WRAP_ID);
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = WRAP_ID;
    }

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

    if (!wrap.contains(btn)) wrap.appendChild(btn);
    if (!document.body.contains(wrap)) document.body.appendChild(wrap);

    return wrap;
  }

  function visible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function isMostlyHorizontalRow(el) {
    if (!visible(el)) return false;
    const r = el.getBoundingClientRect();
    return r.width > window.innerWidth * 0.55 && r.height >= 18 && r.height <= 65;
  }

  function findRowByText(words, minTop, maxTop) {
    const els = Array.from(document.querySelectorAll('div,nav,section,header,ul,li,a,span'));
    let best = null;
    let bestScore = -1;

    for (const el of els) {
      if (!isMostlyHorizontalRow(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.top < minTop || r.top > maxTop) continue;

      const text = (el.textContent || '').toLowerCase();
      let score = 0;
      words.forEach(w => {
        if (text.includes(w)) score += 3;
      });
      if (!score) continue;

      score += Math.max(0, 800 - Math.abs(r.top - 300)) / 800;

      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    }

    return best;
  }

  function findNewsTickerRow() {
    return findRowByText([
      'share price', 'crippled', 'chain', 'detonated', 'decreased',
      'increased', 'ranked', 'completed', 'hospitalized', 'faction',
      'war', 'bounty', 'attacked', 'defeated'
    ], 150, 340);
  }

  function findIconNavRow() {
    return findRowByText([
      'messages', 'events', 'awards', 'home', 'items', 'city', 'wheel', 'stocks'
    ], 190, 390);
  }

  function computeTop() {
    const wrapHeight = 31;

    const news = findNewsTickerRow();
    const nav = findIconNavRow();

    if (news) {
      const nr = news.getBoundingClientRect();
      const afterNews = Math.round(nr.bottom);

      if (nav) {
        const vr = nav.getBoundingClientRect();
        // Put it between the news ticker and icon row.
        const gap = Math.max(0, vr.top - afterNews);
        if (gap >= wrapHeight) return afterNews;
        // If there is no natural gap, place it over the very top edge of the icon row.
        return Math.max(afterNews, Math.round(vr.top - wrapHeight));
      }

      return afterNews;
    }

    if (nav) {
      const vr = nav.getBoundingClientRect();
      return Math.max(160, Math.round(vr.top - wrapHeight));
    }

    // PDA/mobile fallback based on common Torn layout:
    // below the scrolling news row and above Messages/Events row.
    return 294;
  }

  function applyPosition() {
    const wrap = makeWrap();
    const top = computeTop();
    wrap.style.top = top + 'px';
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
    applyPosition();
    fetchUnreadCount();

    let tries = 0;
    const timer = setInterval(function () {
      applyPosition();
      tries++;
      if (tries > 240) clearInterval(timer);
    }, 800);

    setInterval(fetchUnreadCount, 30000);

    window.addEventListener('resize', applyPosition);
    window.addEventListener('orientationchange', function () {
      setTimeout(applyPosition, 600);
    });

    const obs = new MutationObserver(function () {
      applyPosition();
    });
    obs.observe(document.documentElement || document.body, { childList:true, subtree:true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
