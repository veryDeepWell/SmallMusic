const test = require('node:test');
const assert = require('node:assert/strict');
const catalog = require('./catalog');
const engine = require('./engine');
const audio = require('../shared/audio');

test('каталог содержит все пары материалов без дубликатов', () => {
  const materials = Object.keys(catalog.materials);
  assert.equal(new Set(catalog.presets.map(preset => preset.id)).size, catalog.presets.length);
  const pairs = new Set();
  for (const first of materials) {
    for (const second of materials) {
      const preset = catalog.impact(first, second);
      assert.ok(preset);
      assert.equal(preset, catalog.impact(second, first));
      pairs.add(preset.id);
    }
  }
  assert.equal(pairs.size, materials.length * (materials.length + 1) / 2);
  assert.deepEqual(catalog.entries.filter(entry => entry.category === 'impacts'), [catalog.collision]);
});

test('каждый пресет в обоих режимах создаёт ненулевой PCM без перегрузки', () => {
  for (const { id } of catalog.presets) {
    for (const style of Object.keys(engine.styles)) {
      const settings = engine.create(id, style, 91601);
      const clip = engine.render(settings);
      const samples = clip.getChannelData(0);
      const label = id + ' / ' + style;
      assert.equal(clip.length, Math.round(settings.duration * clip.sampleRate / 1000), label);
      assert.ok(samples.some(sample => Math.abs(sample) > .05), label);
      assert.ok(samples.every(sample => Math.abs(sample) <= 1), label);
      assert.equal(samples[0], 0, label);
      assert.ok(samples.at(-1) === 0, label);
    }
  }
});

test('запись истории восстанавливает PCM, а новый seed и правки меняют сигнал', () => {
  const settings = { ...engine.create('steel-wood', 'natural', 2341), duration: 380, pitch: 3 };
  const samples = options => engine.render(options).getChannelData(0);
  const snapshot = engine.restore(JSON.parse(JSON.stringify(settings)));
  assert.deepEqual(samples(snapshot), samples(settings));
  assert.notDeepEqual(samples({ ...settings, seed: 8129 }), samples(settings));
  assert.notDeepEqual(samples({ ...settings, style: 'retro' }), samples(settings));
  assert.notDeepEqual(samples({ ...settings, brightness: 100 }), samples(settings));
  assert.ok(samples({ ...settings, volume: 0 }).every(sample => sample === 0));
  assert.equal(engine.restore({ ...settings, duration: 4000 }).duration, 3000);
  assert.equal(engine.restore({ ...settings, presetId: 'missing' }), null);
});

test('новый выстрел меняет сигнал, старая история сохраняет прежнюю версию', () => {
  const legacy = engine.create('shotgun', 'natural', 2341, 1);
  const stored = { ...legacy };
  delete stored.shotVersion;
  const updated = engine.create('shotgun', 'natural', 2341);
  const samples = settings => engine.render(settings).getChannelData(0);
  assert.deepEqual(engine.restore(stored), legacy);
  assert.deepEqual(samples(engine.restore(stored)), samples(legacy));
  assert.deepEqual(samples(engine.restore(updated)), samples(updated));
  assert.notDeepEqual(samples(updated), samples(legacy));
  assert.notDeepEqual(samples({ ...updated, space: 0 }), samples(updated));
  assert.ok(samples({ ...updated, texture: 0 }).some(sample => Math.abs(sample) > .05));
});

test('WAV и AIFF сохраняют один и тот же 16-битный моно сигнал', async () => {
  const clip = engine.render(engine.create('button', 'natural', 2341));
  const wav = Buffer.from(await audio.wav(clip).arrayBuffer());
  const aiff = Buffer.from(await engine.aiff(clip).arrayBuffer());
  assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
  assert.equal(wav.readUInt32LE(24), 44100);
  assert.equal(wav.readUInt32LE(40), clip.length * 2);
  assert.equal(aiff.toString('ascii', 8, 12), 'AIFF');
  assert.equal(aiff.readUInt32BE(4), aiff.length - 8);
  assert.equal(aiff.readUInt16BE(20), 1);
  assert.equal(aiff.readUInt32BE(22), clip.length);
  assert.equal(aiff.readUInt16BE(26), 16);
  assert.equal(aiff.subarray(28, 38).toString('hex'), '400eac44000000000000');
  assert.equal(aiff.toString('ascii', 38, 42), 'SSND');
  assert.equal(aiff.readUInt32BE(42), clip.length * 2 + 8);
  assert.deepEqual(aiff.subarray(54).swap16(), wav.subarray(44));
});
