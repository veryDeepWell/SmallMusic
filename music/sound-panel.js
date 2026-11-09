(() => {
  const dialog = $('#soundDialog');
  const { sections, normalize } = SoundSettings;
  const hints = {
    mix: 'Громкость, стереопозиция и высота для всех нот паттерна.',
    oscillator: 'До трёх слоёв поверх исходного тембра. Включайте и настраивайте их независимо.',
    envelope: 'Своя огибающая заменяет огибающую пресета. Отпускание начинается после окончания ноты.',
    filter: 'Выберите тип фильтра, чтобы настроить срез и резонанс.',
    lfo: 'Периодически меняет высоту, громкость или срез фильтра. Нулевая глубина выключает модуляцию.',
    effects: 'Насыщение добавляет гармоники. Эхо повторяет сигнал с заданным интервалом.'
  };
  let pattern;
  let draft;
  let section = 'mix';

  function preview(midi = 60) {
    stop();
    audition(pattern.instrument, midi, normalize(draft), 1);
  }

  function makeField(key, spec, values, onEdit) {
    const label = el('label', 'sound-field');
    const name = el('span', '', spec.label);
    const control = el(spec.options ? 'select' : 'input');
    if (spec.options) {
      for (const [id, title] of Object.entries(spec.options)) {
        const option = el('option', '', title);
        option.value = id;
        control.append(option);
      }
      control.value = values[key];
    } else if (typeof spec.initial === 'boolean') {
      control.type = 'checkbox';
      control.checked = values[key];
      label.classList.add('sound-toggle');
    } else {
      control.type = 'number';
      control.min = spec.min;
      control.max = spec.max;
      control.step = 'any';
      control.value = values[key];
    }
    control.oninput = () => {
      if (control.type === 'checkbox') values[key] = control.checked;
      else if (control.type === 'number') values[key] = control.valueAsNumber;
      else values[key] = control.value;
      onEdit();
    };
    const value = el('span', 'sound-value');
    value.append(control);
    if (spec.unit) value.append(el('span', 'sound-unit', spec.unit));
    label.append(name, value);
    return { label, control };
  }

  function envelopeGraph() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 480 84');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Форма огибающей громкости');
    const path = document.createElementNS(svg.namespaceURI, 'path');
    svg.append(path);
    function update() {
      const { delay, attack, hold, decay, sustain, release, enabled } = normalize(draft).envelope;
      const lengths = [delay, attack, hold, decay, .8, release];
      const total = lengths.reduce((sum, time) => sum + time, 0);
      const sustainY = 72 - sustain * .6;
      const ys = [72, 12, 12, sustainY, sustainY, 72];
      let x = 8;
      const points = lengths.map((time, index) => {
        x += time / total * 464;
        return 'L ' + x + ' ' + ys[index];
      });
      path.setAttribute('d', 'M 8 72 ' + points.join(' '));
      svg.classList.toggle('inactive', !enabled);
    }
    update();
    return { svg, update };
  }

  function renderFields() {
    const fields = $('#soundFields');
    fields.replaceChildren(el('p', 'sound-hint', hints[section]));
    const definition = sections[section];
    const graph = section === 'envelope' ? envelopeGraph() : null;
    if (graph) fields.append(graph.svg);
    const groups = section === 'oscillator' ? draft.oscillators : [draft[section]];
    const layout = el('div', section === 'oscillator' ? 'sound-layers' : '');
    groups.forEach((values, index) => {
      const group = el('fieldset', 'sound-group');
      if (section === 'oscillator') group.append(el('legend', '', 'Осциллятор ' + (index + 1)));
      const grid = el('div', 'sound-grid');
      const controls = [];
      function update() {
        const enabled = values.enabled !== false;
        const customFilter = !['preset', 'bypass'].includes(values.type);
        for (const [key, control] of controls) {
          control.disabled = (key !== 'enabled' && !enabled)
            || (section === 'filter' && key !== 'type' && !customFilter);
        }
        graph?.update();
      }
      for (const [key, spec] of Object.entries(definition.fields)) {
        const { label, control } = makeField(key, spec, values, update);
        grid.append(label);
        controls.push([key, control]);
      }
      update();
      group.append(grid);
      layout.append(group);
    });
    fields.append(layout);
  }

  for (const [key, definition] of Object.entries(sections)) {
    const tab = button(definition.title, definition.title, () => {
      section = key;
      renderTabs();
      renderFields();
    });
    tab.dataset.section = key;
    $('#soundTabs').append(tab);
  }

  function renderTabs() {
    $$('#soundTabs button').forEach(tab => {
      const active = tab.dataset.section === section;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-pressed', active);
    });
  }

  const keyboard = $('#soundKeys');
  for (let midi = 60; midi <= 72; midi++) {
    const name = noteName(midi);
    const key = button(name, 'Прослушать ' + name, () => preview(midi));
    key.classList.toggle('black', name.includes('♯'));
    keyboard.append(key);
  }
  $('#editSound').onclick = () => {
    pattern = current();
    if (!pattern) return;
    stop();
    draft = normalize(pattern.sound);
    section = 'mix';
    $('#soundTitle').textContent = pattern.name;
    $('#soundSubtitle').textContent = instrument(pattern.instrument).name + ' · Связанных блоков: ' + count(pattern.id);
    renderTabs();
    renderFields();
    dialog.showModal();
  };
  dialog.addEventListener('keydown', event => event.stopPropagation());
  dialog.addEventListener('close', stop);
  $('#closeSound').onclick = () => dialog.close();
  $('#testSound').onclick = () => preview();
  $('#resetSound').onclick = () => {
    draft = normalize();
    renderFields();
  };
  $('#soundForm').onsubmit = event => {
    event.preventDefault();
    if (!state.patterns.includes(pattern)) {
      dialog.close();
      return;
    }
    snapshot();
    pattern.sound = normalize(draft);
    dialog.close();
    changed();
    toast('Звучание обновлено во всех блоках паттерна');
  };
})();
