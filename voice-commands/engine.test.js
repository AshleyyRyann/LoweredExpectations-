// Run with: node voice-commands/engine.test.js
const assert = require('assert');
const { Engine } = require('./engine.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { console.log('  FAIL ' + name + '\n       ' + e.message); process.exitCode = 1; }
}
function run(...chunks) {
  const e = new Engine();
  chunks.forEach((c) => e.process(c));
  return e;
}

console.log('Dictation');
test('plain speech is typed and capitalized', () => {
  assert.strictEqual(run('hello there').text, 'Hello there');
});
test('chunks are joined with spaces', () => {
  assert.strictEqual(run('hello', 'world').text, 'Hello world');
});

console.log('Trigger words, however speech-to-text spells them');
for (const heard of ['EDOMTIDE', 'edom tide', 'Edam tied', 'Edom tied', 'edom-tide']) {
  test(`"${heard}" enters edit mode`, () => {
    assert.strictEqual(run('hi ' + heard).mode, 'edit');
  });
}
for (const heard of ['KCABOG', 'cab og', 'Cab Og', 'Kab og', 'cab bog', 'KCAVOG']) {
  test(`"${heard}" goes back`, () => {
    assert.strictEqual(run('first part', 'oops wrong', heard).text, 'First part');
  });
}
test('EDOMLLEPS enters spell mode', () => {
  assert.strictEqual(run('edom leps').mode, 'spell');
});
test('ENILWEN inserts a newline mid-sentence', () => {
  assert.strictEqual(run('line one enil wen line two').text, 'Line one\nLine two');
});

console.log('No false alarms on normal speech');
const normal = [
  'I want to go back home after the edit',
  'please edit mode settings in the tide chart',
  'the cab took a long time to come back',
  'turn on edit mode and then exit',
  'new line of clothing at the mall',
  'spell it out for me okay',
  'we went to Edinburgh on a cab',
  'I am listening to the radio',
];
for (const s of normal) {
  test(`"${s}" stays dictation`, () => {
    const e = run(s);
    assert.strictEqual(e.mode, 'dictation');
    assert.strictEqual(e.text.toLowerCase(), s.toLowerCase());
  });
}

console.log('Edit mode works like a keyboard');
test('backspace with a count, then exit back to dictation', () => {
  const e = run('hello worlddd', 'edomtide backspace two exit', 'again');
  assert.strictEqual(e.text, 'Hello world again');
  assert.strictEqual(e.mode, 'dictation');
});
test('delete word', () => {
  assert.strictEqual(run('one two three', 'edomtide delete word').text, 'One two ');
});
test('new line, punctuation, type', () => {
  assert.strictEqual(run('hi', 'edomtide comma new line type see you exit').text, 'Hi,\nsee you');
});
test('cursor movement and insert', () => {
  assert.strictEqual(run('ac', 'edomtide left type b exit').text, 'Abc');
});
test('select all then backspace clears', () => {
  assert.strictEqual(run('some text', 'edomtide select all backspace').text, '');
});
test('undo and redo', () => {
  const e = run('abc', 'edomtide backspace undo');
  assert.strictEqual(e.text, 'Abc');
  e.process('redo');
  assert.strictEqual(e.text, 'Ab');
});
test('capitalize / all caps', () => {
  assert.strictEqual(run('hello nasa', 'edomtide all caps').text, 'Hello NASA');
});
test('unknown words in edit mode are ignored, not typed', () => {
  assert.strictEqual(run('hi', 'edomtide banana exit').text, 'Hi');
});

console.log('Spell mode');
test('NATO + plain letters + caps', () => {
  assert.strictEqual(run('edomleps cap alpha bee charlie exit').text, 'Abc');
});

console.log('Pause / sleep');
test('ignores speech while asleep, wakes on the same trigger', () => {
  const e = run('hi', 'gninetsil this should not appear gninetsil', 'back');
  assert.strictEqual(e.text, 'Hi back');
});

console.log('Training aliases');
test('a custom spelling can be taught', () => {
  const e = new Engine();
  e.addAlias('edit', 'eat on tide');
  e.process('eat on tide');
  assert.strictEqual(e.mode, 'edit');
});

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`);
