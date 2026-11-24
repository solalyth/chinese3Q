(() => {
  const STORAGE_KEY = "chinese3Q_schedule_v1";
  const MODE_KEY = "chinese3Q_mode_v1";

  const state = {
    words: [],
    mode: localStorage.getItem(MODE_KEY) || "pinyin-to-hanzi",
    schedule: loadSchedule(),
    currentIndex: null,
    isFlipped: false,
    countdownTimer: null,
  };

  const els = {
    modeBtns: document.querySelectorAll(".mode-btn"),
    statusText: document.getElementById("status-text"),
    resetBtn: document.getElementById("reset-btn"),
    card: document.getElementById("card"),
    frontLabel: document.getElementById("front-label"),
    frontMain: document.getElementById("front-main"),
    backQuestion: document.getElementById("back-question"),
    backPrimary: document.getElementById("back-primary"),
    backMeaning: document.getElementById("back-meaning"),
    waitingPanel: document.getElementById("waiting-panel"),
    waitingCountdown: document.getElementById("waiting-countdown"),
    forceNextBtn: document.getElementById("force-next-btn"),
    btn1Min: document.getElementById("btn-1min"),
    btn5Min: document.getElementById("btn-5min"),
  };

  function loadSchedule() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  function saveSchedule() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.schedule));
    } catch {
      // Ignore storage quota errors
    }
  }

  function cardKey(mode, word) {
    return `${mode}:${word.hanzi}:${word.pinyin}`;
  }

  function getDueIndices(now = Date.now()) {
    const due = [];
    state.words.forEach((word, idx) => {
      const dueAt = state.schedule[cardKey(state.mode, word)] || 0;
      if (dueAt <= now) {
        due.push(idx);
      }
    });
    return due;
  }

  function getNextDueTime() {
    let minTime = Infinity;
    state.words.forEach((word) => {
      const dueAt = state.schedule[cardKey(state.mode, word)] || 0;
      if (dueAt > Date.now() && dueAt < minTime) {
        minTime = dueAt;
      }
    });
    return minTime === Infinity ? null : minTime;
  }

  function updateStatus() {
    const total = state.words.length;
    const dueCount = getDueIndices().length;
    els.statusText.textContent = `出題可能 ${dueCount} / ${total} 語`;
  }

  function clearCountdown() {
    if (state.countdownTimer) {
      clearInterval(state.countdownTimer);
      state.countdownTimer = null;
    }
  }

  function setFlipped(flipped) {
    state.isFlipped = flipped;
    els.card.classList.toggle("is-flipped", flipped);
    els.btn1Min.disabled = !flipped || state.currentIndex === null;
    els.btn5Min.disabled = !flipped || state.currentIndex === null;
  }

  function renderCard(index) {
    const word = state.words[index];
    state.currentIndex = index;

    els.waitingPanel.classList.add("is-hidden");
    els.card.classList.remove("is-hidden");
    setFlipped(false);

    if (state.mode === "pinyin-to-hanzi") {
      els.frontLabel.textContent = "ピンイン";
      els.frontMain.textContent = word.pinyin;
      els.frontMain.classList.remove("is-hanzi");

      els.backQuestion.textContent = word.pinyin;
      els.backPrimary.textContent = word.hanzi;
      els.backPrimary.classList.add("is-hanzi");
      els.backMeaning.textContent = word.meaning;
    } else {
      els.frontLabel.textContent = "漢字";
      els.frontMain.textContent = word.hanzi;
      els.frontMain.classList.add("is-hanzi");

      els.backQuestion.textContent = word.hanzi;
      els.backPrimary.textContent = word.pinyin;
      els.backPrimary.classList.remove("is-hanzi");
      els.backMeaning.textContent = word.meaning;
    }

    updateStatus();
  }

  function showWaiting() {
    state.currentIndex = null;
    setFlipped(false);
    els.card.classList.add("is-hidden");
    els.waitingPanel.classList.remove("is-hidden");
    updateStatus();

    clearCountdown();
    const tick = () => {
      const nextDue = getNextDueTime();
      if (!nextDue) {
        clearCountdown();
        pickNextCard();
        return;
      }
      const diffSec = Math.max(0, Math.ceil((nextDue - Date.now()) / 1000));
      if (diffSec <= 0) {
        clearCountdown();
        pickNextCard();
        return;
      }
      const min = Math.floor(diffSec / 60);
      const sec = diffSec % 60;
      els.waitingCountdown.textContent =
        min > 0
          ? `次のカードまであと ${min} 分 ${sec} 秒`
          : `次のカードまであと ${sec} 秒`;
    };

    tick();
    state.countdownTimer = setInterval(tick, 1000);
  }

  function pickNextCard({ force = false } = {}) {
    clearCountdown();
    if (state.words.length === 0) return;

    const due = getDueIndices();
    let pool = due;

    if (pool.length === 0) {
      if (!force) {
        showWaiting();
        return;
      }
      pool = state.words.map((_, i) => i);
    }

    // Avoid showing the exact same card twice in a row when other cards exist
    if (pool.length > 1 && state.currentIndex !== null) {
      pool = pool.filter((i) => i !== state.currentIndex);
    }

    const chosen = pool[Math.floor(Math.random() * pool.length)];
    renderCard(chosen);
  }

  function scheduleCurrent(minutes) {
    if (state.currentIndex === null || !state.isFlipped) return;
    const word = state.words[state.currentIndex];
    state.schedule[cardKey(state.mode, word)] = Date.now() + minutes * 60 * 1000;
    saveSchedule();
    pickNextCard();
  }

  function setMode(mode) {
    state.mode = mode;
    localStorage.setItem(MODE_KEY, mode);
    els.modeBtns.forEach((btn) => {
      const active = btn.dataset.mode === mode;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-selected", String(active));
    });
    state.currentIndex = null;
    pickNextCard();
  }

  function bindEvents() {
    els.modeBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.dataset.mode !== state.mode) {
          setMode(btn.dataset.mode);
        }
      });
    });

    const toggleFlip = () => {
      if (state.currentIndex === null) return;
      setFlipped(!state.isFlipped);
    };

    els.card.addEventListener("click", toggleFlip);
    els.card.addEventListener("keydown", (e) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        toggleFlip();
      }
    });

    els.btn1Min.addEventListener("click", () => scheduleCurrent(1));
    els.btn5Min.addEventListener("click", () => scheduleCurrent(5));
    els.forceNextBtn.addEventListener("click", () => pickNextCard({ force: true }));

    els.resetBtn.addEventListener("click", () => {
      state.words.forEach((word) => {
        delete state.schedule[cardKey(state.mode, word)];
      });
      saveSchedule();
      state.currentIndex = null;
      pickNextCard();
    });
  }

  async function init() {
    bindEvents();
    try {
      const res = await fetch("./words.json", { cache: "no-cache" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) {
        throw new Error("Empty word list");
      }
      state.words = data;
      setMode(state.mode);
    } catch (err) {
      els.statusText.textContent = "単語リストの読み込みに失敗しました";
      console.error(err);
    }
  }

  init();
})();
