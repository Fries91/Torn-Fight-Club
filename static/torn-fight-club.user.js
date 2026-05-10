// ==UserScript==
// @name         Torn Fight Club Launcher - Fries91
// @namespace    Fries91.TornFightClub
// @version      4.5.0
// @description  Native full-width Torn page launcher row with unread notification badge.
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

  const ROW_ID = 'tfc-native-page-strip-row';
  const BADGE_ID = 'tfc-native-page-strip-badge';
  const STYLE_ID = 'tfc-native-page-strip-style';

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const css = `
      #${ROW_ID} {
        width:100%!important;
        min-height:42px!important;
        height:42px!important;
        display:flex!important;
        align-items:center!important;
        justify-content:center!important;
        background:linear-gradient(90deg,#080000,#2a0000,#080000)!important;
        border-top:1px solid rgba(255,65,65,.55)!important;
        border-bottom:1px solid rgba(255,65,65,.75)!important;
        box-shadow:inset 0 1px 0 rgba(255,255,255,.06), 0 2px 8px rgba(0,0,0,.65)!important;
        box-sizing:border-box!important;
        padding:4px 8px!important;
        margin:6px 0!important;
        position:relative!important;
        z-index:20!important;
        cursor:pointer!important;
        clear:both!important;
        opacity:1!important;
        visibility:visible!important;
        pointer-events:auto!important;
        font-family:Arial,Helvetica,sans-serif!important;
      }

      #${ROW_ID} .tfc-inner {
        width:100%!important;
        max-width:680px!important;
        min-height:30px!important;
        display:flex!important;
        align-items:center!important;
        justify-content:center!important;
        gap:8px!important;
        border:1px solid rgba(255,70,70,.95)!important;
        border-radius:999px!important;
        background:linear-gradient(135deg,#2e0000,#111)!important;
        color:#fff!important;
        font-size:16px!important;
        font-weight:900!important;
        line-height:22px!important;
        text-align:center!important;
        text-shadow:0 0 8px rgba(255,0,0,.7)!important;
        box-shadow:0 0 14px rgba(180,0,0,.55)!important;
        padding:4px 12px!important;
        box-sizing:border-box!important;
        position:relative!important;
      }

      #${ROW_ID}:hover .tfc-inner {
        background:linear-gradient(135deg,#420000,#171717)!important;
        border-color:#ff7777!important;
      }

      #${BADGE_ID} {
        display:none;
        position:absolute!important;
        top:-9px!important;
        right:-9px!important;
        min-width:20px!important;
        height:20px!important;
        padding:0 5px!important;
        border-radius:999px!important;
        background:#ff2d2d!important;
        color:#fff!important;
        border:1px solid #fff!important;
        font-size:11px!important;
        line-height:19px!important;
        text-align:center!important;
        font-weight:900!important;
        box-shadow:0 0 10px rgba(255,0,0,.85)!important;
        box-sizing:border-box!important;
      }

      @media(max-width:700px){
        #${ROW_ID} {
          min-height:38px!important;
          height:38px!important;
          padding:3px 6px!important;
          margin:5px 0!important;
        }
        #${ROW_ID} .tfc-inner {
          min-height:28px!important;
          font-size:14px!important;
          padding:3px 10px!important;
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

  function makeRow() {
    injectStyle();

    let row = document.getElementById(ROW_ID);
    if (!row) {
      row = document.createElement('div');
      row.id = ROW_ID;
      row.title = 'Open Torn Fight Club';
      row.setAttribute('aria-label', 'Open Torn Fight Club');
      row.innerHTML = '<div class="tfc-inner"><span>🥊 Torn Fight Club 🥊</span><span id="' + BADGE_ID + '">0</span></div>';
      row.addEventListener('click', openApp);
    }

    return row;
  }

  function visible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function textOf(el) {
    return (el && el.textContent ? el.textContent : '').trim().toLowerCase();
  }

  function findPageTitleHomeRow() {
    const els = Array.from(document.querySelectorAll('h1,h2,h3,div,section'));
    for (const el of els) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.top < 430 || r.top > 620) continue;
      const txt = textOf(el);
      if (txt === 'home' || txt.startsWith('home ')) {
        // Prefer the wider parent that contains the eye/calendar/lightbulb area too.
        let p = el;
        for (let i = 0; i < 4 && p && p.parentElement; i++, p = p.parentElement) {
          const pr = p.getBoundingClientRect();
          if (visible(p) && pr.width > window.innerWidth * 0.65 && pr.height <= 90) return p;
        }
        return el;
      }
    }
    return null;
  }

  function findFirstContentCard() {
    const els = Array.from(document.querySelectorAll('div,section'));
    let best = null;
    let bestTop = Infinity;

    for (const el of els) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.top < 560 || r.top > 900) continue;
      if (r.width < window.innerWidth * 0.65) continue;
      if (r.height < 80) continue;

      const txt = textOf(el);
      const looksLikeCard =
        txt.includes('battle stats') ||
        txt.includes('job information') ||
        txt.includes('property') ||
        txt.includes('strength') ||
        txt.includes('defense');

      if (looksLikeCard && r.top < bestTop) {
        best = el;
        bestTop = r.top;
      }
    }

    return best;
  }

  function findMainContentContainer() {
    const card = findFirstContentCard();
    if (!card) return null;

    let p = card.parentElement;
    let best = card.parentElement;

    for (let i = 0; i < 6 && p; i++, p = p.parentElement) {
      if (!visible(p)) continue;
      const r = p.getBoundingClientRect();
      if (r.width >= window.innerWidth * 0.70 && r.top < card.getBoundingClientRect().top && r.height > card.getBoundingClientRect().height) {
        best = p;
      }
    }

    return best || card.parentElement;
  }

  function mountRow() {
    if (!document.body) return;

    const row = makeRow();

    // Best placement: inside the Home/page content, directly above the first content card.
    const firstCard = findFirstContentCard();
    if (firstCard && firstCard.parentElement) {
      if (firstCard.previousElementSibling !== row) {
        firstCard.parentElement.insertBefore(row, firstCard);
      }
      return;
    }

    // Second placement: after the Home title row.
    const homeRow = findPageTitleHomeRow();
    if (homeRow && homeRow.parentElement) {
      if (row.parentElement !== homeRow.parentElement || homeRow.nextElementSibling !== row) {
        homeRow.insertAdjacentElement('afterend', row);
      }
      return;
    }

    // Third placement: inside main content container at the top.
    const main = findMainContentContainer();
    if (main) {
      if (main.firstElementChild !== row) {
        main.insertBefore(row, main.firstElementChild);
      }
      return;
    }

    // Last fallback: top of body flow, not fixed.
    if (document.body.firstElementChild !== row) {
      document.body.insertBefore(row, document.body.firstChild);
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
    const row = document.getElementById(ROW_ID);
    if (!badge || !row) return;

    count = Number(count || 0);
    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : String(count);
      badge.style.display = 'inline-block';
      row.title = 'Open Torn Fight Club — ' + count + ' unread notification' + (count === 1 ? '' : 's');
    } else {
      badge.style.display = 'none';
      row.title = 'Open Torn Fight Club';
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
    mountRow();
    fetchUnreadCount();

    let tries = 0;
    const timer = setInterval(function () {
      mountRow();
      tries++;
      if (tries > 240) clearInterval(timer);
    }, 800);

    setInterval(fetchUnreadCount, 30000);

    window.addEventListener('resize', mountRow);
    window.addEventListener('orientationchange', function () {
      setTimeout(mountRow, 600);
    });

    const obs = new MutationObserver(function () {
      mountRow();
    });
    obs.observe(document.documentElement || document.body, { childList:true, subtree:true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
