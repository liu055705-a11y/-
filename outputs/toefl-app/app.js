(async function () {
  const data = await (window.TOEFL_DATA_READY || Promise.resolve(window.TOEFL_DATA || { entries: [], speaking: [], dictation: [] }));
  const entries = data.entries;
  const storeKey = "toefl-review-state-v1";
  const dictionaryEndpoint = window.TOEFL_DICTIONARY_ENDPOINT || "";
  const dailyGoals = { word: 100, spelling: 50, dictation: 50 };

  const state = {
    view: "quiz",
    section: "全部",
    direction: "en-zh",
    quiz: [],
    quizIndex: 0,
    cardIndex: 0,
    cardFlipped: false,
    spellingItem: null,
    spellingCorrect: 0,
    spellingWrong: 0,
    spellingMastered: 0,
    spellingUnmastered: 0,
    spellingAnswered: false,
    spellingLastCorrect: false,
    dictationIndex: 0,
    dictationItem: null,
    speakingIndex: 0,
    recorder: null,
    recordingStream: null,
    recordingChunks: [],
    recordingUrl: "",
    progress: {
      mastered: {},
      wrong: {},
      tomorrowReview: {},
      streak: 0,
      speakingDone: 0,
      stats: {
        todayDate: "",
        todayPractice: 0,
        taskDate: "",
        wordReview: 0,
        spellingPractice: 0,
        dictationPractice: 0,
        spellingCorrect: 0,
        spellingWrong: 0,
        streakDays: 0,
        lastStudyDate: ""
      },
      voice: {
        accent: "en-US",
        rate: "slow"
      }
    }
  };

  const el = {
    totalCount: document.querySelector("#totalCount"),
    masteredCount: document.querySelector("#masteredCount"),
    wrongCount: document.querySelector("#wrongCount"),
    todayPracticeCount: document.querySelector("#todayPracticeCount"),
    spellingAccuracy: document.querySelector("#spellingAccuracy"),
    streakCount: document.querySelector("#streakCount"),
    wordTaskCount: document.querySelector("#wordTaskCount"),
    spellingTaskCount: document.querySelector("#spellingTaskCount"),
    dictationTaskCount: document.querySelector("#dictationTaskCount"),
    tomorrowReviewCount: document.querySelector("#tomorrowReviewCount"),
    todayReviewCount: document.querySelector("#todayReviewCount"),
    todayReviewList: document.querySelector("#todayReviewList"),
    sectionSelect: document.querySelector("#sectionSelect"),
    directionSelect: document.querySelector("#directionSelect"),
    voiceAccentSelect: document.querySelector("#voiceAccentSelect"),
    voiceRateSelect: document.querySelector("#voiceRateSelect"),
    voiceStatus: document.querySelector("#voiceStatus"),
    quizIndex: document.querySelector("#quizIndex"),
    quizSection: document.querySelector("#quizSection"),
    quizPrompt: document.querySelector("#quizPrompt"),
    answerInput: document.querySelector("#answerInput"),
    feedback: document.querySelector("#feedback"),
    cardSection: document.querySelector("#cardSection"),
    cardFront: document.querySelector("#cardFront"),
    cardBack: document.querySelector("#cardBack"),
    flashCard: document.querySelector("#flashCard"),
    dictionaryFeedback: document.querySelector("#dictionaryFeedback"),
    spellingSection: document.querySelector("#spellingSection"),
    spellingStats: document.querySelector("#spellingStats"),
    spellingMeaning: document.querySelector("#spellingMeaning"),
    spellingExample: document.querySelector("#spellingExample"),
    spellingInput: document.querySelector("#spellingInput"),
    spellingFeedback: document.querySelector("#spellingFeedback"),
    spellingMasteryActions: document.querySelector("#spellingMasteryActions"),
    spellingKnow: document.querySelector("#spellingKnow"),
    spellingMiss: document.querySelector("#spellingMiss"),
    dictationSection: document.querySelector("#dictationSection"),
    dictationInput: document.querySelector("#dictationInput"),
    dictationResult: document.querySelector("#dictationResult"),
    wrongList: document.querySelector("#wrongList"),
    speakingPrompt: document.querySelector("#speakingPrompt"),
    speakingTargets: document.querySelector("#speakingTargets"),
    recordingStatus: document.querySelector("#recordingStatus"),
    recordingPlayback: document.querySelector("#recordingPlayback"),
    recordingFeedback: document.querySelector("#recordingFeedback")
  };

  const speakingPrompts = (data.speaking || []).filter((item) => item.source === "speaking.json");
  const dictationPool = buildDictationPool();

  function loadProgress() {
    try {
      const saved = JSON.parse(localStorage.getItem(storeKey));
      if (saved && saved.progress) {
        Object.assign(state.progress, saved.progress);
        state.progress.stats = {
          todayDate: "",
          todayPractice: 0,
          taskDate: "",
          wordReview: 0,
          spellingPractice: 0,
          dictationPractice: 0,
          spellingCorrect: 0,
          spellingWrong: 0,
          streakDays: 0,
          lastStudyDate: "",
          ...(saved.progress.stats || {})
        };
        state.progress.voice = {
          accent: "en-US",
          rate: "slow",
          ...(saved.progress.voice || {})
        };
      }
    } catch {
      localStorage.removeItem(storeKey);
    }
  }

  function cleanupLegacyProgress() {
    const badTerms = [
      "间隔" + "复习" + "安排",
      "7 " + "天后",
      "2026-06-" + "06",
      "今天 " + "2026-05-" + "30",
      "明天 " + "2026-05-" + "31",
      "3 " + "天后 " + "2026-06-" + "02",
      "study " + "group",
      "TOEFL " + "vocabulary"
    ];
    const hasBadTerm = (value) => badTerms.some((term) => String(value || "").includes(term));
    let changed = false;

    for (const key of Object.keys(state.progress.mastered || {})) {
      if (hasBadTerm(key)) {
        delete state.progress.mastered[key];
        changed = true;
      }
    }

    for (const [key, item] of Object.entries(state.progress.wrong || {})) {
      const content = [key, item?.en, item?.zh, item?.section].join(" ");
      if (hasBadTerm(content)) {
        delete state.progress.wrong[key];
        changed = true;
      }
    }

    if (changed) saveProgress();
  }

  function todayKey() {
    return dateKey();
  }

  function dateKey(offset = 0) {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function daysBetween(before, after) {
    if (!before || !after) return 0;
    return Math.round((new Date(`${after}T00:00:00`) - new Date(`${before}T00:00:00`)) / 86400000);
  }

  function ensureProgressShape() {
    state.progress.mastered ||= {};
    state.progress.wrong ||= {};
    state.progress.tomorrowReview ||= {};
    state.progress.stats ||= {};
    state.progress.voice ||= { accent: "en-US", rate: "slow" };
    state.progress.stats.wordReview ||= 0;
    state.progress.stats.spellingPractice ||= 0;
    state.progress.stats.dictationPractice ||= 0;
    for (const [key, item] of Object.entries(state.progress.wrong)) {
      const type = item.type || "单词";
      state.progress.wrong[key] = {
        id: item.id || key,
        type,
        at: item.at || Date.now(),
        en: item.en || item.text || key,
        zh: item.zh || item.original || item.hint || "",
        section: item.section || type,
        count: item.count || 1
      };
    }
  }

  function resetDailyTasks() {
    const today = dateKey();
    const stats = state.progress.stats;
    if (stats.taskDate !== today) {
      stats.taskDate = today;
      stats.wordReview = 0;
      stats.spellingPractice = 0;
      stats.dictationPractice = 0;
    }
  }

  function recordPractice(kind = "") {
    const today = todayKey();
    const stats = state.progress.stats;
    if (stats.todayDate !== today) {
      stats.todayDate = today;
      stats.todayPractice = 0;
    }
    if (stats.lastStudyDate !== today) {
      const gap = daysBetween(stats.lastStudyDate, today);
      stats.streakDays = gap === 1 ? (stats.streakDays || 0) + 1 : 1;
      stats.lastStudyDate = today;
    }
    resetDailyTasks();
    if (kind === "word") stats.wordReview = (stats.wordReview || 0) + 1;
    if (kind === "spelling") stats.spellingPractice = (stats.spellingPractice || 0) + 1;
    if (kind === "dictation") stats.dictationPractice = (stats.dictationPractice || 0) + 1;
    stats.todayPractice = (stats.todayPractice || 0) + 1;
    saveProgress();
    renderStats();
  }

  function saveProgress() {
    localStorage.setItem(storeKey, JSON.stringify({ progress: state.progress }));
  }

  function reviewKey(type, id, text) {
    return `${type}:${id || text}`;
  }

  function addTomorrowReview(item) {
    state.progress.tomorrowReview ||= {};
    const key = reviewKey(item.type, item.id, item.text);
    const previous = state.progress.tomorrowReview[key] || {};
    state.progress.tomorrowReview[key] = {
      type: item.type,
      id: item.id,
      text: item.text,
      meaning: item.meaning || "",
      answer: item.answer || "",
      addedAt: previous.addedAt || Date.now(),
      dueDate: dateKey(1),
      errorCount: (previous.errorCount || 0) + 1
    };
    saveProgress();
  }

  function dueReviewItems(offset = 0) {
    const dueDate = dateKey(offset);
    return Object.values(state.progress.tomorrowReview || {}).filter((item) => item.dueDate === dueDate);
  }

  function removeReviewById(id, type = "") {
    for (const [key, item] of Object.entries(state.progress.tomorrowReview || {})) {
      if (item.id === id && (!type || item.type === type)) {
        delete state.progress.tomorrowReview[key];
      }
    }
  }

  function sections() {
    return ["全部", ...Array.from(new Set(entries.map((item) => item.section)))];
  }

  function currentPool() {
    const base = state.section === "全部"
      ? entries
      : entries.filter((item) => item.section === state.section);
    const pool = base.length ? base : entries;
    const dueWords = dueReviewItems()
      .filter((item) => item.type === "word")
      .map((item) => entries.find((entry) => entry.id === item.id))
      .filter(Boolean);
    return uniqueById([...dueWords, ...pool]);
  }

  function isValidSpellingItem(item) {
    const word = String(item?.en || item?.word || "").trim();
    if (!word || word.length > 70) return false;
    if (/[=\u3400-\u9fff；;/]/.test(word)) return false;
    if (isCompleteSentence(word)) return false;
    return /^[a-zA-Z][a-zA-Z' -]*(?:[a-zA-Z]|\.\.\.)$/.test(word);
  }

  function isCompleteSentence(text) {
    const value = String(text || "").trim();
    if (value.endsWith("...")) return value.split(/\s+/).length >= 8;
    return /[.!?]$/.test(value) || value.split(/\s+/).length >= 8;
  }

  function isDictationText(text) {
    const value = String(text || "").trim();
    if (!/[a-z]/i.test(value)) return false;
    if (/[=\u3400-\u9fff；;]/.test(value)) return false;
    return value.split(/\s+/).length >= 2 || isCompleteSentence(value);
  }

  function spellingPool() {
    const pool = currentPool().filter(isValidSpellingItem);
    const fallback = pool.length ? pool : entries.filter(isValidSpellingItem);
    const dueSpelling = dueReviewItems()
      .filter((item) => item.type === "spelling")
      .map((item) => entries.find((entry) => entry.id === item.id))
      .filter(Boolean);
    return uniqueById([...dueSpelling, ...fallback]);
  }

  function uniqueById(items) {
    const seen = new Set();
    return items.filter((item) => {
      if (!item || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }

  function buildDictationPool() {
    const sourceDictation = (data.dictation || [])
      .filter((item) => isDictationText(item.text))
      .map((item) => ({
        ...item,
        section: item.section || item.category || item.source || "听写材料"
      }));
    const wordPhrases = entries
      .filter((item) => isDictationText(item.en))
      .map((item) => ({
        id: `word-dictation-${item.id}`,
        text: item.en,
        section: item.section,
        hint: item.zh
      }));
    return uniqueByText([...sourceDictation, ...wordPhrases]);
  }

  function uniqueByText(items) {
    const seen = new Set();
    return items.filter((item) => {
      const key = String(item.text || "").toLowerCase().trim();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function prioritizeDictation(pool) {
    const due = dueReviewItems()
      .filter((item) => item.type === "dictation")
      .map((review) => pool.find((item) => item.id === review.id || item.text === review.text) || {
        id: review.id,
        text: review.text,
        section: "今日错题",
        hint: review.answer || review.meaning
      });
    const seen = new Set();
    return [...due, ...pool].filter((item) => {
      const key = item.id || item.text;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function currentDictationPool() {
    return prioritizeDictation(dictationPool);
  }

  function shuffle(items) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function startQuiz() {
    state.quiz = shuffle(currentPool()).slice(0, 5);
    state.quizIndex = 0;
    clearFeedback();
    renderQuiz();
  }

  function currentQuizItem() {
    if (!state.quiz.length) startQuiz();
    return state.quiz[state.quizIndex] || state.quiz[0];
  }

  function termFront(item) {
    return state.direction === "en-zh" ? item.en : item.zh;
  }

  function termBack(item) {
    return state.direction === "en-zh" ? item.zh : item.en;
  }

  function englishText(value) {
    return /[a-z]/i.test(value) ? value : "";
  }

  function speakText(text) {
    if (!text || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const preferred = selectVoice();
    if (preferred) utterance.voice = preferred;
    utterance.lang = preferred?.lang || state.progress.voice?.accent || "en-US";
    utterance.rate = state.progress.voice?.rate === "normal" ? 0.92 : 0.68;
    utterance.pitch = 1;
    updateVoiceStatus(preferred);
    window.speechSynthesis.speak(utterance);
  }

  function selectVoice() {
    if (!("speechSynthesis" in window)) return null;
    const accent = state.progress.voice?.accent || "en-US";
    const voices = window.speechSynthesis.getVoices();
    const natural = (voice) => /natural|premium|enhanced|samantha|daniel|google|microsoft|ava|jenny|libby|serena/i.test(voice.name);
    const exactLang = (lang) => voices.filter((voice) => (voice.lang || "").toLowerCase() === lang.toLowerCase());
    const englishVoices = voices.filter((voice) => (voice.lang || "").toLowerCase().startsWith("en"));

    let candidates = [];
    if (accent === "en-GB") {
      candidates = [
        ...exactLang("en-GB"),
        ...exactLang("en-UK"),
        ...englishVoices.filter((voice) => /british|uk|united kingdom/i.test(`${voice.name} ${voice.lang}`))
      ];
    } else {
      candidates = exactLang("en-US");
    }

    return candidates.find(natural)
      || candidates[0]
      || englishVoices.find(natural)
      || englishVoices[0]
      || voices[0]
      || null;
  }

  function updateVoiceStatus(voice = selectVoice()) {
    if (!el.voiceStatus) return;
    if (!("speechSynthesis" in window)) {
      el.voiceStatus.textContent = "当前浏览器不支持发音。";
      return;
    }
    if (!voice) {
      el.voiceStatus.textContent = "语音加载中";
      return;
    }
    const accent = state.progress.voice?.accent || "en-US";
    const expected = accent === "en-GB"
      ? (/(en-GB|en-UK)/i.test(voice.lang || "") || /british|uk|united kingdom/i.test(voice.name || ""))
      : /^en-US$/i.test(voice.lang || "");
    const fallback = expected ? "" : " 当前设备没有该语音包，已使用可用英文语音。";
    el.voiceStatus.textContent = `当前语音：${voice.name} (${voice.lang || "unknown"})${fallback}`;
  }

  function normalize(value) {
    return value
      .toLowerCase()
      .replace(/[，。；;,.!?！？、\s]/g, "")
      .trim();
  }

  function isCorrect(answer, expected) {
    const a = normalize(answer);
    const e = normalize(expected);
    if (!a) return false;
    return e.includes(a) || a.includes(e);
  }

  function markMastered(item, kind = "word") {
    state.progress.mastered[item.id] = Date.now();
    delete state.progress.wrong[item.id];
    removeReviewById(item.id);
    state.progress.streak += 1;
    saveProgress();
    recordPractice(kind);
    renderStats();
  }

  function markWrong(item, type = "单词") {
    const reviewType = type === "听写" ? "dictation" : type === "拼写" ? "spelling" : "word";
    const previous = state.progress.wrong[item.id] || {};
    state.progress.wrong[item.id] = {
      id: item.id,
      type,
      at: Date.now(),
      en: item.en,
      zh: item.zh,
      section: item.section,
      count: (previous.count || 0) + 1
    };
    addTomorrowReview({
      type: reviewType,
      id: item.id,
      text: item.en,
      meaning: item.zh,
      answer: type === "听写" ? item.zh : ""
    });
    state.progress.streak = 0;
    saveProgress();
    recordPractice(reviewType);
    renderStats();
  }

  function clearFeedback() {
    el.feedback.className = "feedback";
    el.feedback.textContent = "";
    el.answerInput.value = "";
  }

  function renderStats() {
    resetDailyTasks();
    const stats = state.progress.stats || {};
    const spellingTotal = (stats.spellingCorrect || 0) + (stats.spellingWrong || 0);
    const spellingAccuracy = spellingTotal ? Math.round(((stats.spellingCorrect || 0) / spellingTotal) * 100) : 0;
    const dueToday = dueReviewItems();
    const dueTomorrow = dueReviewItems(1);
    el.totalCount.textContent = String(entries.length);
    el.masteredCount.textContent = String(Object.keys(state.progress.mastered).length);
    el.wrongCount.textContent = String(Object.keys(state.progress.wrong).length);
    el.todayPracticeCount.textContent = String(stats.todayDate === todayKey() ? stats.todayPractice || 0 : 0);
    el.spellingAccuracy.textContent = `${spellingAccuracy}%`;
    el.streakCount.textContent = String(stats.streakDays || 0);
    el.wordTaskCount.textContent = `${Math.min(stats.wordReview || 0, dailyGoals.word)}/${dailyGoals.word}`;
    el.spellingTaskCount.textContent = `${Math.min(stats.spellingPractice || 0, dailyGoals.spelling)}/${dailyGoals.spelling}`;
    el.dictationTaskCount.textContent = `${Math.min(stats.dictationPractice || 0, dailyGoals.dictation)}/${dailyGoals.dictation}`;
    el.todayReviewCount.textContent = `今日错题复习：${dueToday.length} 条`;
    el.tomorrowReviewCount.textContent = `已加入明日复习：${dueTomorrow.length} 条`;
    el.todayReviewList.innerHTML = dueToday.length
      ? dueToday.map((item) => `
        <div class="daily-review-item">
          <span>${escapeHtml(reviewLabel(item.type))} · ${escapeHtml(item.text)}</span>
          <button data-review-master="${escapeHtml(item.id || item.text)}" data-review-type="${escapeHtml(item.type)}">已掌握</button>
        </div>
      `).join("")
      : "";
  }

  function reviewLabel(type) {
    return type === "dictation" ? "听写" : type === "spelling" ? "拼写" : "单词";
  }

  function renderQuiz() {
    const item = currentQuizItem();
    el.quizIndex.textContent = `${state.quizIndex + 1} / ${state.quiz.length || 5}`;
    el.quizSection.textContent = item.section;
    el.quizPrompt.textContent = termFront(item);
    clearFeedback();
    window.setTimeout(() => el.answerInput.focus({ preventScroll: true }), 30);
  }

  function renderCard() {
    const pool = currentPool();
    if (!pool.length) return;
    if (state.cardIndex >= pool.length) state.cardIndex = 0;
    const item = pool[state.cardIndex];
    el.cardSection.textContent = `${item.section} · ${state.cardIndex + 1}/${pool.length}`;
    el.cardFront.textContent = termFront(item);
    el.cardBack.textContent = state.cardFlipped ? termBack(item) : "";
  }

  function renderSpelling() {
    if (!state.spellingItem) {
      state.spellingItem = shuffle(spellingPool())[0];
    }
    if (!state.spellingItem) return;
    const item = state.spellingItem;
    el.spellingSection.textContent = item.section;
    updateSpellingStats();
    el.spellingMeaning.textContent = item.zh;
    el.spellingExample.textContent = item.example || "暂无例句";
    el.spellingInput.value = "";
    el.spellingInput.disabled = false;
    document.querySelector("#checkSpelling").disabled = false;
    state.spellingAnswered = false;
    state.spellingLastCorrect = false;
    el.spellingFeedback.className = "feedback";
    el.spellingFeedback.textContent = "";
    el.spellingMasteryActions.hidden = true;
    el.spellingKnow.className = "primary";
    el.spellingMiss.className = "";
    window.setTimeout(() => el.spellingInput.focus({ preventScroll: true }), 30);
  }

  function renderWrong() {
    const wrong = Object.values(state.progress.wrong).sort((a, b) => b.at - a.at);
    if (!wrong.length) {
      el.wrongList.innerHTML = '<div class="word-item"><div><strong>暂无错词</strong><small>测验时点“加入错词”会出现在这里</small></div></div>';
      return;
    }
    el.wrongList.innerHTML = wrong.map((item) => `
      <div class="word-item">
        <div>
          <small>${escapeHtml(item.type || "单词")}</small>
          <strong>${escapeHtml(item.en)}</strong>
          <small>${escapeHtml(item.zh || "")} · ${escapeHtml(item.section || "")}</small>
          <small>错误 ${item.count || 1} 次 · 最近 ${formatDateTime(item.at)}</small>
        </div>
        <div class="wrong-actions">
          <button data-speak="${escapeHtml(item.id)}" aria-label="播放">▶</button>
          <button data-master="${escapeHtml(item.id)}" aria-label="已掌握">✓</button>
          <button data-remove="${escapeHtml(item.id)}" aria-label="删除">×</button>
        </div>
      </div>
    `).join("");
  }

  function renderDictation() {
    const pool = currentDictationPool();
    if (!pool.length) return;
    if (!state.dictationItem) {
      state.dictationItem = shuffle(pool)[0];
    }
    el.dictationSection.textContent = state.dictationItem.section;
    el.dictationInput.value = "";
    el.dictationResult.innerHTML = "";
  }

  function renderSpeaking() {
    const item = speakingPrompts[state.speakingIndex % speakingPrompts.length];
    if (!item) return;
    el.speakingPrompt.textContent = item.prompt;
    el.speakingTargets.innerHTML = item.targets.map((target) => `<li>${escapeHtml(target)}</li>`).join("");
  }

  function renderAll() {
    renderStats();
    renderQuiz();
    renderCard();
    renderSpelling();
    renderDictation();
    renderWrong();
    renderSpeaking();
  }

  function switchView(view) {
    state.view = view;
    document.querySelectorAll(".tab").forEach((tab) => {
      tab.classList.toggle("is-active", tab.dataset.view === view);
    });
    document.querySelectorAll(".view").forEach((panel) => {
      panel.classList.toggle("is-active", panel.id === `${view}View`);
    });
    if (view === "wrong") renderWrong();
    if (view === "cards") renderCard();
    if (view === "spelling") renderSpelling();
    if (view === "dictation") renderDictation();
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function setupSections() {
    el.sectionSelect.innerHTML = sections()
      .map((section) => `<option value="${escapeHtml(section)}">${escapeHtml(section)}</option>`)
      .join("");
  }

  function bindEvents() {
    document.querySelectorAll(".tab").forEach((tab) => {
      tab.addEventListener("click", () => switchView(tab.dataset.view));
    });

    document.querySelectorAll("[data-task-view]").forEach((button) => {
      button.addEventListener("click", () => switchView(button.dataset.taskView));
    });

    el.todayReviewList.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-review-master]");
      if (!button) return;
      removeReviewById(button.dataset.reviewMaster, button.dataset.reviewType);
      saveProgress();
      renderStats();
    });

    el.sectionSelect.addEventListener("change", () => {
      state.section = el.sectionSelect.value;
      state.cardIndex = 0;
      state.cardFlipped = false;
      state.spellingItem = null;
      startQuiz();
      renderCard();
      renderSpelling();
    });

    el.directionSelect.addEventListener("change", () => {
      state.direction = el.directionSelect.value;
      state.cardFlipped = false;
      renderQuiz();
      renderCard();
    });

    el.voiceAccentSelect.addEventListener("change", () => {
      state.progress.voice.accent = el.voiceAccentSelect.value;
      saveProgress();
      updateVoiceStatus();
    });

    el.voiceRateSelect.addEventListener("change", () => {
      state.progress.voice.rate = el.voiceRateSelect.value;
      saveProgress();
      updateVoiceStatus();
    });

    document.querySelector("#shuffleBtn").addEventListener("click", startQuiz);

    document.querySelector("#speakQuiz").addEventListener("click", () => {
      const item = currentQuizItem();
      speakText(englishText(termFront(item)) || item.en);
    });

    document.querySelector("#checkBtn").addEventListener("click", () => {
      const item = currentQuizItem();
      const expected = termBack(item);
      const ok = isCorrect(el.answerInput.value, expected);
      el.feedback.className = `feedback ${ok ? "good" : "bad"}`;
      el.feedback.textContent = ok ? `对：${expected}` : `答案：${expected}`;
      if (ok) markMastered(item);
      else markWrong(item);
    });

    document.querySelector("#showBtn").addEventListener("click", () => {
      const item = currentQuizItem();
      el.feedback.className = "feedback";
      el.feedback.textContent = `答案：${termBack(item)}`;
      if (state.direction === "zh-en") speakText(item.en);
    });

    document.querySelector("#knowBtn").addEventListener("click", () => {
      markMastered(currentQuizItem());
      nextQuiz();
    });

    document.querySelector("#missBtn").addEventListener("click", () => {
      markWrong(currentQuizItem());
      nextQuiz();
    });

    document.querySelector("#nextBtn").addEventListener("click", nextQuiz);

    el.answerInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") document.querySelector("#checkBtn").click();
    });

    document.querySelector("#cardPrev").addEventListener("click", () => {
      const pool = currentPool();
      state.cardIndex = (state.cardIndex - 1 + pool.length) % pool.length;
      state.cardFlipped = false;
      renderCard();
    });

    document.querySelector("#cardNext").addEventListener("click", () => {
      const pool = currentPool();
      state.cardIndex = (state.cardIndex + 1) % pool.length;
      state.cardFlipped = false;
      renderCard();
    });

    document.querySelector("#cardFlip").addEventListener("click", flipCard);
    document.querySelector("#speakCard").addEventListener("click", (event) => {
      event.stopPropagation();
      const item = currentPool()[state.cardIndex];
      if (item) speakText(englishText(termFront(item)) || item.en);
    });
    document.querySelector("#lookupCard").addEventListener("click", (event) => {
      event.stopPropagation();
      lookupDictionary(currentPool()[state.cardIndex]);
    });
    el.flashCard.addEventListener("click", flipCard);
    el.flashCard.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") flipCard();
    });

    document.querySelector("#speakSpelling").addEventListener("click", () => {
      if (state.spellingItem) speakText(state.spellingItem.en);
    });

    document.querySelector("#checkSpelling").addEventListener("click", checkSpelling);
    document.querySelector("#spellingKnow").addEventListener("click", () => finishSpelling(true));
    document.querySelector("#spellingMiss").addEventListener("click", () => finishSpelling(false));
    el.spellingInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !state.spellingAnswered) checkSpelling();
    });

    document.querySelector("#playDictation").addEventListener("click", () => {
      if (state.dictationItem) speakText(state.dictationItem.text);
    });

    document.querySelector("#newDictation").addEventListener("click", () => {
      state.dictationItem = shuffle(currentDictationPool())[0];
      renderDictation();
      window.setTimeout(() => speakText(state.dictationItem.text), 80);
    });

    document.querySelector("#checkDictation").addEventListener("click", () => {
      if (!state.dictationItem) return;
      renderDictationResult(state.dictationItem.text, el.dictationInput.value);
    });

    document.querySelector("#clearWrong").addEventListener("click", () => {
      state.progress.wrong = {};
      saveProgress();
      renderStats();
      renderWrong();
    });

    el.wrongList.addEventListener("click", (event) => {
      const speakButton = event.target.closest("button[data-speak]");
      const masterButton = event.target.closest("button[data-master]");
      const removeButton = event.target.closest("button[data-remove]");
      if (speakButton) {
        const item = state.progress.wrong[speakButton.dataset.speak];
        if (item) speakText(item.en);
        return;
      }
      if (masterButton) {
        const item = state.progress.wrong[masterButton.dataset.master];
        if (item) {
          state.progress.mastered[item.id] = Date.now();
          delete state.progress.wrong[item.id];
          removeReviewById(item.id);
        }
      } else if (removeButton) {
        removeReviewById(removeButton.dataset.remove);
        delete state.progress.wrong[removeButton.dataset.remove];
      } else {
        return;
      }
      saveProgress();
      renderStats();
      renderWrong();
    });

    document.querySelector("#newSpeaking").addEventListener("click", () => {
      state.speakingIndex = (state.speakingIndex + 1) % speakingPrompts.length;
      renderSpeaking();
    });

    document.querySelector("#speakSpeaking").addEventListener("click", () => {
      const item = speakingPrompts[state.speakingIndex % speakingPrompts.length];
      if (item) speakText(item.prompt);
    });

    document.querySelector("#markSpeaking").addEventListener("click", () => {
      state.progress.speakingDone = (state.progress.speakingDone || 0) + 1;
      state.progress.streak += 1;
      saveProgress();
      recordPractice();
      renderStats();
      state.speakingIndex = (state.speakingIndex + 1) % speakingPrompts.length;
      renderSpeaking();
    });

    document.querySelector("#startRecording").addEventListener("click", startRecording);
    document.querySelector("#stopRecording").addEventListener("click", stopRecording);
    document.querySelector("#deleteRecording").addEventListener("click", deleteRecording);
    document.querySelector("#submitRecording").addEventListener("click", () => {
      el.recordingFeedback.className = "feedback";
      el.recordingFeedback.textContent = "检测接口尚未配置。";
    });
  }

  function nextQuiz() {
    if (state.quizIndex + 1 >= state.quiz.length) {
      startQuiz();
      return;
    }
    state.quizIndex += 1;
    renderQuiz();
  }

  function flipCard() {
    state.cardFlipped = !state.cardFlipped;
    renderCard();
  }

  function normalizeSpelling(value) {
    return value.toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function checkSpelling() {
    const item = state.spellingItem;
    if (!item || state.spellingAnswered) return;
    const answer = normalizeSpelling(el.spellingInput.value);
    const expected = normalizeSpelling(item.en);
    if (!answer) return;
    const ok = answer === expected;

    state.spellingAnswered = true;
    state.spellingLastCorrect = ok;
    el.spellingInput.disabled = true;
    document.querySelector("#checkSpelling").disabled = true;
    el.spellingMasteryActions.hidden = false;
    el.spellingKnow.className = ok ? "primary" : "";
    el.spellingMiss.className = ok ? "" : "primary";

    if (ok) {
      state.spellingCorrect += 1;
      state.progress.stats.spellingCorrect = (state.progress.stats.spellingCorrect || 0) + 1;
      el.spellingFeedback.className = "feedback good";
      el.spellingFeedback.textContent = "拼写正确。建议选择“我会了”。";
    } else {
      state.spellingWrong += 1;
      state.progress.stats.spellingWrong = (state.progress.stats.spellingWrong || 0) + 1;
      el.spellingFeedback.className = "feedback bad";
      el.spellingFeedback.textContent = `拼写错误。正确单词：${item.en}。建议选择“还不会”。`;
    }
    recordPractice("spelling");
    updateSpellingStats();
  }

  function updateSpellingStats() {
    const total = state.spellingCorrect + state.spellingWrong;
    const accuracy = total ? Math.round((state.spellingCorrect / total) * 100) : 0;
    el.spellingStats.textContent = `${state.spellingCorrect} 对 · ${state.spellingWrong} 错 · 已掌握 ${state.spellingMastered} · 未掌握 ${state.spellingUnmastered} · ${accuracy}%`;
  }

  function formatDateTime(value) {
    if (!value) return "暂无";
    return new Date(value).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  }

  function finishSpelling(isMastered) {
    const item = state.spellingItem;
    if (!item || !state.spellingAnswered) return;

    if (isMastered) {
      state.spellingMastered += 1;
      state.progress.mastered[item.id] = Date.now();
      delete state.progress.wrong[item.id];
      removeReviewById(item.id, "spelling");
      saveProgress();
      renderStats();
    } else {
      state.spellingUnmastered += 1;
      const previous = state.progress.wrong[item.id] || {};
      state.progress.wrong[item.id] = {
        id: item.id,
        type: "拼写",
        at: Date.now(),
        en: item.en,
        zh: item.zh,
        section: item.section,
        count: (previous.count || 0) + 1
      };
      addTomorrowReview({
        type: "spelling",
        id: item.id,
        text: item.en,
        meaning: item.zh
      });
      saveProgress();
      renderStats();
    }
    updateSpellingStats();
    nextSpelling();
  }

  function nextSpelling() {
    state.spellingItem = shuffle(spellingPool())[0];
    renderSpelling();
  }

  function tokenizeEnglish(text) {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9'\s-]/g, " ")
      .split(/\s+/)
      .filter(Boolean);
  }

  function diffWords(originalText, answerText) {
    const original = tokenizeEnglish(originalText);
    const answer = tokenizeEnglish(answerText);
    const dp = Array.from({ length: original.length + 1 }, () => Array(answer.length + 1).fill(0));

    for (let i = original.length - 1; i >= 0; i -= 1) {
      for (let j = answer.length - 1; j >= 0; j -= 1) {
        dp[i][j] = original[i] === answer[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }

    const parts = [];
    let i = 0;
    let j = 0;
    let correct = 0;
    let wrong = 0;
    let missing = 0;

    while (i < original.length || j < answer.length) {
      if (i < original.length && j < answer.length && original[i] === answer[j]) {
        parts.push({ type: "correct", word: original[i] });
        correct += 1;
        i += 1;
        j += 1;
      } else if (j < answer.length && (i === original.length || dp[i][j + 1] >= dp[i + 1]?.[j])) {
        parts.push({ type: "wrong", word: answer[j] });
        wrong += 1;
        j += 1;
      } else if (i < original.length) {
        parts.push({ type: "missing", word: original[i] });
        missing += 1;
        i += 1;
      }
    }

    return {
      parts,
      correct,
      wrong,
      missing,
      total: original.length,
      accuracy: original.length ? Math.round((correct / original.length) * 100) : 0
    };
  }

  function renderDictationResult(originalText, answerText) {
    const result = diffWords(originalText, answerText);
    if (result.accuracy < 100 && state.dictationItem) {
      markWrong({
        id: state.dictationItem.id,
        en: state.dictationItem.text,
        zh: state.dictationItem.hint || originalText,
        section: state.dictationItem.section
      }, "听写");
    } else {
      recordPractice("dictation");
    }
    el.dictationResult.innerHTML = `
      <div class="score-line">准确率 ${result.accuracy}% · 正确 ${result.correct} · 错误 ${result.wrong} · 漏写 ${result.missing}</div>
      <div class="word-diff">
        ${result.parts.map((part) => `<span class="${part.type}">${escapeHtml(part.word)}</span>`).join("")}
      </div>
    `;
  }

  function setRecordingButtons(status) {
    document.querySelector("#startRecording").disabled = status === "recording";
    document.querySelector("#stopRecording").disabled = status !== "recording";
    document.querySelector("#deleteRecording").disabled = !state.recordingUrl || status === "recording";
    document.querySelector("#submitRecording").disabled = !state.recordingUrl || status === "recording";
  }

  async function startRecording() {
    if (!navigator.mediaDevices || !window.MediaRecorder) {
      el.recordingFeedback.className = "feedback bad";
      el.recordingFeedback.textContent = "当前浏览器不支持录音。请用 iPhone/iPad 的 Safari 或最新版浏览器打开。";
      return;
    }

    deleteRecording();
    try {
      state.recordingStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      state.recordingChunks = [];
      state.recorder = new MediaRecorder(state.recordingStream);
      state.recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) state.recordingChunks.push(event.data);
      });
      state.recorder.addEventListener("stop", finishRecording);
      state.recorder.start();
      el.recordingStatus.textContent = "录音中...";
      el.recordingFeedback.className = "feedback";
      el.recordingFeedback.textContent = "";
      setRecordingButtons("recording");
    } catch {
      el.recordingFeedback.className = "feedback bad";
      el.recordingFeedback.textContent = "无法开启麦克风。请允许浏览器使用麦克风后再试。";
      setRecordingButtons("idle");
    }
  }

  function stopRecording() {
    if (state.recorder && state.recorder.state === "recording") {
      state.recorder.stop();
    }
    if (state.recordingStream) {
      state.recordingStream.getTracks().forEach((track) => track.stop());
      state.recordingStream = null;
    }
    setRecordingButtons("idle");
  }

  function finishRecording() {
    const blob = new Blob(state.recordingChunks, { type: state.recorder?.mimeType || "audio/webm" });
    if (state.recordingUrl) URL.revokeObjectURL(state.recordingUrl);
    state.recordingUrl = URL.createObjectURL(blob);
    el.recordingPlayback.src = state.recordingUrl;
    el.recordingPlayback.hidden = false;
    el.recordingStatus.textContent = "录音完成，可回放。";
    el.recordingFeedback.className = "feedback";
    el.recordingFeedback.textContent = "";
    setRecordingButtons("idle");
  }

  function deleteRecording() {
    if (state.recorder && state.recorder.state === "recording") {
      state.recorder.stop();
    }
    if (state.recordingStream) {
      state.recordingStream.getTracks().forEach((track) => track.stop());
      state.recordingStream = null;
    }
    if (state.recordingUrl) {
      URL.revokeObjectURL(state.recordingUrl);
      state.recordingUrl = "";
    }
    state.recordingChunks = [];
    el.recordingPlayback.removeAttribute("src");
    el.recordingPlayback.hidden = true;
    el.recordingStatus.textContent = "尚未录音";
    el.recordingFeedback.className = "feedback";
    el.recordingFeedback.textContent = "";
    setRecordingButtons("idle");
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  }

  function lookupDictionary(item) {
    if (!item) return;
    if (!dictionaryEndpoint) {
      el.dictionaryFeedback.className = "feedback";
      el.dictionaryFeedback.textContent = "词典接口尚未配置。";
      return;
    }
    el.dictionaryFeedback.className = "feedback";
    el.dictionaryFeedback.textContent = "词典查询接口已预留。";
  }

  loadProgress();
  ensureProgressShape();
  cleanupLegacyProgress();
  el.voiceAccentSelect.value = state.progress.voice.accent || "en-US";
  el.voiceRateSelect.value = state.progress.voice.rate || "slow";
  if ("speechSynthesis" in window) {
    window.speechSynthesis.onvoiceschanged = () => updateVoiceStatus();
  }
  updateVoiceStatus();
  setupSections();
  bindEvents();
  startQuiz();
  renderAll();
  setRecordingButtons("idle");
  registerServiceWorker();
})();
