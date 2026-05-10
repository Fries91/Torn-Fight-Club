// ==UserScript==
// @name         Torn Fight Club Launcher - Fries91
// @namespace    Fries91.TornFightClub
// @version      4.7.0
// @description  Persistent sticky top launcher for Torn Fight Club with unread notification badge.
// @author       Fries91
// @match        https://www.torn.com/*
// @match        https://*.torn.com/*
// @updateURL    https://torn-fight-club.onrender.com/static/torn-fight-club.user.js
// @downloadURL  https://torn-fight-club.onrender.com/static/torn-fight-club.user.js
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      torn-fight-club.onrender.com
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  const APP_URL = 'https://torn-fight-club.onrender.com/app';
  const STATE_URL = 'https://torn-fight-club.onrender.com/api/state';

  const ROW_ID = 'tfc-sticky-top-launcher-row';
  const BADGE_ID = 'tfc-sticky-top-launcher-badge';
  const STYLE_ID = 'tfc-sticky-top-launcher-style';
  const SPACER_ID = 'tfc-sticky-top-launcher-spacer';

  let lastUrl = location.href;

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const css = `
      #${ROW_ID} {
        position:fixed!important;
        left:0!important;
        right:0!important;
        top:0!important;
        width:100%!important;
        min-height:28px!important;
        height:28px!important;
        display:flex!important;
        align-items:center!important;
        justify-content:center!important;
        background:linear-gradient(90deg,#070000,#1c0000,#070000)!important;
        border-bottom:1px solid rgba(255,65,65,.70)!important;
        box-shadow:0 2px 8px rgba(0,0,0,.70)!important;
        box-sizing:border-box!important;
        padding:2px 6px!important;
        margin:0!important;
        z-index:2147483600!important;
        cursor:pointer!important;
        opacity:1!important;
        visibility:visible!important;
        pointer-events:auto!important;
        font-family:Arial,Helvetica,sans-serif!important;
      }

      #${ROW_ID} .tfc-inner {
        width:100%!important;
        max-width:680px!important;
        height:22px!important;
        min-height:22px!important;
        display:flex!important;
        align-items:center!important;
        justify-content:center!important;
        gap:6px!important;
        border:1px solid rgba(255,70,70,.90)!important;
        border-radius:999px!important;
        background:linear-gradient(135deg,#260000,#111)!important;
        color:#fff!important;
        font-size:13px!important;
        font-weight:900!important;
        line-height:18px!important;
        text-align:center!important;
        text-shadow:0 0 6px rgba(255,0,0,.65)!important;
        box-shadow:0 0 9px rgba(180,0,0,.45)!important;
        padding:1px 10px!important;
        box-sizing:border-box!important;
        position:relative!important;
      }

      #${ROW_ID}:hover .tfc-inner {
        background:linear-gradient(135deg,#3b0000,#171717)!important;
        border-color:#ff7777!important;
      }

      #${BADGE_ID} {
        display:none;
        position:absolute!important;
        top:-8px!important;
        right:-8px!important;
        min-width:18px!important;
        height:18px!important;
        padding:0 5px!important;
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

      #${SPACER_ID} {
        height:28px!important;
        min-height:28px!important;
        width:100%!important;
        display:block!important;
        clear:both!important;
      }

      body.tfc-sticky-top-ready {
        padding-top:28px!important;
        box-sizing:border-box!important;
      }

      @media(max-width:700px){
        #${ROW_ID} {
          min-height:26px!important;
          height:26px!important;
          padding:1px 5px!important;
        }
        #${ROW_ID} .tfc-inner {
          height:20px!important;
          min-height:20px!important;
          font-size:12px!important;
          line-height:17px!important;
          padding:1px 8px!important;
        }
        #${SPACER_ID} {
          height:26px!important;
          min-height:26px!important;
        }
        body.tfc-sticky-top-ready {
          padding-top:26px!important;
        }
      }
    `;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
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

  function makeSpacer() {
    let spacer = document.getElementById(SPACER_ID);
    if (!spacer) {
      spacer = document.createElement('div');
      spacer.id = SPACER_ID;
      spacer.setAttribute('aria-hidden', 'true');
    }
    return spacer;
  }

  function mountStickyTop() {
    if (!document.documentElement) return;

    injectStyle();

    const row = makeRow();

    if (!document.body) {
      document.documentElement.appendChild(row);
      return;
    }

    // Keep row fixed at top, outside Torn's changing page containers.
    if (!document.body.contains(row)) {
      document.body.appendChild(row);
    }

    // Body padding keeps Torn content from hiding under the strip.
    document.body.classList.add('tfc-sticky-top-ready');

    // A spacer helps on Torn/PDA layouts that ignore body padding.
    const spacer = makeSpacer();
    const first = document.body.firstElementChild;
    if (first !== spacer && first !== row) {
      document.body.insertBefore(spacer, first);
    } else if (first === row) {
      document.body.insertBefore(spacer, row);
    }

    if (!document.body.contains(row)) {
      document.body.appendChild(row);
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

  function checkUrlChange() {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(mountStickyTop, 100);
      setTimeout(mountStickyTop, 600);
      setTimeout(fetchUnreadCount, 800);
    }
  }

  function boot() {
    mountStickyTop();
    fetchUnreadCount();

    // Torn/PDA often replaces chunks of the page after navigation/refresh.
    setInterval(function () {
      mountStickyTop();
      checkUrlChange();
    }, 1000);

    setInterval(fetchUnreadCount, 30000);

    window.addEventListener('resize', mountStickyTop);
    window.addEventListener('orientationchange', function () {
      setTimeout(mountStickyTop, 600);
    });

    const obs = new MutationObserver(function () {
      mountStickyTop();
      checkUrlChange();
    });
    obs.observe(document.documentElement, { childList:true, subtree:true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
    mountStickyTop();
  } else {
    boot();
  }
})();
