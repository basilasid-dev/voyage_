import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dictionaries, formatDuration, formatTime, translate, type TKey } from "../src/lib/i18n";

const en = dictionaries.en;
const ml = dictionaries.ml;
const keys = Object.keys(en) as TKey[];
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const MALAYALAM = /[ഀ-ൿ]/;

describe("translations", () => {
  it("English and Malayalam define exactly the same messages", () => {
    assert.deepEqual(Object.keys(ml).sort(), Object.keys(en).sort());
  });

  it("no message is empty, padded or has doubled spaces", () => {
    for (const lang of [en, ml] as Record<string, string>[]) {
      for (const k of keys) {
        const s = lang[k];
        assert.ok(s && s.trim() === s, `${k} is empty or padded`);
        assert.ok(!/ {2,}/.test(s), `${k} has double spaces`);
        assert.ok(!/todo|xxx|lorem/i.test(s), `${k} looks unfinished`);
      }
    }
  });

  it("both languages use the same {placeholders}", () => {
    for (const k of keys) assert.deepEqual(placeholders(ml[k]), placeholders(en[k]), k);
  });

  it("every Malayalam message is actually Malayalam (no untranslated English left over)", () => {
    const allowedLatin = new Set(["README", "RTI", "PDF"]); // names that are kept as they are
    for (const k of keys) {
      assert.match(ml[k], MALAYALAM, `${k} has no Malayalam text`);
      const words = (ml[k].replace(/\{\w+\}/g, "").match(/[A-Za-z]{2,}/g) ?? []).filter((w) => !allowedLatin.has(w));
      assert.deepEqual(words, [], `${k} contains English words: ${words.join(", ")}`);
    }
  });

  it("uses one Malayalam word for each key term, everywhere", () => {
    // [English pattern, required Malayalam stem]. A change here must be a deliberate glossary decision.
    const glossary: [RegExp, string, string][] = [
      [/verified/i, "സ്ഥിരീകരി", "verified"], // root: covers സ്ഥിരീകരിച്ച, സ്ഥിരീകരിക്കാത്ത, സ്ഥിരീകരിച്ചിട്ടില്ല
      [/demo/i, "ഡെമോ", "demo"],
      [/\bfares?\b/i, "നിരക്ക", "fare"], // stem: നിരക്ക് / നിരക്കും / നിരക്കിന്
      [/\bstops?\b/i, "സ്റ്റോപ്പ", "stop"], // stem: matches both സ്റ്റോപ്പ് and സ്റ്റോപ്പുകൾ
      [/\breport/i, "അറിയി", "report"],
      [/bus change|change bus/i, "ബസ് മാറ്റ|ബസ് മാറേണ്ട", "bus change"],
      [/operator/i, "ഉടമ", "operator"],
    ];
    for (const k of keys) {
      for (const [re, stem, name] of glossary) {
        if (re.test(en[k])) assert.ok(new RegExp(stem).test(ml[k]), `${k}: English mentions "${name}" but Malayalam lacks "${stem}"\n  ${ml[k]}`);
      }
    }
  });

  it("the same status word is used in short and long forms", () => {
    assert.match(ml.statusVerified, /സ്ഥിരീകരിച്ച/);
    assert.match(ml.statusVerifiedLong, /സ്ഥിരീകരിച്ച|ഒത്തുനോക്കി/);
    assert.match(ml.statusUnverified, /സ്ഥിരീകരിച്ചിട്ടില്ല/);
    assert.match(ml.statusUnverifiedLong, /സ്ഥിരീകരിക്കാത്ത/);
    assert.match(ml.statusDemo, /ഡെമോ/);
    assert.match(ml.statusDemoLong, /ഡെമോ/);
  });

  it("never promises anything the app does not do", () => {
    // These must always say there is no live information and that fares are not estimated.
    assert.match(en.timetableOnly, /No live tracking/);
    assert.match(en.fareUnavailableHint, /never estimate/i);
    assert.match(ml.timetableOnly, /തത്സമയ/);
    assert.match(ml.fareUnavailableHint, /ഊഹിക്കില്ല/);
    for (const k of keys) assert.ok(!/live (bus )?(location|arrival|position)|arrives in \d+/i.test(en[k].replace(en.timetableOnly, "")), k);
  });

  it("substitutes variables and falls back safely", () => {
    assert.equal(translate("en", "directMany", { n: 3 }), "3 direct buses");
    assert.match(translate("ml", "fieldTooShort", { n: 10 }), /10/);
    assert.equal(translate("en", "reportThanks").includes("{"), false);
  });

  it("formats times and durations in both languages", () => {
    assert.equal(formatTime(0), "12:00 AM");
    assert.equal(formatTime(12 * 60 + 5), "12:05 PM");
    assert.equal(formatTime(24 * 60 + 30), "12:30 AM");
    assert.equal(formatDuration(95, "en"), "1 h 35 min");
    assert.equal(formatDuration(120, "en"), "2 h");
    assert.equal(formatDuration(95, "ml"), "1 മണി. 35 മിനിറ്റ്");
  });
});
