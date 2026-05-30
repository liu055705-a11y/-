import { readFileSync } from "node:fs";

const files = {
  words: "outputs/toefl-app/data/words.json",
  dictation: "outputs/toefl-app/data/dictation.json",
  speaking: "outputs/toefl-app/data/speaking.json"
};

const issues = [];
const chinesePattern = /[\u3400-\u9fff]/;
const reviewPattern = /间隔复习安排|复习安排|今天\s*\d{4}-\d{2}-\d{2}|明天\s*\d{4}-\d{2}-\d{2}|\d+\s*天后\s*\d{4}-\d{2}-\d{2}/;
const datePattern = /^\s*(今天|明天|\d+\s*天后)?\s*\d{4}-\d{2}-\d{2}\s*$/;
const mostlyEnglishPattern = /[a-zA-Z]/;

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function addIssue(id, field, content, reason) {
  issues.push({
    id: id || "(missing id)",
    field,
    content: String(content ?? ""),
    reason
  });
}

function looksLikeLongExplanation(value) {
  const text = String(value || "").trim();
  if (text.length > 80) return true;
  if (/[.!?。！？]/.test(text) && text.split(/\s+/).length > 8) return true;
  return false;
}

function checkWords() {
  const words = readJson(files.words);
  for (const item of words) {
    const word = String(item.word ?? "").trim();
    if (!word) addIssue(item.id, "word", item.word, "word 不能为空");
    if (chinesePattern.test(word)) addIssue(item.id, "word", word, "word 不能包含中文");
    if (word.includes("=")) addIssue(item.id, "word", word, "word 不能包含 =");
    if (word.includes("；") || word.includes(";")) addIssue(item.id, "word", word, "word 不能包含 ； 或 ;");
    if (word.includes("/")) addIssue(item.id, "word", word, "word 不能包含 /");
    if (reviewPattern.test(word) || datePattern.test(word)) addIssue(item.id, "word", word, "word 不能是日期或复习安排");
    if (looksLikeLongExplanation(word)) addIssue(item.id, "word", word, "word 不能是说明性长句");
  }
}

function checkDictation() {
  const dictation = readJson(files.dictation);
  for (const item of dictation) {
    const text = String(item.text ?? "").trim();
    if (text.includes("间隔复习安排")) addIssue(item.id, "text", text, "text 不能包含“间隔复习安排”");
    if (reviewPattern.test(text) || datePattern.test(text)) addIssue(item.id, "text", text, "text 不能是日期安排");
    if (!mostlyEnglishPattern.test(text)) addIssue(item.id, "text", text, "text 应该主要是英文句子或英文短语");
  }
}

function checkSpeaking() {
  const speaking = readJson(files.speaking);
  for (const item of speaking) {
    const question = String(item.question ?? "").trim();
    if (!question) addIssue(item.id, "question", item.question, "question 不能为空");
    if (question.includes("间隔复习安排") || reviewPattern.test(question)) {
      addIssue(item.id, "question", question, "question 不应包含复习安排");
    }
  }
}

checkWords();
checkDictation();
checkSpeaking();

if (issues.length) {
  console.log("发现可疑数据：");
  console.table(issues);
  process.exitCode = 1;
} else {
  console.log("数据质量检查通过。");
}
