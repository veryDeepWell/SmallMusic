(function (root) {
  const eps = .00001;
  const presetWaves = { guitar:'triangle', electric:'sawtooth', bass:'sawtooth', flute:'sine',
    piano:'triangle', epiano:'sine', pad:'sawtooth', lead:'sawtooth', pluck:'triangle' };
  const presetCutoffs = { guitar:2200, electric:1800, bass:650, flute:3500, piano:5000,
    epiano:2000, pad:1100, lead:3000, pluck:3500 };
  const noiseLengths = { snare:.18, hat:.055, openhat:.32, clap:.14 };
  const sweeps = { kick:[.3,150,40], tom:[.22,220,70], rim:[.045,900,450] };
  const curves = new Map();
  const noiseBuffers = new WeakMap();

  function tail(patch) {
    const envelope = patch?.envelope;
    const fx = patch?.effects;
    return (envelope?.enabled ? envelope.delay + envelope.release : .35)
      + (fx?.echo ? fx.time * fx.repeats : 0) + .08;
  }

  function applyEnvelope(param, start, duration, level, envelope, presetAttack) {
    param.setValueAtTime(eps, start);
    if (!envelope?.enabled) {
      param.linearRampToValueAtTime(level, start + Math.min(presetAttack, duration / 2));
      param.exponentialRampToValueAtTime(eps, start + duration + .02);
      return start + duration + .04;
    }
    const end = start + duration;
    const peak = start + envelope.attack;
    const hold = peak + envelope.hold;
    const fall = hold + envelope.decay;
    const sustain = Math.max(eps, level * envelope.sustain / 100);
    let releaseLevel = sustain;
    if (end < peak) {
      releaseLevel = eps + (level - eps) * duration / envelope.attack;
      param.linearRampToValueAtTime(releaseLevel, end);
    } else {
      param.linearRampToValueAtTime(level, peak);
      param.setValueAtTime(level, Math.min(end, hold));
      if (end > hold) {
        const progress = Math.min(1, (end - hold) / envelope.decay);
        releaseLevel = level + (sustain - level) * progress;
        param.linearRampToValueAtTime(releaseLevel, Math.min(end, fall));
      } else releaseLevel = level;
    }
    param.setValueAtTime(releaseLevel, end);
    param.exponentialRampToValueAtTime(eps, end + envelope.release);
    return end + envelope.release + .02;
  }

  function noise(context) {
    if (!noiseBuffers.has(context)) {
      const buffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
      const samples = buffer.getChannelData(0);
      let seed = 14791;
      for (let i = 0; i < samples.length; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        samples[i] = seed / 2147483648 - 1;
      }
      noiseBuffers.set(context, buffer);
    }
    return noiseBuffers.get(context);
  }

  // Voice IDs and normalized patches are independent of projects, tracks and DOM.
  function play(context, destination, { voice, midi, time, duration, volume, patch }) {
    const { mix, envelope, filter, lfo, effects, oscillators = [] } = patch || {};
    if (volume <= 0 || mix?.volume === 0) return;
    const nodes = [];
    const node = factory => {
      const created = context[factory]();
      nodes.push(created);
      return created;
    };
    const delayedStart = time + (envelope?.enabled ? envelope.delay : 0);
    const pitch = (mix?.pitch || 0) * 100 + (mix?.detune || 0);
    const hz = 440 * 2 ** ((midi - 69) / 12);
    const mixer = node('createGain');
    const gain = node('createGain');
    const panner = node('createStereoPanner');
    panner.pan.value = (mix?.pan || 0) / 100;
    const sources = [];
    const noisy = Object.hasOwn(noiseLengths, voice);
    const sweep = sweeps[voice];
    const presetDuration = noiseLengths[voice] || sweep?.[0]
      || (['guitar', 'pluck'].includes(voice) ? Math.min(duration, 1.8) : duration);
    const gate = Math.max(.03, envelope?.enabled ? duration : presetDuration);
    const level = Math.max(eps, volume * (mix?.volume ?? 100) / 100 * (noisy || sweep ? .22 : .18));
    const end = applyEnvelope(gain.gain, delayedStart, gate, level, envelope, voice === 'pad' ? .1 : .006);

    const base = node(noisy ? 'createBufferSource' : 'createOscillator');
    base.detune.value = pitch;
    if (noisy) {
      base.buffer = noise(context);
      base.loop = true;
    } else {
      base.type = presetWaves[voice] || 'sine';
      base.frequency.setValueAtTime(sweep?.[1] || hz * (voice === 'bass' ? .25 : 1), delayedStart);
      if (sweep) base.frequency.exponentialRampToValueAtTime(sweep[2], delayedStart + sweep[0]);
    }
    base.connect(mixer);
    sources.push(base);

    for (const layer of oscillators) {
      if (!layer.enabled || !layer.level) continue;
      const oscillator = node('createOscillator');
      oscillator.type = layer.wave;
      oscillator.frequency.value = hz;
      oscillator.detune.value = pitch + layer.pitch * 100 + layer.detune;
      const layerGain = node('createGain');
      layerGain.gain.value = layer.level / 100;
      const layerPan = node('createStereoPanner');
      layerPan.pan.value = layer.pan / 100;
      oscillator.connect(layerGain).connect(layerPan).connect(mixer);
      sources.push(oscillator);
    }

    let signal = mixer;
    if (effects?.drive) {
      const shaper = node('createWaveShaper');
      if (!curves.has(effects.drive)) {
        const amount = 1 + effects.drive / 9;
        curves.set(effects.drive, Float32Array.from({ length: 513 }, (_, i) =>
          Math.tanh(amount * (i / 256 - 1)) / Math.tanh(amount)));
      }
      shaper.curve = curves.get(effects.drive);
      signal = signal.connect(shaper);
    }
    let filterNode;
    if (filter?.type !== 'bypass') {
      filterNode = node('createBiquadFilter');
      const custom = filter && !['preset', 'bypass'].includes(filter.type);
      filterNode.type = custom ? filter.type : noisy ? 'highpass' : 'lowpass';
      filterNode.frequency.value = Math.min(context.sampleRate * .49, custom ? filter.cutoff
        : noisy ? (voice.includes('hat') ? 7000 : voice === 'clap' ? 1600 : 1100)
        : presetCutoffs[voice] || 8000);
      if (custom) filterNode.Q.value = filter.resonance;
      signal = signal.connect(filterNode);
    }

    if (lfo?.depth && (lfo.target !== 'cutoff' || filterNode)) {
      const modulation = node('createOscillator');
      const depth = node('createGain');
      modulation.type = lfo.wave;
      modulation.frequency.value = lfo.rate;
      modulation.connect(depth);
      if (lfo.target === 'pitch') {
        depth.gain.value = lfo.depth * 2;
        for (const source of sources) depth.connect(source.detune);
      } else if (lfo.target === 'cutoff') {
        depth.gain.value = lfo.depth * 24;
        depth.connect(filterNode.detune);
      } else {
        const tremolo = node('createGain');
        depth.gain.value = lfo.depth / 200;
        tremolo.gain.value = 1 - depth.gain.value;
        depth.connect(tremolo.gain);
        signal = signal.connect(tremolo);
      }
      sources.push(modulation);
    }

    signal.connect(gain).connect(panner).connect(destination);
    if (effects?.echo) {
      for (let i = 1; i <= effects.repeats; i++) {
        const delay = context.createDelay(4);
        nodes.push(delay);
        delay.delayTime.value = effects.time * i;
        const tap = node('createGain');
        tap.gain.value = effects.echo / 100 * .55 ** (i - 1);
        panner.connect(delay).connect(tap).connect(destination);
      }
    }
    // The silent clock keeps echo taps connected until their buffers drain.
    const cleanup = node('createConstantSource');
    cleanup.offset.value = 0;
    cleanup.connect(destination);
    cleanup.onended = () => nodes.forEach(audioNode => audioNode.disconnect());
    cleanup.start(delayedStart);
    cleanup.stop(end + (effects?.echo ? effects.time * effects.repeats : 0) + .04);
    for (const source of sources) {
      source.start(delayedStart);
      source.stop(end);
    }
  }

  function wav(buffer) {
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
    const stride = channels.length * 2;
    const bytes = new ArrayBuffer(44 + buffer.length * stride);
    const view = new DataView(bytes);
    const ascii = (offset, value) => [...value].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));
    ascii(0, 'RIFF');
    view.setUint32(4, bytes.byteLength - 8, true);
    ascii(8, 'WAVE');
    ascii(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels.length, true);
    view.setUint32(24, buffer.sampleRate, true);
    view.setUint32(28, buffer.sampleRate * stride, true);
    view.setUint16(32, stride, true);
    view.setUint16(34, 16, true);
    ascii(36, 'data');
    view.setUint32(40, bytes.byteLength - 44, true);
    for (let frame = 0; frame < buffer.length; frame++) {
      channels.forEach((channel, index) => {
        const sample = Math.max(-1, Math.min(1, channel[frame]));
        view.setInt16(44 + frame * stride + index * 2, sample * (sample < 0 ? 32768 : 32767), true);
      });
    }
    return new Blob([bytes], { type: 'audio/wav' });
  }

  const api = { play, tail, wav };
  if (typeof module !== 'undefined') module.exports = api;
  else root.NoiseAudio = api;
})(globalThis);
