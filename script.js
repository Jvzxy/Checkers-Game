(() => {
  "use strict";

  const SIZE = 8;
  const RED = "red";
  const BLACK = "black";
  const FILES = "ABCDEFGH";
  const MAX_LEVEL = 15; // number of computer levels (must match LEVELS.length below)
  const $ = id => document.getElementById(id);
  const boardEl = $("board");
  const statusTitle = $("statusTitle");
  const turnPill = $("turnPill");
  const boardHint = $("boardHint");
  const redCountEl = $("redCount");
  const blackCountEl = $("blackCount");
  const moveCountEl = $("moveCount");
  const captureCountEl = $("captureCount");
  const redRole = $("redRole");
  const blackRole = $("blackRole");
  const modal = $("resultModal");
  const resultTitle = $("resultTitle");
  const resultText = $("resultText");
  const liveMessage = $("liveMessage");

  // Chosen on the start screen; can only change by starting a new game.
  // Every match is 10 minutes per player (time is in seconds).
  const settings = { mode: "local", level: 1, time: 600 };
  let cleared = loadProgress(); // how many challenge levels the player has beaten (saved)
  let pickedLevel = 1;          // level highlighted on the start screen
  let resultAction = "again"; // what the result button does: again | next | retry
  let bannerTimer = null;

  let state;
  let selected = null;      // [r, c] of the selected piece
  let legalMoves = [];      // single-step moves available to the current player
  let history = [];         // snapshots taken at the start of each turn
  let flipped = false;      // manual board flip (single-player modes)
  let perspective = true;   // two players: the board turns to face whoever is moving
  let lastView = null;      // last board orientation drawn (to animate the turn)
  let gameOver = false;
  let aiThinking = false;
  let aiTimer = null;
  let forcedPiece = null;   // piece that must keep jumping
  let showHints = false;
  let lastLanded = null;    // square of the piece that just moved (for its landing animation)
  let started = false;      // false while the start screen is open

  const name = color => (color === RED ? "Red" : "Black");

  /* ---------- Pixel lettering & UI effects ---------- */

  // 5x7 bitmap font; rows are separated by "/".
  const FONT = {
    A: ".###./#...#/#...#/#####/#...#/#...#/#...#",
    B: "####./#...#/#...#/####./#...#/#...#/####.",
    C: ".###./#...#/#..../#..../#..../#...#/.###.",
    D: "####./#...#/#...#/#...#/#...#/#...#/####.",
    E: "#####/#..../#..../####./#..../#..../#####",
    F: "#####/#..../#..../####./#..../#..../#....",
    G: ".###./#...#/#..../#.###/#...#/#...#/.####",
    H: "#...#/#...#/#...#/#####/#...#/#...#/#...#",
    I: "#####/..#../..#../..#../..#../..#../#####",
    J: "..###/...#./...#./...#./...#./#..#./.##..",
    K: "#...#/#..#./#.#../##.../#.#../#..#./#...#",
    L: "#..../#..../#..../#..../#..../#..../#####",
    M: "#...#/##.##/#.#.#/#.#.#/#...#/#...#/#...#",
    N: "#...#/##..#/#.#.#/#..##/#...#/#...#/#...#",
    O: ".###./#...#/#...#/#...#/#...#/#...#/.###.",
    P: "####./#...#/#...#/####./#..../#..../#....",
    Q: ".###./#...#/#...#/#...#/#.#.#/#..#./.##.#",
    R: "####./#...#/#...#/####./#.#../#..#./#...#",
    S: ".####/#..../#..../.###./....#/....#/####.",
    T: "#####/..#../..#../..#../..#../..#../..#..",
    U: "#...#/#...#/#...#/#...#/#...#/#...#/.###.",
    V: "#...#/#...#/#...#/#...#/#...#/.#.#./..#..",
    W: "#...#/#...#/#...#/#.#.#/#.#.#/##.##/#...#",
    X: "#...#/#...#/.#.#./..#../.#.#./#...#/#...#",
    Y: "#...#/#...#/.#.#./..#../..#../..#../..#..",
    Z: "#####/....#/...#./..#../.#.../#..../#####",
    "?": ".###./#...#/....#/...#./..#../...../..#..",
    "!": "..#../..#../..#../..#../..#../...../..#..",
    0: ".###./#...#/#..##/#.#.#/##..#/#...#/.###.",
    1: "..#../.##../..#../..#../..#../..#../.###.",
    2: ".###./#...#/....#/...#./..#../.#.../#####",
    3: "####./....#/....#/.###./....#/....#/####.",
    4: "...#./..##./.#.#./#..#./#####/...#./...#.",
    5: "#####/#..../####./....#/....#/#...#/.###.",
    6: "..##./.#.../#..../####./#...#/#...#/.###.",
    7: "#####/....#/...#./..#../.#.../.#.../.#...",
    8: ".###./#...#/#...#/.###./#...#/#...#/.###.",
    9: ".###./#...#/#...#/.####/....#/...#./.##..",
  };

  // Draws text as pixel art (inline SVG). Each letter drops in one after another.
  function pixelSVG(text, delay = 0) {
    let x = 0, glyphs = "";
    [...text.toUpperCase()].forEach((ch, i) => {
      if (ch === " ") { x += 3; return; }
      let d = "";
      (FONT[ch] || FONT["?"]).split("/").forEach((row, y) =>
        [...row].forEach((v, k) => { if (v === "#") d += `M${x + k} ${y}h1v1h-1z`; }));
      glyphs += `<g class="px-glyph" style="animation-delay:${delay + i * 45}ms"><path class="px-shade" transform="translate(1 1)" d="${d}"/><path class="px-fill" d="${d}"/></g>`;
      x += 6;
    });
    return `<svg viewBox="0 0 ${x} 8" style="--cols:${x}" aria-hidden="true" shape-rendering="crispEdges">${glyphs}</svg>`;
  }
  document.querySelectorAll("[data-pixel]").forEach(el => {
    el.innerHTML = pixelSVG(el.dataset.pixel, Number(el.dataset.delay || 0));
  });

  // Plays the closing animation, then hides the modal and runs `done`.
  function closeModal(el, done) {
    if (el.classList.contains("leaving")) return;
    el.classList.add("leaving");
    setTimeout(() => { el.hidden = true; el.classList.remove("leaving"); done(); }, 260);
  }

  // Ripple on every button / mode card click.
  document.addEventListener("pointerdown", e => {
    const target = e.target.closest(".button, .mode-card");
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 2;
    const ripple = document.createElement("span");
    ripple.className = "ripple";
    ripple.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - rect.left - size / 2}px;top:${e.clientY - rect.top - size / 2}px`;
    target.appendChild(ripple);
    ripple.addEventListener("animationend", () => ripple.remove());
  });

  /* ---------- AI levels & challenge ladder ---------- */

  // depth  = how many turns ahead it looks (a cap from Level 6 up)
  // blunder = chance it plays a random move instead
  // ms     = thinking time per move (Level 6+ keeps searching deeper until this runs out)
  // pro    = richer evaluation plus a look-ahead through capture exchanges (Level 6+)
  const LEVELS = [
    { name: "Rookie",      icon: "🌱", depth: 0,  blunder: 1 },    // random moves
    { name: "Apprentice",  icon: "⚔️", depth: 2,  blunder: 0.3 },  // thinks 2 turns ahead, often slips
    { name: "Challenger",  icon: "🛡️", depth: 3,  blunder: 0 },
    { name: "Expert",      icon: "🔥", depth: 5,  blunder: 0 },
    { name: "Master",      icon: "👑", depth: 6,  blunder: 0 },
    { name: "Veteran",     icon: "🎖️", depth: 7,  blunder: 0.02,  ms: 600,  pro: true }, // rare slips that fade out by Level 10
    { name: "Tactician",   icon: "🧠", depth: 8,  blunder: 0.015, ms: 800,  pro: true },
    { name: "Strategist",  icon: "♟️", depth: 9,  blunder: 0.01,  ms: 1000, pro: true },
    { name: "Warlord",     icon: "⚡", depth: 10, blunder: 0.005, ms: 1200, pro: true },
    { name: "Prodigy",     icon: "🦅", depth: 11, blunder: 0,     ms: 1400, pro: true },
    { name: "Virtuoso",    icon: "🐉", depth: 12, blunder: 0,     ms: 1600, pro: true },
    { name: "Maestro",     icon: "🌋", depth: 13, blunder: 0, ms: 1900, pro: true },
    { name: "Grandmaster", icon: "🚀", depth: 14, blunder: 0, ms: 2200, pro: true },
    { name: "Titan",       icon: "🗿", depth: 16, blunder: 0, ms: 2500, pro: true },
    { name: "Immortal",    icon: "💀", depth: 18, blunder: 0, ms: 3000, pro: true },
  ];

  function loadProgress() {
    try { return Math.min(MAX_LEVEL, Math.max(0, Number(localStorage.getItem("checkers.cleared")) || 0)); }
    catch { return 0; }
  }
  function saveProgress() {
    try { localStorage.setItem("checkers.cleared", String(cleared)); } catch { /* storage unavailable */ }
  }

  function renderLadder() {
    $("ladderPanel").hidden = !(started && settings.mode === "challenge");
    $("ladderSteps").innerHTML = LEVELS.map((L, i) => {
      const n = i + 1;
      const cls = n === settings.level ? "current" : n <= cleared ? "done" : n === cleared + 1 ? "open" : "locked";
      const mark = { current: "▶", locked: "🔒", done: "✓", open: "" }[cls];
      return `<li class="${cls}"><span>${L.icon}</span>Level ${n} · ${L.name}<em>${mark}</em></li>`;
    }).join("");
    // The list scrolls now that there are 15 levels, so keep the current one in view.
    const list = $("ladderSteps"), cur = list.querySelector(".current");
    if (cur) list.scrollTop = cur.offsetTop - (list.clientHeight - cur.offsetHeight) / 2;
  }

  function showLevelBanner() {
    const L = LEVELS[settings.level - 1];
    $("levelBanner").innerHTML = `<span class="pixel pixel-gold" style="--px:6px">${pixelSVG("Level " + settings.level)}</span><strong>${L.icon} ${L.name}</strong>`;
    $("levelBanner").hidden = false;
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => { $("levelBanner").hidden = true; }, 1900);
  }

  /* ---------- Visual tutorial ---------- */

  const mp = (color, r, c, cls = "", vars = "") => `<i class="mp ${color} ${cls}" style="--r:${r};--c:${c};${vars}"></i>`;
  const mk = (type, r, c) => `<i class="mk ${type}" style="--r:${r};--c:${c}"></i>`;
  const mini = (n, inner) => `<div class="mini" style="--n:${n}">${inner}</div>`;

  let setupPieces = "";
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    if ((r + c) % 2 === 1 && (r < 3 || r > 4)) setupPieces += mp(r < 3 ? "black" : "red", r, c, "a-pop", `--i:${(r * 3 + c) % 14}`);
  }

  const TUTORIAL = [
    { title: "Set up the board", text: "Each side has 12 pieces on the dark squares. Red moves first.", visual: mini(8, setupPieces) },
    { title: "Move diagonally", text: "Pick a piece, then tap a green dot. Regular pieces only move forward.",
      visual: mini(6, mk("move", 3, 2) + mp("red", 4, 1, "a-move", "--dx:1;--dy:-1")) },
    { title: "Jump to capture", text: "Hop over an enemy into the empty square behind it. Gold rings mark captures, and you can skip them.",
      visual: mini(6, mk("jump", 2, 3) + mp("black", 3, 2, "a-gone1") + mp("red", 4, 1, "a-move", "--dx:2;--dy:-2")) },
    { title: "Chain your jumps", text: "Another jump open after landing? Keep going! Tap your piece again to stop early.",
      visual: mini(6, mk("jump", 3, 2) + mk("jump", 1, 4) + mp("black", 4, 1, "a-gone1") + mp("black", 2, 3, "a-gone2") +
        mp("red", 5, 0, "a-chain", "--dx1:2;--dy1:-2;--dx2:4;--dy2:-4")) },
    { title: "Become a king", text: "Reach the far row to earn a crown. Kings can move and jump backwards too.",
      visual: mini(6, mk("move", 0, 3) + mp("red", 1, 2, "a-move crowns", "--dx:1;--dy:-1")) },
    { title: "How to win", text: "Capture every piece, leave them with no legal move, or watch their clock hit zero.",
      visual: `<div class="tut-chips"><span class="chip" style="--d:0">💥<b>Capture all</b></span><span class="chip" style="--d:1">🚧<b>Block them</b></span><span class="chip" style="--d:2">⏱️<b>Beat the clock</b></span></div>` },
    { title: "Climb the ladder", text: `In Level Challenge, only Level 1 is open. Beat a level to unlock the next, stronger computer. There are ${LEVELS.length} levels in all!`,
      visual: `<div class="tut-ladder">${[0, 3, 7, 11, LEVELS.length - 1].map((n, k) => `<span style="--i:${k}">${LEVELS[n].icon}<b>L${n + 1}</b></span>`).join("")}</div>` },
  ];

  const tutorialModal = $("tutorialModal");
  let tutIndex = 0;

  function renderTutorial() {
    const t = TUTORIAL[tutIndex];
    $("tutStep").textContent = `STEP ${tutIndex + 1} OF ${TUTORIAL.length}`;
    $("tutStage").innerHTML = t.visual;
    $("tutTitle").textContent = t.title;
    $("tutText").textContent = t.text;
    $("tutDots").innerHTML = TUTORIAL.map((_, i) => `<i class="${i === tutIndex ? "on" : ""}"></i>`).join("");
    $("tutPrev").disabled = tutIndex === 0;
    $("tutNext").textContent = tutIndex === TUTORIAL.length - 1 ? "Let's play!" : "Next →";
  }

  function openTutorial() {
    tutIndex = 0;
    renderTutorial();
    tutorialModal.hidden = false;
    $("tutNext").focus();
  }

  const closeTutorial = () => closeModal(tutorialModal, () => {});

  function tutorialStep(dir) {
    if (dir > 0 && tutIndex === TUTORIAL.length - 1) { closeTutorial(); return; }
    tutIndex = Math.min(TUTORIAL.length - 1, Math.max(0, tutIndex + dir));
    renderTutorial();
  }

  document.addEventListener("keydown", e => {
    if (tutorialModal.hidden) return;
    if (e.key === "ArrowRight") tutorialStep(1);
    else if (e.key === "ArrowLeft") tutorialStep(-1);
    else if (e.key === "Escape") closeTutorial();
  });

  /* ---------- Rating & leaderboard (saved on this device) ---------- */

  const TIERS = [
    { name: "Bronze", icon: "🥉", min: 0 }, { name: "Silver", icon: "🥈", min: 800 }, { name: "Gold", icon: "🥇", min: 1100 },
    { name: "Platinum", icon: "💠", min: 1400 }, { name: "Diamond", icon: "💎", min: 1700 }, { name: "Legend", icon: "🔥", min: 2000 },
  ];
  const BOT_RATING = LEVELS.map((_, i) => 400 + i * 150); // 400 up to 2500, one per computer level
  const PROFILE_VERSION = 2; // v2: ratings start at 0 (older saves started at 600)
  const DEFAULT_PROFILE = { v: PROFILE_VERSION, name: "You", rating: 0, peak: 0, wins: 0, losses: 0, streak: 0, best: 0 };
  const tierOf = r => [...TIERS].reverse().find(t => r >= t.min);
  const esc = str => str.replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  const leaderboardModal = $("leaderboardModal");
  const confirmModal = $("confirmModal");

  function loadProfile() {
    try {
      const p = JSON.parse(localStorage.getItem("checkers.profile"));
      if (p && typeof p.rating === "number") {
        // An older save started at 600 points: start it again from 0 once, but keep the player's name.
        if (p.v !== PROFILE_VERSION) return { ...DEFAULT_PROFILE, name: typeof p.name === "string" ? p.name : DEFAULT_PROFILE.name };
        return { ...DEFAULT_PROFILE, ...p };
      }
    } catch { /* ignore */ }
    return { ...DEFAULT_PROFILE };
  }
  let profile = loadProfile();
  function saveProfile() {
    try { localStorage.setItem("checkers.profile", JSON.stringify(profile)); } catch { /* storage unavailable */ }
  }

  function renderRatingPill() {
    const t = tierOf(profile.rating);
    $("ratingPill").textContent = `${t.icon} ${t.name} · ${profile.rating}`;
  }

  // Elo against the computer's fixed rating. Only Level Challenge games are ranked.
  function applyRating(win, level) {
    const before = profile.rating;
    const expected = 1 / (1 + 10 ** ((BOT_RATING[level - 1] - before) / 400));
    let delta = Math.round(32 * ((win ? 1 : 0) - expected));
    delta = win ? Math.max(1, delta) : Math.min(-1, delta);
    profile.rating = Math.max(0, before + delta); // can't go below 0
    profile.peak = Math.max(profile.peak, profile.rating);
    if (win) { profile.wins++; profile.streak++; profile.best = Math.max(profile.best, profile.streak); }
    else { profile.losses++; profile.streak = 0; }
    saveProfile();
    renderRatingPill();
    return { before, after: profile.rating, delta: profile.rating - before };
  }

  function showRatingChange(r, win) {
    const was = tierOf(r.before), now = tierOf(r.after);
    $("ratingChange").innerHTML =
      `<strong class="delta ${r.delta > 0 ? "up" : r.delta < 0 ? "down" : ""}">${r.delta > 0 ? "+" : ""}${r.delta}</strong>` +
      `<span>Rating ${r.before} → ${r.after} · ${now.icon} ${now.name}</span>` +
      (now.min > was.min ? `<em>🎉 Promoted to ${now.icon} ${now.name}!</em>` : "") +
      (now.min < was.min ? `<em class="demo">Dropped to ${now.icon} ${now.name}</em>` : "") +
      (win && profile.streak >= 2 ? `<em>🔥 ${profile.streak} win streak</em>` : "");
    $("ratingChange").hidden = false;
  }

  function renderLeaderboard() {
    const tier = tierOf(profile.rating), next = TIERS.find(t => t.min > profile.rating);
    const games = profile.wins + profile.losses;
    $("lbBadge").textContent = tier.icon;
    $("lbTier").textContent = `${tier.name} tier`;
    $("lbRating").textContent = profile.rating;
    $("lbBarFill").style.width = `${next ? ((profile.rating - tier.min) / (next.min - tier.min)) * 100 : 100}%`;
    $("lbNext").textContent = next ? `${next.min - profile.rating} pts to ${next.icon} ${next.name}` : "Top tier reached";
    const rows = [{ me: true, name: profile.name.trim() || "You", rating: profile.rating, icon: tier.icon, tag: tier.name },
      ...LEVELS.map((L, i) => ({ name: `${L.name} Bot`, rating: BOT_RATING[i], icon: L.icon, tag: `Level ${i + 1}` }))]
      .sort((a, b) => b.rating - a.rating || b.me - a.me);
    $("lbList").innerHTML = rows.map((r, i) =>
      `<li class="${r.me ? "me" : ""}"><span class="lb-rank">${i + 1}</span><span class="lb-icon">${r.icon}</span>` +
      `<span class="lb-name">${esc(r.name)}${r.me ? " (you)" : ""}<small>${r.tag}</small></span><b>${r.rating}</b></li>`).join("");
    $("lbStats").innerHTML = [["Peak", profile.peak], ["Win rate", games ? `${Math.round((profile.wins / games) * 100)}%` : "–"],
      ["Streak", `🔥 ${profile.streak}`], ["Best", profile.best]].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join("");
  }

  function openLeaderboard() {
    renderLeaderboard();
    $("lbName").value = profile.name;
    leaderboardModal.hidden = false;
    // 16 rows now, so scroll the list to put the player's own row in view.
    const list = $("lbList"), me = list.querySelector(".me");
    if (me) list.scrollTop = me.offsetTop - (list.clientHeight - me.offsetHeight) / 2;
    $("lbClose").focus();
  }
  const closeLeaderboard = () => closeModal(leaderboardModal, () => {});

  $("lbName").addEventListener("input", e => { profile.name = e.target.value.slice(0, 14); saveProfile(); renderLeaderboard(); });
  $("lbClose").addEventListener("click", closeLeaderboard);
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !leaderboardModal.hidden) closeLeaderboard(); });
  renderRatingPill();

  /* ---------- Confirmation dialog (replaces the browser's confirm box) ---------- */

  let pendingConfirm = null;
  const rankedInProgress = () => started && !gameOver && settings.mode === "challenge" && state.moves > 0;

  function confirmDialog({ icon, eyebrow, title, text, ok, cancel }, onYes) {
    $("confirmIcon").textContent = icon;
    $("confirmEyebrow").textContent = eyebrow;
    $("confirmTitle").textContent = title;
    $("confirmText").textContent = text;
    $("confirmOk").textContent = ok;
    $("confirmCancel").textContent = cancel;
    pendingConfirm = onYes;
    confirmModal.hidden = false;
    $("confirmCancel").focus(); // the safe choice is focused by default
  }

  function answerConfirm(yes) {
    const action = pendingConfirm;
    pendingConfirm = null;
    closeModal(confirmModal, () => { if (yes && action) action(); });
  }

  $("confirmOk").addEventListener("click", () => answerConfirm(true));
  $("confirmCancel").addEventListener("click", () => answerConfirm(false));
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !confirmModal.hidden) answerConfirm(false); });

  /* ---------- Sound ---------- */

  let audioCtx = null;
  let muted = false;

  function getAudio() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }

  // A short crunch plus a low thud when a piece is captured.
  function playCaptureSound() {
    const ctx = muted ? null : getAudio();
    if (!ctx) return;
    const t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * 0.16);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1600;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.5, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    noise.connect(filter).connect(ng).connect(ctx.destination);
    noise.start(t);

    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(240, t);
    osc.frequency.exponentialRampToValueAtTime(55, t + 0.2);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.6, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    osc.connect(og).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.25);
  }

  function playBeep() {
    const ctx = muted ? null : getAudio();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.value = 880;
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.09);
  }

  /* ---------- Clocks ---------- */

  const clockEls = { red: $("redClock"), black: $("blackClock") };
  let clocks = { red: 0, black: 0 };
  let lastTick = 0;
  let clockTimer = null;

  function formatTime(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }

  function renderClocks() {
    for (const color of [RED, BLACK]) {
      const el = clockEls[color];
      el.textContent = formatTime(clocks[color]);
      el.classList.toggle("active", started && !gameOver && state.turn === color);
      el.classList.toggle("low", clocks[color] <= 30000);
    }
  }

  function tick() {
    const now = Date.now();
    const dt = now - lastTick;
    lastTick = now;
    if (gameOver || !started || !state || !tutorialModal.hidden || !leaderboardModal.hidden || !confirmModal.hidden) return; // paused while a help/leaderboard screen is open
    const color = state.turn;
    const before = Math.ceil(clocks[color] / 1000);
    clocks[color] -= dt;
    if (clocks[color] <= 0) {
      clocks[color] = 0;
      clearTimeout(aiTimer);
      aiThinking = false;
      endGame(other(color), `${name(color)} ran out of time.`);
      return;
    }
    const after = Math.ceil(clocks[color] / 1000);
    if (after < before && after <= 10 && !isComputerTurn()) playBeep();
    renderClocks();
  }

  function resetClocks() {
    const ms = settings.time * 1000;
    clocks = { red: ms, black: ms };
    clearInterval(clockTimer);
    lastTick = Date.now();
    clockTimer = setInterval(tick, 200);
  }

  /* ---------- Board & rules ---------- */

  function makeInitialBoard() {
    const board = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if ((r + c) % 2 !== 1) continue;
        if (r < 3) board[r][c] = { color: BLACK, king: false };
        else if (r > 4) board[r][c] = { color: RED, king: false };
      }
    }
    return board;
  }

  const freshState = () => ({ board: makeInitialBoard(), turn: RED, moves: 0, captures: 0 });
  // Pieces are never changed in place (a promotion swaps in a new king object), so copies can share them.
  const cloneBoard = b => b.map(row => row.slice());
  const cloneState = s => ({ board: cloneBoard(s.board), turn: s.turn, moves: s.moves, captures: s.captures });
  const inBounds = (r, c) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;
  const other = color => (color === RED ? BLACK : RED);
  const directions = p => (p.king ? [-1, 1] : p.color === RED ? [-1] : [1]);

  function movesForPiece(board, r, c) {
    const piece = board[r][c];
    if (!piece) return [];
    const moves = [];
    for (const dr of directions(piece)) {
      for (const dc of [-1, 1]) {
        const nr = r + dr, nc = c + dc;
        if (!inBounds(nr, nc)) continue;
        if (!board[nr][nc]) {
          moves.push({ from: [r, c], to: [nr, nc], capture: null });
        } else if (board[nr][nc].color !== piece.color) {
          const jr = r + dr * 2, jc = c + dc * 2;
          if (inBounds(jr, jc) && !board[jr][jc]) {
            moves.push({ from: [r, c], to: [jr, jc], capture: [nr, nc] });
          }
        }
      }
    }
    return moves;
  }

  // Mutates the board (but never a piece object). Returns true if the piece was promoted to king.
  function applyStep(board, move) {
    const [r, c] = move.from, [nr, nc] = move.to;
    const piece = board[r][c];
    board[nr][nc] = piece;
    board[r][c] = null;
    if (move.capture) board[move.capture[0]][move.capture[1]] = null;
    if (!piece.king && ((piece.color === RED && nr === 0) || (piece.color === BLACK && nr === SIZE - 1))) {
      board[nr][nc] = { color: piece.color, king: true };
      return true;
    }
    return false;
  }

  // Single-step moves for a color; captures are mandatory.
  function allLegalMoves(s, color = s.turn) {
    const normal = [], captures = [];
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const p = s.board[r][c];
        if (!p || p.color !== color) continue;
        for (const m of movesForPiece(s.board, r, c)) (m.capture ? captures : normal).push(m);
      }
    }
    return [...captures, ...normal]; // captures are optional
  }

  function refreshLegal() {
    legalMoves = forcedPiece
      ? movesForPiece(state.board, forcedPiece[0], forcedPiece[1]).filter(m => m.capture)
      : allLegalMoves(state);
  }

  const movesForSelected = (r, c) => legalMoves.filter(m => m.from[0] === r && m.from[1] === c);

  /* ---------- Game flow ---------- */

  function startNewGame() {
    clearTimeout(aiTimer);
    started = true;
    $("startModal").hidden = true;
    state = freshState();
    selected = null;
    history = [];
    gameOver = false;
    aiThinking = false;
    forcedPiece = null;
    showHints = false;
    modal.hidden = true;
    renderLadder();
    $("undoButton").disabled = settings.mode === "challenge";
    $("undoButton").title = settings.mode === "challenge" ? "Undo is off in ranked games" : "";
    updateFlipButton();
    if (settings.mode === "challenge") showLevelBanner();
    resetClocks();
    refreshLegal();
    render();
    updateStatus("Red's turn", "Select a red piece to move.");
  }

  function updateStatus(title, hint) {
    statusTitle.textContent = title;
    boardHint.textContent = hint;
    turnPill.textContent = gameOver ? "GAME OVER" : `${state.turn.toUpperCase()} TURN`;
    turnPill.className = `turn-pill ${state.turn === RED ? "red-pill" : "black-pill"}`;
    liveMessage.textContent = `${title}. ${hint}`;
  }

  const isComputerTurn = () => settings.mode !== "local" && state.turn === BLACK && !gameOver;

  // Two players share one device, so the board turns to face whoever is moving.
  // Otherwise it only turns when the Flip board button is pressed.
  const viewFlipped = () => (settings.mode === "local" && perspective ? state.turn === BLACK : flipped);

  function updateFlipButton() {
    const b = $("flipButton");
    if (settings.mode === "local") {
      b.textContent = `🔄 Turn view: ${perspective ? "on" : "off"}`;
      b.title = "When on, the board turns to face the player whose move it is";
      b.setAttribute("aria-pressed", String(perspective));
    } else {
      b.textContent = "⇅ Flip board";
      b.title = "";
      b.removeAttribute("aria-pressed");
    }
  }

  function renderCoordinates(flip) {
    const files = [...FILES], ranks = [8, 7, 6, 5, 4, 3, 2, 1];
    if (flip) { files.reverse(); ranks.reverse(); }
    const fileHtml = files.map(f => `<span>${f}</span>`).join("");
    const rankHtml = ranks.map(n => `<span>${n}</span>`).join("");
    document.querySelectorAll(".coordinate-top, .coordinate-bottom").forEach(el => (el.innerHTML = fileHtml));
    document.querySelectorAll(".coordinate-side").forEach(el => (el.innerHTML = rankHtml));
  }

  function render() {
    boardEl.innerHTML = "";
    const movable = new Set();
    if (showHints) legalMoves.forEach(m => movable.add(m.from.join(",")));
    const targets = selected ? movesForSelected(selected[0], selected[1]) : [];
    const view = viewFlipped();

    for (let vr = 0; vr < SIZE; vr++) {
      for (let vc = 0; vc < SIZE; vc++) {
        const r = view ? SIZE - 1 - vr : vr;
        const c = view ? SIZE - 1 - vc : vc;
        const dark = (r + c) % 2 === 1;
        const square = document.createElement("button");
        square.type = "button";
        square.className = `square ${dark ? "dark" : "light"}`;
        square.setAttribute("role", "gridcell");
        square.dataset.r = r;
        square.dataset.c = c;
        const label = `${FILES[c]}${SIZE - r}`;

        if (selected && selected[0] === r && selected[1] === c) square.classList.add("selected");
        if (movable.has(`${r},${c}`)) square.classList.add("movable");
        const target = targets.find(m => m.to[0] === r && m.to[1] === c);
        if (target) square.classList.add(target.capture ? "capture-target" : "legal");

        const piece = state.board[r][c];
        if (piece) {
          const el = document.createElement("span");
          el.className = `piece ${piece.color}${piece.king ? " king" : ""}`;
          if (lastLanded && lastLanded[0] === r && lastLanded[1] === c) el.classList.add("landed");
          square.appendChild(el);
          square.setAttribute("aria-label", `${piece.color}${piece.king ? " king" : ""} piece, ${label}`);
        } else {
          square.setAttribute("aria-label", `${label}${target ? ", legal destination" : ""}`);
        }
        if (!dark) square.tabIndex = -1;
        square.addEventListener("click", () => handleSquareClick(r, c));
        boardEl.appendChild(square);
      }
    }

    const flat = state.board.flat();
    redCountEl.textContent = flat.filter(p => p && p.color === RED).length;
    blackCountEl.textContent = flat.filter(p => p && p.color === BLACK).length;
    moveCountEl.textContent = state.moves;
    captureCountEl.textContent = state.captures;
    redRole.textContent = settings.mode === "challenge" ? `${profile.name.trim() || "You"} · ${profile.rating}` : "Player 1";
    blackRole.textContent = settings.mode === "local" ? "Player 2" : `${settings.mode === "challenge" ? "Level " + settings.level : "Computer"} · ${LEVELS[settings.level - 1].name}`;
    renderCoordinates(view);
    renderClocks();
    lastLanded = null;
    // The board spins to its new side when the view changes (e.g. after each two-player move).
    if (lastView !== null && lastView !== view) {
      const wrap = document.querySelector(".board-wrap");
      wrap.classList.remove("turning");
      void wrap.offsetWidth; // restart the animation
      wrap.classList.add("turning");
    }
    lastView = view;
  }

  function handleSquareClick(r, c) {
    getAudio();
    if (!started || gameOver || aiThinking || isComputerTurn() || (r + c) % 2 === 0) return;

    if (selected) {
      const move = movesForSelected(selected[0], selected[1]).find(m => m.to[0] === r && m.to[1] === c);
      if (move) { performMove(move); return; }
    }

    const who = name(state.turn);
    if (forcedPiece) {
      if (selected && selected[0] === r && selected[1] === c) { finishTurn(); return; }
      updateStatus(`${who} can keep capturing`, "Jump again with the highlighted piece, or click it to stop.");
      return;
    }

    const piece = state.board[r][c];
    if (piece && piece.color === state.turn) {
      if (selected && selected[0] === r && selected[1] === c) {
        selected = null;
        render();
        updateStatus(`${who}'s turn`, "Select one of your pieces.");
        return;
      }
      const available = movesForSelected(r, c);
      if (!available.length) {
        updateStatus(`${who}'s turn`, "That piece has no legal move. Choose another piece.");
        return;
      }
      selected = [r, c];
      render();
      updateStatus(`${who} selected`, available.some(m => m.capture)
        ? "Gold rings are captures, and they're optional. Green dots are normal moves."
        : "Choose a highlighted square to move.");
    } else {
      selected = null;
      render();
      updateStatus(`${who}'s turn`, "Select one of your pieces.");
    }
  }

  function performMove(move) {
    if (!forcedPiece) history.push(cloneState(state)), history.length > 100 && history.shift();
    const [nr, nc] = move.to;
    const promoted = applyStep(state.board, move);
    lastLanded = [nr, nc];
    if (move.capture) { state.captures++; playCaptureSound(); }
    selected = null;
    showHints = false;

    // Keep jumping with the same piece, unless it was just crowned (a crowning jump ends the turn).
    if (move.capture && !promoted) {
      const more = movesForPiece(state.board, nr, nc).filter(m => m.capture);
      if (more.length) {
        forcedPiece = [nr, nc];
        selected = [nr, nc];
        legalMoves = more;
        render();
        updateStatus(`${name(state.turn)} can keep capturing`,
          isComputerTurn() ? "The computer is continuing its capture." : "Jump again, or click your piece to stop here.");
        return;
      }
    }

    finishTurn();
  }

  function finishTurn() {
    forcedPiece = null;
    selected = null;
    state.moves++;
    state.turn = other(state.turn);
    refreshLegal();
    render();
    if (checkWinner()) return;

    updateStatus(`${name(state.turn)}'s turn`, `Select a ${state.turn} piece to move.`);
    if (isComputerTurn()) scheduleComputerMove();
  }

  function checkWinner() {
    // legalMoves already holds the new current player's options.
    if (legalMoves.length) return false;
    const remaining = state.board.flat().filter(p => p && p.color === state.turn).length;
    endGame(other(state.turn), remaining === 0
      ? "All opposing pieces have been captured."
      : "The other player has no legal moves.");
    return true;
  }

  function endGame(winner, text) {
    if (gameOver) return;
    gameOver = true;
    render();
    updateStatus(`${name(winner)} wins!`, "The match is complete.");
    resultTitle.textContent = `${name(winner)} wins!`;
    resultText.textContent = text;
    resultAction = "again";
    $("playAgainButton").textContent = "Play again";
    $("menuButton").hidden = settings.mode !== "challenge";
    $("resultBoard").hidden = settings.mode !== "challenge";
    $("ratingChange").hidden = true;
    if (settings.mode === "challenge") {
      const lvl = LEVELS[settings.level - 1];
      showRatingChange(applyRating(winner === RED, settings.level), winner === RED);
      if (winner === RED) { cleared = Math.max(cleared, settings.level); saveProgress(); renderLadder(); }
      if (winner === RED && settings.level < LEVELS.length) {
        resultTitle.textContent = `Level ${settings.level} cleared!`;
        resultText.textContent = `You beat ${lvl.name} and unlocked Level ${settings.level + 1}: ${LEVELS[settings.level].name}, a stronger opponent.`;
        resultAction = "next";
        $("playAgainButton").textContent = "Next level →";
      } else if (winner === RED) {
        resultTitle.textContent = "Champion!";
        resultText.textContent = `You beat all ${LEVELS.length} levels. Nobody can stop you now.`;
      } else {
        resultTitle.textContent = "Level failed";
        resultText.textContent = `${lvl.name} won this round. Ready for a rematch?`;
        resultAction = "retry";
        $("playAgainButton").textContent = "Retry level";
      }
    }
    modal.hidden = false;
    $("playAgainButton").focus();
  }

  /* ---------- Computer player ---------- */

  // Every full capture chain starting from one piece.
  function captureSequences(board, r, c) {
    const results = [];
    (function walk(b, pr, pc, path) {
      const jumps = movesForPiece(b, pr, pc).filter(m => m.capture);
      if (!jumps.length) { if (path.length) results.push({ steps: path }); return; }
      for (const j of jumps) {
        const nb = cloneBoard(b);
        const promoted = applyStep(nb, j);
        const next = [...path, j];
        if (promoted) results.push({ steps: next });
        else walk(nb, j.to[0], j.to[1], next);
      }
    })(board, r, c, []);
    return results;
  }

  // Complete turns (a whole jump chain counts as one turn).
  function allTurnMoves(s, color) {
    const caps = [], normal = [];
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const p = s.board[r][c];
        if (!p || p.color !== color) continue;
        caps.push(...captureSequences(s.board, r, c));
        for (const m of movesForPiece(s.board, r, c)) if (!m.capture) normal.push({ steps: [m] });
      }
    }
    return [...caps, ...normal]; // captures are optional
  }

  function applyTurn(s, seq) {
    const next = cloneState(s);
    for (const step of seq.steps) applyStep(next.board, step);
    next.turn = other(s.turn);
    return next;
  }

  // Score from Black's point of view (positive is good for the computer).
  // `pro` (Level 6 and up) adds: safe edge men, kings that stay central, and men backed up by a friend.
  function evaluate(s, pro) {
    let score = 0;
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const p = s.board[r][c];
        if (!p) continue;
        const advancement = p.king ? 0 : (p.color === BLACK ? r : SIZE - 1 - r) * 0.08;
        const back = !p.king && (p.color === BLACK ? r === 0 : r === SIZE - 1) ? 0.25 : 0;
        const center = r >= 2 && r <= 5 && c >= 2 && c <= 5 ? 0.1 : 0;
        let v = (p.king ? 5 : 3) + advancement + back + center;
        if (pro) {
          if (p.king) {
            v -= (Math.abs(r - 3.5) + Math.abs(c - 3.5)) * 0.04;            // kings belong in the middle
          } else {
            if (c === 0 || c === SIZE - 1) v += 0.05;                       // edge men can't be jumped
            const behind = r - (p.color === BLACK ? 1 : -1);                // the row behind this man
            for (const dc of [-1, 1]) {
              const f = inBounds(behind, c + dc) ? s.board[behind][c + dc] : null;
              if (f && f.color === p.color) v += 0.06;                      // a friend covers the back
            }
          }
        }
        score += (p.color === BLACK ? 1 : -1) * v;
      }
    }
    return score;
  }

  const TIMEOUT = Symbol("timeout");
  const EPS = 1e-6;
  let search = { deadline: Infinity, nodes: 0, pro: false };

  // Every capture turn available to a color.
  function captureTurns(s, color) {
    const out = [];
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const p = s.board[r][c];
        if (p && p.color === color) out.push(...captureSequences(s.board, r, c));
      }
    }
    return out;
  }

  // Keeps looking through capture trades past the search depth, so the computer
  // doesn't stop in the middle of an exchange. Captures are optional, so standing still is allowed.
  function settle(s, alpha, beta, extra) {
    const stand = evaluate(s, true);
    const caps = extra > 0 ? captureTurns(s, s.turn) : [];
    if (!caps.length) return stand;
    const maximizing = s.turn === BLACK;
    let best = stand;
    if (maximizing ? best >= beta : best <= alpha) return best;
    if (maximizing) alpha = Math.max(alpha, best); else beta = Math.min(beta, best);
    for (const move of caps) {
      const v = settle(applyTurn(s, move), alpha, beta, extra - 1);
      if (maximizing) { best = Math.max(best, v); alpha = Math.max(alpha, best); }
      else { best = Math.min(best, v); beta = Math.min(beta, best); }
      if (beta <= alpha) break;
    }
    return best;
  }

  function minimax(s, depth, alpha, beta) {
    if ((++search.nodes & 255) === 0 && Date.now() > search.deadline) throw TIMEOUT;
    const moves = allTurnMoves(s, s.turn);
    if (!moves.length) return s.turn === BLACK ? -1000 - depth : 1000 + depth;
    if (depth === 0) return search.pro ? settle(s, alpha, beta, 4) : evaluate(s, false);
    const maximizing = s.turn === BLACK;
    let best = maximizing ? -Infinity : Infinity;
    for (const move of moves) {
      const v = minimax(applyTurn(s, move), depth - 1, alpha, beta);
      if (maximizing) { best = Math.max(best, v); alpha = Math.max(alpha, best); }
      else { best = Math.min(best, v); beta = Math.min(beta, best); }
      if (beta <= alpha) break;
    }
    return best;
  }

  // Looks 1 turn ahead, then 2, then 3 ... until it reaches the level's depth or runs out of
  // thinking time, and plays the best move from the last depth it fully finished.
  function chooseComputerMove(s, level) {
    const moves = allTurnMoves(s, BLACK);
    if (!moves.length) return null;
    const { depth, blunder, ms = Infinity, pro = false } = LEVELS[level - 1];
    if (!depth || Math.random() < blunder) return moves[Math.floor(Math.random() * moves.length)];
    search = { deadline: Date.now() + ms, nodes: 0, pro };
    let order = moves, best = [moves[0]];
    for (let d = 1; d <= depth; d++) {
      let bestScore = -Infinity, found = [];
      try {
        for (const move of order) {
          const score = minimax(applyTurn(s, move), d - 1, bestScore - EPS, Infinity);
          if (score > bestScore + EPS) { bestScore = score; found = [move]; }
          else if (score >= bestScore - EPS) found.push(move);
        }
      } catch (e) {
        if (e === TIMEOUT) break; // out of time: keep the last finished depth
        throw e;
      }
      best = found;
      order = [...found, ...order.filter(m => !found.includes(m))]; // try the best moves first next time
      if (Math.abs(bestScore) >= 1000) break; // a forced win (or loss) is already clear
    }
    return best[Math.floor(Math.random() * best.length)];
  }

  function scheduleComputerMove() {
    aiThinking = true;
    updateStatus("Computer is thinking…", "The computer is choosing a move.");
    aiTimer = setTimeout(() => {
      tick();                                   // settle the clocks before the search blocks the page
      if (gameOver) return;
      const seq = chooseComputerMove(state, settings.level);
      tick();                                   // the thinking time comes off the computer's clock, not the player's
      if (!seq || gameOver) { aiThinking = false; return; }
      playAISteps(seq.steps, 0);
    }, 350);
  }

  function playAISteps(steps, i) {
    performMove(steps[i]);
    if (i + 1 < steps.length && !gameOver) {
      aiTimer = setTimeout(() => playAISteps(steps, i + 1), 400);
    } else {
      aiThinking = false;
    }
  }

  /* ---------- Controls ---------- */

  function undoMove() {
    if (settings.mode === "challenge" || !history.length || aiThinking || clocks.red <= 0 || clocks.black <= 0) return; // no undo in ranked games
    state = history.pop();
    // Against the computer, also take back the player's own move so it's their turn again.
    if (settings.mode !== "local" && state.turn === BLACK && history.length) state = history.pop();
    selected = null;
    forcedPiece = null;
    showHints = false;
    gameOver = false;
    modal.hidden = true;
    refreshLegal();
    render();
    updateStatus(`${name(state.turn)}'s turn`, "Last move undone.");
  }

  function toggleHints() {
    if (gameOver || aiThinking || isComputerTurn()) return;
    showHints = !showHints;
    render();
    updateStatus(showHints ? "Movable pieces highlighted" : `${name(state.turn)}'s turn`,
      showHints
        ? "Select a highlighted piece to see where it can go."
        : "Select one of your pieces.");
  }

  /* ---------- Start screen ---------- */

  const startModal = $("startModal");
  const welcomeModal = $("welcomeModal");
  const modeInputs = document.querySelectorAll('input[name="startMode"]');
  const chosenMode = () => document.querySelector('input[name="startMode"]:checked').value;

  // Level picker: levels you haven't unlocked yet are locked.
  function renderLevelPicker(note) {
    $("levelGrid").innerHTML = LEVELS.map((L, i) => {
      const n = i + 1, locked = n > cleared + 1, done = n <= cleared;
      return `<button type="button" role="radio" aria-checked="${n === pickedLevel}" data-level="${n}" class="level-btn${n === pickedLevel ? " selected" : ""}${locked ? " locked" : ""}" aria-disabled="${locked}" aria-label="Level ${n}, ${L.name}${locked ? ", locked" : done ? ", cleared" : ""}"><span class="lv-icon">${locked ? "🔒" : L.icon}</span><b>L${n}</b>${done ? "<i>✓</i>" : ""}</button>`;
    }).join("");
    const L = LEVELS[pickedLevel - 1];
    $("levelCaption").textContent = note || `${L.icon} Level ${pickedLevel} · ${L.name} (rated ${BOT_RATING[pickedLevel - 1]})` +
      (pickedLevel <= cleared ? " — cleared, play it again" : pickedLevel < LEVELS.length ? ` — beat it to unlock Level ${pickedLevel + 1}` : " — beat it to become Champion");
    $("resetProgress").hidden = cleared === 0;
  }

  function syncSetup() {
    $("levelPicker").hidden = chosenMode() !== "challenge";
    renderLevelPicker();
  }

  $("levelGrid").addEventListener("click", e => {
    const btn = e.target.closest(".level-btn");
    if (!btn) return;
    const n = Number(btn.dataset.level);
    if (n > cleared + 1) {
      renderLevelPicker(`🔒 Beat Level ${n - 1} to unlock this one.`);
      const locked = $("levelGrid").querySelector(`[data-level="${n}"]`);
      locked.classList.add("shake");
      locked.addEventListener("animationend", () => locked.classList.remove("shake"));
      return;
    }
    pickedLevel = n;
    renderLevelPicker();
  });
  $("resetProgress").addEventListener("click", () => confirmDialog({
    icon: "🗑️", eyebrow: "LEVEL CHALLENGE", title: "Reset progress?",
    text: `Levels 2 to ${LEVELS.length} will lock again. Your rating and stats are kept.`, ok: "Reset", cancel: "Cancel",
  }, () => {
    cleared = 0;
    saveProgress();
    pickedLevel = 1;
    renderLevelPicker();
  }));

  // Shows a fresh board behind the start screen. Nothing runs until the player presses Start.
  function openSetup(welcome = false) {
    clearTimeout(aiTimer);
    clearInterval(clockTimer);
    started = false;
    aiThinking = false;
    gameOver = false;
    forcedPiece = null;
    selected = null;
    showHints = false;
    history = [];
    modal.hidden = true;
    state = freshState();
    const ms = settings.time * 1000;
    clocks = { red: ms, black: ms };
    refreshLegal();
    render();
    updateStatus("Choose a game mode", "Pick how you want to play to begin.");
    document.querySelector(`input[name="startMode"][value="${settings.mode}"]`).checked = true;
    pickedLevel = Math.min(cleared + 1, LEVELS.length);
    syncSetup();
    renderLadder();
    welcomeModal.hidden = !welcome;
    startModal.hidden = welcome;
    (welcome ? $("playButton") : document.querySelector('input[name="startMode"]:checked')).focus();
  }

  modeInputs.forEach(input => input.addEventListener("change", syncSetup));
  $("startGameButton").addEventListener("click", () => {
    settings.mode = chosenMode();
    settings.level = settings.mode === "challenge" ? pickedLevel : 1; // Practice always uses the easiest computer
    getAudio();
    closeModal(startModal, startNewGame);
  });
  $("playButton").addEventListener("click", () => {
    getAudio();
    closeModal(welcomeModal, () => {
      startModal.hidden = false;
      document.querySelector('input[name="startMode"]:checked').focus();
    });
  });

  $("newGameTop").addEventListener("click", () => {
    // Leaving a ranked match that has started counts as a loss.
    if (!rankedInProgress()) { openSetup(); return; }
    confirmDialog({
      icon: "⚠️", eyebrow: "RANKED MATCH", title: "Leave this match?",
      text: "Leaving a ranked match counts as a loss and costs you rating.", ok: "Leave match", cancel: "Keep playing",
    }, () => {
      if (rankedInProgress()) applyRating(false, settings.level);
      openSetup();
    });
  });
  $("playAgainButton").addEventListener("click", () => {
    if (resultAction === "again") { openSetup(); return; }
    if (resultAction === "next") settings.level++;
    closeModal(modal, startNewGame);
  });
  $("menuButton").addEventListener("click", () => closeModal(modal, () => openSetup()));
  $("tutorialTop").addEventListener("click", openTutorial);
  $("ratingPill").addEventListener("click", openLeaderboard);
  $("leaderboardButton").addEventListener("click", openLeaderboard);
  $("resultBoard").addEventListener("click", openLeaderboard);
  $("tutorialButton").addEventListener("click", openTutorial);
  $("tutPrev").addEventListener("click", () => tutorialStep(-1));
  $("tutNext").addEventListener("click", () => tutorialStep(1));
  $("tutSkip").addEventListener("click", closeTutorial);
  $("undoButton").addEventListener("click", undoMove);
  $("hintButton").addEventListener("click", toggleHints);
  $("flipButton").addEventListener("click", () => {
    if (settings.mode === "local") {
      flipped = viewFlipped(); // switching the turn view off keeps the board as it is now
      perspective = !perspective;
      updateFlipButton();
    } else {
      flipped = !flipped;
    }
    render();
  });
  $("soundButton").addEventListener("click", e => {
    muted = !muted;
    e.currentTarget.textContent = muted ? "🔇 Sound off" : "🔊 Sound on";
    e.currentTarget.setAttribute("aria-pressed", String(muted));
    if (!muted) getAudio();
  });

  openSetup(true);
})();