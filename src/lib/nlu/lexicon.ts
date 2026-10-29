/**
 * Multilingual lexicon for the deterministic extraction engine (PRD 6.2 step 6).
 * Covers English, Hindi (Devanagari), Hinglish (romanised Hindi), Bengali and Tamil.
 * No model, no API key: extraction is grammar + lexicon driven, exactly as the
 * blueprint requires ("the LLM is never the decision-maker for safety").
 */

export type Lang = "en" | "hi" | "bn" | "ta";

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** Trim a phrase list into a regex alternation (longest first so "chest pain" wins). */
export function alt(...lists: (string[] | undefined)[]): string {
  const items = lists
    .flat()
    .filter(Boolean)
    .map((s) => s!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .sort((a, b) => b.length - a.length);
  return items.join("|");
}

// ---------------------------------------------------------------- red flags
export const RED_FLAGS: { key: string; phrases: string[]; label: string }[] = [
  {
    key: "chest_pain",
    label: "chest pain",
    phrases: [
      "chest pain", "chest discomfort", "chest tightness", "chest pressure", "pain in chest",
      "heart pain", "seene me dard", "seene mein dard", "chhati me dard", "chhati mein dard",
      "छाती में दर्द", "सीने में दर्द", "छाती दर्द", "बुक्का",
      "বুকে ব্যথা", "বুক চেপে", "বুকের ব্যাথা",
      "மார்பு வலி", "நெஞ்சு வலி", "நெஞ்சு பிடி", "நெஞ்சு பாரம்",
    ],
  },
  {
    key: "breathless",
    label: "difficulty breathing",
    phrases: [
      "cannot breathe", "can't breathe", "cant breathe", "unable to breathe", "shortness of breath",
      "short of breath", "breathless", "breathlessness", "gasping", "saans nahi", "saans nahi aa rahi",
      "saans phool", "dam ghut", "दम घुट", "सांस नहीं", "साँस नहीं", "सांस फूल", "साँस फूल",
      "শ্বাস নিতে", "শ্বাসকষ্ট", "দম বন্ধ", "श्वास",
      "மூச்சு விட", "மூச்சுத்திணறல்", "மூச்சு வரவில்லை",
    ],
  },
  {
    key: "fainting",
    label: "fainting",
    phrases: [
      "fainted", "fainting", "passed out", "blacked out", "unconscious", "collapsed",
      "behosh", "चक्कर आकर गिर", "बेहोश", "अचेत",
      "অচেতন", "জ্ঞান হার", "মূর্ছা",
      "மயக்கம்", "சுயநினைவு இழ",
    ],
  },
  {
    key: "bleeding",
    label: "severe bleeding",
    phrases: [
      "severe bleeding", "heavy bleeding", "bleeding a lot", "blood loss", "profuse bleeding",
      "bahut khoon", "khoon beh raha", "बहुत खून", "खून बह", "रक्तस्राव",
      "রক্তক্ষরণ", "অনেক রক্ত",
      "அதிக இரத்த", "இரத்தப்போக்கு",
    ],
  },
  {
    key: "stroke",
    label: "stroke signs",
    phrases: [
      "face drooping", "face droop", "slurred speech", "cannot speak", "can't speak", "cannot move arm",
      "weakness on one side", "one side weakness", "paralysis", "muh tedha", "baat samajh nahi",
      "लकवा", "पक्षाघात", "मुँह टेढ़ा", "बोली लड़खड़ा", "बात साफ नहीं",
      "পক্ষাঘাত", "মুখ বেঁকে", "কথা জড়িয়ে",
      "பக்கவாதம்", "பேச்சு தடை", "முகம் கோணல்",
    ],
  },
];

export const redFlagRegex = new RegExp(`(${alt(...RED_FLAGS.map((r) => r.phrases))})`, "i");

// ----------------------------------------------------------------- symptoms
export type SymptomDef = {
  key: string;
  label: string;
  bodyPart: string;
  phrases: string[];
  severityHint?: "mild" | "moderate" | "severe";
};

export const SYMPTOMS: SymptomDef[] = [
  {
    key: "abdominal_pain", label: "stomach pain", bodyPart: "abdomen", phrases: [
      "stomach pain", "stomach ache", "abdominal pain", "belly pain", "tummy pain", "cramps in stomach",
      "pet me dard", "pet mein dard", "pet dard", "pet me aithan", "pet me ethan", "pet me jalan",
      "पेट में दर्द", "पेट दर्द", "पेट में ऐठन", "पेट में जलन", "पेट में मरोड़", "पेट फूल",
      "পেটে ব্যথা", "পেট ব্যথা", "পেটে জ্বালা", "পেট খারাপ",
      "வயிற்று வலி", "வயிறு வலி", "வயிற்றில் வலி", "வயிறு எரிச்சல்",
    ],
  },
  {
    key: "acidity", label: "acidity", bodyPart: "abdomen", phrases: [
      "acidity", "acid reflux", "acidity problem", "gas problem", "gas", "heartburn",
      "khatti dikar", "khatti dakar", "khट्टी डकार", "एसिडिटी", "गैस", "अम्लता",
      "অ্যাসিডিটি", "গ্যাস", "বুক জ্বালা",
      "அமிலத்தன்மை", "வாயு", "நெஞ்செரிச்சல்",
    ],
  },
  { key: "headache", label: "headache", bodyPart: "head", phrases: [
      "headache", "head pain", "migraine", "sir dard", "sar dard", "sir me dard",
      "सिर दर्द", "सर दर्द", "सिर में दर्द", "माइग्रेन",
      "মাথা ব্যথা", "মাথাব্যথা", "মাথা ধরা",
      "தலைவலி", "தலை வலி", "தலை வலிக்கிறது",
    ] },
  { key: "fever", label: "fever", bodyPart: "whole body", phrases: [
      "fever", "temperature", "high temperature", "bukhar", "बुखार", "ज्वर", "তাপ", "জ্বর", "காய்ச்சல்",
    ] },
  { key: "cough", label: "cough", bodyPart: "chest", phrases: [
      "cough", "coughing", "khansi", "खांसी", "खाँसी", "কাশি", "இருமல்",
    ] },
  { key: "cold", label: "cold", bodyPart: "nose", phrases: [
      "cold", "running nose", "runny nose", "blocked nose", "sardi", "zukam", "सर्दी", "जुकाम", "নাক দিয়ে জল", "சளி", "மூக்கு ஒழுகு",
    ] },
  { key: "sore_throat", label: "sore throat", bodyPart: "throat", phrases: [
      "sore throat", "throat pain", "gale me dard", "gala kharab", "गले में दर्द", "गला खराब", "গলা ব্যথা", "தொண்டை வலி",
    ] },
  {
    key: "breathlessness", label: "breathlessness", bodyPart: "chest", severityHint: "severe", phrases: [
      "breathlessness", "short of breath", "cant breathe", "can't breathe", "heavy breathing",
      "saans phool", "saans phul", "सांस फूल", "সাঁস ফুল",
      "শ্বাসকষ্ট", "மூச்சுத்திணறல்",
    ],
  },
  { key: "body_pain", label: "body ache", bodyPart: "whole body", phrases: [
      "body pain", "body ache", "aching all over", "badan dard", "बदन दर्द", "शरीर दर्द", "शरीर में दर्द",
      "শরীর ব্যথা", "গা ব্যথা", "உடல் வலி", "உடம்பு வலி",
    ] },
  { key: "joint_pain", label: "joint pain", bodyPart: "joints", phrases: [
      "joint pain", "knee pain", "ghutne me dard", "jodo me dard", "जोड़ों में दर्द", "घुटनों में दर्द",
      "গাঁটে ব্যথা", "হাঁটু ব্যথা", "மூட்டு வலி", "முழங்கால் வலி",
    ] },
  { key: "dizziness", label: "dizziness", bodyPart: "head", phrases: [
      "dizziness", "dizzy", "vertigo", "chakkar", "चक्कर", "মাথা ঘোরা", "তাল মাথা", "தலைச்சுற்றல்",
    ] },
  { key: "nausea", label: "nausea", bodyPart: "abdomen", phrases: [
      "nausea", "nauseous", "vomiting", "vomit", "throwing up", "ulti", "ji michla",
      "उल्टी", "जी मिचलाना", "मतली", "বমি", "বমি ভাব", "வாந்தி", "குமட்டல்",
    ] },
  { key: "loose_motion", label: "loose motions", bodyPart: "abdomen", phrases: [
      "loose motion", "loose motions", "diarrhea", "diarrhoea", "dast", "दस्त", "লুজ মোশন", "డయేरिया", "வயிற்றுப்போக்கு",
    ] },
  { key: "constipation", label: "constipation", bodyPart: "abdomen", phrases: [
      "constipation", "kabz", "कब्ज", "কোষ্ঠকাঠিন্য", "மலச்சிக்கல்",
    ] },
  { key: "toothache", label: "toothache", bodyPart: "teeth", phrases: [
      "toothache", "tooth pain", "dant dard", "दांत दर्द", "दाँत दर्द", "দাঁত ব্যথা", "பல் வலி",
    ] },
  { key: "back_pain", label: "back pain", bodyPart: "back", phrases: [
      "back pain", "backache", "kamar dard", "कमर दर्द", "পিঠে ব্যথা", "কোমর ব্যথা", "முதுகு வலி", "இடுப்பு வலி",
    ] },
  { key: "chest_discomfort", label: "chest discomfort", bodyPart: "chest", severityHint: "severe", phrases: [
      "chest discomfort", "chest tightness", "chest heavy", "seene me bhaari", "छाती भारी", "বুক চাপ", "மார்பு பாரம்",
    ] },
  { key: "palpitations", label: "palpitations", bodyPart: "chest", phrases: [
      "palpitations", "heart racing", "dhak dhak", "dhadkan tez", "धड़कन तेज", "धकधक", "বুক ধড়ফড়", "இதய துடிப்பு",
    ] },
  { key: "swelling", label: "swelling", bodyPart: "legs", phrases: [
      "swelling", "swollen", "sujan", "sujhan", "सूजन", "फूला", "ফোলা", "வீக்கம்",
    ] },
  { key: "rash", label: "rash", bodyPart: "skin", phrases: [
      "rash", "itching", "itchy", "khujli", "दाने", "खुजली", "चकत्ते", "চুলকানি", "தோல் அரிப்பு", "அரிப்பு",
    ] },
  { key: "burning_urine", label: "burning urine", bodyPart: "urinary", phrases: [
      "burning urine", "burning while passing urine", "peshab me jalan", "पेशाब में जलन", "প্রস্রাবে জ্বালা", "சிறுநீர் எரிச்சல்",
    ] },
  { key: "weakness", label: "weakness", bodyPart: "whole body", phrases: [
      "weakness", "weak", "tired", "tiredness", "fatigue", "no energy", "kamzori", "thakan",
      "कमजोरी", "थकान", "कमज़ोरी", "দুর্বল", "ক্লান্তি", "பலவீனம்", "சோர்வு",
    ] },
  { key: "sweating", label: "sweating", bodyPart: "whole body", phrases: [
      "sweating", "sweaty", "pasina", "पसीना", "ঘাম", "வியர்வை",
    ] },
  { key: "appetite_loss", label: "appetite loss", bodyPart: "whole body", phrases: [
      "no appetite", "lost appetite", "not eating", "bhukh nahi", "bhookh nahi", "भूख नहीं", "খিদে নেই", "பசி இல்லை",
    ] },
  { key: "eye_problem", label: "eye problem", bodyPart: "eyes", phrases: [
      "blurred vision", "blurry vision", "eye pain", "aankh dard", "dhundhla", "आंख दर्द", "धुंधला", "চোখ ব্যথা", "கண் வலி",
    ] },
  { key: "sleep_problem", label: "sleep problem", bodyPart: "whole body", phrases: [
      "cannot sleep", "can't sleep", "insomnia", "neend nahi", "नींद नहीं", "ঘুম হচ্ছে না", "தூக்கம் இல்லை",
    ] },
  {
    key: "period_pain", label: "period pain", bodyPart: "pelvis", phrases: [
      "period pain", "menstrual cramps", "periods pain", "masik dard", "मासिक दर्द", "পিরিয়ড ব্যথা", "மாதவிடாய் வலி",
    ],
  },
];

// --------------------------------------------------------------------- mood
export const MOOD_LOW = [
  "low", "sad", "upset", "irritated", "irritable", "anxious", "worried", "stressed", "stress",
  "not happy", "depressed", "mood off", "disturbed", "restless", "tension", "pareshan", "udaas",
  "dukhi", "chidchida", "gussa", "pareshani", "उदास", "परेशान", "तनाव", "चिड़चिड़ा", "गुस्सा", "बेचैन", "मन खराब",
  "মন খারাপ", "দুশ্চিন্তা", "রাগ", "চিন্তা", "বিরক্ত",
  "மனச்சோர்வு", "கவலை", "கோபம்", "சோகம்", "பதட்டம்",
];
export const MOOD_GOOD = [
  "good", "happy", "great", "fine", "well", "calm", "relaxed", "better", "cheerful", "energetic",
  "achha", "accha", "badhiya", "maza", "khush", "शांत", "अच्छा", "खुश", "बढ़िया", "आराम",
  "ভালো", "খুশি", "শান্ত", "আরাম",
  "நன்றாக", "மகிழ்ச்சி", "அமைதி", "நிம்மதி",
];
export const MOOD_VERY_LOW = [
  "very low", "very sad", "very upset", "extremely low", "hopeless", "crying", "cried",
  "bahut udaas", "bahut dukhi", "rone", "बहुत उदास", "रो रही", "रो रहा", "बहुत परेशान",
  "очень", "খুব মন খারাপ", "কাঁদছি", "மிகவும் சோகம்", "அழுதேன்",
];
export const ENERGY_LOW = [
  "tired", "very tired", "exhausted", "no energy", "weak", "drained", "sleepy", "lethargic",
  "thak gaya", "thak gayi", "bahut thakan", "बहुत थकान", "थका", "थकी", "सुस्त", "आलस",
  "ক্লান্ত", "অবসন্ন", "আলসে", "சோர்வு", "களைப்பு", "சோம்பல்",
];
export const ENERGY_HIGH = [
  "energetic", "fresh", "active", "full of energy", "fit", "chust", "taaza", "फ्रेश", "ताज़ा", "ऊर्जा", "चुस्त",
  "প্রাণবন্ত", "সতেজ", "புத்துணர்ச்சி", "ஆரோக்கியம்",
];

// -------------------------------------------------------------------- stress
export const STRESS_EVENTS = [
  "fight", "argument", "quarrel", "work pressure", "office pressure", "deadline", "meeting",
  "exam", "tension at home", "family problem", "money problem", "fight at work",
  "jhagda", "larai", "kalesh", "झगड़ा", "लड़ाई", "कलेश", "दफ्तर का दबाव", "परीक्षा",
  "ঝগড়া", "চাপ", "পরীক্ষা", "தகராறு", "அழுத்தம்", "தேர்வு",
];

// ---------------------------------------------------------------- food/water
export const FOOD_TAGS: { tag: string; phrases: string[] }[] = [
  { tag: "heavy_dinner", phrases: ["heavy dinner", "heavy meal at night", "bhari dinner", "late dinner", "raat ko bhari khana", "भारी डिनर", "रात को भारी खाना", "দেরিতে খাওয়া", "பலமான இரவு உணவு"] },
  { tag: "fried", phrases: ["fried", "oily", "greasy", "pakoda", "samosa", "chips", "तला", "तली", "ऑयली", "पकौड़ा", "समोसा", "ভাজা", "পেঁয়াজু", "பொரித்த", "எண்ணெய்"] },
  { tag: "sweet", phrases: ["sweet", "mithai", "sugar in tea", "dessert", "मिठाई", "मीठा", "চিনি", "মিষ্টি", "இனிப்பு"] },
  { tag: "light", phrases: ["light dinner", "light meal", "halka khana", "khichdi", "dal chawal", "हल्का खाना", "खिचड़ी", "दाल चावल", "হালকা খাবার", "இலகுவான உணவு"] },
  { tag: "outside_food", phrases: ["outside food", "restaurant", "hotel food", "bahar ka khana", "बाहर का खाना", "รีস্টোরেন্ট", "বাইরের খাবার", "வெளி உணவு"] },
  { tag: "vegetables", phrases: ["vegetables", "salad", "sabzi", "sabji", "सब्जी", "सलाद", "সবজি", "காய்கறி"] },
  { tag: "fruit", phrases: ["fruit", "fruits", "apple", "banana", "phal", "फल", "আপেল", "কলা", "பழம்", "வாழை"] },
  { tag: "tea_coffee", phrases: ["tea", "coffee", "chai", "चाय", "कॉफी", "চা", "কফি", "டீ", "காபி"] },
  { tag: "rice_roti", phrases: ["rice", "roti", "chapati", "chawal", "भात", "चावल", "रोटी", "ভাত", "রুটি", "சாதம்", "சப்பாத்தி"] },
  { tag: "skipped_meal", phrases: ["skipped", "did not eat", "didnt eat", "khana nahi khaya", "खाना नहीं खाया", "খাইনি", "சாப்பிடவில்லை"] },
];
export const WATER_LOW = [
  "little water", "less water", "no water", "didn't drink water", "pani kam", "kam pani", "pani nahi",
  "पानी कम", "कम पानी", "पानी नहीं", "পানি কম", "জল কম", "தண்ணீர் குறைவு",
];
export const WATER_OK = [
  "drank water", "8 glasses", "good water", "pani piya", "khub pani", "पानी पिया", "खूब पानी", "পানি খেয়েছি", "தண்ணீர் குடித்தேன்",
];

// ------------------------------------------------------------------ activity
export const ACTIVITY_WORDS = [
  "walk", "walked", "walking", "jog", "jogging", "run", "ran", "yoga", "exercise", "gym", "cycling",
  "swim", "सैर", "टहला", "टहली", "चला", "दौड़", "योग", "व्यायाम", "जिम", "साइकिल",
  "হাঁটা", "দৌড়", "যোগব্যায়াম", "সাইকেল", "நடை", "நடந்தேன்", "ஓட்டம்", "யோகா", "உடற்பயிற்சி",
];

// ----------------------------------------------------------------- questions
export const QUESTION_MARKERS = [
  "can i", "should i", "is it ok", "is it okay", "what should", "do i need", "how long",
  "kya main", "kya mujhe", "kaise", "kitna", "kyun", "क्या मैं", "क्या मुझे", "कैसे", "कितना", "क्यों",
  "আমি কি", "কত", "কেন", "কিভাবে", "எனக்கு", "எப்படி", "எத்தனை", "ஏன்",
];

// ------------------------------------------------------ vitals / medication
export const VITAL_WORDS = {
  bp: ["bp", "b p", "blood pressure", "बीपी", "ब्लड प्रेशर", "রক্তচাপ", "বিপি", "இரத்த அழுத்தம்"],
  sugar: ["sugar", "glucose", "blood sugar", "शुगर", "मधुमेह", "চিনি", "সুগার", "சர்க்கரை", "இரத்த சர்க்கரை"],
  fasting: ["fasting", "empty stomach", "khali pet", "khali pet", "खाली पेट", "उपवास", "খালি পেট", "வெற்ற வயிறு"],
  postmeal: ["post meal", "after meal", "after food", "khane ke baad", "khaana kha ke", "खाने के बाद", "খাবার পরে", "உணவுக்குப் பின்"],
  weight: ["weight", "वजन", "ওজন", "எடை"],
  spo2: ["spo2", "oxygen", "ऑक्सीजन", "অক্সিজেন", "ஆக்சிஜன்"],
  temp: ["temperature", "temp", "बुखार", "ज्वर", "জ্বর", "காய்ச்சல்"],
};
export const MEDICINE_TAKEN = [
  "took my medicine", "took medicine", "took my tablet", "took tablet", "medicine li", "dawa li",
  "goli li", "dawa kha li", "दवा ली", "गोली ली", "दवाई ली", "ঔষধ খেয়েছি", "ওষুধ খেয়েছি", "மாத்திரை சாப்பிட்டேன்", "மருந்து சாப்பிட்டேன்",
];
export const MEDICINE_MISSED = [
  "forgot my tablet", "forgot tablet", "forgot medicine", "missed my medicine", "missed tablet",
  "did not take medicine", "dawa nahi li", "goli bhul", "dawa bhul", "दवा नहीं ली", "दवाई भूल", "गोली भूल",
  "ঔষধ খাইনি", "ওষুধ ভুলে", "மாத்திரை மறந்து", "மருந்து மறந்து",
];

// Romanised Hinglish sleep words matter as much as the Devanagari ones: pilot
// users say "7 ghante soyi" far more often than they type "सोई".
export const SLEEP_WORDS = ["sleep", "slept", "sleeping", "night sleep", "soya", "soyi", "soye", "soye hain", "neend", "नींद", "सोया", "सोई", "ঘুম", "தூக்கம்", "உறக்கம்"];
export const SLEEP_LOW_QUALITY = ["restless", "woke up", "awake", "tossed", "broken sleep", "neend nahi", "नींद नहीं", "बार-बार जाग", "ঘুম ভেঙে", "தூக்கம் கலைந்தது"];

// symptom key -> graph node label
export const SYMPTOM_BY_KEY: Record<string, SymptomDef> = Object.fromEntries(
  SYMPTOMS.map((s) => [s.key, s]),
);

export function detectLang(text: string): Lang {
  const t = norm(text);
  if (/[\u0980-\u09FF]/.test(t)) return "bn";
  if (/[\u0B80-\u0BFF]/.test(t)) return "ta";
  if (/[\u0900-\u097F]/.test(t)) return "hi";
  return "en";
}

export { norm };
