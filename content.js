(() => {
  const DEFAULTS = {enabled:true, intervalMs:5000, maxPerScan:8, totalClosed:0};
  let settings = {...DEFAULTS}, timer=null, observer=null, busy=false, quickTimer=null;

  chrome.storage.local.get(DEFAULTS, d => {
    settings = {...DEFAULTS, ...d};
    if (settings.enabled) start();
  });

  chrome.storage.onChanged.addListener(c => {
    if (c.enabled) {
      settings.enabled = c.enabled.newValue;
      settings.enabled ? start() : stop();
    }
    if (c.intervalMs) {
      settings.intervalMs = c.intervalMs.newValue;
      if (settings.enabled) start();
    }
    if (c.maxPerScan) settings.maxPerScan = c.maxPerScan.newValue;
  });

  const norm = s => (s || "").toLocaleLowerCase("tr-TR").replace(/\s+/g," ").trim();

  function start() {
    stopTimer();
    scan();
    timer = setInterval(scan, Math.max(3000, Number(settings.intervalMs)||5000));
    if (!observer) {
      observer = new MutationObserver(() => {
        if (settings.enabled && !busy) scheduleQuick();
      });
      observer.observe(document.body, {childList:true, subtree:true});
    }
  }

  function stop() {
    stopTimer();
    if (observer) { observer.disconnect(); observer=null; }
    if (quickTimer) { clearTimeout(quickTimer); quickTimer=null; }
  }

  function stopTimer() {
    if (timer) clearInterval(timer);
    timer=null;
  }

  function scheduleQuick() {
    if (quickTimer) return;
    quickTimer=setTimeout(()=>{quickTimer=null; scan();},900);
  }

  // V2: önce "Tanıyabileceğiniz kişiler" bölümünü buluyoruz.
  function findRecommendationSection() {
    const all = [...document.querySelectorAll("h1,h2,h3,h4,h5,span,div,p")];
    const hit = all.find(el => {
      const t = norm(el.innerText || el.textContent);
      return t.includes("tanıyabileceğiniz kişiler") ||
             t.includes("people you may know");
    });
    if (!hit) return null;

    // Başlıktan yukarı doğru kart listesini/section'ı bul.
    let el = hit;
    for (let i=0; i<7 && el; i++, el=el.parentElement) {
      const cards = [...el.querySelectorAll("li")].filter(x => {
        const t=norm(x.innerText);
        return t.includes("bağlantı kur") || t.includes("connect") || t.includes("bağlan");
      });
      if (cards.length >= 2) return el;
    }
    return hit.parentElement;
  }

  function looksLikeDismiss(btn, card) {
    const a = norm(
      btn.getAttribute("aria-label") + " " +
      btn.getAttribute("title") + " " +
      btn.textContent
    );

    if (a.includes("dismiss") || a.includes("kapat") ||
        a.includes("close") || a.includes("öneriyi kaldır") ||
        a.includes("remove suggestion")) return true;

    // LinkedIn sürümünde aria-label bulunmazsa geometrik konumla X düğmesini seç.
    const cr=card.getBoundingClientRect(), br=btn.getBoundingClientRect();
    if (cr.width < 120 || cr.height < 80 || br.width < 10 || br.height < 10) return false;

    const relX = br.left-cr.left, relY=br.top-cr.top;
    const nearTop = relY >= -5 && relY < Math.min(115, cr.height*0.42);
    const nearRight = relX > cr.width*0.58;
    const small = br.width <= 70 && br.height <= 70;

    return nearTop && nearRight && small;
  }

  function getCards(section) {
    const lis=[...section.querySelectorAll("li")];
    const candidates=lis.filter(card=>{
      const t=norm(card.innerText);
      const r=card.getBoundingClientRect();
      return r.width>=120 && r.height>=120 &&
        (t.includes("bağlantı kur") || t.includes("connect") || t.includes("bağlan"));
    });

    if (candidates.length) return candidates;

    // Bazı LinkedIn sürümlerinde kartlar li değildir.
    const divs=[...section.querySelectorAll("div")];
    return divs.filter(card=>{
      const t=norm(card.innerText);
      const r=card.getBoundingClientRect();
      return r.width>=150 && r.width<=500 && r.height>=180 && r.height<=700 &&
        (t.includes("bağlantı kur") || t.includes("connect"));
    }).slice(0,20);
  }

  function scan() {
    if (!settings.enabled || busy || !document.body) return;
    busy=true;
    let closed=0;

    try {
      const section=findRecommendationSection();
      if (!section) return;

      const cards=getCards(section);
      const seen=new Set();

      for (const card of cards) {
        if (closed >= Math.max(1, Number(settings.maxPerScan)||8)) break;
        if (seen.has(card)) continue;
        seen.add(card);

        const buttons=[...card.querySelectorAll("button,[role='button']")];
        const dismiss=buttons.find(b=>looksLikeDismiss(b,card));
        if (!dismiss) continue;

        // Son güvenlik: buton gerçekten görünür ve kartın içinde olmalı.
        const br=dismiss.getBoundingClientRect(), cr=card.getBoundingClientRect();
        if (br.width<=0 || br.height<=0 || cr.width<=0) continue;
        if (br.left < cr.left-5 || br.right > cr.right+5) continue;

        dismiss.click();
        closed++;
      }

      if (closed) {
        chrome.storage.local.get({totalClosed:0}, d=>{
          chrome.storage.local.set({
            totalClosed:Number(d.totalClosed||0)+closed,
            lastAction:new Date().toISOString()
          });
        });
      }
    } finally {
      busy=false;
    }
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type==="SCAN_NOW") { scan(); sendResponse({ok:true}); }
    return true;
  });
})();