// fallvector SDK · sovereign single-file library · MIT · AI-Native Solutions
// Extracted from fallvector/index.html · 57423 bytes of source logic
// Public-safe: no primes/glyphs/dyad references

/*!
 * Fall Kit · v1.0.0 · the shared cascade for every estate seed
 *
 * Inlineable JS module. Drop into any seed via <script> or copy-paste inline.
 * Preserves single-HTML sovereignty (no external deps until user opts in to T2 WebLLM).
 *
 * What it gives every seed:
 *  - AI tier picker: T0 (off · default) · T2 (WebLLM in-browser, 5 models 1B-70B) · T3 (BYOK Anthropic/OpenAI/Google)
 *  - Universal entry: FallKit.aiComplete(systemPrompt, userMsg, maxTokens) → string|null
 *  - AI chip UI in header
 *  - WebRTC P2P mesh (ported from canonical fallnet · fall-signal channel · Google STUN)
 *  - Help section partial: FallKit.helpSection()
 *  - Settings panel: FallKit.openSettings()
 *
 * Doctrine (per botler CLAUDE.md):
 *  - T0 fallback ALWAYS works · aiComplete returns null · caller MUST degrade gracefully
 *  - NEVER hide a feature behind AI · NEVER proxy API keys · NEVER log keys
 *  - WebLLM is lazy-loaded · model weights download ONLY on user opt-in
 *
 * Estate-first canonical references:
 *  - WebLLM pattern: Downloads/botler/index.html (T0/T2/T3 cascade)
 *  - WebRTC pattern: Downloads/fallnet/fallnet-shim.js (raw RTCPeerConnection)
 *  - Mesh channel:   'fall-signal'
 */
(function (root) {
  'use strict';
  const FALL_KIT_VERSION = '1.2.0';
  const KCC_MINT_URL = 'https://sjgant80-hub.github.io/kcc-mint/';
  // ─── Model registry ──────────────────────────────────────────────
  const WEBLLM_MODELS = {
    'llama-1b':  { id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',   size: '~700MB', label: '1B · fast · any laptop / phone' },
    'llama-3b':  { id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC',   size: '~2GB',   label: '3B · balanced · default · most laptops' },
    'qwen-7b':   { id: 'Qwen2.5-7B-Instruct-q4f16_1-MLC',     size: '~5GB',   label: '7B · capable · needs decent GPU (M-series Mac / 8GB+ VRAM)' },
    'llama-8b':  { id: 'Llama-3.1-8B-Instruct-q4f16_1-MLC',   size: '~5GB',   label: '8B · common · needs decent GPU' },
    'llama-70b': { id: 'Llama-3.1-70B-Instruct-q4f16_1-MLC',  size: '~40GB',  label: '70B · frontier · needs serious GPU + 64GB+ RAM' },
  };
  const DEFAULT_MODEL = 'llama-3b';
  const T3_PROVIDERS = {
    anthropic: { label: 'Anthropic Claude', models: ['claude-sonnet-4-5','claude-opus-4-7','claude-haiku-4-5'], default: 'claude-sonnet-4-5', url: 'https://api.anthropic.com/v1/messages' },
    openai:    { label: 'OpenAI',           models: ['gpt-4o','gpt-4o-mini','o1-mini'],                          default: 'gpt-4o-mini',      url: 'https://api.openai.com/v1/chat/completions' },
    google:    { label: 'Google Gemini',    models: ['gemini-1.5-pro','gemini-1.5-flash','gemini-2.0-flash-exp'], default: 'gemini-1.5-flash', url: 'https://generativelanguage.googleapis.com/v1beta/models/' },
  };
  // ─── State ───────────────────────────────────────────────────────
  const STATE = {
    config: loadConfig(),
    ai: { ready: false, loading: false, progress: 0, engine: null, model: null },
    mesh: { active: false, peers: new Map(), bc: null, signal: null },
  };
  function loadConfig() {
    try { return JSON.parse(localStorage.getItem('fall-kit.config') || '{}'); }
    catch (e) { return {}; }
  }
  function saveConfig() {
    try { localStorage.setItem('fall-kit.config', JSON.stringify(STATE.config)); } catch (e) {}
  }
  // ─── DOM helpers ─────────────────────────────────────────────────
  function $(s, root) { return (root || document).querySelector(s); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
  // ─── AI tier ─────────────────────────────────────────────────────
  function aiTier() { return STATE.config.ai_tier || 'T0'; }
  function renderAiChip() {
    const chip = $('#fk-ai-chip');
    if (!chip) return;
    const txt = $('#fk-ai-chip-text');
    chip.classList.remove('fk-chip-live', 'fk-chip-loading', 'fk-chip-warn');
    const tier = aiTier();
    if (tier === 'T0') { txt.textContent = 'T0 · off'; }
    else if (tier === 'T2') {
      if (STATE.ai.ready) { txt.textContent = 'T2 ' + (WEBLLM_MODELS[STATE.config.webllm_model || DEFAULT_MODEL]?.label.split(' · ')[0] || '') + ' · ready'; chip.classList.add('fk-chip-live'); }
      else if (STATE.ai.loading) { txt.textContent = 'T2 loading ' + Math.round(STATE.ai.progress) + '%'; chip.classList.add('fk-chip-loading'); }
      else { txt.textContent = 'T2 · click to load'; chip.classList.add('fk-chip-warn'); }
    } else if (tier === 'T3') {
      if (STATE.config.api_key) { txt.textContent = 'T3 ' + (T3_PROVIDERS[STATE.config.api_provider]?.label || 'BYOK') + ' · active'; chip.classList.add('fk-chip-live'); }
      else { txt.textContent = 'T3 · no key set'; chip.classList.add('fk-chip-warn'); }
    }
  }
  async function loadWebLLM(modelKey) {
    if (STATE.ai.loading) return;
    const key = modelKey || STATE.config.webllm_model || DEFAULT_MODEL;
    const model = WEBLLM_MODELS[key];
    if (!model) { console.error('fall-kit: unknown model', key); return; }
    if (STATE.ai.ready && STATE.ai.model === model.id) return;
    STATE.ai.loading = true; STATE.ai.progress = 0; renderAiChip();
    notify('Loading WebLLM · ' + model.label + ' · ' + model.size + ' first time', 'info');
    try {
      const { CreateMLCEngine } = await import('https://esm.run/@mlc-ai/web-llm@0.2.79');
      const engine = await CreateMLCEngine(model.id, {
        initProgressCallback: p => { STATE.ai.progress = (p.progress || 0) * 100; renderAiChip(); }
      });
      STATE.ai.engine = engine;
      STATE.ai.model = model.id;
      STATE.ai.ready = true;
      STATE.ai.loading = false;
      STATE.config.webllm_model = key; saveConfig();
      renderAiChip();
      notify('WebLLM ready · sovereign mode · ' + model.label.split(' · ')[0], 'ok');
    } catch (e) {
      console.error('fall-kit: WebLLM load failed', e);
      STATE.ai.loading = false; renderAiChip();
      notify('WebLLM load failed · ' + e.message, 'err');
    }
  }
  async function aiComplete(systemPrompt, userMsg, maxTokens) {
    maxTokens = maxTokens || 600;
    const tier = aiTier();
    if (tier === 'T2' && STATE.ai.ready && STATE.ai.engine) {
      const r = await STATE.ai.engine.chat.completions.create({
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMsg }],
        max_tokens: maxTokens,
      });
      return r.choices[0].message.content;
    }
    if (tier === 'T3' && STATE.config.api_key && STATE.config.api_provider) {
      return await aiCloudCall(systemPrompt, userMsg, maxTokens);
    }
    return null;
  }
  async function aiCloudCall(sys, msg, maxTokens) {
    const provider = STATE.config.api_provider;
    const key = STATE.config.api_key;
    const model = STATE.config.api_model || T3_PROVIDERS[provider]?.default;
    if (provider === 'anthropic') {
      const r = await fetch(T3_PROVIDERS.anthropic.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model, max_tokens: maxTokens, system: sys, messages: [{ role: 'user', content: msg }] }),
      });
      if (!r.ok) throw new Error('Anthropic ' + r.status + ': ' + (await r.text()).slice(0, 200));
      const j = await r.json();
      return j.content[0].text;
    }
    if (provider === 'openai') {
      const r = await fetch(T3_PROVIDERS.openai.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'Authorization': 'Bearer ' + key },
        body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'system', content: sys }, { role: 'user', content: msg }] }),
      });
      if (!r.ok) throw new Error('OpenAI ' + r.status);
      const j = await r.json();
      return j.choices[0].message.content;
    }
    if (provider === 'google') {
      const r = await fetch(T3_PROVIDERS.google.url + model + ':generateContent?key=' + encodeURIComponent(key), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: sys + '\n\n---\n\n' + msg }] }], generationConfig: { maxOutputTokens: maxTokens } }),
      });
      if (!r.ok) throw new Error('Google ' + r.status);
      const j = await r.json();
      return j.candidates[0].content.parts[0].text;
    }
    throw new Error('unknown provider: ' + provider);
  }
  // ─── WebRTC P2P mesh (ported from canonical fallnet · fall-signal channel · Google STUN) ───
  const MESH_CHANNEL = 'fall-signal';
  const STUN_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];
  function meshStart(opts) {
    if (STATE.mesh.active) return;
    opts = opts || {};
    const seedId = opts.seedId || (location.pathname + '#' + Math.random().toString(36).slice(2, 8));
    STATE.mesh.seedId = seedId;
    try { STATE.mesh.bc = new BroadcastChannel(MESH_CHANNEL); }
    catch (e) { console.warn('fall-kit: BroadcastChannel unavailable'); return; }
    STATE.mesh.bc.onmessage = e => {
      const m = e.data;
      if (!m || !m.kind || m.peerId === seedId) return;
      if (opts.onMessage) opts.onMessage(m);
    };
    STATE.mesh.bc.postMessage({ kind: 'fall-kit:hello', peerId: seedId, ts: Date.now(), seedName: opts.seedName || 'unknown' });
    STATE.mesh.active = true;
    notify('Mesh active · channel ' + MESH_CHANNEL, 'ok');
  }
  function meshPost(kind, payload) {
    if (!STATE.mesh.active || !STATE.mesh.bc) return false;
    STATE.mesh.bc.postMessage({ kind: kind, peerId: STATE.mesh.seedId, ts: Date.now(), payload: payload });
    return true;
  }
  // ─── Toast ───────────────────────────────────────────────────────
  function notify(msg, kind) {
    let t = $('#fk-toast');
    if (!t) {
      t = document.createElement('div'); t.id = 'fk-toast';
      t.style.cssText = 'position:fixed;bottom:18px;left:50%;transform:translateX(-50%) translateY(20px);background:#c08a3a;color:#0a0a0a;padding:9px 18px;border-radius:3px;font-family:ui-monospace,Menlo,monospace;font-size:11px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;opacity:0;transition:all .22s;z-index:10000;pointer-events:none';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.background = kind === 'err' ? '#a14a2a' : kind === 'ok' ? '#6b8d4a' : '#c08a3a';
    t.style.color = kind === 'err' ? '#fff' : '#0a0a0a';
    t.style.opacity = '1';
    t.style.transform = 'translateX(-50%) translateY(0)';
    clearTimeout(t._to);
    t._to = setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(-50%) translateY(20px)'; }, 2400);
  }
  // ─── Settings modal ──────────────────────────────────────────────
  function openSettings() {
    let bg = $('#fk-modal-bg');
    if (!bg) {
      bg = document.createElement('div'); bg.id = 'fk-modal-bg';
      bg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.72);display:flex;align-items:flex-start;justify-content:center;padding:60px 16px;overflow-y:auto;z-index:9999';
      bg.onclick = e => { if (e.target.id === 'fk-modal-bg') closeSettings(); };
      document.body.appendChild(bg);
    }
    const tier = aiTier();
    const provider = STATE.config.api_provider || 'anthropic';
    const providerCfg = T3_PROVIDERS[provider];
    bg.innerHTML = `
      <div style="background:#13121a;border:1px solid #c08a3a;border-radius:5px;max-width:600px;width:100%;padding:22px 24px;color:#ebe3d2;font-family:system-ui,-apple-system,sans-serif;font-size:13.5px;line-height:1.55">
        <div style="margin-bottom:14px"><label style="display:block;font-size:11px;color:#a89e88;letter-spacing:.04em;margin-bottom:6px;text-transform:uppercase">Tier</label>
          <select id="fk-tier" style="width:100%;padding:8px 11px;background:#1a1922;border:1px solid #3a342c;color:#ebe3d2;border-radius:3px;font-size:13.5px;font-family:inherit">
            <option value="T0"${tier==='T0'?' selected':''}>T0 · off (default · the seed works fully without AI)</option>
            <option value="T2"${tier==='T2'?' selected':''}>T2 · WebLLM in-browser · sovereign · pick a model below</option>
            <option value="T3"${tier==='T3'?' selected':''}>T3 · BYOK · Anthropic / OpenAI / Google · stored in your browser only</option>
          </select>
        </div>
        <div id="fk-t2-block" style="display:${tier==='T2'?'block':'none'};margin-bottom:14px;padding:12px 14px;background:#1a1922;border:1px solid #2a2934;border-radius:4px">
          <label style="display:block;font-size:11px;color:#a89e88;letter-spacing:.04em;margin-bottom:6px;text-transform:uppercase">WebLLM model · 1B → 70B cascade</label>
          <select id="fk-model" style="width:100%;padding:8px 11px;background:#22212c;border:1px solid #3a342c;color:#ebe3d2;border-radius:3px;font-size:13px;font-family:inherit">
            ${Object.entries(WEBLLM_MODELS).map(([k,m]) => `<option value="${k}"${(STATE.config.webllm_model||DEFAULT_MODEL)===k?' selected':''}>${esc(m.label)} · ${esc(m.size)}</option>`).join('')}
          </select>
          <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            <button id="fk-load-llm" style="padding:7px 14px;background:#c08a3a;color:#0a0a0a;border:none;border-radius:3px;font-weight:600;font-size:12px;cursor:pointer;font-family:inherit">${STATE.ai.ready?'✓ Loaded · switch':'Load model (one-time download)'}</button>
            <span id="fk-llm-status" style="font-family:ui-monospace,Menlo,monospace;font-size:10px;color:#a89e88;letter-spacing:.04em">${STATE.ai.ready?'ready':STATE.ai.loading?Math.round(STATE.ai.progress)+'%':'not loaded'}</span>
          </div>
          <div style="margin-top:8px;font-size:11px;color:#6e6a5e;line-height:1.55">First load downloads the model from @mlc-ai/web-llm CDN. Cached forever after. Inference is 100% local — open DevTools → Network during use, nothing leaves.</div>
        </div>
        <div id="fk-t3-block" style="display:${tier==='T3'?'block':'none'};margin-bottom:14px;padding:12px 14px;background:#1a1922;border:1px solid #2a2934;border-radius:4px">
          <label style="display:block;font-size:11px;color:#a89e88;letter-spacing:.04em;margin-bottom:6px;text-transform:uppercase">BYOK provider</label>
          <select id="fk-provider" style="width:100%;padding:8px 11px;background:#22212c;border:1px solid #3a342c;color:#ebe3d2;border-radius:3px;font-size:13px;font-family:inherit;margin-bottom:10px">
            ${Object.entries(T3_PROVIDERS).map(([k,p]) => `<option value="${k}"${provider===k?' selected':''}>${esc(p.label)}</option>`).join('')}
          </select>
          <label style="display:block;font-size:11px;color:#a89e88;letter-spacing:.04em;margin-bottom:6px;text-transform:uppercase">Model</label>
          <select id="fk-api-model" style="width:100%;padding:8px 11px;background:#22212c;border:1px solid #3a342c;color:#ebe3d2;border-radius:3px;font-size:13px;font-family:inherit;margin-bottom:10px">
            ${providerCfg.models.map(m => `<option value="${m}"${(STATE.config.api_model||providerCfg.default)===m?' selected':''}>${esc(m)}</option>`).join('')}
          </select>
          <label style="display:block;font-size:11px;color:#a89e88;letter-spacing:.04em;margin-bottom:6px;text-transform:uppercase">API key</label>
          <input type="password" id="fk-key" value="${esc(STATE.config.api_key || '')}" placeholder="${STATE.config.api_key ? '(set · leave empty to keep)' : 'sk-ant-... or sk-... or AIza...'}" autocomplete="off" style="width:100%;padding:8px 11px;background:#22212c;border:1px solid #3a342c;color:#ebe3d2;border-radius:3px;font-size:13px;font-family:ui-monospace,Menlo,monospace">
          <div style="margin-top:8px;font-size:11px;color:#6e6a5e;line-height:1.55">Key lives in this browser only (localStorage). Sent direct to the provider — never to us. Wipe with Reset.</div>
        </div>
        <div style="margin-bottom:14px;padding:12px 14px;background:#1a1922;border:1px solid #2a2934;border-radius:4px">
          <label style="display:block;font-size:11px;color:#a89e88;letter-spacing:.04em;margin-bottom:6px;text-transform:uppercase">Cross-seed mesh</label>
          <div style="display:flex;gap:8px;align-items:center">
            <button id="fk-mesh-toggle" style="padding:6px 12px;background:${STATE.mesh.active?'#6b8d4a':'#1a1922'};color:${STATE.mesh.active?'#fff':'#a89e88'};border:1px solid ${STATE.mesh.active?'#6b8d4a':'#3a342c'};border-radius:3px;font-size:11px;cursor:pointer;font-family:inherit">${STATE.mesh.active?'✓ Active · disconnect':'Activate mesh'}</button>
            <span style="font-family:ui-monospace,Menlo,monospace;font-size:10px;color:#6e6a5e;letter-spacing:.04em">channel · <code style="background:#22212c;padding:1px 5px;border-radius:2px">${MESH_CHANNEL}</code></span>
          </div>
          <div style="margin-top:8px;font-size:11px;color:#6e6a5e;line-height:1.55">BroadcastChannel for same-device · WebRTC for cross-device (planned). Other estate seeds on the same channel discover each other automatically.</div>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
          <button onclick="FallKit.closeSettings()" style="padding:7px 14px;background:transparent;color:#a89e88;border:1px solid #3a342c;border-radius:3px;font-size:12px;cursor:pointer;font-family:inherit">Close</button>
          <button id="fk-save" style="padding:7px 14px;background:#c08a3a;color:#0a0a0a;border:none;border-radius:3px;font-weight:600;font-size:12px;cursor:pointer;font-family:inherit">Save</button>
        </div>
      </div>`;
    // Wire interactions
    $('#fk-tier').onchange = () => {
      const t = $('#fk-tier').value;
      $('#fk-t2-block').style.display = t === 'T2' ? 'block' : 'none';
      $('#fk-t3-block').style.display = t === 'T3' ? 'block' : 'none';
    };
    $('#fk-provider') && ($('#fk-provider').onchange = () => {
      const p = $('#fk-provider').value;
      const sel = $('#fk-api-model');
      sel.innerHTML = T3_PROVIDERS[p].models.map(m => `<option value="${m}">${esc(m)}</option>`).join('');
    });
    $('#fk-load-llm') && ($('#fk-load-llm').onclick = () => {
      const m = $('#fk-model').value;
      loadWebLLM(m);
    });
    $('#fk-mesh-toggle').onclick = () => {
      if (STATE.mesh.active) { STATE.mesh.bc?.close(); STATE.mesh.active = false; STATE.mesh.bc = null; notify('Mesh disconnected'); }
      else meshStart({ seedName: STATE.config.seedName || 'seed' });
      openSettings();  // refresh modal
    };
    $('#fk-save').onclick = () => {
      STATE.config.ai_tier = $('#fk-tier').value;
      if ($('#fk-model')) STATE.config.webllm_model = $('#fk-model').value;
      if ($('#fk-provider')) STATE.config.api_provider = $('#fk-provider').value;
      if ($('#fk-api-model')) STATE.config.api_model = $('#fk-api-model').value;
      const newKey = $('#fk-key')?.value;
      if (newKey) STATE.config.api_key = newKey;
      saveConfig(); renderAiChip(); notify('Saved', 'ok'); closeSettings();
    };
  }
  function closeSettings() { const bg = $('#fk-modal-bg'); if (bg) bg.remove(); }
  // ─── Help section (returns HTML string for inclusion in seed Help tabs) ───
  function helpSection() {
    return `<div style="background:rgba(192,138,58,.05);border:1px solid #3a342c;border-radius:4px;padding:18px 22px;margin:14px 0">
      <p style="font-size:13px;color:#a89e88;line-height:1.7;margin-bottom:10px">This seed runs fully without AI (<strong style="color:#c08a3a">T0</strong>, default). Enable a tier in settings if you want AI-assist features:</p>
      <table style="width:100%;border-collapse:collapse;font-size:12.5px">
        <thead><tr><th style="padding:6px 10px;text-align:left;background:rgba(0,0,0,.2);font-family:ui-monospace,Menlo,monospace;font-size:10px;color:#a89e88;letter-spacing:.08em;text-transform:uppercase">Tier</th><th style="padding:6px 10px;text-align:left;background:rgba(0,0,0,.2);font-family:ui-monospace,Menlo,monospace;font-size:10px;color:#a89e88;letter-spacing:.08em;text-transform:uppercase">What it is</th></tr></thead>
        <tbody>
          <tr><td style="padding:6px 10px;border-top:1px solid #2a2934;color:#c08a3a;font-weight:600">T0</td><td style="padding:6px 10px;border-top:1px solid #2a2934;color:#a89e88">Off. The seed works fully. No AI · no downloads · no API calls.</td></tr>
          <tr><td style="padding:6px 10px;border-top:1px solid #2a2934;color:#c08a3a;font-weight:600">T2</td><td style="padding:6px 10px;border-top:1px solid #2a2934;color:#a89e88">WebLLM in-browser. Pick a model: 1B (700MB, fast) → 3B (2GB, balanced) → 7B (5GB, capable) → 70B (40GB, frontier). One-time download, runs offline forever after. Zero data leaves your device.</td></tr>
          <tr><td style="padding:6px 10px;border-top:1px solid #2a2934;color:#c08a3a;font-weight:600">T3</td><td style="padding:6px 10px;border-top:1px solid #2a2934;color:#a89e88">BYOK · Anthropic Claude · OpenAI GPT · Google Gemini. You bring the API key, you pay the provider direct. Key stays in your browser, sent direct to the provider, never proxied.</td></tr>
        </tbody>
      </table>
      <p style="font-size:12px;color:#6e6a5e;line-height:1.6;margin-top:10px">Open the AI chip in the header to switch tier or check status. Cross-seed mesh activates a BroadcastChannel on <code style="background:#1a1922;padding:1px 5px;border-radius:2px">${MESH_CHANNEL}</code> so other estate seeds on the same device discover this one.</p>
    </div>`;
  }
  // ─── CSS for AI chip ─────────────────────────────────────────────
  function injectCss() {
    const s = document.createElement('style');
    s.id = 'fk-css';
    s.textContent = `
      #fk-ai-chip { display:inline-flex; align-items:center; gap:6px; padding:4px 9px; border-radius:3px; font-family:ui-monospace,Menlo,monospace; font-size:10px; letter-spacing:.08em; text-transform:uppercase; font-weight:600; cursor:pointer; border:1px solid #3a342c; background:#1a1922; color:#a89e88; user-select:none; vertical-align:middle }
      #fk-ai-chip:hover { border-color:#c08a3a; color:#ebe3d2 }
      #fk-ai-chip.fk-chip-live { border-color:#6b8d4a; color:#6b8d4a; background:rgba(107,141,74,.10) }
      #fk-ai-chip.fk-chip-loading { border-color:#e8a83a; color:#e8a83a; background:rgba(232,168,58,.10) }
      #fk-ai-chip.fk-chip-warn { border-color:#a14a2a; color:#a14a2a; background:rgba(161,74,42,.08) }
      #fk-ai-chip .fk-dot { width:6px; height:6px; border-radius:50%; background:currentColor; flex-shrink:0 }
      #fk-ai-chip.fk-chip-loading .fk-dot { animation:fk-pulse 1s infinite }
      @keyframes fk-pulse { 0%,100%{opacity:1}50%{opacity:.3} }
      .fk-ai-assist { display:inline-flex; align-items:center; gap:5px; padding:4px 9px; font-size:11px; border:1px solid #c08a3a; color:#c08a3a; background:transparent; border-radius:3px; cursor:pointer; font-family:inherit }
      .fk-ai-assist:hover { background:#c08a3a; color:#0a0a0a }
      .fk-ai-assist::before { content:'✦'; font-size:12px }
    `;
    document.head.appendChild(s);
  }
  // ─── KCC Mint launcher (v1.2 · fork-this-seed shortcut) ──────────
  function openMint() {
    const slug = (STATE.config.seedName || location.hostname.split('.')[0] || 'seed').replace(/[^a-z0-9-]/gi, '-').toLowerCase();
    const url = location.href.split('?')[0].split('#')[0];
    const params = new URLSearchParams({ fork: '1', parent_slug: slug, parent_name: name, parent_url: url, parent_desc: desc });
  }
  // ─── Init ────────────────────────────────────────────────────────
  function init(opts) {
    opts = opts || {};
    injectCss();
    if (opts.seedName) STATE.config.seedName = opts.seedName;
    if ($('#fk-ai-chip')) { renderAiChip(); return { version: FALL_KIT_VERSION, mounted: false }; }
    const chip = document.createElement('button');
    chip.id = 'fk-ai-chip';
    chip.title = 'AI cascade · click to configure tier and model';
    chip.innerHTML = '<span class="fk-dot"></span><span id="fk-ai-chip-text">T0 · off</span>';
    chip.onclick = openSettings;
    // Try anchor first, fall back to floating bottom-right
    const anchor = opts.chipAnchor ? $(opts.chipAnchor) : null;
    if (anchor) { anchor.appendChild(chip); }
    else {
      chip.style.cssText += ';position:fixed;bottom:14px;left:14px;z-index:9998;box-shadow:0 4px 14px rgba(0,0,0,.4)';
      document.body.appendChild(chip);
    }
    // v1.2 · floating mint button next to chip
    if (!$('#fk-mint-btn') && !opts.hideMint) {
      const mintBtn = document.createElement('button');
      mintBtn.id = 'fk-mint-btn';
      mintBtn.title = 'Mint a fork of this seed as a KCC bundle · provenance economy';
      mintBtn.innerHTML = '<span style="font-size:13px">✦</span> mint fork';
      mintBtn.style.cssText = 'position:fixed;bottom:14px;left:130px;z-index:9998;display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border-radius:3px;font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:.08em;text-transform:uppercase;font-weight:600;cursor:pointer;border:1px solid #c08a3a;color:#c08a3a;background:rgba(10,10,15,.7);box-shadow:0 4px 14px rgba(0,0,0,.4)';
      mintBtn.onmouseover = () => { mintBtn.style.background = '#c08a3a'; mintBtn.style.color = '#0a0a0a'; };
      mintBtn.onmouseout  = () => { mintBtn.style.background = 'rgba(10,10,15,.7)'; mintBtn.style.color = '#c08a3a'; };
      mintBtn.onclick = openMint;
      document.body.appendChild(mintBtn);
    }
    renderAiChip();
    return { version: FALL_KIT_VERSION, mounted: true };
  }
  // ─── Public API ──────────────────────────────────────────────────
  root.FallKit = {
    version: FALL_KIT_VERSION,
    init: init,
    aiTier: aiTier,
    aiComplete: aiComplete,
    loadWebLLM: loadWebLLM,
    openSettings: openSettings,
    closeSettings: closeSettings,
    renderAiChip: renderAiChip,
    helpSection: helpSection,
    meshStart: meshStart,
    meshPost: meshPost,
    notify: notify,
    openMint: openMint,  // v1.2 · launch kcc-mint with this seed prefilled as parent
    MODELS: WEBLLM_MODELS,
    PROVIDERS: T3_PROVIDERS,
    state: STATE,
  };
})(typeof window !== 'undefined' ? window : globalThis);
  // fall-kit init · auto-mounts a floating AI chip bottom-left
  (function () {
    function go() { if (typeof FallKit !== 'undefined') FallKit.init({ seedName: "fallvector" }); }
    else go();
  })();
const PRIME=1429;
const VERSION='1.0.0';
const ESTATE_COLORS=[
  {name:'brass',hex:'#b8974a'},{name:'amber',hex:'#ff8c00'},{name:'ox',hex:'#8b1a1a'},
  {name:'cream',hex:'#e6e1d6'},{name:'void',hex:'#0b0a0f'},{name:'green',hex:'#4ade80'},
  {name:'red',hex:'#ef4444'},{name:'blue',hex:'#60a5fa'},{name:'yellow',hex:'#fbbf24'},
  {name:'slate',hex:'#64748b'},{name:'knowledge',hex:'#7c3aed'},{name:'white',hex:'#fafaf7'}
];
const state={
  tool:'v',
  shapes:[],  // {id,type,attrs,visible}
  selectedId:null,
  canvas:{w:800,h:600},
  zoom:1,
  pan:{x:0,y:0},
  history:[],
  future:[],
  settings:{anthropicKey:'',geminiKey:'',openaiKey:'',openrouterKey:''},
  drawing:null,
  penPath:[],
  nextId:1
};
/* ---------- IndexedDB ---------- */
let db=null;
function openDB(){
  return new Promise((res,rej)=>{
    const r=indexedDB.open('fallvector',1);
    r.onupgradeneeded=e=>{const d=e.target.result;if(!d.objectStoreNames.contains('doc'))d.createObjectStore('doc');if(!d.objectStoreNames.contains('settings'))d.createObjectStore('settings')};
    r.onsuccess=e=>{db=e.target.result;res(db)};
    r.onerror=e=>rej(e);
  });
}
function dbGet(store,key){return new Promise(res=>{if(!db)return res(null);const t=db.transaction(store,'readonly').objectStore(store).get(key);t.onsuccess=()=>res(t.result);t.onerror=()=>res(null)})}
function dbPut(store,key,val){return new Promise(res=>{if(!db)return res();const t=db.transaction(store,'readwrite').objectStore(store).put(val,key);t.onsuccess=()=>res();t.onerror=()=>res()})}
/* ---------- Cascade (T0/T2/T3) ---------- */
const Cascade={
  async detectTier(){if(await this._probe())return'T2';const s=state.settings;if(s.anthropicKey||s.openaiKey||s.geminiKey||s.openrouterKey)return'T3';return'T0'},
  async _probe(){if(this._p!==undefined)return this._p;try{this._p=await Promise.race([fetch('http://127.0.0.1:11434/api/tags').then(r=>r.ok),new Promise(r=>setTimeout(()=>r(false),350))])}catch(e){this._p=false}return this._p},
  async generate(sys,user,maxTok){const s=state.settings,max=maxTok||1200;
    if(s.anthropicKey)try{const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':s.anthropicKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},body:JSON.stringify({model:'claude-haiku-4-5',max_tokens:max,system:sys,messages:[{role:'user',content:user}]})});const d=await r.json();return{tier:'T3·Claude',text:d?.content?.[0]?.text||''}}catch(e){}
    if(s.geminiKey)try{const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${s.geminiKey}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({systemInstruction:{parts:[{text:sys}]},contents:[{parts:[{text:user}]}]})});const d=await r.json();return{tier:'T3·Gemini',text:d?.candidates?.[0]?.content?.parts?.[0]?.text||''}}catch(e){}
    if(s.openaiKey)try{const r=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+s.openaiKey},body:JSON.stringify({model:'gpt-4o-mini',messages:[{role:'system',content:sys},{role:'user',content:user}]})});const d=await r.json();return{tier:'T3·GPT',text:d?.choices?.[0]?.message?.content||''}}catch(e){}
    if(s.openrouterKey)try{const r=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+s.openrouterKey,'HTTP-Referer':location.origin},body:JSON.stringify({model:'anthropic/claude-haiku-4-5',messages:[{role:'system',content:sys},{role:'user',content:user}]})});const d=await r.json();return{tier:'T3·OpenRouter',text:d?.choices?.[0]?.message?.content||''}}catch(e){}
    return{tier:'T0',text:null}
  }
};
/* ---------- Shape model ---------- */
function newId(){return 's'+(state.nextId++)}
function addShape(type,attrs){
  const sh={id:newId(),type,attrs:Object.assign({fill:'#b8974a',stroke:'#0b0a0f','stroke-width':1,opacity:1},attrs),visible:true};
  state.shapes.push(sh);
  snapshot();
  render();
  return sh;
}
function getSelected(){return state.shapes.find(s=>s.id===state.selectedId)}
function deleteShape(id){state.shapes=state.shapes.filter(s=>s.id!==id);if(state.selectedId===id)state.selectedId=null;snapshot();render()}
function moveZ(id,dir){
  const i=state.shapes.findIndex(s=>s.id===id);if(i<0)return;
  const j=i+dir;if(j<0||j>=state.shapes.length)return;
  [state.shapes[i],state.shapes[j]]=[state.shapes[j],state.shapes[i]];
  snapshot();render();
}
/* ---------- History ---------- */
function snapshot(){
  state.history.push(JSON.stringify({shapes:state.shapes,canvas:state.canvas,nextId:state.nextId}));
  if(state.history.length>20)state.history.shift();
  state.future=[];
  saveDoc();
}
function undo(){if(state.history.length<2)return;state.future.push(state.history.pop());restore(state.history[state.history.length-1])}
function redo(){if(!state.future.length)return;const s=state.future.pop();state.history.push(s);restore(s)}
/* ---------- Render ---------- */
function render(){
  // Clear svg
  while(svg.firstChild)svg.removeChild(svg.firstChild);
  // Render in order (first = back)
  state.shapes.forEach(sh=>{
    if(!sh.visible)return;
    const el=document.createElementNS('http://www.w3.org/2000/svg',sh.type==='text'?'text':sh.type);
    for(const[k,v]of Object.entries(sh.attrs)){
      if(k==='_text')continue;
      el.setAttribute(k,v);
    }
    if(sh.type==='text'&&sh.attrs._text!==undefined)el.textContent=sh.attrs._text;
    el.setAttribute('data-id',sh.id);
    el.style.cursor=state.tool==='v'?'move':'';
    svg.appendChild(el);
  });
  // Selection overlay
  const sel=getSelected();
  if(sel&&sel.visible&&state.tool==='v'){
    const bb=bboxOf(sel);
    if(bb){
      const out=document.createElementNS('http://www.w3.org/2000/svg','rect');
      out.setAttribute('x',bb.x-2);out.setAttribute('y',bb.y-2);
      out.setAttribute('width',bb.w+4);out.setAttribute('height',bb.h+4);
      out.setAttribute('class','sel-outline');
      svg.appendChild(out);
      // Corner handles (NW NE SW SE)
      const hs=[[bb.x,bb.y,'nw'],[bb.x+bb.w,bb.y,'ne'],[bb.x,bb.y+bb.h,'sw'],[bb.x+bb.w,bb.y+bb.h,'se']];
      hs.forEach(([x,y,c])=>{
        const h=document.createElementNS('http://www.w3.org/2000/svg','rect');
        h.setAttribute('x',x-4);h.setAttribute('y',y-4);
        h.setAttribute('width',8);h.setAttribute('height',8);
        h.setAttribute('class','handle');
        h.setAttribute('data-handle',c);
        svg.appendChild(h);
      });
    }
  }
  renderLayers();
  renderProps();
}
function bboxOf(sh){
  const a=sh.attrs;
  if(sh.type==='rect')return{x:+a.x,y:+a.y,w:+a.width,h:+a.height};
  if(sh.type==='ellipse')return{x:+a.cx-+a.rx,y:+a.cy-+a.ry,w:+a.rx*2,h:+a.ry*2};
  if(sh.type==='line'){const x=Math.min(+a.x1,+a.x2),y=Math.min(+a.y1,+a.y2);return{x,y,w:Math.abs(+a.x2-+a.x1),h:Math.abs(+a.y2-+a.y1)}}
  if(sh.type==='text'){const x=+a.x||0,y=+a.y||0;const w=(a._text||'').length*((+a['font-size']||16)*0.6);const h=+a['font-size']||16;return{x,y:y-h,w,h}}
  if(sh.type==='path'){
    // parse M/L
    const pts=(a.d||'').split(/[MLZ\s,]+/).filter(Boolean).map(Number);
    if(pts.length<2)return null;
    let mx=Infinity,my=Infinity,Mx=-Infinity,My=-Infinity;
    for(let i=0;i<pts.length;i+=2){mx=Math.min(mx,pts[i]);Mx=Math.max(Mx,pts[i]);my=Math.min(my,pts[i+1]);My=Math.max(My,pts[i+1])}
    return{x:mx,y:my,w:Mx-mx,h:My-my};
  }
  if(sh.type==='g'){
    try{
      const tmp=document.createElementNS('http://www.w3.org/2000/svg','svg');
      tmp.style.position='absolute';tmp.style.visibility='hidden';
      const clone=document.createElementNS('http://www.w3.org/2000/svg','g');
      for(const[k,v]of Object.entries(a)){if(k==='_inner')continue;clone.setAttribute(k,v)}
      clone.innerHTML=a._inner||'';
      tmp.appendChild(clone);document.body.appendChild(tmp);
      const b=clone.getBBox();
      document.body.removeChild(tmp);
      return{x:b.x,y:b.y,w:b.width,h:b.height};
    }catch(e){return{x:0,y:0,w:100,h:100}}
  }
  return null;
}
function setBBox(sh,bb){
  const a=sh.attrs;
  if(sh.type==='rect'){a.x=bb.x;a.y=bb.y;a.width=Math.max(1,bb.w);a.height=Math.max(1,bb.h)}
  else if(sh.type==='ellipse'){a.cx=bb.x+bb.w/2;a.cy=bb.y+bb.h/2;a.rx=Math.max(1,bb.w/2);a.ry=Math.max(1,bb.h/2)}
  else if(sh.type==='line'){a.x1=bb.x;a.y1=bb.y;a.x2=bb.x+bb.w;a.y2=bb.y+bb.h}
  else if(sh.type==='text'){a.x=bb.x;a.y=bb.y+bb.h}
  else if(sh.type==='path'||sh.type==='g'){
    // translate via transform
    const orig=bboxOf(sh);
    if(!orig)return;
    const dx=bb.x-orig.x, dy=bb.y-orig.y;
    if(sh.type==='path'){
      a.d=(a.d||'').replace(/(-?\d+(?:\.\d+)?)\s*[ ,]\s*(-?\d+(?:\.\d+)?)/g,(_,x,y)=>(+x+dx)+','+(+y+dy));
    }else{
      const cur=a.transform||'';const m=cur.match(/translate\(([^,)]+)[, ]([^)]+)\)/);
      const tx=m?parseFloat(m[1])+dx:dx, ty=m?parseFloat(m[2])+dy:dy;
      a.transform=`translate(${tx},${ty})`;
    }
  }
}
function renderLayers(){
  layerList.innerHTML='';
  // Top of stack first = reverse render order
  const rev=[...state.shapes].reverse();
  rev.forEach(sh=>{
    const row=document.createElement('div');
    row.className='layer'+(sh.id===state.selectedId?' sel':'')+(sh.visible?'':' hidden');
    const name=sh.type+(sh.attrs._text?' "'+sh.attrs._text.slice(0,12)+'"':'')+' · '+sh.id;
    row.innerHTML=`<span class="eye" data-eye>${sh.visible?'◉':'○'}</span><span class="name">${name}</span><span class="x" data-x>×</span>`;
    row.onclick=e=>{
      if(e.target.dataset.eye!==undefined){sh.visible=!sh.visible;snapshot();render();return}
      if(e.target.dataset.x!==undefined){deleteShape(sh.id);return}
      state.selectedId=sh.id;render();
    };
    layerList.appendChild(row);
  });
}
function renderProps(){
  const sel=getSelected();
  if(!sel){propBody.innerHTML='<div class="empty">no selection</div>';return}
  const bb=bboxOf(sel)||{x:0,y:0,w:0,h:0};
  const a=sel.attrs;
  let html=`
    <div class="row2">
      <div class="field"><label>x</label><input type="number" id="pX" value="${Math.round(bb.x)}"></div>
      <div class="field"><label>y</label><input type="number" id="pY" value="${Math.round(bb.y)}"></div>
    </div>
    <div class="row2">
      <div class="field"><label>w</label><input type="number" id="pW" value="${Math.round(bb.w)}"></div>
      <div class="field"><label>h</label><input type="number" id="pH" value="${Math.round(bb.h)}"></div>
    </div>
    <div class="field"><label>fill</label><input type="color" id="pFill" value="${toHex(a.fill)}"></div>
    <div class="field"><label>stroke</label><input type="color" id="pStroke" value="${toHex(a.stroke||'#000000')}"></div>
    <div class="field"><label>sw</label><input type="number" id="pSW" value="${+a['stroke-width']||0}" min="0" step="0.5"></div>
    <div class="field"><label>op</label><input type="range" id="pOp" min="0" max="1" step="0.05" value="${a.opacity!==undefined?a.opacity:1}"></div>`;
  if(sel.type==='text'){
    html+=`<div class="field"><label>text</label><input type="text" id="pText" value="${(a._text||'').replace(/"/g,'&quot;')}"></div>
    <div class="row2">
      <div class="field"><label>size</label><input type="number" id="pFS" value="${+a['font-size']||16}"></div>
      <div class="field"><label>font</label><input type="text" id="pFF" value="${a['font-family']||'serif'}"></div>
    </div>`;
  }
  html+=`<div class="zbtns">
    <button onclick="moveZ('${sel.id}',1)">▲ up</button>
    <button onclick="moveZ('${sel.id}',-1)">▼ down</button>
    <button onclick="deleteShape('${sel.id}')">delete</button>
  </div>`;
  propBody.innerHTML=html;
  // Wire inputs
  const upd=()=>{
    const nbb={x:+$('pX').value,y:+$('pY').value,w:+$('pW').value,h:+$('pH').value};
    setBBox(sel,nbb);
    sel.attrs.fill=$('pFill').value;
    sel.attrs.stroke=$('pStroke').value;
    sel.attrs['stroke-width']=+$('pSW').value;
    sel.attrs.opacity=+$('pOp').value;
    if(sel.type==='text'){
      sel.attrs._text=$('pText').value;
      sel.attrs['font-size']=+$('pFS').value;
      sel.attrs['font-family']=$('pFF').value;
    }
    render();
  };
  ['pX','pY','pW','pH','pFill','pStroke','pSW','pOp','pText','pFS','pFF'].forEach(id=>{const e=$(id);if(e){e.addEventListener('change',()=>{upd();snapshot()});e.addEventListener('input',upd)}});
}
function toHex(c){if(!c||c==='none')return'#000000';if(c.startsWith('#'))return c.length===4?'#'+c[1]+c[1]+c[2]+c[2]+c[3]+c[3]:c.slice(0,7);const m=c.match(/\d+/g);if(m&&m.length>=3)return'#'+m.slice(0,3).map(n=>(+n).toString(16).padStart(2,'0')).join('');return'#000000'}
/* ---------- Tools ---------- */
function selectTool(t){
  state.tool=t;
  svg.className='tool-'+t;
  if(t!=='p')state.penPath=[];
  render();
}
/* ---------- Mouse on SVG ---------- */
function svgPt(evt){
  const r=svg.getBoundingClientRect();
  const x=(evt.clientX-r.left)/r.width*state.canvas.w;
  const y=(evt.clientY-r.top)/r.height*state.canvas.h;
  return{x,y};
}
let dragMode=null; // 'move' | 'resize' | 'draw'
let dragStart=null, dragShape=null, dragHandle=null, dragOrigBB=null;
svg.addEventListener('mousedown',e=>{
  const p=svgPt(e);
  const t=state.tool;
  // handle?
  if(e.target.classList&&e.target.classList.contains('handle')){
    dragMode='resize';dragShape=getSelected();dragHandle=e.target.getAttribute('data-handle');dragOrigBB=bboxOf(dragShape);dragStart=p;return;
  }
  if(t==='v'){
    const id=e.target.getAttribute&&e.target.getAttribute('data-id');
    if(id){state.selectedId=id;dragMode='move';dragShape=getSelected();dragOrigBB=bboxOf(dragShape);dragStart=p;render()}
    else{state.selectedId=null;render()}
    return;
  }
  if(t==='r'){const sh=addShapeNoSnap('rect',{x:p.x,y:p.y,width:1,height:1});dragMode='draw';dragShape=sh;dragStart=p;state.selectedId=sh.id;return}
  if(t==='e'){const sh=addShapeNoSnap('ellipse',{cx:p.x,cy:p.y,rx:1,ry:1});dragMode='draw';dragShape=sh;dragStart=p;state.selectedId=sh.id;return}
  if(t==='l'){const sh=addShapeNoSnap('line',{x1:p.x,y1:p.y,x2:p.x,y2:p.y,stroke:'#0b0a0f','stroke-width':2,fill:'none'});dragMode='draw';dragShape=sh;dragStart=p;state.selectedId=sh.id;return}
  if(t==='t'){const sh=addShape('text',{x:p.x,y:p.y,'font-family':'Georgia,serif','font-size':24,fill:'#0b0a0f',_text:'text'});state.selectedId=sh.id;render();return}
  if(t==='p'){
    state.penPath.push(p);
    const d=state.penPath.map((pp,i)=>(i===0?'M':'L')+pp.x+','+pp.y).join(' ');
    if(state.penPath.length===1){
      const sh=addShape('path',{d,fill:'none',stroke:'#0b0a0f','stroke-width':2});
      state.selectedId=sh.id;
    }else{
      const sh=getSelected();if(sh){sh.attrs.d=d;render()}
    }
  }
});
function addShapeNoSnap(type,attrs){
  const sh={id:newId(),type,attrs:Object.assign({fill:'#b8974a',stroke:'#0b0a0f','stroke-width':1,opacity:1},attrs),visible:true};
  state.shapes.push(sh);render();return sh;
}
svg.addEventListener('mousemove',e=>{
  if(!dragMode)return;
  const p=svgPt(e);
  if(dragMode==='move'&&dragShape){
    const dx=p.x-dragStart.x, dy=p.y-dragStart.y;
    const nbb={x:dragOrigBB.x+dx,y:dragOrigBB.y+dy,w:dragOrigBB.w,h:dragOrigBB.h};
    setBBox(dragShape,nbb);render();
  }else if(dragMode==='resize'&&dragShape){
    let{x,y,w,h}=dragOrigBB;
    if(dragHandle==='se'){w=p.x-x;h=p.y-y}
    else if(dragHandle==='sw'){w=(x+w)-p.x;x=p.x;h=p.y-y}
    else if(dragHandle==='ne'){w=p.x-x;h=(y+h)-p.y;y=p.y}
    else if(dragHandle==='nw'){w=(x+w)-p.x;h=(y+h)-p.y;x=p.x;y=p.y}
    setBBox(dragShape,{x,y,w:Math.max(1,w),h:Math.max(1,h)});render();
  }else if(dragMode==='draw'&&dragShape){
    if(dragShape.type==='rect'){
      const x=Math.min(p.x,dragStart.x),y=Math.min(p.y,dragStart.y);
      dragShape.attrs.x=x;dragShape.attrs.y=y;
      dragShape.attrs.width=Math.abs(p.x-dragStart.x);
      dragShape.attrs.height=Math.abs(p.y-dragStart.y);
    }else if(dragShape.type==='ellipse'){
      const cx=(p.x+dragStart.x)/2,cy=(p.y+dragStart.y)/2;
      dragShape.attrs.cx=cx;dragShape.attrs.cy=cy;
      dragShape.attrs.rx=Math.abs(p.x-dragStart.x)/2;
      dragShape.attrs.ry=Math.abs(p.y-dragStart.y)/2;
    }else if(dragShape.type==='line'){
      dragShape.attrs.x2=p.x;dragShape.attrs.y2=p.y;
    }
    render();
  }
});
  if(dragMode){dragMode=null;dragShape=null;snapshot()}
});
svg.addEventListener('dblclick',e=>{
  if(state.tool==='p'&&state.penPath.length>1){
    const sh=getSelected();
    if(sh&&sh.type==='path'){sh.attrs.d+=' Z';sh.attrs.fill='#b8974a'}
    state.penPath=[];snapshot();render();
  }
});
/* ---------- Canvas size & zoom ---------- */
function applyCanvasSize(){
  svg.setAttribute('width',state.canvas.w);
  svg.setAttribute('height',state.canvas.h);
  svg.setAttribute('viewBox',`0 0 ${state.canvas.w} ${state.canvas.h}`);
  zoomFit();
}
function applyZoom(){
  canvasWrap.style.transform=`translate(${state.pan.x}px,${state.pan.y}px) scale(${state.zoom})`;
}
function zoomBy(d){state.zoom=Math.max(0.1,Math.min(8,state.zoom+d));applyZoom()}
function zoomFit(){
  const r=canvasArea.getBoundingClientRect();
  const pad=40;
  const z=Math.min((r.width-pad*2)/state.canvas.w,(r.height-pad*2)/state.canvas.h);
  state.zoom=Math.max(0.05,Math.min(4,z));state.pan={x:0,y:0};applyZoom();
}
canvasArea.addEventListener('wheel',e=>{e.preventDefault();const d=-e.deltaY/600;state.zoom=Math.max(0.05,Math.min(8,state.zoom*(1+d)));applyZoom()},{passive:false});
/* ---------- Palette swatches ---------- */
ESTATE_COLORS.forEach(c=>{
  const s=document.createElement('div');
  s.className='sw';s.style.background=c.hex;s.title=c.name;
  s.innerHTML=`<span class="lbl">${c.name}</span>`;
  s.onclick=()=>{const sel=getSelected();if(sel){sel.attrs.fill=c.hex;snapshot();render()}};
  swEl.appendChild(s);
});
/* ---------- Export ---------- */
function serializeSVG(){
  const clone=svg.cloneNode(true);
  // strip overlay (outline + handles)
  [...clone.querySelectorAll('.sel-outline,.handle')].forEach(n=>n.remove());
  clone.setAttribute('xmlns','http://www.w3.org/2000/svg');
  return'<?xml version="1.0" encoding="UTF-8"?>\n'+clone.outerHTML;
}
function exportSVG(){
  const s=serializeSVG();
  const blob=new Blob([s],{type:'image/svg+xml'});
  download(blob,'fallvector.svg');
}
function exportPNG(){
  const s=serializeSVG();
  const blob=new Blob([s],{type:'image/svg+xml'});
  const url=URL.createObjectURL(blob);
  const img=new Image();
  img.onload=()=>{
    const c=document.createElement('canvas');
    c.width=state.canvas.w;c.height=state.canvas.h;
    const ctx=c.getContext('2d');
    ctx.fillStyle='#ffffff';ctx.fillRect(0,0,c.width,c.height);
    ctx.drawImage(img,0,0);
    URL.revokeObjectURL(url);
    c.toBlob(b=>download(b,'fallvector.png'),'image/png');
  };
  img.src=url;
}
function download(blob,name){
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
/* ---------- Paste SVG ---------- */
  if(!txt||!txt.includes('<svg'))return;
  try{
    const parser=new DOMParser();
    const doc=parser.parseFromString(txt,'image/svg+xml');
    const root=doc.documentElement;
    if(root.nodeName!=='svg')return;
    const inner=root.innerHTML;
    addShape('g',{transform:'translate(0,0)',_inner:inner});
  }catch(err){console.warn('paste failed',err)}
});
/* ---------- Doc save/load ---------- */
let saveTimer=null;
function saveDoc(){
  clearTimeout(saveTimer);
  saveTimer=setTimeout(()=>{
    dbPut('doc','main',{shapes:state.shapes,canvas:state.canvas,nextId:state.nextId,ts:Date.now()});
  },200);
}
async function loadDoc(){
  const d=await dbGet('doc','main');
  if(d){
    state.shapes=d.shapes||[];state.canvas=d.canvas||{w:800,h:600};state.nextId=d.nextId||1;
    applyCanvasSize();
    state.history=[JSON.stringify({shapes:state.shapes,canvas:state.canvas,nextId:state.nextId})];
    render();
  }else{snapshot()}
}
function docNew(){
  if(!confirm('start a new document? current work is auto-saved but will be cleared from the canvas.'))return;
  state.shapes=[];state.selectedId=null;state.canvas={w:800,h:600};state.nextId=1;
  applyCanvasSize();snapshot();render();
}
/* ---------- Settings ---------- */
async function loadSettings(){const s=await dbGet('settings','keys');if(s)state.settings=Object.assign(state.settings,s);updateTierBadge()}
/* ---------- Ω autopilot ---------- */
pInput.addEventListener('keydown',async e=>{
  if(e.key==='Escape'){closePalette()}
  if(e.key==='Enter'){
    const q=pInput.value.trim();if(!q)return;
    pBody.innerHTML='<span class="hint">routing…</span>';
    const t0=routeT0(q);
    if(t0){applyAction(t0);pBody.innerHTML='<span class="ok">✓ '+describe(t0)+'</span>';pInput.value='';setTimeout(closePalette,700);return}
    // T3
    const tier=await Cascade.detectTier();
    if(tier==='T0'){pBody.innerHTML='<span class="err">offline · phrase not matched. add an api key in settings for freeform.</span>';return}
    const sys='You are FallVector autopilot. Parse the user intent into a single JSON action for a vector editor. Reply with ONLY JSON, no prose. Schema: {"action":"add"|"edit"|"delete","shape":"rect"|"ellipse"|"line"|"text"|"path","x":number,"y":number,"w":number,"h":number,"fill":"#hex","stroke":"#hex","text":"string"}. Canvas is '+state.canvas.w+'x'+state.canvas.h+'. Estate colors: brass=#b8974a amber=#ff8c00 ox=#8b1a1a cream=#e6e1d6 void=#0b0a0f green=#4ade80 red=#ef4444 blue=#60a5fa yellow=#fbbf24 slate=#64748b knowledge=#7c3aed white=#fafaf7.';
    const r=await Cascade.generate(sys,q,500);
    try{
      const m=r.text.match(/\{[\s\S]*\}/);
      const obj=JSON.parse(m?m[0]:r.text);
      applyAction(obj);pBody.innerHTML='<span class="ok">✓ '+r.tier+' · '+describe(obj)+'</span>';pInput.value='';setTimeout(closePalette,800);
    }catch(err){pBody.innerHTML='<span class="err">parse failed · '+r.tier+'</span>'}
  }
});
function colorByName(n){const c=ESTATE_COLORS.find(x=>x.name===n.toLowerCase());return c?c.hex:null}
function routeT0(q){
  const s=q.toLowerCase();
  // shape sizes: 200x100
  const sz=s.match(/(\d+)\s*[x×]\s*(\d+)/);
  // single number for size of circle/square
  const num=s.match(/(\d+)\b/);
  // color word
  let color=null;for(const c of ESTATE_COLORS){if(s.includes(c.name)){color=c.hex;break}}
  const cw=state.canvas.w,ch=state.canvas.h;
  if(/rect|rectangle|square|box/.test(s)){
    const w=sz?+sz[1]:(num?+num[1]:200), h=sz?+sz[2]:(/square/.test(s)?w:100);
    return{action:'add',shape:'rect',x:(cw-w)/2,y:(ch-h)/2,w,h,fill:color||'#b8974a'};
  }
  if(/circle|ellipse|oval/.test(s)){
    const w=sz?+sz[1]:(num?+num[1]:120), h=sz?+sz[2]:(/ellipse|oval/.test(s)?w*0.7:w);
    return{action:'add',shape:'ellipse',x:(cw-w)/2,y:(ch-h)/2,w,h,fill:color||'#ff8c00'};
  }
  if(/^line\b|draw line|line\s/.test(s)){
    return{action:'add',shape:'line',x:cw*0.2,y:ch*0.5,w:cw*0.6,h:0,stroke:color||'#0b0a0f'};
  }
  const tm=s.match(/text\s+(.+?)(?:\s+(sans|serif|mono))?(?:\s+(\d+))?$/i);
  if(tm){
    return{action:'add',shape:'text',x:cw*0.3,y:ch*0.5,text:tm[1].replace(/^["']|["']$/g,''),fill:color||'#0b0a0f',w:+(tm[3]||48)};
  }
  if(/^logo\b|^badge\b|^mark\b/.test(s)){
    addShape('ellipse',{cx:cw/2,cy:ch/2,rx:80,ry:80,fill:color||'#b8974a',stroke:'none'});
    return null; // already applied
  }
  return null;
}
function describe(a){if(!a)return'';return a.action+' '+(a.shape||'')+(a.fill?' '+a.fill:'')}
function applyAction(a){
  if(!a||!a.action)return;
  if(a.action==='add'){
    if(a.shape==='rect')addShape('rect',{x:a.x||10,y:a.y||10,width:a.w||100,height:a.h||100,fill:a.fill||'#b8974a',stroke:a.stroke||'none'});
    else if(a.shape==='ellipse')addShape('ellipse',{cx:(a.x||0)+(a.w||100)/2,cy:(a.y||0)+(a.h||100)/2,rx:(a.w||100)/2,ry:(a.h||100)/2,fill:a.fill||'#ff8c00',stroke:a.stroke||'none'});
    else if(a.shape==='line')addShape('line',{x1:a.x||10,y1:a.y||10,x2:(a.x||10)+(a.w||100),y2:(a.y||10)+(a.h||0),stroke:a.stroke||'#0b0a0f','stroke-width':2,fill:'none'});
    else if(a.shape==='text')addShape('text',{x:a.x||50,y:a.y||100,'font-family':'Georgia,serif','font-size':a.w||48,fill:a.fill||'#0b0a0f',_text:a.text||'text'});
  }else if(a.action==='delete'){
    const sel=getSelected();if(sel)deleteShape(sel.id);
  }
}
/* ---------- Keyboard ---------- */
  const inField=/INPUT|TEXTAREA|SELECT/.test(e.target.tagName);
  if((e.ctrlKey||e.metaKey)&&e.key==='k'){e.preventDefault();openPalette();return}
  if((e.ctrlKey||e.metaKey)&&e.key==='z'){e.preventDefault();undo();return}
  if((e.ctrlKey||e.metaKey)&&(e.key==='y'||(e.shiftKey&&e.key==='Z'))){e.preventDefault();redo();return}
  if(inField)return;
  if(e.key==='Escape'){closePalette();closeSettings();state.selectedId=null;state.penPath=[];render();return}
  if(e.key==='Delete'||e.key==='Backspace'){const sel=getSelected();if(sel){deleteShape(sel.id);e.preventDefault()}return}
  const tools={v:'v',p:'p',r:'r',e:'e',l:'l',t:'t'};
  if(tools[e.key])selectTool(tools[e.key]);
});
try{const sig=new BroadcastChannel('fall-signal');sig.postMessage({source:'fallvector',type:'hello',prime:PRIME,version:VERSION,ts:Date.now()});sig.addEventListener('message',e=>{const m=e.data;if(m&&m.type==='ping')sig.postMessage({source:'fallvector',type:'pong',prime:PRIME})})}catch(e){}
/* ---------- Boot ---------- */
(async()=>{
  await openDB();
  await loadSettings();
  await loadDoc();
  zoomFit();
  updateTierBadge();
})();

// Named exports for the primary API surface
export { loadConfig };
export { saveConfig };
export { $ };
export { esc };
export { aiTier };
export { renderAiChip };
export { loadWebLLM };
export { aiComplete };
export { aiCloudCall };
export { meshStart };

export { FALL_KIT_VERSION };
export { KCC_MINT_URL };
export { WEBLLM_MODELS };
export { DEFAULT_MODEL };
export { T3_PROVIDERS };
export { STATE };
export { MESH_CHANNEL };
export { STUN_SERVERS };
export { PRIME };
export { VERSION };
