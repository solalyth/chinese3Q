(() => {
  const STORAGE_KEY = "chinese3Q_deck_v2";
  const MODE_KEY = "chinese3Q_mode_v1";
  const THEME_KEY = "chinese3Q_theme_v1";

  // デック設定（割合などはここを変更）
  const MASTER_OK_COUNT = 3; // OK をこの回数達成したら二度と出題しない
  const NEW_CARD_RATIO = 0.25; // 未出題が残っているときに未出題を出す割合 (1/4)

  const state = {
    words: [],
    mode: localStorage.getItem(MODE_KEY) || "pinyin-to-hanzi",
    deck: loadDeck(),
    currentIndex: null,
    isFlipped: false,
    countdownTimer: null,
  };

  const els = {
    modeBtns: document.querySelectorAll(".mode-btn"),
    statusText: document.getElementById("status-text"),
    progressMastered: document.getElementById("progress-mastered"),
    progressLearning: document.getElementById("progress-learning"),
    themeBtn: document.getElementById("theme-btn"),
    resetBtn: document.getElementById("reset-btn"),
    card: document.getElementById("card"),
    frontLabel: document.getElementById("front-label"),
    frontMain: document.getElementById("front-main"),
    backQuestion: document.getElementById("back-question"),
    backPrimary: document.getElementById("back-primary"),
    backMeaning: document.getElementById("back-meaning"),
    waitingPanel: document.getElementById("waiting-panel"),
    waitingTitle: document.getElementById("waiting-title"),
    waitingCountdown: document.getElementById("waiting-countdown"),
    forceNextBtn: document.getElementById("force-next-btn"),
    btn1Min: document.getElementById("btn-1min"),
    btn5Min: document.getElementById("btn-5min"),
    btn5MinSub: document.getElementById("btn-5min-sub"),
  };

  function loadDeck() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  function saveDeck() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.deck));
    } catch {
      // Ignore storage quota errors
    }
  }

  function cardKey(mode, word) {
    return `${mode}:${word.hanzi}:${word.pinyin}`;
  }

  function getCardState(word) {
    const entry = state.deck[cardKey(state.mode, word)];
    if (!entry) {
      return { seen: false, okCount: 0, dueAt: 0 };
    }
    return {
      seen: Boolean(entry.seen),
      okCount: Number(entry.okCount) || 0,
      dueAt: Number(entry.dueAt) || 0,
    };
  }

  function isMastered(cardState) {
    return cardState.okCount >= MASTER_OK_COUNT;
  }

  function getPools(now = Date.now()) {
    const unseen = [];
    const reviewDue = [];
    const reviewWaiting = [];
    let masteredCount = 0;
    let learningCount = 0;

    state.words.forEach((word, idx) => {
      const cs = getCardState(word);
      if (isMastered(cs)) {
        masteredCount += 1;
      } else if (!cs.seen) {
        unseen.push(idx);
      } else {
        learningCount += 1;
        if (cs.dueAt <= now) {
          reviewDue.push(idx);
        } else {
          reviewWaiting.push({ idx, dueAt: cs.dueAt });
        }
      }
    });

    return {
      unseen,
      reviewDue,
      reviewWaiting,
      masteredCount,
      learningCount,
      unseenCount: unseen.length,
    };
  }

  function updateStatus() {
    const total = state.words.length;
    if (total === 0) return;

    const { masteredCount, learningCount, unseenCount } = getPools();
    els.statusText.textContent = `習得 ${masteredCount} / ${total}（学習中 ${learningCount}・未出題 ${unseenCount}）`;

    const masteredPct = (masteredCount / total) * 100;
    const learningPct = (learningCount / total) * 100;
    els.progressMastered.style.width = `${masteredPct}%`;
    els.progressLearning.style.width = `${learningPct}%`;
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
    const cs = getCardState(word);
    state.currentIndex = index;

    els.waitingPanel.classList.add("is-hidden");
    els.card.classList.remove("is-hidden");
    els.card.classList.add("no-transition");
    setFlipped(false);
    void els.card.offsetWidth;
    els.card.classList.remove("no-transition");

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

    const remainingOk = MASTER_OK_COUNT - cs.okCount;
    els.btn5MinSub.textContent =
      remainingOk <= 1 ? "これで習得！" : `あと ${remainingOk} 回で習得`;

    updateStatus();
  }

  function showCompleted() {
    clearCountdown();
    state.currentIndex = null;
    setFlipped(false);
    els.card.classList.add("is-hidden");
    els.waitingPanel.classList.remove("is-hidden");
    els.waitingTitle.textContent = "すべての単語を習得しました！";
    els.waitingCountdown.textContent = "リセットすると最初からやり直せます";
    els.forceNextBtn.classList.add("is-hidden");
    updateStatus();
  }

  function showWaiting() {
    state.currentIndex = null;
    setFlipped(false);
    els.card.classList.add("is-hidden");
    els.waitingPanel.classList.remove("is-hidden");
    els.waitingTitle.textContent = "今は出題待ちのカードのみです";
    els.forceNextBtn.classList.remove("is-hidden");
    updateStatus();

    clearCountdown();
    const tick = () => {
      const { reviewWaiting } = getPools();
      if (reviewWaiting.length === 0) {
        clearCountdown();
        pickNextCard();
        return;
      }
      const nextDue = Math.min(...reviewWaiting.map((item) => item.dueAt));
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

  function pickRandomFrom(pool) {
    let candidates = pool;
    if (candidates.length > 1 && state.currentIndex !== null) {
      candidates = candidates.filter((i) => i !== state.currentIndex);
    }
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  function pickNextCard({ force = false } = {}) {
    clearCountdown();
    if (state.words.length === 0) return;

    const { unseen, reviewDue, reviewWaiting } = getPools();

    // 全カード習得済み
    if (unseen.length === 0 && reviewDue.length === 0 && reviewWaiting.length === 0) {
      showCompleted();
      return;
    }

    let chosenPool = null;

    if (unseen.length > 0 && reviewDue.length > 0) {
      chosenPool = Math.random() < NEW_CARD_RATIO ? unseen : reviewDue;
    } else if (unseen.length > 0) {
      chosenPool = unseen;
    } else if (reviewDue.length > 0) {
      chosenPool = reviewDue;
    } else if (force && reviewWaiting.length > 0) {
      chosenPool = reviewWaiting.map((item) => item.idx);
    }

    if (!chosenPool) {
      showWaiting();
      return;
    }

    renderCard(pickRandomFrom(chosenPool));
  }

  function recordResult(isOk) {
    if (state.currentIndex === null || !state.isFlipped) return;
    const word = state.words[state.currentIndex];
    const key = cardKey(state.mode, word);
    const prev = getCardState(word);

    const nextOkCount = isOk ? prev.okCount + 1 : prev.okCount;
    const delayMin = isOk ? 5 : 1;

    state.deck[key] = {
      seen: true,
      okCount: nextOkCount,
      dueAt: nextOkCount >= MASTER_OK_COUNT ? Infinity : Date.now() + delayMin * 60 * 1000,
    };

    saveDeck();
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

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    els.themeBtn.textContent = theme === "dark" ? "☀️" : "🌙";
    els.themeBtn.setAttribute(
      "aria-label",
      theme === "dark" ? "ライトモードに切替" : "ダークモードに切替"
    );
  }

  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "dark" || saved === "light") {
      applyTheme(saved);
    } else {
      const prefersDark =
        window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
      applyTheme(prefersDark ? "dark" : "light");
    }
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

    els.btn1Min.addEventListener("click", () => recordResult(false));
    els.btn5Min.addEventListener("click", () => recordResult(true));
    els.forceNextBtn.addEventListener("click", () => pickNextCard({ force: true }));

    els.resetBtn.addEventListener("click", () => {
      state.words.forEach((word) => {
        delete state.deck[cardKey(state.mode, word)];
      });
      saveDeck();
      state.currentIndex = null;
      pickNextCard();
    });

    els.themeBtn.addEventListener("click", () => {
      const current =
        document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
      const next = current === "dark" ? "light" : "dark";
      localStorage.setItem(THEME_KEY, next);
      applyTheme(next);
    });
  }

  async function init() {
    initTheme();
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
