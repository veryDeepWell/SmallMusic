(function (root) {
  const categories = {
    impacts: 'Удары и материалы', steps: 'Шаги', weapons: 'Оружие', ui: 'Интерфейс',
    world: 'Предметы и механизмы', motion: 'Движение и стихии', arcade: 'Аркада и фантастика'
  };

  const materials = {
    steel:    { name: 'Сталь',   tone: 670,  modes: [1, 2.76, 4.13, 6.49], ring: .42, grit: .23, color: 4900 },
    iron:     { name: 'Железо',  tone: 345,  modes: [1, 2.33, 3.78, 5.55], ring: .29, grit: .33, color: 3200 },
    aluminum: { name: 'Алюминий',tone: 970,  modes: [1, 2.22, 3.84, 5.26], ring: .31, grit: .26, color: 6200 },
    copper:   { name: 'Медь',    tone: 520,  modes: [1, 2.42, 3.35, 4.91], ring: .49, grit: .2, color: 4000 },
    wood:     { name: 'Дерево',  tone: 245,  modes: [1, 1.81, 3.14, 4.53], ring: .072, grit: .42, color: 1800 },
    glass:    { name: 'Стекло',  tone: 1210, modes: [1, 2.62, 4.47, 6.81], ring: .42, grit: .18, color: 8200 },
    ceramic:  { name: 'Керамика',tone: 780,  modes: [1, 2.1, 3.52, 5.21], ring: .23, grit: .32, color: 5600 },
    stone:    { name: 'Камень',  tone: 390,  modes: [1, 1.98, 3.82], ring: .085, grit: .62, color: 3000 },
    concrete: { name: 'Бетон',   tone: 155,  modes: [1, 2.45, 3.43], ring: .06, grit: .7, color: 2200 },
    brick:    { name: 'Кирпич',  tone: 310,  modes: [1, 1.71, 3.28], ring: .069, grit: .63, color: 2700 },
    plastic:  { name: 'Пластик', tone: 460,  modes: [1, 1.77, 3.12], ring: .1, grit: .4, color: 3400 },
    rubber:   { name: 'Резина',  tone: 115,  modes: [1, 1.64], ring: .057, grit: .33, color: 1150 },
    leather:  { name: 'Кожа',    tone: 125,  modes: [1, 1.83], ring: .038, grit: .5, color: 1350 },
    fabric:   { name: 'Ткань',   tone: 77,   modes: [1, 1.58], ring: .025, grit: .66, color: 950 }
  };

  const presets = [];
  const add = (category, id, name, recipe, duration, options) =>
    presets.push({ category, id, name, recipe, duration, ...options });

  const materialIds = Object.keys(materials);
  for (const [i, first] of materialIds.entries()) {
    for (const second of materialIds.slice(i)) {
      const a = materials[first];
      const b = materials[second];
      add('impacts', first + '-' + second, a.name + ' × ' + b.name, 'impact',
        Math.max(a.ring, b.ring) * 2 + .12, { materials: [first, second] });
    }
  }

  const surfaces = {
    pavement: ['асфальт', 'concrete', 2600, .45],
    concrete: ['бетон', 'concrete', 1900, .48],
    boards: ['доски', 'wood', 1800, .27],
    gravel: ['гравий', 'stone', 5500, .87],
    grass: ['трава', 'fabric', 3500, .73],
    sand: ['песок', 'fabric', 2100, .81],
    snow: ['снег', 'rubber', 4800, .78],
    metal: ['металл', 'iron', 3600, .44],
    tile: ['плитка', 'ceramic', 4400, .35],
    puddle: ['лужа', 'rubber', 6200, .83]
  };
  for (const [id, [surface, material, color, grit]] of Object.entries(surfaces)) {
    add('steps', 'step-' + id, 'Шаг · ' + surface, 'step', .31, { material, color, grit, count: 1 });
    add('steps', 'run-' + id, 'Бег · ' + surface, 'step', .78, { material, color, grit, count: 3 });
    add('steps', 'land-' + id, 'Приземление · ' + surface, 'step', .47, { material, color, grit, count: 1, heavy: true });
  }

  // Shot profiles set the number of reports, transient brightness and low-end weight.
  for (const [id, name, duration, count, color, weight] of [
    ['pistol', 'Пистолет', .63, 1, 7100, .35],
    ['revolver', 'Револьвер', .8, 1, 5500, .61],
    ['suppressed', 'Пистолет с глушителем', .32, 1, 2300, .19],
    ['rifle', 'Винтовка', .84, 1, 6500, .74],
    ['sniper', 'Снайперская винтовка', 1.15, 1, 4900, .83],
    ['shotgun', 'Дробовик', .92, 1, 3900, .88],
    ['burst', 'Автомат · очередь', .94, 4, 5400, .55],
    ['machinegun', 'Пулемёт · очередь', 1.48, 7, 4500, .79],
    ['cannon', 'Пушка', 1.75, 1, 3100, .99],
    ['grenade', 'Взрыв гранаты', 1.32, 1, 1950, .91],
    ['blast', 'Большой взрыв', 2.4, 1, 1350, 1]
  ]) add('weapons', id, name, 'shot', duration, { count, color, weight });

  // Mechanical sequences play separate contacts at normalized positions in the clip.
  for (const [category, id, name, duration, first, second, hits] of [
    ['ui', 'button', 'Кнопка интерфейса', .115, 'plastic', 'rubber', [0]],
    ['ui', 'mouse', 'Щелчок мыши', .19, 'plastic', 'steel', [0, .34]],
    ['ui', 'toggle', 'Переключатель UI', .16, 'rubber', 'plastic', [0, .33]],
    ['ui', 'tab', 'Вкладка UI', .14, 'plastic', 'wood', [0, .17]],
    ['ui', 'type', 'Печать на клавиатуре', .55, 'plastic', 'plastic', [0, .17, .39, .61]],
    ['world', 'switch', 'Настенный выключатель', .22, 'plastic', 'steel', [0, .28]],
    ['world', 'panel', 'Кнопка на панели', .21, 'steel', 'plastic', [0, .35]],
    ['world', 'lever', 'Металлический рычаг', .45, 'iron', 'steel', [0, .28, .53]],
    ['world', 'latch', 'Защёлка', .25, 'iron', 'wood', [0, .19]],
    ['world', 'lock', 'Замок и ключ', .64, 'steel', 'iron', [0, .12, .29, .63]],
    ['world', 'door-wood', 'Деревянная дверь', .48, 'wood', 'wood', [0, .11, .22]],
    ['world', 'door-metal', 'Металлическая дверь', .82, 'iron', 'iron', [0, .11, .18]],
    ['world', 'drawer', 'Ящик закрывается', .43, 'wood', 'plastic', [0, .26, .54]],
    ['world', 'chain', 'Звон цепи', .85, 'iron', 'steel', [0, .08, .19, .26, .43, .57]],
    ['world', 'coins', 'Горсть монет', .76, 'copper', 'steel', [0, .06, .11, .17, .27, .39, .59]],
    ['world', 'glass-break', 'Разбитое стекло', .88, 'glass', 'stone', [0, .025, .064, .1, .13, .17, .25, .32, .49, .63]],
    ['world', 'pot-break', 'Разбитый горшок', .67, 'ceramic', 'concrete', [0, .09, .14, .22, .37, .48]],
    ['world', 'ball', 'Отскоки мяча', .93, 'rubber', 'concrete', [0, .36, .6, .75, .84]],
    ['world', 'knock', 'Стук в дверь', .73, 'wood', 'leather', [0, .25, .52]],
    ['world', 'bell', 'Удар колокола', 1.5, 'copper', 'copper', [0]],
    ['world', 'hammer', 'Молоток по наковальне', .93, 'steel', 'iron', [0, .44]],
    ['world', 'clock', 'Тиканье часов', .87, 'plastic', 'iron', [0, .52]],
    ['weapons', 'reload', 'Перезарядка', .8, 'steel', 'plastic', [0, .26, .48, .73]],
    ['weapons', 'empty', 'Спуск без патрона', .18, 'iron', 'steel', [0, .21]],
    ['weapons', 'shell', 'Гильза падает', .55, 'copper', 'concrete', [0, .19, .32, .44]],
    ['weapons', 'sword', 'Столкновение клинков', .64, 'steel', 'steel', [0, .075]],
    ['weapons', 'shield', 'Удар по щиту', .51, 'wood', 'iron', [0, .09]]
  ]) add(category, id, name, 'impact', duration, { materials: [first, second], hits });

  // Sweeps blend colored noise with a sliding oscillator.
  for (const [category, id, name, duration, from, to, color, tone, pulses, attack] of [
    ['motion', 'whoosh', 'Взмах', .45, 160, 65, 4300, .08, 1, .34],
    ['motion', 'flyby', 'Пролёт мимо', .78, 430, 90, 2900, .27, 1, .38],
    ['motion', 'wind', 'Порыв ветра', 1.75, 150, 70, 1400, .02, 3, .24],
    ['motion', 'rustle', 'Шорох ткани', .6, 175, 75, 3800, .01, 6, .18],
    ['motion', 'paper', 'Шорох бумаги', .44, 210, 110, 6900, .03, 8, .06],
    ['motion', 'scrape', 'Скрежет металла', .73, 790, 260, 7600, .48, 5, .09],
    ['motion', 'splash', 'Всплеск воды', .67, 430, 155, 5300, .25, 7, .06],
    ['motion', 'bubble', 'Пузырь', .26, 170, 760, 1600, .82, 2, .07],
    ['motion', 'fire', 'Треск огня', 1.4, 130, 55, 3800, .025, 13, .07],
    ['motion', 'thunder', 'Раскат грома', 2.4, 95, 37, 780, .24, 4, .06],
    ['motion', 'engine', 'Разгон двигателя', 1.38, 52, 340, 1400, .77, 2, .07],
    ['motion', 'steam', 'Выброс пара', 1.1, 540, 100, 7600, .01, 2, .06],
    ['weapons', 'ricochet', 'Рикошет', .45, 2250, 570, 6900, .72, 1, .015],
    ['weapons', 'arrow', 'Пролёт стрелы', .39, 820, 170, 4400, .23, 1, .25],
    ['weapons', 'laser', 'Лазерный выстрел', .47, 1380, 80, 4500, .89, 1, .013],
    ['arcade', 'jump', 'Прыжок', .28, 290, 840, 3600, .94, 1, .025],
    ['arcade', 'hurt', 'Получение урона', .36, 510, 88, 2200, .66, 4, .02],
    ['arcade', 'warp', 'Телепорт', .95, 155, 1250, 5400, .81, 5, .18],
    ['arcade', 'charge', 'Заряд энергии', 1.15, 92, 680, 2500, .93, 7, .34],
    ['arcade', 'shield-on', 'Активация щита', .65, 290, 580, 1800, .78, 3, .15],
    ['arcade', 'glitch', 'Цифровой сбой', .44, 1850, 210, 6800, .55, 11, .04],
    ['arcade', 'ufo', 'НЛО', 1.26, 720, 355, 2700, .94, 9, .16]
  ]) add(category, id, name, 'sweep', duration, { from, to, color, tone, pulses, attack });

  for (const [category, id, name, duration, frequency, notes, gap] of [
    ['ui', 'hover', 'Наведение', .095, 860, [0], .25],
    ['ui', 'confirm', 'Подтверждение', .36, 660, [0, 7], .25],
    ['ui', 'cancel', 'Отмена', .28, 485, [0, -5], .25],
    ['ui', 'error', 'Ошибка', .4, 310, [0, -1, -6], .22],
    ['ui', 'notify', 'Уведомление', .54, 575, [0, 5, 9], .21],
    ['ui', 'message', 'Новое сообщение', .48, 740, [0, 4], .2],
    ['ui', 'unlock', 'Разблокировка', .62, 480, [0, 4, 7, 12], .17],
    ['ui', 'timer', 'Таймер', .65, 725, [0, 0, 7], .31],
    ['ui', 'alarm', 'Сигнал тревоги', 1.14, 550, [0, 5, 0, 5], .24],
    ['arcade', 'coin', 'Монета', .4, 920, [0, 5, 12], .13],
    ['arcade', 'pickup', 'Подбор предмета', .49, 545, [0, 7, 12], .16],
    ['arcade', 'powerup', 'Усиление', .77, 395, [0, 4, 7, 11, 14], .15],
    ['arcade', 'level-up', 'Новый уровень', 1.0, 395, [0, 4, 7, 12, 16], .16],
    ['arcade', 'quest', 'Задание выполнено', 1.17, 330, [0, 7, 12, 16, 19], .145],
    ['arcade', 'game-over', 'Конец игры', 1.12, 510, [0, -3, -7, -12], .21],
    ['arcade', 'respawn', 'Возрождение', .78, 285, [-5, 0, 5, 12], .18],
    ['arcade', 'countdown', 'Обратный отсчёт', 1.5, 570, [0, 0, 0, 7], .25]
  ]) add(category, id, name, 'tones', duration, { frequency, notes, gap });

  const byId = Object.fromEntries(presets.map(preset => [preset.id, preset]));
  function impact(first, second) {
    const sorted = [first, second].sort((a, b) => materialIds.indexOf(a) - materialIds.indexOf(b));
    return byId[sorted.join('-')];
  }

  const api = { categories, materials, presets, byId, impact };
  if (typeof module !== 'undefined') module.exports = api;
  else root.SoundCatalog = api;
})(globalThis);
