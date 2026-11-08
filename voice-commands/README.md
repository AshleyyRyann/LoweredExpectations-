# Reverse Voice Commands (prototype)

A command language for speech-to-text. You dictate normally, and when you want
to *do* something instead of *say* something, you say a word backwards. Nobody
says "EDOMTIDE" by accident, so commands never fire in the middle of normal
speech.

## Try it

Open `index.html` in **Chrome or Edge** (they support live speech
recognition), click **Start listening**, and talk. You can also type into the
"Pretend I said" box to test without a microphone.

Example session:

1. Say: *"Hey can you send me the notes from today"*
2. Say: **EDOMTIDE** ("EH-dom-tide"). The badge turns orange and you're in edit mode.
3. Say: *"backspace five"*, *"type tomorrow"*, *"exit"*
4. Keep dictating.

## The language

**Dictation mode: backwards words**

| Say | Meaning | Comes from |
|---|---|---|
| `EDOMTIDE` | Enter edit mode (voice keyboard) | edit mode |
| `EDOMLLEPS` | Enter spell mode (letter by letter) | spell mode |
| `KCABOG` | Undo the last thing you dictated | go back |
| `ENILWEN` | Line break | new line |
| `GNINETSIL` | Pause; say it again to resume | listening |

**Edit mode:** plain keyboard words, because you've switched modes on purpose.
`backspace`, `delete word`, `delete line`, `new line`, `space`, `left` /
`right`, `word left` / `word right`, `go to start` / `go to end`,
`select all`, `select word`, `clear all`, `undo`, `redo`, `capitalize`,
`all caps`, `lowercase`, punctuation (`period`, `comma`, `question mark`…),
`type …` to type words literally, and `exit` to go back to dictation. Most
commands take a count: "backspace five", "left three".

**Spell mode:** letters ("a", "bee"), NATO words ("alpha", "bravo"), digits,
`cap` (capitalizes the next letter), `space`, `backspace`, `exit`.

## How it works

Speech-to-text engines turn made-up words into real-looking ones:
"EDOMTIDE" usually comes back as "Edom tide" or "Edam tied." So the engine
(`engine.js`) doesn't look for exact spellings. It turns what was heard into a
*sound skeleton* (`*d*mt*d`) and compares sounds instead:

- Vowels are treated as interchangeable, since speech engines guess them
  inconsistently.
- Consonants must match. That's what keeps "go back" (`g*b*k`) from matching
  KCABOG (`k*b*g`).
- Short triggers must match almost exactly; longer ones get more leeway.
- **Train** lets a user teach it how their own speech engine spells a trigger.
  This is saved in the browser.

## Tests

```
node engine.test.js
```

The tests cover spelling variations of each trigger, editing behavior, and
**false alarms**: ordinary sentences such as "I want to go back home after the
edit" must stay plain dictation.

## Known limits (what a real product would fix)

- **It reads text, not audio.** It only sees what the browser's speech engine
  decided you said, so a few real words can collide. "Cabbage" spells out like
  KCABOG and is blocked by hand. A production version should detect trigger
  words in the **raw audio** with a custom keyword spotter (Picovoice
  Porcupine, openWakeWord, or a small custom model) running alongside the
  dictation engine. That's more accurate, and it's the part most likely to be
  patentable.
- Edits only apply inside this page. A product would need a desktop app or an
  Android keyboard to type into any app. iOS doesn't let third-party keyboards
  use the microphone.
- English only, Chrome/Edge only.
