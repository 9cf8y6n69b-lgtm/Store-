// إعدادات ميزات الرومات (خط تلقائي، ريأكشن، صور فقط، رد تلقائي...) لكل سيرفر
const Pro = require("../prodb");
const key = g => `feat_${g}`;
const DEF = () => ({ pic: [], avt: [], feel: [], feedrate: [], rchat: { rooms: [], text: "", color: "#2b2d31", image: "" }, autoline: [], lineUrl: "", react: {}, absence: [], cut: { room: null, questions: [], images: [] }, autoreply: [], clear: {}, ecolor: "#2b2d31" });
const get = g => { const s = Pro.get(key(g)) || {}; const d = DEF(); for (const k in d) if (s[k] === undefined) s[k] = d[k]; if (!s.rchat.rooms) s.rchat = d.rchat; if (!s.cut.questions) s.cut = d.cut; return s; };
const save = (g, s) => Pro.set(key(g), s);
const edit = (g, fn) => { const s = get(g); fn(s); save(g, s); return s; };
const toggle = (arr, id) => { const i = arr.indexOf(id); if (i >= 0) { arr.splice(i, 1); return false; } arr.push(id); return true; };

const QUESTIONS = ["لو عندك مليون دولار وش أول شي تسويه؟", "أغرب أكلة جربتها؟", "وش الشي اللي يخليك تضحك بدون سبب؟", "مين أقرب شخص لك وليش؟", "لو تقدر تسافر لأي دولة الحين وين تروح؟", "وش أكثر عادة تزعجك في الناس؟", "أفضل ذكرى في حياتك؟", "لو رجع بك الزمن سنة وش تغير؟", "وش الصفة اللي تحب تشوفها في صديقك؟", "قهوة ولا شاي؟", "ليل ولا نهار؟", "وش أول تطبيق تفتحه الصبح؟", "أكثر كلمة تقولها؟", "لو كنت مدير السيرفر يوم واحد وش تسوي؟", "وش الهواية اللي تتمنى تتعلمها؟", "آخر شي ضحكك؟", "مين قدوتك؟", "أحسن نصيحة جاتك؟", "وش الشي اللي ما تستغني عنه؟", "أجمل مكان زرته؟", "لو تصير حيوان وش تختار؟", "وش أصعب قرار أخذته؟", "فلم ما تمل منه؟", "أكلة تأكلها كل يوم ما تمل؟", "وش الشي اللي تتمنى يتغير في العالم؟"];
module.exports = { get, save, edit, toggle, QUESTIONS };
