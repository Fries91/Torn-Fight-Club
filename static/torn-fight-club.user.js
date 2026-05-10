// ==UserScript==
// @name         Torn Fight Club Launcher - Fries91
// @namespace    Fries91.TornFightClub
// @version      3.0.0
// @description  Opens the Torn Fight Club app page.
// @author       Fries91
// @match        https://www.torn.com/*
// @match        https://*.torn.com/*
// @updateURL    https://torn-fight-club.onrender.com/static/torn-fight-club.user.js
// @downloadURL  https://torn-fight-club.onrender.com/static/torn-fight-club.user.js
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';
  const APP_URL = 'https://torn-fight-club.onrender.com/app';

  function openApp() {
    window.open(APP_URL, '_blank', 'noopener,noreferrer');
  }

  function addButton() {
    if (!document.body || document.getElementById('tfc-open-app-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'tfc-open-app-btn';
    btn.textContent = '🥊';
    btn.title = 'Open Torn Fight Club';
    btn.onclick = openApp;
    btn.style.cssText = [
      'position:fixed','top:180px','right:8px','width:38px','height:38px',
      'border-radius:10px','border:2px solid #ff3434','background:#1b0000',
      'color:#fff','font-size:24px','z-index:2147483646','cursor:pointer',
      'box-shadow:0 4px 18px rgba(0,0,0,.75)','display:flex',
      'align-items:center','justify-content:center','padding:0'
    ].join(';');
    document.body.appendChild(btn);
  }

  function boot() {
    addButton();
    let tries = 0;
    const timer = setInterval(() => {
      addButton();
      tries++;
      if (tries > 180) clearInterval(timer);
    }, 1000);
    new MutationObserver(addButton).observe(document.documentElement || document.body, {childList:true, subtree:true});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
