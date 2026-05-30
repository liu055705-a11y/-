(async function () {
  const data = await (window.TOEFL_DATA_READY || Promise.resolve(window.TOEFL_DATA || { entries: [], speaking: [], dictation: [] }));
  const entries = data.entries;
  const storeKey = "toefl-review-state-v1";

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
      streak: 0,
      speakingDone: 0
    }
  };

  const el = {
    totalCount: document.querySelector("#totalCount"),
    masteredCount: document.querySelector("#masteredCount"),
    wrongCount: document.querySelector("#wrongCount"),
    streakCount: document.querySelector("#streakCount"),
    sectionSelect: document.querySelector("#sectionSelect"),
    directionSelect: document.querySelector("#directionSelect"),
    quizIndex: document.querySelector("#quizIndex"),
    quizSection: document.querySelector("#quizSection"),
    quizPrompt: document.querySelector("#quizPrompt"),
    answerInput: document.querySelector("#answerInput"),
    feedback: document.querySelector("#feedback"),
    cardSection: document.querySelector("#cardSection"),
    cardFront: document.querySelector("#cardFront"),
    cardBack: document.querySelector("#cardBack"),
    flashCard: document.querySelector("#flashCard"),
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

  function saveProgress() {
    localStorage.setItem(storeKey, JSON.stringify({ progress: state.progress }));
  }

  function sections() {
    return ["全部", ...Array.from(new Set(entries.map((item) => item.section)))];
  }

  function currentPool() {
    const base = state.section === "全部"
      ? entries
      : entries.filter((item) => item.section === state.section);
    return base.length ? base : entries;
  }

  function isValidSpellingItem(item) {
    const word = String(item?.en || item?.word || "").trim();
    if (!word || word.length > 40) return false;
    if (/[=\u3400-\u9fff；;/]/.test(word)) return false;
    return /^[a-zA-Z][a-zA-Z' -]*[a-zA-Z.]?$/.test(word);
  }

  function spellingPool() {
    const pool = currentPool().filter(isValidSpellingItem);
    return pool.length ? pool : entries.filter(isValidSpellingItem);
  }

  function buildDictationPool() {
    if (data.dictation?.length) {
      return data.dictation.filter((item) => item.text);
    }
    const phrases = entries
      .filter((item) => item.en.split(/\s+/).length >= 2)
      .map((item) => ({
        text: item.en,
        section: item.section,
        hint: item.zh
      }));
    const prompts = (data.speaking || []).map((item) => ({
      text: item.prompt,
      section: "口语题目",
      hint: item.targets.join(", ")
    }));
    return [...phrases, ...prompts].filter((item) => item.text);
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
    utterance.lang = "en-US";
    utterance.rate = 0.78;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
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

  function markMastered(item) {
    state.progress.mastered[item.id] = Date.now();
    delete state.progress.wrong[item.id];
    state.progress.streak += 1;
    saveProgress();
    renderStats();
  }

  function markWrong(item) {
    state.progress.wrong[item.id] = {
      at: Date.now(),
      en: item.en,
      zh: item.zh,
      section: item.section
    };
    state.progress.streak = 0;
    saveProgress();
    renderStats();
  }

  function clearFeedback() {
    el.feedback.className = "feedback";
    el.feedback.textContent = "";
    el.answerInput.value = "";
  }

  function renderStats() {
    el.totalCount.textContent = String(entries.length);
    el.masteredCount.textContent = String(Object.keys(state.progress.mastered).length);
    el.wrongCount.textContent = String(Object.keys(state.progress.wrong).length);
    el.streakCount.textContent = String(state.progress.streak || 0);
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
          <strong>${escapeHtml(item.en)}</strong>
          <small>${escapeHtml(item.zh)} · ${escapeHtml(item.section)}</small>
        </div>
        <button data-remove="${escapeHtml(item.en)}" aria-label="移除">✓</button>
      </div>
    `).join("");
  }

  function renderDictation() {
    if (!dictationPool.length) return;
    if (!state.dictationItem) {
      state.dictationItem = shuffle(dictationPool)[0];
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
      state.dictationItem = shuffle(dictationPool)[0];
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
      const button = event.target.closest("button[data-remove]");
      if (!button) return;
      const en = button.dataset.remove;
      const match = Object.entries(state.progress.wrong).find(([, item]) => item.en === en);
      if (match) delete state.progress.wrong[match[0]];
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
      el.spellingFeedback.className = "feedback good";
      el.spellingFeedback.textContent = "拼写正确。建议选择“我会了”。";
    } else {
      state.spellingWrong += 1;
      el.spellingFeedback.className = "feedback bad";
      el.spellingFeedback.textContent = `拼写错误。正确单词：${item.en}。建议选择“还不会”。`;
    }
    updateSpellingStats();
  }

  function updateSpellingStats() {
    const total = state.spellingCorrect + state.spellingWrong;
    const accuracy = total ? Math.round((state.spellingCorrect / total) * 100) : 0;
    el.spellingStats.textContent = `${state.spellingCorrect} 对 · ${state.spellingWrong} 错 · 已掌握 ${state.spellingMastered} · 未掌握 ${state.spellingUnmastered} · ${accuracy}%`;
  }

  function finishSpelling(isMastered) {
    const item = state.spellingItem;
    if (!item || !state.spellingAnswered) return;

    if (isMastered) {
      state.spellingMastered += 1;
      markMastered(item);
    } else {
      state.spellingUnmastered += 1;
      markWrong(item);
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

  loadProgress();
  cleanupLegacyProgress();
  setupSections();
  bindEvents();
  startQuiz();
  renderAll();
  setRecordingButtons("idle");
  registerServiceWorker();
})();
