(() => {
  const { categories, materials, presets, byId, impact } = SoundCatalog;
  const { styles, fields, create, restore, render, aiff } = SoundEngine;
  const $ = selector => document.querySelector(selector);
  const make = (tag, content, className) => {
    const element = document.createElement(tag);
    if (content) element.textContent = content;
    if (className) element.className = className;
    return element;
  };
  const button = (content, action, className) => {
    const element = make('button', content, className);
    element.type = 'button';
    element.onclick = action;
    return element;
  };
  const storageKey = 'smallsound-studio-v1';
  const searchAliases = { shot: 'выстрел стрельба', step: 'ходьба шаги' };
  const time = new Intl.DateTimeFormat('ru', { dateStyle: 'short', timeStyle: 'short' });
  const seed = () => crypto.getRandomValues(new Uint32Array(1))[0];
  let saved;
  try { saved = JSON.parse(localStorage.getItem(storageKey)); } catch {}
  const history = Array.isArray(saved?.history) ? saved.history.flatMap(entry => {
    const settings = restore(entry?.settings);
    return settings && typeof entry.id === 'string' && Number.isFinite(entry.date)
      && Math.abs(entry.date) <= 8.64e15 ? [{ ...entry, settings }] : [];
  }) : [];
  let selected = history.find(entry => entry.id === saved?.selected)?.id;
  let current = restore(saved?.current) || history.find(entry => entry.id === selected)?.settings;
  let onlyFavorites = false;
  let rendered;
  let renderFrame;
  let context;
  let source;
  let playback = 0;
  const inputs = new Map();
  const styleButtons = document.querySelectorAll('[data-style]');
  const autoplay = $('#autoplay');
  autoplay.checked = saved?.autoplay !== false;

  function persist() {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ history, current, selected, autoplay: autoplay.checked }));
      $('#storage-status').textContent = 'Сохраняется в этом браузере';
    } catch {
      $('#storage-status').textContent = 'Не удалось сохранить историю в браузере';
    }
  }

  function option(select, value, label) {
    select.add(new Option(label, value));
  }
  const categorySelect = $('#category');
  option(categorySelect, '', 'Все категории');
  for (const [id, label] of Object.entries(categories)) option(categorySelect, id, label);
  for (const [id, { name }] of Object.entries(materials)) {
    option($('#material-a'), id, name);
    option($('#material-b'), id, name);
  }
  $('#material-b').value = 'wood';

  for (const [key, field] of Object.entries(fields)) {
    const label = make('label', '', 'control');
    const caption = make('span', '', 'control-caption');
    const value = make('output');
    value.setAttribute('aria-hidden', 'true');
    const input = make('input');
    input.type = 'range';
    input.id = 'setting-' + key;
    value.setAttribute('for', input.id);
    input.min = field.min;
    input.max = field.max;
    input.step = field.step;
    input.setAttribute('aria-label', field.label);
    caption.append(make('span', field.label), value);
    label.append(caption, input);
    $('#controls').append(label);
    inputs.set(key, { input, value });
    input.oninput = () => {
      stop();
      current = { ...current, [key]: Number(input.value) };
      updateValues();
      scheduleRender();
    };
    input.onchange = () => {
      persist();
      if (autoplay.checked) play();
    };
  }

  function renderCatalog() {
    const search = $('#search').value.trim().toLocaleLowerCase('ru').split(/[\s×]+/)
      .filter(word => word && !['о', 'об', 'по'].includes(word));
    const category = categorySelect.value;
    let count = 0;
    const content = document.createDocumentFragment();
    for (const [id, name] of Object.entries(categories)) {
      if (category && category !== id) continue;
      const matches = presets.filter(preset => {
        if (preset.category !== id) return false;
        const generic = preset.materials?.some(material => ['steel', 'iron', 'aluminum', 'copper'].includes(material))
          ? 'металла' : '';
        const aliases = preset.category === 'ui' && preset.recipe === 'impact' ? 'щелчок клик' : searchAliases[preset.recipe];
        const haystack = [preset.name, name, generic, aliases].join(' ').toLocaleLowerCase('ru');
        return search.every(word => haystack.includes(word));
      });
      if (!matches.length) continue;
      content.append(make('h3', name, 'group-label'));
      for (const preset of matches) {
        const entry = button(preset.name, () => {
          generate(preset.id);
          if (matchMedia('(max-width: 650px)').matches) $('.editor').scrollIntoView({ block: 'start' });
        }, 'preset');
        entry.dataset.preset = preset.id;
        const indicator = make('span', '＋');
        indicator.setAttribute('aria-hidden', 'true');
        entry.append(indicator);
        content.append(entry);
      }
      count += matches.length;
    }
    if (!count) content.append(make('p', 'По этому запросу ничего нет.', 'empty'));
    $('#catalog-count').textContent = count === presets.length ? count : count + ' / ' + presets.length;
    $('#presets').replaceChildren(content);
    markPreset();
  }

  function markPreset() {
    for (const entry of $('#presets').querySelectorAll('button')) {
      if (entry.dataset.preset === current?.presetId) entry.setAttribute('aria-current', 'true');
      else entry.removeAttribute('aria-current');
    }
  }

  function renderHistory(focusId, focusAction) {
    const visible = onlyFavorites ? history.filter(entry => entry.favorite) : history;
    $('#history-count').textContent = visible.length;
    const list = $('#history');
    list.replaceChildren();
    if (!visible.length) {
      list.append(make('p', onlyFavorites ? 'Пока нет избранных звуков.' : 'Здесь появятся созданные варианты.', 'empty'));
    }
    for (const entry of visible) {
      const row = make('div', '', 'history-row');
      const name = byId[entry.settings.presetId].name;
      const open = button('', () => {
        selected = entry.id;
        selectSound({ ...entry.settings }, autoplay.checked, entry.id, 'open');
      }, 'history-open');
      open.append(make('strong', name), make('small', styles[entry.settings.style] + ' · '
        + entry.settings.duration + ' мс · ' + time.format(entry.date)));
      if (selected === entry.id) open.setAttribute('aria-current', 'true');
      const favorite = button(entry.favorite ? '★' : '☆', () => {
        entry.favorite = !entry.favorite;
        persist();
        renderHistory(entry.id, 'favorite');
      }, 'icon');
      favorite.setAttribute('aria-label', 'Избранное · ' + name);
      favorite.setAttribute('aria-pressed', String(Boolean(entry.favorite)));
      const remove = button('×', () => {
        const index = visible.indexOf(entry);
        const next = visible[index + 1] || visible[index - 1];
        history.splice(history.indexOf(entry), 1);
        if (selected === entry.id) selected = undefined;
        persist();
        updateValues();
        renderHistory(next?.id, 'open');
      }, 'icon');
      remove.setAttribute('aria-label', 'Удалить · ' + name);
      row.append(open, favorite, remove);
      list.append(row);
      if (entry.id === focusId) (focusAction === 'favorite' ? favorite : open).focus({ preventScroll: true });
    }
    if (focusAction && !list.contains(document.activeElement)) $('#favorites').focus({ preventScroll: true });
  }

  function updateValues() {
    $('#duration').textContent = current.duration + ' мс';
    for (const [key, { input, value }] of inputs) {
      input.value = current[key];
      const display = current[key] + ' ' + fields[key].unit;
      value.textContent = display;
      input.setAttribute('aria-valuetext', display);
    }
    const previous = history.find(entry => entry.id === selected)?.settings;
    $('#save').disabled = previous && Object.keys(fields).every(key => current[key] === previous[key]);
  }

  function draw() {
    const canvas = $('#waveform');
    const scale = window.devicePixelRatio || 1;
    const width = Math.round(canvas.clientWidth * scale);
    const height = Math.round(canvas.clientHeight * scale);
    if (!width || !height || !rendered) return;
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const graphics = canvas.getContext('2d');
    graphics.clearRect(0, 0, width, height);
    const center = height / 2;
    graphics.fillStyle = '#41635c';
    graphics.fillRect(0, center, width, scale);
    graphics.fillStyle = '#9ce1ce';
    const samples = rendered.getChannelData(0);
    for (let x = 0; x < width; x++) {
      const start = Math.floor(x * samples.length / width);
      const end = Math.max(start + 1, Math.floor((x + 1) * samples.length / width));
      let low = samples[start];
      let high = low;
      for (let i = start + 1; i < end; i++) {
        low = Math.min(low, samples[i]);
        high = Math.max(high, samples[i]);
      }
      if (high || low) graphics.fillRect(x, center - high * center, 1, Math.max(1, (high - low) * center));
    }
  }

  function refreshAudio() {
    cancelAnimationFrame(renderFrame);
    rendered = render(current);
    draw();
  }

  function scheduleRender() {
    cancelAnimationFrame(renderFrame);
    rendered = null;
    renderFrame = requestAnimationFrame(refreshAudio);
  }

  function getRendered() {
    if (!rendered) refreshAudio();
    return rendered;
  }

  function stop() {
    playback++;
    if (source) {
      source.stop();
      source.disconnect();
      source = null;
    }
    $('#play').textContent = '▶ Слушать';
  }

  async function play() {
    stop();
    const request = playback;
    try {
      context ||= new AudioContext();
      if (context.state !== 'running') await context.resume();
      if (request !== playback) return;
      const clip = getRendered();
      const buffer = context.createBuffer(1, clip.length, clip.sampleRate);
      buffer.copyToChannel(clip.getChannelData(0), 0);
      const node = context.createBufferSource();
      source = node;
      node.buffer = buffer;
      node.connect(context.destination);
      node.onended = () => {
        if (source !== node) return;
        node.disconnect();
        source = null;
        $('#play').textContent = '▶ Слушать';
      };
      node.start();
      $('#play').textContent = '■ Стоп';
    } catch {
      $('#status').textContent = 'Не удалось воспроизвести звук.';
    }
  }

  function selectSound(settings, preview, focusId, focusAction) {
    stop();
    current = settings;
    const preset = byId[current.presetId];
    $('#sound-title').textContent = preset.name;
    $('#sound-category').textContent = categories[preset.category];
    $('#status').textContent = '';
    styleButtons.forEach(control => control.setAttribute('aria-pressed', String(current.style === control.dataset.style)));
    markPreset();
    updateValues();
    refreshAudio();
    renderHistory(focusId, focusAction);
    persist();
    if (preview) play();
  }

  function addToHistory(settings) {
    const id = Date.now().toString(36) + '-' + seed().toString(36);
    history.unshift({ id, settings: { ...settings }, date: Date.now(), favorite: false });
    selected = id;
  }

  function generate(presetId) {
    const settings = create(presetId, current?.style || 'natural', seed());
    addToHistory(settings);
    selectSound(settings, autoplay.checked);
  }

  $('#search').oninput = renderCatalog;
  categorySelect.onchange = renderCatalog;
  $('#material-form').onsubmit = event => {
    event.preventDefault();
    generate(impact($('#material-a').value, $('#material-b').value).id);
    if (matchMedia('(max-width: 650px)').matches) $('.editor').scrollIntoView({ block: 'start' });
  };
  $('#play').onclick = () => source ? stop() : play();
  autoplay.onchange = persist;
  $('#reroll').onclick = () => generate(current.presetId);
  $('#reset').onclick = () => {
    selectSound(create(current.presetId, current.style, current.seed), autoplay.checked);
  };
  styleButtons.forEach(control => {
    control.onclick = () => {
      const style = control.dataset.style;
      if (current.style === style) return;
      const settings = { ...current, style };
      addToHistory(settings);
      selectSound(settings, autoplay.checked);
    };
  });
  $('#save').onclick = () => {
    addToHistory(current);
    updateValues();
    renderHistory();
    persist();
    $('#status').textContent = 'Правки добавлены в историю.';
  };
  $('#favorites').onclick = event => {
    onlyFavorites = !onlyFavorites;
    event.currentTarget.setAttribute('aria-pressed', String(onlyFavorites));
    renderHistory();
  };
  $('#download').onclick = () => {
    const format = $('#format').value;
    const clip = getRendered();
    const blob = format === 'aiff' ? aiff(clip) : NoiseAudio.wav(clip);
    const link = make('a');
    link.href = URL.createObjectURL(blob);
    link.download = current.presetId + '-' + current.style + '-' + current.seed.toString(16) + '.' + format;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    $('#status').textContent = 'Клип готов · ' + format.toUpperCase() + ' · 44,1 кГц · моно';
  };
  new ResizeObserver(draw).observe($('#waveform'));

  if (!current) current = create('steel-wood', 'natural', seed());
  renderCatalog();
  selectSound(current, false);
})();
