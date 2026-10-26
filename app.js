// English Coach — práctica de inglés por voz con Gemini (Live + modo turnos de respaldo)
const SDK_URL = "https://esm.run/@google/genai@2.31.0";

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ---------------------------------------------------------------- storage
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const DEFAULTS = {
  apiKey: "", name: "Ivan", liveModel: "", liteModel: "", voice: "", mode: "auto", level: "B1",
  role: "Fullstack Developer (Python/Django, React/Next.js, TypeScript, PostgreSQL, Docker, AWS)",
  dailyGoal: 10,
};
let settings = { ...DEFAULTS, ...store.get("ec.settings", {}) };
let sessions = store.get("ec.sessions", []);
const saveSettings = () => store.set("ec.settings", settings);
const saveSessions = () => { sessions = sessions.slice(-120); store.set("ec.sessions", sessions); };

const dayKey = (d = new Date()) => d.toLocaleDateString("sv-SE"); // YYYY-MM-DD local

// ---------------------------------------------------------------- SDK
let sdk;
async function getAI() {
  sdk ??= await import(SDK_URL);
  return new sdk.GoogleGenAI({ apiKey: settings.apiKey });
}

// ---------------------------------------------------------------- navigation
function show(id) {
  $$(".screen").forEach((s) => s.classList.toggle("on", s.id === id));
  window.scrollTo(0, 0);
  if (id === "home") renderHome();
  if (id === "settings") renderSettings();
}
$$("[data-go]").forEach((b) => (b.onclick = () => show(b.dataset.go)));

// ---------------------------------------------------------------- home
function minutesByDay() {
  const m = {};
  for (const s of sessions) m[s.date] = (m[s.date] || 0) + (s.minutes || 0);
  return m;
}
function streakCount(m) {
  const d = new Date();
  if (!m[dayKey(d)]) d.setDate(d.getDate() - 1); // si hoy todavía no practicó, la racha sigue viva
  let n = 0;
  while (m[dayKey(d)]) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
function renderHome() {
  const m = minutesByDay();
  const n = streakCount(m);
  $("#streak").textContent = `${n} ${n === 1 ? "día" : "días"}`;
  const todayMin = Math.round(m[dayKey()] || 0);
  $("#today-min").textContent = `Hoy: ${todayMin} de ${settings.dailyGoal} min`;
  $("#goal-bar").style.width = Math.min(100, (todayMin / settings.dailyGoal) * 100) + "%";

  const names = ["D", "L", "M", "M", "J", "V", "S"];
  let html = "";
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const k = dayKey(d);
    html += `<div class="day">${names[d.getDay()]}<div class="dot ${m[k] ? "done" : ""} ${i === 0 ? "today" : ""}">${m[k] ? "✓" : d.getDate()}</div></div>`;
  }
  $("#week").innerHTML = html;

  $("#level").value = settings.level;
  const hint = !settings.apiKey
    ? "⚠️ Primero cargá tu API key en Ajustes."
    : settings.mode === "turns" ? "Modo turnos: tocás para hablar y la IA responde."
    : "Modo Live: hablás como en una llamada. Mejor con auriculares.";
  $("#mode-hint").textContent = hint;

  const recent = sessions.slice().reverse().slice(0, 8);
  $("#history").innerHTML = recent.length
    ? recent.map((s) => `
      <div class="hist-item" data-id="${s.id}">
        <div>
          <div>${s.kind === "interview" ? "💼 Entrevista" : "💬 Conversación"}</div>
          <div class="muted small">${new Date(s.start).toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" })} · ${Math.max(1, Math.round(s.minutes))} min</div>
        </div>
        <span class="pill">${s.review ? (s.review.corrections?.length ?? 0) + " correcciones" : "sin analizar"}</span>
      </div>`).join("")
    : `<div class="muted">Todavía no hay sesiones.</div>`;
  $$("#history .hist-item").forEach((el) => (el.onclick = () => openReview(sessions.find((s) => s.id === el.dataset.id))));
}
$("#level").onchange = (e) => { settings.level = e.target.value; saveSettings(); };
$$("[data-start]").forEach((b) => (b.onclick = () => startSession(b.dataset.start)));

// ---------------------------------------------------------------- settings
function fillSelect(sel, items, current) {
  const list = items.length ? items : current ? [current] : [];
  sel.innerHTML = list.length
    ? list.map((v) => `<option ${v === current ? "selected" : ""}>${esc(v)}</option>`).join("")
    : `<option value="">(guardá la API key para detectar)</option>`;
}
function renderSettings() {
  $("#apikey").value = settings.apiKey;
  fillSelect($("#live-model"), store.get("ec.liveModels", []), settings.liveModel);
  fillSelect($("#lite-model"), store.get("ec.liteModels", []), settings.liteModel);
  $("#voice").value = settings.voice;
  $("#mode").value = settings.mode;
  $("#name").value = settings.name;
  $("#role").value = settings.role;
  $("#goal").value = settings.dailyGoal;
}
function readSettingsForm() {
  settings.apiKey = $("#apikey").value.trim();
  settings.liveModel = $("#live-model").value;
  settings.liteModel = $("#lite-model").value;
  settings.voice = $("#voice").value;
  settings.mode = $("#mode").value;
  settings.name = $("#name").value.trim() || "Ivan";
  settings.role = $("#role").value.trim() || DEFAULTS.role;
  settings.dailyGoal = Math.max(1, parseInt($("#goal").value, 10) || 10);
}
const versionScore = (name) => {
  const v = (name.match(/(\d+(?:\.\d+)?)/) || [0, 0])[1];
  return parseFloat(v) * 10 - (/preview|exp/.test(name) ? 1 : 0);
};
$("#verify").onclick = async () => {
  readSettingsForm();
  const msg = $("#verify-msg");
  if (!settings.apiKey) { msg.innerHTML = `<span class="err">Pegá tu API key.</span>`; return; }
  $("#verify").disabled = true;
  msg.textContent = "Consultando modelos disponibles…";
  try {
    const ai = await getAI();
    const live = [], lite = [];
    const pager = await ai.models.list({ config: { pageSize: 200 } });
    for await (const m of pager) {
      const name = (m.name || "").replace(/^models\//, "");
      const actions = m.supportedActions || [];
      if (actions.includes("bidiGenerateContent") && !/translat|transcri/i.test(name)) live.push(name);
      if (actions.includes("generateContent") && /flash-lite/.test(name) && !/tts|image|audio|live/.test(name)) lite.push(name);
    }
    live.sort((a, b) => versionScore(b) - versionScore(a));
    lite.sort((a, b) => versionScore(b) - versionScore(a));
    store.set("ec.liveModels", live);
    store.set("ec.liteModels", lite);
    if (!live.includes(settings.liveModel)) settings.liveModel = live[0] || "";
    if (!lite.includes(settings.liteModel)) settings.liteModel = lite[0] || "";
    saveSettings();
    renderSettings();
    msg.innerHTML = `<span class="ok">✓ API key válida.</span> ${live.length} modelos Live y ${lite.length} de texto.` +
      (!live.length ? ` <span class="warn">Sin modelos Live: vas a usar el modo turnos.</span>` : "");
  } catch (e) {
    msg.innerHTML = `<span class="err">No funcionó: ${esc(e?.message || e)}</span>`;
  }
  $("#verify").disabled = false;
};
$("#save-settings").onclick = () => { readSettingsForm(); saveSettings(); show("home"); };

// ---------------------------------------------------------------- prompts
const LEVELS = {
  A2: "elementary (A2): use very simple words and short sentences, and speak slowly and clearly",
  B1: "intermediate (B1): use common vocabulary and clear sentences",
  B2: "upper-intermediate (B2): speak naturally, with some common idioms",
  C1: "advanced (C1): speak naturally at normal speed, with idioms and nuanced vocabulary",
};
function systemPrompt(kind, topic) {
  const base = `You are an English speaking coach talking by voice with ${settings.name}, a native Spanish speaker from Argentina. ` +
    `His level is ${LEVELS[settings.level]}. Keep each of your turns short (1-3 sentences) so he speaks more than you. ` +
    `Always answer in English. If he uses Spanish words, give him the English phrase and encourage him to say it. ` +
    `Do not list grammar corrections during the conversation (they are reviewed at the end), but if a mistake makes him hard to understand, briefly repeat what he meant correctly and continue.`;
  if (kind === "interview") {
    return `${base} Act as a friendly but realistic technical interviewer at an international company hiring a ${settings.role}. ` +
      (topic ? `Focus on: ${topic}. ` : "") +
      `Run a real job interview: a brief introduction, then one question at a time about his background and experience, behavioral questions (STAR format), and technical questions about his stack. ` +
      `Ask follow-up questions when an answer is vague. Do not give feedback during the interview unless he asks for it.`;
  }
  return `${base} Have a relaxed, natural conversation. ` +
    (topic ? `Topic: ${topic}. ` : "Start by asking about his day, then follow his interests. ") +
    `Ask open follow-up questions and share brief opinions to keep it natural.`;
}
const KICKOFF = "(The session has started. Greet me briefly and ask the first question.)";

// ---------------------------------------------------------------- session state
let S = null;

function setStatus(text, orb = "") {
  $("#status").textContent = text;
  $("#orb").className = "orb " + orb;
}
function sysLine(text) {
  const d = document.createElement("div");
  d.className = "line sys";
  d.textContent = text;
  $("#transcript").appendChild(d);
  $("#transcript").scrollTop = 1e9;
}
// Agrega texto al último renglón si es del mismo hablante y está abierto
function appendLine(who, text) {
  if (!text) return;
  const last = S.transcript[S.transcript.length - 1];
  if (last && last.who === who && last.open) {
    last.text += text;
    last.el.textContent = last.text.trim();
  } else {
    if (last) last.open = false;
    const el = document.createElement("div");
    el.className = "line " + who;
    el.textContent = text.trim();
    $("#transcript").appendChild(el);
    S.transcript.push({ who, text, open: true, el });
  }
  $("#transcript").scrollTop = 1e9;
}
function closeLine() { const last = S?.transcript[S.transcript.length - 1]; if (last) last.open = false; }

function tick() {
  if (!S) return;
  const s = Math.floor((Date.now() - S.start) / 1000);
  $("#timer").firstChild.textContent = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")} · `;
}

async function startSession(kind) {
  if (!settings.apiKey) { show("settings"); return; }
  // Los AudioContext se crean ya, dentro del toque del usuario, para que Chrome permita el audio
  const inCtx = new AudioContext({ sampleRate: 16000 });
  const outCtx = new AudioContext({ sampleRate: 24000 });
  S = {
    kind, topic: $("#topic").value.trim(), start: Date.now(), transcript: [], mode: null,
    inCtx, outCtx, nextT: 0, sources: new Set(), muted: false, ending: false,
  };
  $("#transcript").innerHTML = "";
  $("#s-title").textContent = kind === "interview" ? "Entrevista" : "Conversación";
  $("#s-mode").textContent = "conectando…";
  ["#live-controls", "#turn-controls", "#fallback-box"].forEach((s) => ($(s).hidden = true));
  setStatus("Conectando…", "idle");
  show("session");
  S.timerId = setInterval(tick, 1000);
  try { S.wakeLock = await navigator.wakeLock?.request("screen"); } catch {}

  try {
    S.ai = await getAI();
  } catch (e) {
    sysLine("No se pudo cargar la librería de Gemini. ¿Tenés conexión?");
    setStatus("Sin conexión", "idle");
    $("#fallback-box").hidden = false;
    $("#to-turns").hidden = true;
    return;
  }

  if (settings.mode !== "turns" && settings.liveModel) {
    try { await startLive(); return; }
    catch (e) {
      cleanupLive();
      const why = e?.message || String(e);
      if (settings.mode === "live") {
        sysLine(`No se pudo conectar Live: ${why}`);
        setStatus("Live no disponible", "idle");
        $("#fallback-box").hidden = false;
        return;
      }
      sysLine(`Live no disponible (${why}). Sigo en modo turnos.`);
    }
  }
  await startTurns();
}

// ---------------------------------------------------------------- Live (voz a voz)
const WORKLET = `
class Capture extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Int16Array(1600); this.i = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) for (let k = 0; k < ch.length; k++) {
      const s = Math.max(-1, Math.min(1, ch[k]));
      this.buf[this.i++] = s < 0 ? s * 0x8000 : s * 0x7fff;
      if (this.i === this.buf.length) { this.port.postMessage(this.buf.buffer.slice(0)); this.i = 0; }
    }
    return true;
  }
}
registerProcessor("capture", Capture);`;

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function startLive() {
  const config = {
    responseModalities: ["AUDIO"],
    systemInstruction: systemPrompt(S.kind, S.topic),
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    contextWindowCompression: { slidingWindow: {} },
  };
  if (settings.voice) config.speechConfig = { voiceConfig: { prebuiltVoiceConfig: { voiceName: settings.voice } } };

  let ready, fail;
  const setup = new Promise((res, rej) => { ready = res; fail = rej; });
  const timeout = setTimeout(() => fail(new Error("tiempo de espera agotado")), 15000);

  S.session = await S.ai.live.connect({
    model: settings.liveModel,
    config,
    callbacks: {
      onopen: () => {},
      onmessage: (m) => {
        if (m.setupComplete) { clearTimeout(timeout); ready(); }
        handleLive(m);
      },
      onerror: (e) => fail(new Error(e?.message || "error de conexión")),
      onclose: (e) => {
        clearTimeout(timeout);
        const reason = e?.reason || `conexión cerrada (código ${e?.code ?? "?"})`;
        fail(new Error(reason));
        if (S && S.mode === "live" && !S.ending) onLiveDropped(reason);
      },
    },
  });
  await setup;

  S.mode = "live";
  $("#s-mode").textContent = "Live";
  await startMic();
  await S.outCtx.resume();
  $("#live-controls").hidden = false;
  setStatus("Escuchando…");
  S.session.sendClientContent({ turns: [{ role: "user", parts: [{ text: KICKOFF }] }], turnComplete: true });
}

async function startMic() {
  S.mic = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  await S.inCtx.resume();
  const url = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }));
  await S.inCtx.audioWorklet.addModule(url);
  const src = S.inCtx.createMediaStreamSource(S.mic);
  S.node = new AudioWorkletNode(S.inCtx, "capture");
  const sink = S.inCtx.createGain();
  sink.gain.value = 0;
  src.connect(S.node).connect(sink).connect(S.inCtx.destination);
  S.node.port.onmessage = (e) => {
    if (!S || S.mode !== "live" || S.muted) return;
    // Nivel del micrófono para animar la esfera mientras no habla la IA
    const pcm = new Int16Array(e.data);
    let sum = 0;
    for (let i = 0; i < pcm.length; i += 8) sum += Math.abs(pcm[i]);
    const level = Math.min(1, (sum / (pcm.length / 8)) / 6000);
    if (!S.sources.size) $("#orb").style.transform = `scale(${1 + level * 0.25})`;
    try { S.session.sendRealtimeInput({ audio: { data: toBase64(e.data), mimeType: "audio/pcm;rate=16000" } }); } catch {}
  };
}

function handleLive(m) {
  if (!S) return;
  if (m.goAway) sysLine("La sesión Live está por terminar (límite de tiempo).");
  const sc = m.serverContent;
  if (!sc) return;
  if (sc.interrupted) { stopPlayback(); closeLine(); }
  for (const p of sc.modelTurn?.parts || []) {
    if (p.inlineData?.data) {
      const rate = parseInt((p.inlineData.mimeType || "").match(/rate=(\d+)/)?.[1] || "24000", 10);
      playPCM(p.inlineData.data, rate);
    }
  }
  if (sc.inputTranscription?.text) appendLine("user", sc.inputTranscription.text);
  if (sc.outputTranscription?.text) appendLine("ai", sc.outputTranscription.text);
  if (sc.turnComplete) closeLine();
}

function playPCM(b64, rate) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const pcm = new Int16Array(bytes.buffer, 0, bytes.length >> 1);
  const f32 = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) f32[i] = pcm[i] / 32768;
  const buf = S.outCtx.createBuffer(1, f32.length, rate);
  buf.copyToChannel(f32, 0);
  const src = S.outCtx.createBufferSource();
  src.buffer = buf;
  src.connect(S.outCtx.destination);
  const t = Math.max(S.outCtx.currentTime + 0.04, S.nextT);
  src.start(t);
  S.nextT = t + buf.duration;
  S.sources.add(src);
  $("#orb").style.transform = "";
  setStatus("Hablando…", "speaking");
  src.onended = () => {
    S?.sources.delete(src);
    if (S && !S.sources.size && S.mode === "live") setStatus(S.muted ? "Micrófono silenciado" : "Escuchando…");
  };
}
function stopPlayback() {
  if (!S) return;
  for (const s of S.sources) { try { s.stop(); } catch {} }
  S.sources.clear();
  S.nextT = 0;
}

function onLiveDropped(reason) {
  S.mode = "dropped";
  cleanupLive();
  $("#live-controls").hidden = true;
  sysLine(`Se cortó la conexión Live: ${reason}`);
  setStatus("Conexión cortada", "idle");
  $("#to-turns").hidden = !settings.liteModel;
  $("#fallback-box").hidden = false;
}
function cleanupLive() {
  if (!S) return;
  try { S.node?.port && (S.node.port.onmessage = null); } catch {}
  S.mic?.getTracks().forEach((t) => t.stop());
  S.mic = null;
  stopPlayback();
  try { S.session?.close(); } catch {}
  S.session = null;
}

$("#mute").onclick = () => {
  S.muted = !S.muted;
  $("#mute").textContent = S.muted ? "🔇 Activar mic" : "🎙️ Silenciar";
  if (!S.sources.size) setStatus(S.muted ? "Micrófono silenciado" : "Escuchando…", S.muted ? "idle" : "");
};
$("#to-turns").onclick = () => { $("#fallback-box").hidden = true; startTurns(); };

// ---------------------------------------------------------------- modo turnos (respaldo)
function transcriptToHistory() {
  const h = [{ role: "user", parts: [{ text: KICKOFF }] }];
  for (const l of S.transcript) {
    if (l.who === "sys") continue;
    const role = l.who === "user" ? "user" : "model";
    const last = h[h.length - 1];
    if (last.role === role) last.parts[0].text += " " + l.text.trim();
    else h.push({ role, parts: [{ text: l.text.trim() }] });
  }
  return h;
}
function englishVoice() {
  const vs = speechSynthesis.getVoices().filter((v) => /^en[-_]/i.test(v.lang));
  return vs.find((v) => /en[-_]US/i.test(v.lang) && v.localService) || vs.find((v) => /en[-_]US/i.test(v.lang)) || vs[0];
}
function speak(text) {
  return new Promise((resolve) => {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = englishVoice();
    if (v) u.voice = v;
    u.lang = v?.lang || "en-US";
    u.rate = settings.level === "A2" ? 0.85 : 1;
    u.onend = u.onerror = () => resolve();
    speechSynthesis.speak(u);
  });
}

async function startTurns() {
  if (!settings.liteModel) {
    sysLine("No hay modelo de texto configurado. Revisá Ajustes.");
    $("#fallback-box").hidden = false;
    $("#to-turns").hidden = true;
    return;
  }
  S.mode = "turns";
  $("#s-mode").textContent = "Turnos";
  $("#turn-controls").hidden = false;
  speechSynthesis.getVoices(); // precarga
  const hasHistory = S.transcript.some((l) => l.who === "user");
  S.chat = S.ai.chats.create({
    model: settings.liteModel,
    config: { systemInstruction: systemPrompt(S.kind, S.topic) + " Reply in plain text only (no markdown, no emojis, no lists), because it will be read aloud." },
    history: hasHistory ? transcriptToHistory() : [],
  });
  if (!hasHistory) await sendTurn(KICKOFF, false);
  else setStatus("Tocá el botón y hablá", "idle");
}

async function sendTurn(text, showUser = true) {
  if (!S || S.mode !== "turns") return;
  if (showUser) { closeLine(); appendLine("user", text); closeLine(); }
  setStatus("Pensando…", "idle");
  $("#talk").disabled = true;
  try {
    const r = await S.chat.sendMessage({ message: text });
    const reply = (r.text || "").replace(/[*_#`]/g, "").trim();
    appendLine("ai", reply);
    closeLine();
    setStatus("Hablando…", "speaking");
    await speak(reply);
    setStatus("Tocá el botón y hablá", "idle");
  } catch (e) {
    const msg = e?.message || String(e);
    sysLine(/429|quota|RESOURCE_EXHAUSTED/i.test(msg)
      ? "Se terminó la cuota gratuita de hoy para este modelo. Probá mañana o cambiá de modelo en Ajustes."
      : `Error: ${msg}`);
    setStatus("Error", "idle");
  }
  $("#talk").disabled = false;
}

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
$("#talk").onclick = () => {
  if (!Recognition) { sysLine("Este navegador no tiene reconocimiento de voz. Escribí tu respuesta."); return; }
  if (S.rec) { S.rec.stop(); return; }
  speechSynthesis.cancel();
  const rec = new Recognition();
  rec.lang = "en-US";
  rec.interimResults = true;
  rec.maxAlternatives = 1;
  let finalText = "";
  const live = document.createElement("div");
  live.className = "line user";
  live.style.opacity = ".6";
  $("#transcript").appendChild(live);
  rec.onresult = (e) => {
    let interim = "";
    finalText = "";
    for (const r of e.results) (r.isFinal ? (finalText += r[0].transcript) : (interim += r[0].transcript));
    live.textContent = (finalText + " " + interim).trim();
    $("#transcript").scrollTop = 1e9;
  };
  rec.onerror = (e) => { if (e.error !== "no-speech" && e.error !== "aborted") sysLine("Micrófono: " + e.error); };
  rec.onend = () => {
    S.rec = null;
    live.remove();
    $("#talk").classList.remove("rec");
    $("#talk").textContent = "🎙️ Tocá para hablar";
    const t = (finalText || live.textContent).trim();
    if (t) sendTurn(t);
    else setStatus("No te escuché. Probá de nuevo.", "idle");
  };
  S.rec = rec;
  rec.start();
  $("#talk").classList.add("rec");
  $("#talk").textContent = "⏹️ Listo";
  setStatus("Escuchando…");
};
$("#type-send").onclick = () => {
  const t = $("#type-input").value.trim();
  if (!t) return;
  $("#type-input").value = "";
  speechSynthesis.cancel();
  sendTurn(t);
};
$("#type-input").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#type-send").click(); });

// ---------------------------------------------------------------- fin de sesión
async function endSession() {
  if (!S || S.ending) return;
  S.ending = true;
  clearInterval(S.timerId);
  try { S.rec?.abort(); } catch {}
  speechSynthesis.cancel();
  cleanupLive();
  try { S.inCtx.close(); S.outCtx.close(); } catch {}
  try { await S.wakeLock?.release(); } catch {}

  const lines = S.transcript.filter((l) => l.who !== "sys").map((l) => ({ who: l.who, text: l.text.trim() })).filter((l) => l.text);
  const minutes = (Date.now() - S.start) / 60000;
  const spoke = lines.some((l) => l.who === "user");
  const kind = S.kind;
  S = null;
  if (!spoke) { show("home"); return; }

  const rec = {
    id: Date.now().toString(36), date: dayKey(), start: Date.now() - minutes * 60000,
    minutes, kind, transcript: lines, review: null,
  };
  sessions.push(rec);
  saveSessions();
  openReview(rec);
}
["#end-live", "#end-turns", "#end-fallback"].forEach((id) => ($(id).onclick = endSession));

// ---------------------------------------------------------------- análisis y correcciones
const REVIEW_SCHEMA = {
  type: "OBJECT",
  properties: {
    summary: { type: "STRING" },
    level: { type: "STRING" },
    corrections: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { original: { type: "STRING" }, corrected: { type: "STRING" }, explanation: { type: "STRING" } },
        required: ["original", "corrected", "explanation"],
      },
    },
    better: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { original: { type: "STRING" }, natural: { type: "STRING" } },
        required: ["original", "natural"],
      },
    },
    vocabulary: {
      type: "ARRAY",
      items: { type: "OBJECT", properties: { word: { type: "STRING" }, meaning: { type: "STRING" } }, required: ["word", "meaning"] },
    },
    interview: { type: "STRING" },
    tip: { type: "STRING" },
  },
  required: ["summary", "level", "corrections", "better", "vocabulary", "tip"],
};

async function runReview(rec) {
  const ai = await getAI();
  const convo = rec.transcript.map((l) => `${l.who === "user" ? "STUDENT" : "COACH"}: ${l.text}`).join("\n");
  const prompt =
    `You are an expert English teacher reviewing a spoken practice session of a native Spanish speaker from Argentina (target level ${settings.level}).\n` +
    `The STUDENT lines come from automatic speech transcription, so ignore punctuation, capitalization and obvious transcription glitches.\n` +
    `Write every explanation, the summary and the tip in Spanish (Argentina, informal "vos"). Keep English examples in English.\n\n` +
    `Return:\n` +
    `- summary: 2-3 sentences on how the student did.\n` +
    `- level: estimated CEFR level (e.g. "B1").\n` +
    `- corrections: real grammar or vocabulary mistakes made by the STUDENT only. "original" must be the student's exact words (just the relevant sentence), "corrected" the fixed version, "explanation" one short sentence. Max 8, most important first. Empty array if none.\n` +
    `- better: up to 3 correct but unnatural student sentences, with a more natural native way to say them.\n` +
    `- vocabulary: up to 5 useful words or phrases related to the conversation, with the meaning in Spanish.\n` +
    (rec.kind === "interview" ? `- interview: 2-4 sentences of feedback on the quality of his interview answers (content, structure, STAR, confidence).\n` : "") +
    `- tip: one concrete thing to focus on next session.\n\n` +
    `Conversation:\n${convo}`;
  const r = await ai.models.generateContent({
    model: settings.liteModel,
    contents: prompt,
    config: { responseMimeType: "application/json", responseSchema: REVIEW_SCHEMA, temperature: 0.2 },
  });
  return JSON.parse(r.text);
}

// Diff por palabras (LCS): rojo tachado = sacar, verde = agregar
function diffHTML(a, b) {
  const A = a.split(/\s+/).filter(Boolean), B = b.split(/\s+/).filter(Boolean);
  const key = (w) => w.toLowerCase().replace(/[^a-z0-9']/g, "");
  const dp = Array.from({ length: A.length + 1 }, () => new Array(B.length + 1).fill(0));
  for (let i = A.length - 1; i >= 0; i--)
    for (let j = B.length - 1; j >= 0; j--)
      dp[i][j] = key(A[i]) === key(B[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = [];
  let i = 0, j = 0;
  while (i < A.length && j < B.length) {
    if (key(A[i]) === key(B[j])) { out.push(esc(B[j])); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) out.push(`<s class="del">${esc(A[i++])}</s>`);
    else out.push(`<b class="add">${esc(B[j++])}</b>`);
  }
  while (i < A.length) out.push(`<s class="del">${esc(A[i++])}</s>`);
  while (j < B.length) out.push(`<b class="add">${esc(B[j++])}</b>`);
  return out.join(" ");
}

function transcriptHTML(rec) {
  return `<details class="card"><summary>Ver la conversación completa</summary>` +
    rec.transcript.map((l) => `<div class="line ${l.who}">${esc(l.text)}</div>`).join("") + `</details>`;
}

async function openReview(rec) {
  if (!rec) return;
  show("review");
  const body = $("#review-body");
  const head = `<div class="muted small" style="margin-bottom:10px">${rec.kind === "interview" ? "💼 Entrevista" : "💬 Conversación"} · ${Math.max(1, Math.round(rec.minutes))} min · ${new Date(rec.start).toLocaleString("es-AR", { dateStyle: "medium", timeStyle: "short" })}</div>`;

  if (!rec.review) {
    body.innerHTML = head + `<div class="card"><div class="spinner"></div><div class="muted" style="text-align:center">Analizando tu sesión…</div></div>` + transcriptHTML(rec);
    try {
      rec.review = await runReview(rec);
      saveSessions();
    } catch (e) {
      const msg = e?.message || String(e);
      body.innerHTML = head + `<div class="card"><div class="err">No se pudo analizar: ${esc(/429|quota|RESOURCE_EXHAUSTED/i.test(msg) ? "se terminó la cuota gratuita de hoy." : msg)}</div>
        <button class="btn" id="retry-review">Reintentar</button><div class="muted small" style="margin-top:8px">La sesión quedó guardada: también podés analizarla después desde el historial.</div></div>` + transcriptHTML(rec);
      $("#retry-review").onclick = () => openReview(rec);
      return;
    }
  }
  const v = rec.review;
  let html = head + `<div class="card"><div class="row"><div class="grow">${esc(v.summary)}</div><span class="pill" style="font-size:14px">${esc(v.level || "")}</span></div></div>`;

  html += `<div class="card"><h2>✏️ Correcciones (${v.corrections?.length || 0})</h2>`;
  html += v.corrections?.length
    ? v.corrections.map((c) => `<div class="corr"><div class="diff">${diffHTML(c.original, c.corrected)}</div><div class="why">${esc(c.explanation)}</div></div>`).join("")
    : `<div class="muted">Sin errores importantes. 👏</div>`;
  html += `</div>`;

  if (v.better?.length) {
    html += `<div class="card"><h2>🗣️ Más natural</h2>` +
      v.better.map((b) => `<div class="corr"><div class="muted small">${esc(b.original)}</div><div>→ ${esc(b.natural)}</div></div>`).join("") + `</div>`;
  }
  if (v.interview) html += `<div class="card"><h2>💼 Sobre tus respuestas</h2><div>${esc(v.interview)}</div></div>`;
  if (v.vocabulary?.length) {
    html += `<div class="card"><h2>📚 Vocabulario</h2><div class="vocab">` +
      v.vocabulary.map((w) => `<div><b>${esc(w.word)}</b><br><span class="muted">${esc(w.meaning)}</span></div>`).join("") + `</div></div>`;
  }
  html += `<div class="card"><h2>🎯 Para la próxima</h2><div>${esc(v.tip)}</div></div>`;
  html += transcriptHTML(rec);
  html += `<button class="btn" id="back-home">Volver al inicio</button>`;
  body.innerHTML = html;
  $("#back-home").onclick = () => show("home");
}

// ---------------------------------------------------------------- arranque
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
navigator.storage?.persist?.().catch(() => {});
show(settings.apiKey ? "home" : "settings");
