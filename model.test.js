const test=require('node:test'),assert=require('node:assert/strict'),M=require('./music/model');
function fixture(){const s=M.fresh(),p=M.pattern('guitar','Гитара — куплет');p.notes=[{beat:0,midi:60,duration:1,velocity:.8}];s.patterns.push(p);s.clips.push({id:M.id(),patternId:p.id,trackId:s.tracks[0].id,start:0,length:4},{id:M.id(),patternId:p.id,trackId:s.tracks[1].id,start:4,length:8});return {s,p}}
test('правка паттерна обновляет все связанные экземпляры и повторы',()=>{const {s,p}=fixture();p.notes[0].midi=63;p.notes[0].duration=2;const ev=M.events(s);assert.deepEqual(ev.map(e=>e.beat),[0,16,32]);assert.ok(ev.every(e=>e.midi===63&&e.duration===2));assert.equal(s.patterns.length,1)});
test('копия независима, транспонирование не меняет оригинал',()=>{const {s,p}=fixture(),copy=M.duplicate(p,1);s.patterns.push(copy);assert.notEqual(copy.id,p.id);assert.equal(copy.instrument,p.instrument);copy.notes[0].duration=3;assert.equal(copy.notes[0].midi,61);assert.equal(p.notes[0].midi,60);assert.equal(p.notes[0].duration,1)});
test('паттерны не ограничены числом инструментов или линий',()=>{const s=M.fresh();for(let i=0;i<500;i++)s.patterns.push(M.pattern('guitar','Партия '+i));assert.equal(M.validate(s).patterns.length,500);assert.equal(s.tracks.length,4)});
test('JSON сохраняет ссылки на паттерны',()=>{const {s,p}=fixture();const loaded=M.migrate(JSON.parse(JSON.stringify(s)));loaded.patterns[0].notes[0].midi=65;assert.ok(M.events(loaded).every(e=>e.midi===65));assert.equal(loaded.clips[0].patternId,p.id)});
test('mute и solo действуют на линии, не на паттерны',()=>{const {s}=fixture();s.tracks[0].solo=true;assert.equal(M.events(s).length,1);s.tracks[0].mute=true;assert.equal(M.events(s).length,0)});
test('сокращение длины и обрезка блока не играют скрытые ноты',()=>{const {s,p}=fixture();p.length=1;p.notes.push({beat:5,midi:70,duration:1,velocity:1});s.clips=[{id:M.id(),patternId:p.id,trackId:s.tracks[0].id,start:0,length:.125}];assert.equal(M.events(s).length,1);assert.equal(M.events(s)[0].duration,.5)});
test('старый проект преобразуется без потери нот и расположения блоков',()=>{const s=M.migrate({name:'Old',bpm:112,tracks:[{name:'Keys',instrument:0,length:4,color:'#b69ae6',volume:.6,mute:false,solo:false,notes:[[0,7,2]]}],clips:[{t:0,s:2,l:4}]});assert.equal(s.patterns[0].notes[0].midi,64);assert.equal(M.events(s)[0].beat,8);assert.equal(s.clips[0].patternId,s.patterns[0].id)});
test('невалидные ссылки при импорте отклоняются',()=>{const {s}=fixture();s.clips[0].patternId='missing';assert.throws(()=>M.validate(s))});


test('звучание сохраняется, используется связанными блоками и копируется независимо', () => {
  const {s, p} = fixture();
  p.sound.mix.pan = -65;
  p.sound.oscillators[0].enabled = true;
  const restored = M.migrate(JSON.parse(JSON.stringify(s)));
  const original = restored.patterns[0];
  const copy = M.duplicate(original);
  copy.sound.mix.pan = 90;
  copy.sound.oscillators[0].enabled = false;
  assert.ok(M.events(restored).every(event => event.patch.mix.pan === -65));
  assert.equal(original.sound.oscillators[0].enabled, true);
});

test('проекты без настроек звучания получают нейтральные параметры', () => {
  const {s, p} = fixture();
  delete p.sound;
  const restored = M.migrate(s).patterns[0].sound;
  assert.equal(restored.mix.volume, 100);
  assert.equal(restored.filter.type, 'preset');
  assert.equal(restored.envelope.enabled, false);
  assert.ok(restored.oscillators.every(layer => !layer.enabled));
});
