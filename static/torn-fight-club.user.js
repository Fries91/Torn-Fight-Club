// ==UserScript==
// @name         Torn Fight Club Launcher - Fries91
// @namespace    Fries91.TornFightClub
// @version      4.3.0
// @description  News-strip launcher for Torn Fight Club with unread notification badge.
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

  const STRIP_ID = 'tfc-news-strip-launcher';
  const BTN_ID = 'tfc-news-strip-button';
  const BADGE_ID = 'tfc-news-strip-badge';
  const STYLE_ID = 'tfc-news-strip-style';

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const css = `
      #${STRIP_ID} {
        width:100%!important;
        min-height:30px!important;
        display:flex!important;
        align-items:center!important;
        justify-content:center!important;
        background:linear-gradient(90deg,#100,#210000,#100)!important;
        border-top:1px solid rgba(255,70,70,.35)!important;
        border-bottom:1px solid rgba(255,70,70,.45)!important;
        box-shadow:inset 0 1px 0 rgba(255,255,255,.05), 0 2px 8px rgba(0,0,0,.45)!important;
        z-index:5!important;
        position:relative!important;
        box-sizing:border-box!important;
        padding:3px 6px!important;
      }

      #${BTN_ID} {
        display:inline-flex!important;
        align-items:center!important;
        justify-content:center!important;
        gap:6px!important;
        width:auto!important;
        max-width:94vw!important;
        min-height:24px!important;
        padding:3px 14px!important;
        border:1px solid rgba(255,70,70,.85)!important;
        border-radius:999px!important;
        background:linear-gradient(135deg,#250000,#111)!important;
        color:#fff!important;
        font-size:13px!important;
        font-weight:900!important;
        line-height:18px!important;
        text-decoration:none!important;
        cursor:pointer!important;
        box-shadow:0 0 12px rgba(180,0,0,.45)!important;
        white-space:nowrap!important;
        position:relative!important;
        vertical-align:middle!important;
      }

      #${BTN_ID}:hover {
        background:linear-gradient(135deg,#3b0000,#181818)!important;
        border-color:#ff5555!important;
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
        #${STRIP_ID} {
          min-height:28px!important;
          padding:2px 4px!important;
        }
        #${BTN_ID} {
          font-size:12px!important;
          padding:3px 12px!important;
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

  function makeStrip() {
    injectStyle();

    let strip = document.getElementById(STRIP_ID);
    if (!strip) {
      strip = document.createElement('div');
      strip.id = STRIP_ID;
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

    if (!strip.contains(btn)) strip.appendChild(btn);
    return strip;
  }

  function visible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function looksLikeNews(el) {
    if (!el || !visible(el)) return false;
    const r = el.getBoundingClientRect();
    if (r.top < 120 || r.top > 330) return false;
    const txt = (el.textContent || '').trim();
    if (txt.length < 8) return false;

    const lower = txt.toLowerCase();
    const newsWords = [
      'crippled', 'chain', 'detonated', 'highest rated', 'defeated',
      'attacked', 'hospitalized', 'bounty', 'ranked', 'war', 'faction',
      'completed', 'outside', 'resolution', 'news'
    ];
    return newsWords.some(w => lower.includes(w));
  }

  function findNewsTicker() {
    const selectors = [
      '[class*="news"]',
      '[class*="ticker"]',
      '[class*="headline"]',
      '[class*="areas"]',
      '[class*="bar"]',
      'div'
    ];

    const seen = new Set();
    for (const sel of selectors) {
      const els = Array.from(document.querySelectorAll(sel));
      for (const el of els) {
        if (seen.has(el)) continue;
        seen.add(el);
        if (looksLikeNews(el)) {
          let candidate = el;
          for (let i = 0; i < 3 && candidate.parentElement; i++) {
            const p = candidate.parentElement;
            const pr = p.getBoundingClientRect();
            const cr = candidate.getBoundingClientRect();
            if (visible(p) && pr.width >= cr.width && pr.top >= 110 && pr.top <= 330 && pr.height <= 70) {
              candidate = p;
            }
          }
          return candidate;
        }
      }
    }

    return null;
  }

  function findInsertPointFallback() {
    // If the exact news ticker is not found, use the row below the main Torn logo/menu.
    const candidates = Array.from(document.querySelectorAll('header, #header, [class*="header"], [class*="top"], [class*="menu"], [class*="bar"], div'));
    let best = null;
    let bestScore = -1;

    for (const el of candidates) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.top < 120 || r.top > 330) continue;
      if (r.height < 18 || r.height > 80) continue;

      const text = (el.textContent || '').toLowerCase();
      let score = 0;
      if (text.includes('torn')) score += 1;
      if (text.includes('home')) score += 1;
      if (text.includes('messages')) score += 1;
      if (text.includes('events')) score += 1;
      if (text.includes('stocks')) score += 1;
      score += Math.max(0, 1000 - Math.abs(r.top - 250)) / 1000;

      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    }

    return best;
  }

  function mountStrip() {
    if (!document.body) return;

    const strip = makeStrip();

    const news = findNewsTicker();
    if (news && news.parentElement) {
      if (strip.parentElement !== news.parentElement || strip.previousElementSibling !== news) {
        news.insertAdjacentElement('afterend', strip);
      }
      return;
    }

    const fallback = findInsertPointFallback();
    if (fallback && fallback.parentElement) {
      if (strip.parentElement !== fallback.parentElement) {
        fallback.insertAdjacentElement('afterend', strip);
      }
      return;
    }

    // Last resort: still not floating over content; keep it at top of body flow.
    if (document.body.firstChild !== strip) {
      document.body.insertBefore(strip, document.body.firstChild);
    }
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
    mountStrip();
    fetchUnreadCount();

    let tries = 0;
    const mountTimer = setInterval(function () {
      mountStrip();
      tries++;
      if (tries > 240) clearInterval(mountTimer);
    }, 800);

    setInterval(fetchUnreadCount, 30000);

    const obs = new MutationObserver(function () {
      mountStrip();
    });
    obs.observe(document.documentElement || document.body, { childList:true, subtree:true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
