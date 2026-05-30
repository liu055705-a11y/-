window.TOEFL_DATA_READY = Promise.all([
  fetch("./data/words.json").then((response) => response.json()),
  fetch("./data/speaking.json").then((response) => response.json()),
  fetch("./data/dictation.json").then((response) => response.json())
]).then(([words, speaking, dictation]) => {
  const entries = words.map((item) => ({
    ...item,
    en: item.en || item.word,
    zh: item.zh || item.meaning,
    section: item.section || item.category || "综合"
  }));

  const speakingItems = speaking.map((item) => ({
    ...item,
    prompt: item.prompt || item.question,
    targets: item.targets || item.tips || []
  }));

  window.TOEFL_DATA = {
    generatedAt: new Date().toISOString(),
    entries,
    speaking: speakingItems,
    dictation
  };

  return window.TOEFL_DATA;
});
