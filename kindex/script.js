(() => {
  const bigBtn = document.getElementById("bigBtn");
  const scoreEl = document.getElementById("score");
  const streakEl = document.getElementById("streak");
  const moodEl = document.getElementById("mood");
  const chaosFill = document.getElementById("chaosFill");
  const subtitle = document.getElementById("subtitle");
  const logEl = document.getElementById("log");
  const toast = document.getElementById("toast");
  const wrap = document.getElementById("wrap");

  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlayTitle");
  const overlayMsg = document.getElementById("overlayMsg");
  const overlayBtn = document.getElementById("overlayBtn");

  // ---- Tuning (progress speed) ----
  const SPEED = 20;

  let startedAt = null;

  // Real vs displayed (lies happen later, but now it's more playful)
  let realScore = 0;
  let displayScore = 0;

  let streak = 0;
  let chaos = 0; // 0..100
  let winShown = false;

  let inputFrozenUntil = 0;
  let avoidMouse = false;

  // ---- Fake Error System (looks like you lost, but you didn't) ----
  let fakeErrorActive = false;
  const fakeErrors = [
    { title: "YOU LOST", msg: "Better luck next time." },
    { title: "ERROR", msg: "SCORE CORRUPTED" },
    { title: "CONNECTION LOST", msg: "Reconnecting to button..." },
    { title: "SAVE FILE DAMAGED", msg: "Attempting recovery..." },
    { title: "UNRECOVERABLE ERROR", msg: "Just kidding." },
  ];

  // ---- Rock Paper Scissors Gate (best 2 out of 3) ----
  let rpsActive = false;
  let rpsPlayerWins = 0;
  let rpsCpuWins = 0;
  const RPS_CHOICES = ["Rock", "Paper", "Scissors"];

  // RPS penalties (tweak these if you want)
  const RPS_ROUND_PENALTY_MIN = 2;
  const RPS_ROUND_PENALTY_MAX = 5;
  const RPS_MATCH_PENALTY_MIN = 6;
  const RPS_MATCH_PENALTY_MAX = 12;

  // --- Audio (Web Audio) ---
  let audioCtx = null;

  function ensureAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
  }

  function playTone(freq, durMs, type = "sine", gain = 0.06) {
    if (!audioCtx) return;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type;
    o.frequency.value = freq;

    const t0 = audioCtx.currentTime;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + durMs / 1000);

    o.connect(g);
    g.connect(audioCtx.destination);

    o.start(t0);
    o.stop(t0 + durMs / 1000 + 0.02);
  }

  function clickSound() {
    ensureAudio();
    const pick = Math.random();
    if (pick < 0.33) playTone(440 + Math.random() * 120, 70, "triangle", 0.05);
    else if (pick < 0.66) playTone(260 + Math.random() * 80, 90, "sine", 0.06);
    else playTone(520 + Math.random() * 180, 55, "square", 0.03);
  }

  function goodSound() {
    ensureAudio();
    playTone(523.25, 70, "sine", 0.05);
    setTimeout(() => playTone(659.25, 90, "sine", 0.05), 70);
  }

  function badSound() {
    ensureAudio();
    playTone(220, 120, "sawtooth", 0.04);
    setTimeout(() => playTone(196, 140, "sawtooth", 0.04), 90);
  }

  function winSound() {
    ensureAudio();
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => setTimeout(() => playTone(f, 110, "triangle", 0.06), i * 90));
  }

  function chaosSound() {
    ensureAudio();
    const freqs = [111, 222, 333, 444, 666, 777];
    const f = freqs[Math.floor(Math.random() * freqs.length)];
    playTone(f, 80, ["square", "sine", "triangle"][Math.floor(Math.random() * 3)], 0.04);
  }

  // --- Time / phases ---
  function now() { return Date.now(); }
  function elapsedSec() {
    if (!startedAt) return 0;
    return ((now() - startedAt) / 1000) * SPEED;
  }
  function minuteMark() { return elapsedSec() / 60; }

  function phase() {
    const m = minuteMark();
    if (m < 5) return "warmup";
    if (m < 15) return "sassy";
    if (m < 25) return "drifty";
    if (m < 35) return "gremlin";
    if (m < 45) return "fakeWin";
    if (m < 55) return "party";
    return "final";
  }

  // --- UI helpers ---
  function setToast(text) {
    toast.textContent = text;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 900);
  }

  function setOverlay(on, title = "", msg = "") {
    if (on) {
      overlayTitle.textContent = title;
      overlayMsg.textContent = msg;
      overlay.classList.remove("hidden");
      overlay.setAttribute("aria-hidden", "false");
    } else {
      overlay.classList.add("hidden");
      overlay.setAttribute("aria-hidden", "true");
    }
  }

  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function randInt(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
  function chance(p) { return Math.random() < p; }

  function updateMood() {
    if (chaos < 20) moodEl.textContent = "🙂";
    else if (chaos < 45) moodEl.textContent = "😏";
    else if (chaos < 70) moodEl.textContent = "😵‍💫";
    else moodEl.textContent = "👹";
  }

  function setChaos(amount) {
    chaos = clamp(amount, 0, 100);
    chaosFill.style.width = `${chaos}%`;
    updateMood();
  }

  function log(text) {
    logEl.textContent = text;
  }

  // --- Rock Paper Scissors logic ---
  function rpsResult(player, cpu) {
    if (player === cpu) return "tie";
    if (
      (player === "Rock" && cpu === "Scissors") ||
      (player === "Paper" && cpu === "Rock") ||
      (player === "Scissors" && cpu === "Paper")
    ) return "win";
    return "lose";
  }

  function startRPSGate() {
    if (rpsActive) return;
    rpsActive = true;

    rpsPlayerWins = 0;
    rpsCpuWins = 0;

    bigBtn.disabled = true;

    setOverlay(true, "ROCK · PAPER · SCISSORS", "Win 2 out of 3 to continue");

    overlayBtn.textContent = "ROCK";
    overlayBtn.dataset.choice = "Rock";
  }

  function handleRPSPick() {
    const player = overlayBtn.dataset.choice;
    const cpu = RPS_CHOICES[randInt(0, 2)];
    const result = rpsResult(player, cpu);

    if (result === "win") {
      rpsPlayerWins++;
      goodSound();
    } else if (result === "lose") {
      rpsCpuWins++;

      // ✅ Lose points for losing a round
      const roundPenalty = randInt(RPS_ROUND_PENALTY_MIN, RPS_ROUND_PENALTY_MAX);
      addScore(-roundPenalty, true);
      setToast(`RPS penalty: -${roundPenalty}`);

      badSound();
    } else {
      chaosSound();
    }

    overlayMsg.textContent =
      `You: ${player} | CPU: ${cpu}\n` +
      `You ${rpsPlayerWins} – ${rpsCpuWins} CPU\n` +
      `Win 2 out of 3 to continue`;

    const next = RPS_CHOICES[(RPS_CHOICES.indexOf(player) + 1) % 3];
    overlayBtn.textContent = next.toUpperCase();
    overlayBtn.dataset.choice = next;

    if (rpsPlayerWins >= 2) {
      setTimeout(() => {
        setOverlay(false);
        rpsActive = false;
        bigBtn.disabled = false;
        setToast("You may continue.");
        goodSound();
      }, 650);
    }

    if (rpsCpuWins >= 2) {
      setTimeout(() => {
        // ✅ Extra penalty for losing the match
        const matchPenalty = randInt(RPS_MATCH_PENALTY_MIN, RPS_MATCH_PENALTY_MAX);
        addScore(-matchPenalty, true);
        setToast(`Match loss: -${matchPenalty}`);

        // Reset the match and keep them blocked until they win
        rpsPlayerWins = 0;
        rpsCpuWins = 0;

        setOverlay(true, "YOU LOST", "Rock Paper Scissors says no.\nTry again.");
        overlayBtn.textContent = "ROCK";
        overlayBtn.dataset.choice = "Rock";
        badSound();
      }, 650);
    }
  }

  // --- Fake error (looks like loss) ---
  function triggerFakeError() {
    if (fakeErrorActive || rpsActive) return;
    fakeErrorActive = true;

    const err = fakeErrors[randInt(0, fakeErrors.length - 1)];

    const prevBg = document.body.style.background;
    const oldDisplay = scoreEl.textContent;

    document.body.style.background = "#5b0000";
    wrap.classList.add("shake");
    bigBtn.disabled = true;

    setOverlay(true, err.title, err.msg);
    badSound();

    scoreEl.textContent = "0";

    setTimeout(() => {
      overlayTitle.textContent = "RECOVERING…";
      overlayMsg.textContent = "Please do not unplug the button.";
      chaosSound();
    }, 850);

    setTimeout(() => {
      setOverlay(false);
      wrap.classList.remove("shake");
      document.body.style.background = prevBg;

      scoreEl.textContent = oldDisplay;

      bigBtn.disabled = false;
      setToast("Error resolved.");
      fakeErrorActive = false;
    }, 2000);
  }

  // --- Game logic ---
  const buttonPhrases = [
    "CLICK TO WIN", "CLICK TO VIBE", "FREE POINTS", "DO NOT CLICK",
    "TRUST ME", "BET YOU WON'T", "GAMBLE", "HONEST BUTTON",
    "SUPER LEGIT", "ABSOLUTELY SAFE", "MORE CHAOS", "NORMAL"
  ];

  const subtitlePhrases = [
    "Totally normal button. Probably.",
    "If it says 'DON'T', it might mean 'DO'.",
    "This game is certified suspicious.",
    "Your clicks are being judged (lovingly).",
    "Welcome to the vibe economy.",
  ];

  function maybeSwapTexts() {
    const p = phase();
    if (p === "warmup") return;

    if (chance(p === "party" ? 0.25 : 0.12)) {
      bigBtn.textContent = buttonPhrases[randInt(0, buttonPhrases.length - 1)];
    }
    if (chance(0.08)) {
      subtitle.textContent = subtitlePhrases[randInt(0, subtitlePhrases.length - 1)];
    }
  }

  function maybeMoveButton(mouseX, mouseY) {
    if (!avoidMouse || fakeErrorActive || rpsActive) return;

    const rect = bigBtn.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    const dist = Math.hypot(mouseX - cx, mouseY - cy);
    if (dist < 170 && chance(0.6)) {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const pad = 18;

      const x = randInt(pad, Math.max(pad, vw - rect.width - pad));
      const y = randInt(90, Math.max(90, vh - rect.height - pad));

      bigBtn.style.position = "fixed";
      bigBtn.style.left = `${x}px`;
      bigBtn.style.top = `${y}px`;
      chaosSound();
    }
  }

  function freezeInput(ms) {
    inputFrozenUntil = now() + ms;
    bigBtn.disabled = true;
    setTimeout(() => {
      if (!fakeErrorActive && !rpsActive) bigBtn.disabled = false;
    }, ms);
  }

  function addScore(delta, showLie = false) {
    realScore += delta;

    const p = phase();
    let shown = realScore;

    if (showLie) shown = realScore + randInt(-8, 8);
    else if (p === "drifty") {
      if (chance(0.25)) shown = realScore + randInt(-3, 3);
    } else if (p === "gremlin" || p === "party" || p === "final") {
      if (chance(0.45)) shown = realScore + randInt(-10, 10);
    }

    displayScore = shown;
    scoreEl.textContent = String(displayScore);
  }

  function step() {
    if (!startedAt) return;
    if (fakeErrorActive || rpsActive) return;

    const p = phase();

    if (p === "warmup") setChaos(chaos + 0.05);
    if (p === "sassy") setChaos(chaos + 0.10);
    if (p === "drifty") setChaos(chaos + 0.16);
    if (p === "gremlin") setChaos(chaos + 0.22);
    if (p === "fakeWin") setChaos(chaos + 0.18);
    if (p === "party") setChaos(chaos + 0.25);
    if (p === "final") setChaos(chaos + 0.20);

    if (p === "party" || p === "final") {
      if (chance(0.12)) {
        const h = randInt(0, 359);
        const s = randInt(35, 95);
        const l = randInt(10, 25);
        document.body.style.background = `hsl(${h} ${s}% ${l}%)`;
      }
    }

    if (p === "party" || p === "final") {
      if (chance(0.25)) wrap.classList.add("shake");
      else wrap.classList.remove("shake");
    } else {
      wrap.classList.remove("shake");
    }

    avoidMouse = (p === "party" || p === "final");

    if (chance(0.18)) {
      const lines = {
        warmup: ["Button warming up…", "Calibrating honesty…", "Loading trust…"],
        sassy: ["That click had aura.", "Impressive. Concerning.", "Big click energy."],
        drifty: ["Cause and effect are optional.", "Time is fake. Keep clicking.", "The score is shy."],
        gremlin: ["Gremlin mode engaged.", "The button is learning.", "Your clicks taste like fear (jk)."],
        fakeWin: ["Victory is complicated.", "Congratulations (pending audit).", "We’re checking your vibe score."],
        party: ["Party time. Everyone lies.", "Chaos is a feature.", "Your mouse is too confident."],
        final: ["Final form unlocked.", "Reality is buffering…", "Please clap."],
      };
      const arr = lines[p] || ["..."];
      log(arr[randInt(0, arr.length - 1)]);
    }

    // Trigger RPS gate during chaos phases
    if (!rpsActive && (p === "party" || p === "final") && Math.random() < 0.006) {
      startRPSGate();
      return;
    }

    // Random fake error (late game only)
    if (!fakeErrorActive && (p === "gremlin" || p === "party" || p === "final") && Math.random() < 0.01) {
      triggerFakeError();
      return;
    }

    if (!winShown && (p === "fakeWin" || p === "party" || p === "final") && realScore >= 30) {
      winShown = true;
      setOverlay(true, "YOU WIN", "This seems… suspiciously easy.");
      winSound();

      freezeInput(900);
      setTimeout(() => {
        overlayTitle.textContent = "JUST KIDDING";
        overlayMsg.textContent = "Winning has a small processing fee.";
        badSound();
      }, 900);

      setTimeout(() => {
        setOverlay(false);
        const fee = randInt(5, 12);
        addScore(-fee, true);
        setToast(`Processing fee: -${fee}`);
      }, 1850);
    }

    if (chance(0.06) && (p === "gremlin" || p === "party" || p === "final")) {
      const event = randInt(1, 4);
      if (event === 1) {
        freezeInput(randInt(450, 1200));
        setToast("Freeze! (for fun)");
        chaosSound();
      } else if (event === 2) {
        const bonus = randInt(2, 6);
        addScore(bonus, chance(0.4));
        setToast(`Mystery bonus +${bonus}`);
        goodSound();
      } else if (event === 3) {
        const prank = randInt(2, 7);
        addScore(-prank, chance(0.4));
        setToast(`Prank tax -${prank}`);
        badSound();
      } else {
        bigBtn.textContent = "HONEST BUTTON";
        subtitle.textContent = "This statement has not been verified.";
        chaosSound();
      }
    }

    if (!avoidMouse) {
      bigBtn.style.position = "";
      bigBtn.style.left = "";
      bigBtn.style.top = "";
    }
  }

  function onClick() {
    ensureAudio();
    clickSound();

    if (!startedAt) startedAt = now();
    if (fakeErrorActive || rpsActive) return;
    if (now() < inputFrozenUntil) return;

    const p = phase();

    if ((p === "party" || p === "final") && Math.random() < 0.05) {
      triggerFakeError();
      return;
    }

    streak++;
    streakEl.textContent = String(streak);

    let delta = 0;

    if (p === "warmup") {
      delta = 1;
      log("Nice. Normal. Probably.");
      if (chance(0.2)) goodSound();
    } else if (p === "sassy") {
      delta = chance(0.75) ? randInt(1, 3) : -1;
      log("Good choice. (Officially.)");
      if (delta > 0) goodSound(); else badSound();
    } else if (p === "drifty") {
      const delayed = chance(0.5);
      delta = chance(0.6) ? randInt(1, 5) : -randInt(1, 4);
      log(delayed ? "Your points are arriving… later." : "Points delivered instantly-ish.");
      if (delayed) {
        const d = randInt(250, 1100);
        setTimeout(() => {
          if (!fakeErrorActive && !rpsActive) addScore(delta, false);
        }, d);
        if (chance(0.25)) chaosSound();
        maybeSwapTexts();
        return;
      }
      if (delta > 0) goodSound(); else badSound();
    } else if (p === "gremlin") {
      if (chance(0.15)) {
        freezeInput(randInt(350, 900));
        setToast("Button needs a snack.");
      }
      delta = chance(0.55) ? randInt(2, 7) : -randInt(1, 6);
      log("Gremlin verdict: acceptable.");
      if (delta > 0) goodSound(); else badSound();
    } else if (p === "fakeWin") {
      delta = chance(0.75) ? randInt(2, 6) : randInt(-2, 2);
      log("Almost there. Maybe. Allegedly.");
      if (delta >= 0) goodSound(); else badSound();
    } else if (p === "party") {
      delta = chance(0.65) ? randInt(1, 10) : -randInt(1, 8);
      log("Party rules: yes.");
      if (chance(0.35)) chaosSound();
      if (delta > 0) goodSound(); else badSound();
    } else {
      delta = chance(0.6) ? randInt(2, 12) : -randInt(1, 10);
      log("Final form: button has opinions.");
      if (chance(0.55)) chaosSound();
      if (delta > 0) goodSound(); else badSound();
    }

    const lieNow = (phase() === "party" || phase() === "final") && chance(0.35);
    addScore(delta, lieNow);

    if (delta > 0) setChaos(chaos + 0.8);
    else setChaos(chaos + 1.4);

    if (streak % 10 === 0) {
      const bonus = randInt(3, 8);
      addScore(bonus, chance(0.5));
      setToast(`Streak bonus +${bonus}`);
      winSound();
    }

    maybeSwapTexts();
  }

  function onMouseMove(e) {
    if (!startedAt) return;
    if (fakeErrorActive || rpsActive) return;
    maybeMoveButton(e.clientX, e.clientY);
  }

  // Overlay button: RPS uses overlay button; otherwise it's "Continue"
  overlayBtn.onclick = () => {
    ensureAudio();
    clickSound();

    if (rpsActive) {
      handleRPSPick();
      return;
    }

    setOverlay(false);
    setToast("Continuing was brave.");
  };

  bigBtn.addEventListener("click", onClick);
  window.addEventListener("mousemove", onMouseMove);

  log("Click the button. It’s fine. 🙂");
  setChaos(0);

  setInterval(step, 140);
})();
