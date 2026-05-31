window.TOEFL_DATA_READY = Promise.all([
  fetch("./data/words.json").then((response) => response.json()),
  fetch("./data/speaking.json").then((response) => response.json()),
  fetch("./data/dictation.json").then((response) => response.json()),
  fetch("./data/word-updates.json").then((response) => response.ok ? response.json() : []).catch(() => [])
]).then(([words, speaking, dictation, updates]) => {
  const entries = words.map((item) => ({
    ...item,
    en: item.en || item.word,
    zh: item.meaning || item.zh,
    section: item.section || item.category || "综合"
  }));

  const speakingItems = speaking.map((item) => ({
    ...item,
    source: "speaking.json",
    prompt: item.prompt || item.question,
    targets: item.targets || item.tips || []
  }));

  window.TOEFL_DATA = {
    generatedAt: new Date().toISOString(),
    entries,
    speaking: speakingItems,
    dictation,
    updates: Array.isArray(updates) ? updates : []
  };

  return window.TOEFL_DATA;
});
