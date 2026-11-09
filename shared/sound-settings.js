(function (root) {
  const waves = Object.freeze({ sine: 'Синус', triangle: 'Треугольник', sawtooth: 'Пила', square: 'Квадрат' });
  const number = (label, initial, min, max, step, unit = '') => ({ label, initial, min, max, step, unit });
  const choice = (label, initial, options) => ({ label, initial, options });
  const toggle = (label, initial) => ({ label, initial });
  const sections = {
    mix: {
      title: 'Общие',
      fields: {
        volume: number('Громкость', 100, 0, 200, 1, '%'),
        pan: number('Панорама', 0, -100, 100, 1, '%'),
        pitch: number('Транспозиция', 0, -24, 24, 1, 'пт'),
        detune: number('Точная настройка', 0, -100, 100, 1, 'цент')
      }
    },
    oscillator: {
      title: 'Осцилляторы',
      fields: {
        enabled: toggle('Включить слой', false),
        wave: choice('Форма волны', 'sine', waves),
        level: number('Уровень слоя', 30, 0, 100, 1, '%'),
        pitch: number('Транспозиция слоя', 0, -24, 24, 1, 'пт'),
        detune: number('Расстройка слоя', 0, -100, 100, 1, 'цент'),
        pan: number('Панорама слоя', 0, -100, 100, 1, '%')
      }
    },
    envelope: {
      title: 'Огибающая',
      fields: {
        enabled: toggle('Своя огибающая', false),
        delay: number('Задержка', 0, 0, 1, .01, 'с'),
        attack: number('Атака', .01, .005, 2, .005, 'с'),
        hold: number('Удержание пика', 0, 0, 2, .01, 'с'),
        decay: number('Спад', .18, .01, 3, .01, 'с'),
        sustain: number('Уровень сустейна', 65, 0, 100, 1, '%'),
        release: number('Затухание', .2, .01, 4, .01, 'с')
      }
    },
    filter: {
      title: 'Фильтр',
      fields: {
        type: choice('Тип фильтра', 'preset', {
          preset: 'Фильтр инструмента', bypass: 'Без фильтра', lowpass: 'Низких частот',
          highpass: 'Высоких частот', bandpass: 'Полосовой', notch: 'Режекторный'
        }),
        cutoff: number('Частота среза', 2400, 40, 16000, 1, 'Гц'),
        resonance: number('Резонанс Q', 1, .1, 18, .1)
      }
    },
    lfo: {
      title: 'Модуляция',
      fields: {
        target: choice('Цель LFO', 'pitch', { pitch: 'Высота', volume: 'Громкость', cutoff: 'Частота среза' }),
        wave: choice('Форма LFO', 'sine', waves),
        rate: number('Частота LFO', 5, .1, 20, .1, 'Гц'),
        depth: number('Глубина LFO', 0, 0, 100, 1, '%')
      }
    },
    effects: {
      title: 'Эффекты',
      fields: {
        drive: number('Насыщение', 0, 0, 100, 1, '%'),
        echo: number('Уровень эха', 0, 0, 70, 1, '%'),
        time: number('Время эха', .25, .05, 1, .01, 'с'),
        repeats: number('Повторы эха', 2, 1, 4, 1)
      }
    }
  };

  function normalizeSection(fields, input) {
    return Object.fromEntries(Object.entries(fields).map(([key, field]) => {
      const value = input?.[key];
      if (field.options) return [key, Object.hasOwn(field.options, value) ? value : field.initial];
      if (typeof field.initial === 'boolean') return [key, typeof value === 'boolean' ? value : field.initial];
      const valid = Number.isFinite(value) ? Math.min(field.max, Math.max(field.min, value)) : field.initial;
      return [key, field.step === 1 ? Math.round(valid) : valid];
    }));
  }

  function normalize(input) {
    const sound = {};
    for (const [key, section] of Object.entries(sections)) {
      if (key === 'oscillator') {
        sound.oscillators = Array.from({ length: 3 }, (_, index) =>
          normalizeSection(section.fields, input?.oscillators?.[index]));
      } else {
        sound[key] = normalizeSection(section.fields, input?.[key]);
      }
    }
    return sound;
  }

  const api = { sections, normalize };
  if (typeof module !== 'undefined') module.exports = api;
  else root.SoundSettings = api;
})(globalThis);
