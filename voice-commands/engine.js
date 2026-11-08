// Voice command engine: turns a stream of speech-to-text transcripts into
// either dictated text or keyboard-style edit actions.
//
// Core idea: in dictation mode, only "reversed" trigger words (words nobody
// says by accident, like EDOMTIDE = "edit mode" backwards) are treated as
// commands. Everything else is typed as-is. Because speech-to-text engines
// spell made-up words unpredictably ("Edom tide", "edam tied"), triggers are
// matched by how they SOUND, not how they're spelled.
//
// No DOM access in here, so it can run in a browser or under Node for tests.

(function (root) {
  'use strict';

  // ---------- Phonetic matching ----------

  // Reduce a string to a rough "sound skeleton" so different spellings of the
  // same sounds compare equal: "edom tide", "Edam tied", "edomtide" all become
  // "*d*mt*d". Vowels collapse to "*" because speech engines guess vowels
  // wildly; consonants are kept, because they carry what makes a word distinct
  // (it's what keeps "go back" from matching KCABOG).
  function phoneticKey(str) {
    return String(str)
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter(Boolean)
      .map((w) => (w.length > 2 ? w.replace(/([^aeiouy])e$/, '$1') : w)) // silent e: tide -> tid
      .join('')
      .replace(/ph/g, 'f')
      .replace(/ck/g, 'k')
      .replace(/qu/g, 'kw')
      .replace(/x/g, 'ks')
      .replace(/c(?=[eiy])/g, 's')
      .replace(/[cq]/g, 'k')
      .replace(/(?<=[a-z])h/g, '') // "kuh", "oh", "th" -> drop the h
      .replace(/[aeiouy]+/g, '*')
      .replace(/([^*])\1+/g, '$1'); // collapse doubled consonants
  }

  // Consonants that speech engines commonly swap for each other cost half.
  const SIMILAR = new Set(['bv', 'vb', 'fv', 'vf', 'sz', 'zs', 'mn', 'nm']);

  // Edit distance tuned for sound keys: vowel slots are cheap to add or drop,
  // consonants are expensive, look-alike consonants are in between.
  function soundDistance(a, b) {
    const m = a.length, n = b.length;
    const indel = (c) => (c === '*' ? 0.5 : 1);
    const sub = (x, y) => (x === y ? 0 : SIMILAR.has(x + y) ? 0.5 : 1);
    let prev = [0];
    for (let j = 1; j <= n; j++) prev[j] = prev[j - 1] + indel(b[j - 1]);
    for (let i = 1; i <= m; i++) {
      const cur = [prev[0] + indel(a[i - 1])];
      for (let j = 1; j <= n; j++) {
        cur[j] = Math.min(
          prev[j] + indel(a[i - 1]),
          cur[j - 1] + indel(b[j - 1]),
          prev[j - 1] + sub(a[i - 1], b[j - 1])
        );
      }
      prev = cur;
    }
    return prev[n];
  }

  // ---------- The command language ----------

  // Dictation-mode triggers. `word` is the canonical spelling; `say` is how to
  // pronounce it. Extra spellings a user's speech engine produces can be added
  // as aliases (see Engine.addAlias), which is what the "Train" button does.
  const TRIGGERS = [
    { id: 'edit',  word: 'EDOMTIDE',  say: 'EH-dom-tide',   from: 'edit mode',  desc: 'Enter edit mode (voice keyboard)' },
    { id: 'spell', word: 'EDOMLLEPS', say: 'EH-dom-leps',   from: 'spell mode', desc: 'Enter spell mode (letter by letter)' },
    { id: 'back',  word: 'KCABOG',    say: 'KAB-og',        from: 'go back',    desc: 'Undo the last thing dictated' },
    { id: 'enter', word: 'ENILWEN',   say: 'EN-il-wen',     from: 'new line',   desc: 'Insert a line break' },
    { id: 'sleep', word: 'GNINETSIL', say: 'guh-NIN-et-sill', from: 'listening', desc: 'Pause: ignore speech until woken' },
  ];

  // Real words whose spelling happens to sound-match a trigger. A production
  // version listening to raw audio wouldn't need this; text matching does.
  const NEVER_TRIGGER = new Set(['cabbage', 'cabbages']);

  // Number words for counts like "backspace three".
  const NUMBERS = {
    one: 1, two: 2, to: 2, too: 2, three: 3, four: 4, for: 4, five: 5, six: 6,
    seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15,
    twenty: 20,
  };

  // Edit-mode commands. Plain English is fine here because you've explicitly
  // switched into edit mode. `count: true` means a number may follow.
  const EDIT_COMMANDS = [
    { phrase: ['exit'],                 action: 'exit',        desc: 'Back to dictation' },
    { phrase: ['done'],                 action: 'exit',        desc: 'Back to dictation' },
    { phrase: ['backspace'],            action: 'backspace',   count: true, desc: 'Delete character(s) before cursor' },
    { phrase: ['back', 'space'],        action: 'backspace',   count: true },
    { phrase: ['delete', 'word'],       action: 'deleteWord',  count: true, desc: 'Delete word(s) before cursor' },
    { phrase: ['delete', 'line'],       action: 'deleteLine',  desc: 'Delete the current line' },
    { phrase: ['delete'],               action: 'delete',      count: true, desc: 'Delete character(s) after cursor' },
    { phrase: ['new', 'line'],          action: 'newline',     count: true, desc: 'Line break' },
    { phrase: ['enter'],                action: 'newline',     count: true },
    { phrase: ['space'],                action: 'space',       count: true, desc: 'Insert a space' },
    { phrase: ['left'],                 action: 'left',        count: true, desc: 'Move cursor left' },
    { phrase: ['right'],                action: 'right',       count: true, desc: 'Move cursor right' },
    { phrase: ['word', 'left'],         action: 'wordLeft',    count: true, desc: 'Move cursor one word left' },
    { phrase: ['word', 'right'],        action: 'wordRight',   count: true, desc: 'Move cursor one word right' },
    { phrase: ['go', 'to', 'start'],    action: 'home',        desc: 'Cursor to start of text' },
    { phrase: ['go', 'to', 'end'],      action: 'end',         desc: 'Cursor to end of text' },
    { phrase: ['select', 'all'],        action: 'selectAll',   desc: 'Select everything' },
    { phrase: ['select', 'word'],       action: 'selectWord',  desc: 'Select word before cursor' },
    { phrase: ['clear', 'all'],         action: 'clearAll',    desc: 'Erase everything' },
    { phrase: ['undo'],                 action: 'undo',        count: true, desc: 'Undo' },
    { phrase: ['redo'],                 action: 'redo',        count: true, desc: 'Redo' },
    { phrase: ['capitalize'],           action: 'capitalize',  desc: 'Capitalize word before cursor' },
    { phrase: ['all', 'caps'],          action: 'upper',       desc: 'UPPERCASE word before cursor' },
    { phrase: ['lowercase'],            action: 'lower',       desc: 'lowercase word before cursor' },
    { phrase: ['period'],               action: 'insert', text: '.',  desc: 'Punctuation: period, comma, question mark…' },
    { phrase: ['comma'],                action: 'insert', text: ',' },
    { phrase: ['question', 'mark'],     action: 'insert', text: '?' },
    { phrase: ['exclamation', 'point'], action: 'insert', text: '!' },
    { phrase: ['colon'],                action: 'insert', text: ':' },
    { phrase: ['type'],                 action: 'typeRest',    desc: '"type …" types the rest literally' },
  ];

  // Spell mode: letters, NATO alphabet, and how speech engines often hear
  // single letters ("bee", "see", "why").
  const LETTERS = {};
  'abcdefghijklmnopqrstuvwxyz'.split('').forEach((c) => (LETTERS[c] = c));
  Object.assign(LETTERS, {
    alpha: 'a', alfa: 'a', bravo: 'b', charlie: 'c', delta: 'd', echo: 'e',
    foxtrot: 'f', golf: 'g', hotel: 'h', india: 'i', juliet: 'j', kilo: 'k',
    lima: 'l', mike: 'm', november: 'n', oscar: 'o', papa: 'p', quebec: 'q',
    romeo: 'r', sierra: 's', tango: 't', uniform: 'u', victor: 'v',
    whiskey: 'w', xray: 'x', yankee: 'y', zulu: 'z',
    bee: 'b', be: 'b', see: 'c', sea: 'c', dee: 'd', gee: 'g', jay: 'j',
    kay: 'k', okay: 'k', el: 'l', em: 'm', en: 'n', oh: 'o', pee: 'p',
    queue: 'q', cue: 'q', are: 'r', ar: 'r', tee: 't', tea: 't', you: 'u',
    vee: 'v', ex: 'x', why: 'y', zee: 'z', zed: 'z',
  });
  const DIGITS = { zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9' };

  function tokenize(text) {
    return String(text).trim().split(/\s+/).filter(Boolean);
  }
  function clean(tok) {
    return tok.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  // ---------- Engine ----------

  class Engine {
    constructor(opts = {}) {
      this.mode = 'dictation'; // dictation | edit | spell | sleep
      this.text = '';
      this.cursor = 0;
      this.selEnd = 0; // selection is [cursor, selEnd)
      this.history = [];
      this.future = [];
      this.lastDictation = null; // {start, end} of last dictated chunk
      this.aliases = opts.aliases || {}; // triggerId -> [phonetic keys]
      this.onEvent = opts.onEvent || (() => {});
      this.spellCaps = false;
    }

    // --- trigger detection ---

    triggerKeys(trigger) {
      return [phoneticKey(trigger.word)].concat(this.aliases[trigger.id] || []);
    }

    // Does this run of words sound like a trigger? Returns the trigger or null.
    matchTrigger(words) {
      if (words.some((w) => NEVER_TRIGGER.has(w))) return null;
      const key = phoneticKey(words.join(' '));
      if (key.replace(/\*/g, '').length < 3) return null;
      let best = null, bestDist = Infinity;
      for (const t of TRIGGERS) {
        for (const tk of this.triggerKeys(t)) {
          const d = soundDistance(key, tk);
          const consonants = tk.replace(/\*/g, '').length;
          // Short triggers must match almost exactly; long ones can be looser.
          const allowed = consonants >= 5 ? 1.5 : consonants === 4 ? 1 : 0.5;
          if (d <= allowed && d < bestDist) { best = t; bestDist = d; }
        }
      }
      return best;
    }

    // Look for a trigger starting at word i, trying 3-, 2-, then 1-word windows.
    findTriggerAt(words, i) {
      for (let len = 3; len >= 1; len--) {
        if (i + len > words.length) continue;
        const t = this.matchTrigger(words.slice(i, i + len).map(clean));
        if (t) return { trigger: t, len };
      }
      return null;
    }

    addAlias(triggerId, heardText) {
      const key = phoneticKey(heardText);
      if (!key) return null;
      this.aliases[triggerId] = this.aliases[triggerId] || [];
      if (!this.aliases[triggerId].includes(key)) this.aliases[triggerId].push(key);
      return key;
    }

    // --- main entry point: one final transcript chunk from speech-to-text ---

    process(transcript) {
      const words = tokenize(transcript);
      let i = 0;
      while (i < words.length) {
        if (this.mode === 'dictation') i = this.processDictation(words, i);
        else if (this.mode === 'edit') i = this.processEdit(words, i);
        else if (this.mode === 'spell') i = this.processSpell(words, i);
        else if (this.mode === 'sleep') i = this.processSleep(words, i);
      }
    }

    processDictation(words, i) {
      const buffer = [];
      while (i < words.length) {
        const hit = this.findTriggerAt(words, i);
        if (hit) {
          if (buffer.length) this.dictate(buffer.join(' '));
          buffer.length = 0;
          i += hit.len;
          this.runTrigger(hit.trigger);
          if (this.mode !== 'dictation') return i;
          continue;
        }
        buffer.push(words[i]);
        i++;
      }
      if (buffer.length) this.dictate(buffer.join(' '));
      return i;
    }

    processSleep(words, i) {
      // Only the sleep trigger (said again) wakes it up.
      while (i < words.length) {
        const hit = this.findTriggerAt(words, i);
        if (hit && hit.trigger.id === 'sleep') {
          this.setMode('dictation');
          return i + hit.len;
        }
        i++;
      }
      return i;
    }

    runTrigger(t) {
      this.emit('trigger', `${t.word} → ${t.desc}`);
      switch (t.id) {
        case 'edit': this.setMode('edit'); break;
        case 'spell': this.setMode('spell'); break;
        case 'enter': this.snapshot(); this.insert('\n'); break;
        case 'sleep': this.setMode('sleep'); break;
        case 'back': this.undoLastDictation(); break;
      }
    }

    processEdit(words, i) {
      const toks = words.map(clean);
      // Leading-trigger escape hatch: dictation triggers also work in edit mode.
      const hit = this.findTriggerAt(words, i);
      if (hit && hit.trigger.id !== 'edit') {
        this.runTrigger(hit.trigger);
        return i + hit.len;
      }
      for (const cmd of EDIT_COMMANDS) {
        const n = cmd.phrase.length;
        if (toks.slice(i, i + n).join(' ') !== cmd.phrase.join(' ')) continue;
        let j = i + n;
        let count = 1;
        if (cmd.count && j < toks.length) {
          if (/^\d+$/.test(toks[j])) { count = parseInt(toks[j], 10); j++; }
          else if (NUMBERS[toks[j]] !== undefined) { count = NUMBERS[toks[j]]; j++; }
          if (toks[j] === 'times') j++;
        }
        if (cmd.action === 'typeRest') {
          // Types everything up to "exit"/"done" (or the end of what you said).
          let k = j;
          while (k < toks.length && toks[k] !== 'exit' && toks[k] !== 'done') k++;
          const rest = words.slice(j, k).join(' ');
          if (rest) { this.snapshot(); this.insert(rest); this.emit('command', `type "${rest}"`); }
          return k;
        }
        this.emit('command', cmd.phrase.join(' ') + (count > 1 ? ` ×${count}` : ''));
        this.edit(cmd, count);
        return j;
      }
      this.emit('ignored', `"${words[i]}" isn't an edit command (say "type …" to type it)`);
      return i + 1;
    }

    processSpell(words, i) {
      const tok = clean(words[i]);
      const next = clean(words[i + 1] || '');
      if (tok === 'exit' || tok === 'done') { this.setMode('dictation'); return i + 1; }
      if (tok === 'space') { this.snapshot(); this.insert(' '); return i + 1; }
      if (tok === 'backspace') { this.edit({ action: 'backspace' }, 1); return i + 1; }
      if (tok === 'cap' || tok === 'capital') { this.spellCaps = true; return i + 1; }
      if (tok === 'x' && next === 'ray') { this.spellLetter('x'); return i + 2; }
      if (LETTERS[tok]) { this.spellLetter(LETTERS[tok]); return i + 1; }
      if (DIGITS[tok]) { this.snapshot(); this.insert(DIGITS[tok]); return i + 1; }
      if (/^\d+$/.test(tok)) { this.snapshot(); this.insert(tok); return i + 1; }
      this.emit('ignored', `"${words[i]}" isn't a letter`);
      return i + 1;
    }

    spellLetter(c) {
      this.snapshot();
      this.insert(this.spellCaps ? c.toUpperCase() : c);
      this.spellCaps = false;
    }

    setMode(mode) {
      this.mode = mode;
      this.emit('mode', mode);
    }

    emit(type, detail) { this.onEvent({ type, detail, mode: this.mode }); }

    // --- text buffer ---

    snapshot() {
      this.history.push({ text: this.text, cursor: this.cursor, selEnd: this.selEnd });
      if (this.history.length > 200) this.history.shift();
      this.future = [];
    }

    restore(s) { this.text = s.text; this.cursor = s.cursor; this.selEnd = s.selEnd; }

    setCursor(pos) {
      this.cursor = this.selEnd = Math.max(0, Math.min(this.text.length, pos));
    }

    insert(str) {
      this.text = this.text.slice(0, this.cursor) + str + this.text.slice(this.selEnd);
      this.setCursor(this.cursor + str.length);
    }

    dictate(phrase) {
      this.snapshot();
      const before = this.text.slice(0, this.cursor);
      const needsSpace = before.length && !/[\s\n]$/.test(before);
      const atSentenceStart = !before.trim() || /[.!?\n]\s*$/.test(before);
      let p = phrase;
      if (atSentenceStart) p = p.charAt(0).toUpperCase() + p.slice(1);
      const insertText = (needsSpace ? ' ' : '') + p;
      const start = this.cursor;
      this.insert(insertText);
      this.lastDictation = { start, end: this.cursor, text: insertText };
      this.emit('dictation', phrase);
    }

    undoLastDictation() {
      const d = this.lastDictation;
      if (!d || this.text.slice(d.start, d.end) !== d.text) {
        this.emit('ignored', 'Nothing to go back on');
        return;
      }
      this.snapshot();
      this.text = this.text.slice(0, d.start) + this.text.slice(d.end);
      this.setCursor(d.start);
      this.lastDictation = null;
    }

    wordStartBefore(pos) {
      let p = pos;
      while (p > 0 && /\s/.test(this.text[p - 1])) p--;
      while (p > 0 && !/\s/.test(this.text[p - 1])) p--;
      return p;
    }
    wordEndAfter(pos) {
      let p = pos;
      while (p < this.text.length && /\s/.test(this.text[p])) p++;
      while (p < this.text.length && !/\s/.test(this.text[p])) p++;
      return p;
    }

    transformWordBefore(fn) {
      const end = this.selEnd > this.cursor ? this.selEnd : this.cursor;
      let e = end;
      while (e > 0 && /\s/.test(this.text[e - 1])) e--;
      const s = this.wordStartBefore(e);
      this.text = this.text.slice(0, s) + fn(this.text.slice(s, e)) + this.text.slice(e);
    }

    edit(cmd, count) {
      const a = cmd.action;
      if (a === 'exit') { this.setMode('dictation'); return; }
      if (a === 'undo') {
        for (let k = 0; k < count && this.history.length; k++) {
          this.future.push({ text: this.text, cursor: this.cursor, selEnd: this.selEnd });
          this.restore(this.history.pop());
        }
        return;
      }
      if (a === 'redo') {
        for (let k = 0; k < count && this.future.length; k++) {
          this.history.push({ text: this.text, cursor: this.cursor, selEnd: this.selEnd });
          this.restore(this.future.pop());
        }
        return;
      }
      this.snapshot();
      const hasSel = this.selEnd > this.cursor;
      switch (a) {
        case 'backspace':
          if (hasSel) { this.insert(''); count--; }
          for (let k = 0; k < count; k++) {
            if (this.cursor === 0) break;
            this.text = this.text.slice(0, this.cursor - 1) + this.text.slice(this.cursor);
            this.setCursor(this.cursor - 1);
          }
          break;
        case 'delete':
          if (hasSel) { this.insert(''); count--; }
          this.text = this.text.slice(0, this.cursor) + this.text.slice(this.cursor + count);
          break;
        case 'deleteWord':
          if (hasSel) { this.insert(''); count--; }
          for (let k = 0; k < count; k++) {
            const s = this.wordStartBefore(this.cursor);
            this.text = this.text.slice(0, s) + this.text.slice(this.cursor);
            this.setCursor(s);
          }
          break;
        case 'deleteLine': {
          const s = this.text.lastIndexOf('\n', this.cursor - 1) + 1;
          let e = this.text.indexOf('\n', this.cursor);
          e = e === -1 ? this.text.length : e + 1;
          this.text = this.text.slice(0, s) + this.text.slice(e);
          this.setCursor(s);
          break;
        }
        case 'newline': this.insert('\n'.repeat(count)); break;
        case 'space': this.insert(' '.repeat(count)); break;
        case 'insert': this.insert(cmd.text); break;
        case 'left': this.setCursor(this.cursor - count); break;
        case 'right': this.setCursor(this.selEnd + count); break;
        case 'wordLeft': { let p = this.cursor; for (let k = 0; k < count; k++) p = this.wordStartBefore(p); this.setCursor(p); break; }
        case 'wordRight': { let p = this.selEnd; for (let k = 0; k < count; k++) p = this.wordEndAfter(p); this.setCursor(p); break; }
        case 'home': this.setCursor(0); break;
        case 'end': this.setCursor(this.text.length); break;
        case 'selectAll': this.cursor = 0; this.selEnd = this.text.length; break;
        case 'selectWord': { let e = this.cursor; while (e > 0 && /\s/.test(this.text[e - 1])) e--; this.cursor = this.wordStartBefore(e); this.selEnd = e; break; }
        case 'clearAll': this.text = ''; this.setCursor(0); break;
        case 'capitalize': this.transformWordBefore((w) => w.charAt(0).toUpperCase() + w.slice(1)); break;
        case 'upper': this.transformWordBefore((w) => w.toUpperCase()); break;
        case 'lower': this.transformWordBefore((w) => w.toLowerCase()); break;
      }
    }
  }

  const api = { Engine, TRIGGERS, EDIT_COMMANDS, phoneticKey, soundDistance };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.VoiceCommands = api;
})(typeof window !== 'undefined' ? window : globalThis);
