(function(){
  const SCRIPT_URL = window.LEGRAND_SCRIPT_URL || "";
  const $ = (s)=>document.querySelector(s);
  const lotInput = $('#lot'), resultEl = $('#result'), statusEl = $('#status');

  function setStatus(t,isErr=false){ statusEl.textContent=t||''; statusEl.style.borderColor=isErr?'var(--danger)':'var(--border)'; statusEl.style.color=isErr?'var(--danger)':'var(--muted)'; }
  function escapeHtml(s){ return String(s).replace(/[&<>\"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'" :'&#39;'}[m])); }

  function jsonp(url){
    return new Promise((resolve, reject)=>{
      const cb = 'cb_' + Math.random().toString(36).slice(2);
      window[cb] = (data)=>{ delete window[cb]; resolve(data); };
      const s = document.createElement('script');
      s.src = url + (url.includes('?') ? '&' : '?') + 'callback=' + cb;
      s.onerror = ()=>{ delete window[cb]; reject(new Error('JSONP load error')); };
      document.body.appendChild(s);
    });
  }

  async function lookup(lotRaw){
    const lot = String(lotRaw||'').trim();
    if(!lot) return;
    setStatus('Searching…');
    resultEl.innerHTML='';
    try{
      const u = new URL(SCRIPT_URL);
      u.searchParams.set('lot', lot);
      const data = await jsonp(u.toString());
      if (!data || data.ok === false) {
        const msg = (data && (data.error || (data.notFound && 'Not found'))) || 'Lookup failed';
        setStatus(msg, true);
        resultEl.innerHTML = `<div class="err">${escapeHtml(msg)} for LOT <span class="mono">${escapeHtml(lot)}</span>.</div>`;
        updateUrl(lot);
        return;
      }
      setStatus(`Found ${data.count} file(s)`);
      renderList(lot, data.items, data.primary);
      updateUrl(lot);
    }catch(err){
      setStatus('Lookup failed', true);
      resultEl.innerHTML = `<div class="err">Lookup error. Check your Apps Script deploy & sharing. (${escapeHtml(err.message)})</div>`;
    }
  }

  function renderList(lot, items, primary){
    const grid = document.createElement('div'); grid.className = 'grid';
    const panel = document.createElement('div');
    const links = document.createElement('div'); links.className = 'links';

    function select(item, el){
      grid.querySelectorAll('.thumb').forEach(x => x.classList.remove('active'));
      if (el) el.classList.add('active');

      links.innerHTML = `
        <div>LOT <strong>${escapeHtml(lot)}</strong></div>
        <span class="mono">FILE_ID:</span> <span class="mono">${escapeHtml(item.fileId)}</span>
        <a href="${item.open}" target="_blank" rel="noopener">Open in Drive</a>
        <a href="${item.view}" target="_blank" rel="noopener">Direct view</a>
        <a href="${item.preview}" target="_blank" rel="noopener">Preview URL</a>
      `;

      panel.innerHTML = '';
      panel.appendChild(links);
      const lower = item.name.toLowerCase();
      if (lower.endsWith('.pdf')) {
        const embed = document.createElement('embed');
        embed.className = 'embed';
        embed.type = 'application/pdf';
        embed.src = item.preview;
        panel.appendChild(embed);
      } else {
        const img = document.createElement('img');
        // Try Drive "view" first; if it fails (onerror), fall back to googleusercontent direct.
        img.src = item.view;
        img.alt = 'Certificate image';
        img.style.maxWidth = '100%';
        img.style.height = 'auto';
        img.style.border = '1px solid var(--border)';
        img.style.borderRadius = '12px';
        img.onerror = () => { if (img.src !== item.image) img.src = item.image; };
        panel.appendChild(img);
      }
    }

    items.forEach((it) => {
      const card = document.createElement('div');
      card.className = 'thumb';
      card.title = it.name;
      const lower = it.name.toLowerCase();
      let imgHtml;
      if (lower.endsWith('.pdf')) {
        imgHtml = `<div style="display:flex;align-items:center;justify-content:center;height:140px">PDF</div>`;
      } else {
        const thumb = it.thumb || it.view || it.image;
        imgHtml = `<img src="${thumb}" alt="thumb" onerror="this.onerror=null; this.src='${(it.image || '').replace(/'/g, "\\'")}';">`;
      }
      card.innerHTML = `${imgHtml}<div class="name mono">${escapeHtml(it.name)}</div>`;
      card.onclick = () => select(it, card);
      grid.appendChild(card);
    });

    resultEl.innerHTML = '';
    resultEl.appendChild(grid);
    resultEl.appendChild(panel);

    const first = primary || items[0];
    const firstEl = Array.from(grid.children).find(c => c.title === first.name) || grid.children[0];
    select(first, firstEl);
  }

  function updateUrl(lot){
    const url = new URL(location.href);
    if(lot) url.searchParams.set('lot', lot); else url.searchParams.delete('lot');
    history.replaceState(null,'',url);
  }

  document.getElementById('f').addEventListener('submit', (e)=>{ e.preventDefault(); lookup(lotInput.value); });
  document.getElementById('clear').addEventListener('click', ()=>{ lotInput.value=''; resultEl.innerHTML=''; setStatus(''); updateUrl(''); lotInput.focus(); });

  (function(){
    const q = new URLSearchParams(location.search).get('lot') || '';
    if (q){ lotInput.value = q; lookup(q); } else { lotInput.focus(); }
  })();
})();
