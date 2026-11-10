(function (root) {
  const catalog = typeof module !== 'undefined' ? require('./catalog') : root.SoundCatalog;
  const sampleRate = 44100;
  const tau = Math.PI * 2;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const styles = { natural: 'Обычный', retro: '8-битный' };
  const fields = {
    duration: { label: 'Длительность', min: 40, max: 3000, step: 1, unit: 'мс' },
    pitch: { label: 'Высота', min: -24, max: 24, step: 1, unit: 'пт' },
    brightness: { label: 'Яркость', min: 0, max: 100, step: 1, unit: '%' },
    texture: { label: 'Шум', min: 0, max: 100, step: 1, unit: '%' },
    decay: { label: 'Затухание', min: 0, max: 100, step: 1, unit: '%' },
    drive: { label: 'Насыщение', min: 0, max: 100, step: 1, unit: '%' },
    space: { label: 'Эхо', min: 0, max: 100, step: 1, unit: '%' },
    volume: { label: 'Громкость', min: 0, max: 100, step: 1, unit: '%' }
  };

  function randomSource(seed) {
    return () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
  }

  function create(presetId, style, seed, shotVersion = 2) {
    const preset = catalog.byId[presetId];
    const random = randomSource(seed);
    const shot = preset.recipe === 'shot';
    const modern = shot && shotVersion === 2 && style === 'natural';
    return {
      presetId, style, seed,
      ...(shot ? { shotVersion } : {}),
      duration: Math.round(preset.duration * (875 + random() * 250)),
      pitch: Math.round(random() * 6 - 3),
      brightness: Math.round(42 + random() * 16),
      texture: Math.round(44 + random() * 12),
      decay: Math.round(43 + random() * 14),
      drive: modern ? 9 : shot ? 18 : 4,
      space: modern ? 32 : shot ? 24 : 5,
      volume: 84
    };
  }

  function restore(data) {
    if (!Object.hasOwn(catalog.byId, data?.presetId) || !Object.hasOwn(styles, data.style)
      || !Number.isInteger(data.seed) || data.seed < 0 || data.seed > 0xffffffff) return null;
    const settings = create(data.presetId, data.style, data.seed, data.shotVersion === 2 ? 2 : 1);
    for (const [key, field] of Object.entries(fields)) {
      if (Number.isFinite(data[key])) settings[key] = Math.round(clamp(data[key], field.min, field.max));
    }
    return settings;
  }

  function render(settings) {
    const preset = catalog.byId[settings.presetId];
    const samples = new Float32Array(Math.round(settings.duration * sampleRate / 1000));
    const duration = samples.length / sampleRate;
    const random = randomSource(settings.seed ^ 0x93b74a21);
    const vary = amount => 1 + (random() * 2 - 1) * amount;
    const retro = settings.style === 'retro';
    const modernShot = preset.recipe === 'shot' && settings.shotVersion === 2 && !retro;
    const pitch = 2 ** (settings.pitch / 12);
    const brightness = 2 ** ((settings.brightness - 50) / 32);
    const texture = settings.texture / 50;
    const decay = 2 ** ((settings.decay - 50) / 35);

    function layer(start, length, sample) {
      const first = Math.round(start * sampleRate);
      const frames = Math.min(Math.ceil(length * sampleRate), samples.length - first);
      for (let i = 0; i < frames; i++) samples[first + i] += sample(i);
    }

    function tone(start, length, frequency, level, options = {}) {
      const from = clamp(frequency * pitch, 20, 12000);
      const to = clamp((options.to || frequency) * pitch, 20, 12000);
      const bend = Math.log(to / from);
      const attack = Math.max(1, sampleRate * (options.attack ?? .001));
      const drop = Math.exp(-4.4 / (sampleRate * length));
      const pulseRate = options.pulses || 0;
      const wave = retro ? 'pulse' : options.wave;
      let phase = 0;
      let envelope = level;
      layer(start, length, i => {
        const progress = i / (sampleRate * length);
        const frequencyProgress = retro && bend ? Math.floor(progress * 24) / 24 : progress;
        phase += (bend ? from * Math.exp(bend * frequencyProgress) : from) / sampleRate;
        const sine = Math.sin(phase * tau);
        const shaped = wave === 'pulse' ? (phase % 1 < .32 ? .8 : -.37647)
          : wave === 'rough' ? .7 * sine + .22 * Math.sin(phase * tau * 2) : sine;
        const pulse = pulseRate ? .65 + .35 * Math.sin(tau * progress * pulseRate) : 1;
        envelope *= drop;
        return shaped * pulse * envelope * Math.min(1, i / attack);
      });
    }

    function noise(start, length, color, level, options = {}) {
      const coefficient = 1 - Math.exp(-tau * clamp(color * brightness * Math.sqrt(pitch), 90, 15000) / sampleRate);
      const lowCut = 1 - Math.exp(-tau * (options.lowCut || 40) / sampleRate);
      const attack = Math.max(1, sampleRate * (options.attack ?? .0005));
      const drop = Math.exp(-(options.drop || 4.8) / (sampleRate * length));
      const pulseRate = options.pulses || 0;
      let filtered = 0;
      let low = 0;
      let envelope = level * (options.texture ?? texture);
      let white = 0;
      layer(start, length, i => {
        if (!retro || i % 5 === 0) white = random() * 2 - 1;
        filtered += coefficient * (white - filtered);
        low += lowCut * (filtered - low);
        const progress = i / (sampleRate * length);
        const pulse = pulseRate ? .56 + .44 * Math.sin(tau * progress * pulseRate) : 1;
        envelope *= drop;
        return (filtered - low) * pulse * envelope * Math.min(1, i / attack);
      });
    }

    function strike(start, first, second, force, size = 1) {
      const a = catalog.materials[first];
      const b = catalog.materials[second];
      const hardness = Math.sqrt(a.color * b.color);
      const ringScale = clamp(Math.sqrt(hardness / 2300), .53, 1.35);
      noise(start, (.032 + (a.grit + b.grit) * .07) * size * decay,
        hardness, force * (.6 + a.grit + b.grit), { lowCut: hardness * .16 });
      for (const material of [a, b]) {
        const frequency = material.tone * vary(.12) / Math.sqrt(size);
        material.modes.forEach((ratio, index) => {
          const level = force * .48 * (.78 - material.grit / 2)
            * (.58 + .42 * brightness) ** index / (1 + index * .82);
          const length = material.ring * size * decay * ringScale * vary(.17) / (1 + index * .21);
          if (frequency * ratio * pitch < 12000) tone(start, length, frequency * ratio, level);
        });
      }
    }

    function firearm() {
      const { count, color, weight } = preset;
      const report = clamp(color / 7000, .18, 1);
      const scale = clamp(duration / preset.duration, .25, 2);
      const room = settings.space / 100;
      const bodyTexture = .65 + .35 * texture;
      for (let i = 0; i < count; i++) {
        const start = i * duration * .77 / count * vary(.025);
        const force = vary(.14);
        const bass = (120 + 280 * (1 - weight)) * pitch * vary(.18);
        const body = (.046 + .16 * weight ** 2) * scale * decay;
        const tail = (.1 + weight ** 3 * preset.duration * .45) * scale * decay;

        // The short pressure transient loses its top end well before the body and reflections.
        noise(start, (.009 + .016 * weight) * scale, color * 1.9 * vary(.12),
          force * (1.15 + report * 1.8), { lowCut: 640 + report * 850, attack: .00018, drop: 6, texture: bodyTexture });
        noise(start, body, color * .65, force * (1.3 + weight * .7),
          { lowCut: 120 + report * 150, attack: .0005, drop: 6.7, texture: bodyTexture });
        noise(start, body * 1.3, bass, force * (1 + weight * 2.9),
          { lowCut: 26, attack: .0018 + weight * .001, drop: 4.3, texture: bodyTexture });
        noise(start + .011, tail, color * .22, force * (.15 + weight * .7),
          { lowCut: 49, attack: .008, drop: 4.5, texture: bodyTexture });

        if (room) {
          for (const [delay, level] of [[.026, .72], [.051, .49], [.084, .32], [.137, .24]]) {
            noise(start + delay * vary(.17), tail * (.5 + delay * 5), color / (2 + delay * 19),
              force * room * level, { lowCut: 68, attack: .001 + delay * .08, drop: 4.2, texture: bodyTexture });
          }
        }
      }
    }

    const recipes = {
      impact() {
        const size = clamp(duration / preset.duration, .32, 2.5);
        (preset.hits || [0]).forEach((position, i) => {
          const force = vary(.19) / (1 + i * .26);
          strike(position * duration * vary(.065), ...preset.materials, force, size);
        });
      },
      step() {
        for (let i = 0; i < preset.count; i++) {
          const start = i * duration / (preset.count + .2) * vary(.035);
          const length = Math.min(duration / preset.count, .46);
          const force = (preset.heavy ? 1.4 : 1) * vary(.15);
          strike(start, 'rubber', preset.material, force * .65, preset.heavy ? 1.7 : 1);
          tone(start, length * .5 * decay, preset.heavy ? 75 : 105, force * .57, { to: 48 });
          for (let grain = 0; grain < 3 + Math.round(preset.grit * 7); grain++) {
            noise(start + random() * length * .6, length * .28 * decay * vary(.3),
              preset.color * vary(.3), force * preset.grit * .68, { lowCut: preset.color * .18 });
          }
        }
      },
      shot() {
        if (modernShot) {
          firearm();
          return;
        }
        for (let i = 0; i < preset.count; i++) {
          const start = i * duration * .72 / preset.count * vary(.028);
          const weight = preset.weight;
          const length = duration * (.31 + weight * .36) * decay / Math.sqrt(preset.count);
          noise(start, (.017 + .019 * weight) * decay, preset.color * vary(.18), 2.1, { lowCut: 700 });
          noise(start + .004, length, preset.color * .47, .62 + weight,
            { lowCut: 70, attack: .003, drop: 3.5 });
          tone(start, length * .68, (160 - weight * 83) * vary(.16), .4 + weight * .95,
            { to: 38 + (1 - weight) * 38, wave: 'rough' });
          noise(start + Math.min(.05, length * .25), length * .88, preset.color * .26, weight * .54,
            { pulses: 3, lowCut: 65, attack: .02 });
        }
      },
      sweep() {
        const attack = duration * preset.attack;
        const length = duration * clamp(.82 * decay, .42, 1.4);
        const modulation = preset.pulses > 1 ? preset.pulses : 0;
        const shift = vary(.17);
        tone(0, length, preset.from * shift, preset.tone,
          { to: preset.to * shift, wave: 'rough', attack, pulses: modulation });
        noise(0, length, preset.color * vary(.18), (1 - preset.tone) * 1.25,
          { attack, pulses: modulation, drop: 2.8, lowCut: preset.color * .13 });
        if (preset.pulses > 5) {
          for (let i = 0; i < preset.pulses; i++) {
            noise(random() * duration * .8, .028 * decay, preset.color * vary(.4),
              vary(.4) * (1 - preset.tone), { lowCut: 520 });
          }
        }
      },
      tones() {
        const base = preset.frequency * vary(.11);
        preset.notes.forEach((note, i) => {
          const frequency = base * 2 ** (note / 12);
          const start = duration * preset.gap * i;
          const length = duration * (preset.gap + .12) * decay;
          tone(start, length, frequency, .84, { attack: .004 });
          if (!retro) tone(start, length * .48, frequency * 2.01, .19 * brightness);
          noise(start, .019, 3400, .13, { lowCut: 650 });
        });
      }
    };
    recipes[preset.recipe]();

    const delay = Math.round(sampleRate * (preset.recipe === 'shot' ? .072 : .043));
    const echo = modernShot ? 0 : settings.space / 100 * .53;
    const drive = 1 + settings.drive / 17;
    const hold = retro ? 6 + (settings.brightness < 45 ? 2 : 0) : 1;
    let peak = 0;
    let held = 0;
    for (let i = samples.length - 1; i >= delay; i--) {
      samples[i] += samples[i - delay] * echo;
      if (i >= 2 * delay) samples[i] += samples[i - 2 * delay] * echo * .48;
    }
    for (let i = 0; i < samples.length; i++) {
      if (i % hold === 0) {
        held = Math.tanh(samples[i] * drive);
        if (retro) held = Math.round(held * 127) / 127;
      }
      const fade = Math.min(1, i / (modernShot ? 8 : 48), (samples.length - 1 - i) / 220);
      samples[i] = held * fade;
      peak = Math.max(peak, Math.abs(samples[i]));
    }
    const gain = .93 * settings.volume / 100 / Math.max(.16, peak);
    for (let i = 0; i < samples.length; i++) samples[i] *= gain;
    return { length: samples.length, numberOfChannels: 1, sampleRate, getChannelData: () => samples };
  }

  function aiff(buffer) {
    const samples = buffer.getChannelData(0);
    const bytes = new ArrayBuffer(54 + samples.length * 2);
    const view = new DataView(bytes);
    const ascii = (offset, value) => [...value].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));
    ascii(0, 'FORM');
    view.setUint32(4, bytes.byteLength - 8);
    ascii(8, 'AIFF');
    ascii(12, 'COMM');
    view.setUint32(16, 18);
    view.setUint16(20, 1);
    view.setUint32(22, samples.length);
    view.setUint16(26, 16);
    // AIFF stores the sample rate as a big-endian 80-bit extended float.
    const exponent = Math.floor(Math.log2(buffer.sampleRate));
    view.setUint16(28, 16383 + exponent);
    view.setUint32(30, buffer.sampleRate * 2 ** (31 - exponent));
    ascii(38, 'SSND');
    view.setUint32(42, 8 + samples.length * 2);
    samples.forEach((sample, i) => {
      view.setInt16(54 + i * 2, sample * (sample < 0 ? 32768 : 32767));
    });
    return new Blob([bytes], { type: 'audio/aiff' });
  }

  const api = { styles, fields, create, restore, render, aiff };
  if (typeof module !== 'undefined') module.exports = api;
  else root.SoundEngine = api;
})(globalThis);
