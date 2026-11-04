/* MEKORA / scroll-directed product exploration. No external dependencies. */
(() => {
  'use strict';
  const root = document.querySelector('#story');
  if (!root) return;
  const byId = id => document.getElementById(id);
  const svg = byId('device-svg');
  const world = byId('world');
  const core = byId('core-layer');
  const mount = byId('mount-layer');
  const contact = byId('contact-layer');
  const motor = byId('motor');
  const screw = byId('screw-layer');
  const guides = byId('guide-lines');
  const signal = byId('motor-signal');
  const content = byId('scene-content');
  const dots = [...document.querySelectorAll('.progress-dot')];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const scenes = [
    { eyebrow:'00 / THE PRODUCT', title:'Замечает.<br>До поломки.', description:'Модульный датчик мониторинга промышленного оборудования. Прокрутите, чтобы увидеть, как он устроен.', right:false, hud:'MEKORA / 00' },
    { eyebrow:'01 / FASTENING', title:'Всё начинается<br>с детали.', description:'Камера приближается к крепёжному винту. Надёжная фиксация датчика на монтажной основе.', right:true, hud:'FASTENING / 01' },
    { eyebrow:'02 / MEKORA CORE', title:'Слышит<br>невидимое.', description:'Базовый модуль измеряет вибрацию и температуру — важные сигналы состояния оборудования.', right:false, hud:'CORE / 02' },
    { eyebrow:'03 / MOUNTING BASE', title:'Основа<br>точности.', description:'Монтажная пластина передаёт вибрации от поверхности оборудования к датчику.', right:true, hud:'BASE / 03' },
    { eyebrow:'04 / CONTACT LAYER', title:'Ближе<br>к источнику.', description:'Контактный слой обеспечивает надёжную фиксацию и тепловой контакт с агрегатом.', right:false, hud:'CONTACT / 04' },
    { eyebrow:'05 / THE MACHINE', title:'Видеть.<br>Раньше.', description:'От измерения физических параметров — к обнаружению потенциальных отклонений и информированному решению инженера.', right:true, hud:'MACHINE / 05' }
  ];
  /* Each view is a camera frame in SVG's 900x640 coordinate space. The target part fills the shot. */
  const cameras = [
    [20,   0,  860, 620],
    [375, 96, 205, 148],
    [330, 165, 312, 230],
    [330, 240, 305, 220],
    [330, 300, 310, 230],
    [150, 294, 605, 435]
  ];
  /* screw lift, core lift, mounting movement, contact movement, signal visibility */
  const offsets = [
    [0,   0,   0,  0, 0],
    [106, 0,   0,  0, 0],
    [155, 67,  0,  0, 0],
    [160, 125, 56, 0, 0],
    [160, 136, 95, 63,0],
    [0,   0,   0,  0, 1]
  ];
  const clamp = (v,min,max) => Math.max(min,Math.min(max,v));
  const lerp = (a,b,t) => a+(b-a)*t;
  const smooth = t => {t=clamp(t,0,1);return t*t*(3-2*t);};
  let current = -1, lastProgress = -1, ticking = false;

  function render(progress) {
    progress = clamp(progress,0,5);
    const base = Math.min(4, Math.floor(progress));
    const next = base+1;
    const mix = smooth(progress-base);
    const camera = cameras[base].map((v,i)=>lerp(v,cameras[next][i],mix));
    svg.setAttribute('viewBox',camera.map(v=>v.toFixed(2)).join(' '));
    const [s,c,m,ct,sig] = offsets[base].map((v,i)=>lerp(v,offsets[next][i],mix));
    screw.setAttribute('transform',`translate(0 ${-s.toFixed(2)})`);
    core.setAttribute('transform',`translate(0 ${-c.toFixed(2)})`);
    mount.setAttribute('transform',`translate(0 ${m.toFixed(2)})`);
    contact.setAttribute('transform',`translate(0 ${ct.toFixed(2)})`);
    motor.setAttribute('transform',`translate(0 ${(ct*.13).toFixed(2)})`);
    guides.setAttribute('opacity',(clamp((c+m)/180,0,.55)*(1-sig)).toFixed(2));
    signal.setAttribute('opacity',sig.toFixed(2));
    world.setAttribute('opacity','1');
    byId('progress-fill').style.height = `${progress/5*100}%`;

    const sceneIndex = clamp(Math.round(progress),0,5);
    if (sceneIndex !== current) {
      current = sceneIndex;
      const scene = scenes[sceneIndex];
      byId('scene-eyebrow').textContent=scene.eyebrow;
      byId('scene-title').innerHTML=scene.title;
      byId('scene-description').textContent=scene.description;
      byId('hud-label').textContent=scene.hud;
      byId('scene-counter').textContent=`${String(sceneIndex+1).padStart(2,'0')} / 06`;
      content.classList.toggle('side-right',scene.right);
      byId('scene-action').classList.toggle('hidden',sceneIndex!==0);
      dots.forEach((dot,i)=>{
        dot.classList.toggle('active',i===sceneIndex);
        if (i===sceneIndex) dot.setAttribute('aria-current','step');
        else dot.removeAttribute('aria-current');
      });
      byId('device-description').textContent = `Анимированная сцена ${sceneIndex+1} из 6. ${scene.description}`;
    }
  }
  function position() {
    const viewH = window.innerHeight;
    const storyTop = root.getBoundingClientRect().top + window.scrollY;
    const scrollLength = Math.max(1,root.offsetHeight - viewH);
    return clamp((window.scrollY-storyTop)/scrollLength*5,0,5);
  }
  function update() {
    ticking = false;
    const p=position();
    if(Math.abs(p-lastProgress)>0.0001){render(p);lastProgress=p;}
  }
  function requestUpdate(){if(!ticking){ticking=true;requestAnimationFrame(update);}}
  function go(index){
    const i=clamp(index,0,5);
    const top=root.getBoundingClientRect().top+window.scrollY+(root.offsetHeight-window.innerHeight)*i/5;
    window.scrollTo({top,behavior:reducedMotion.matches?'instant':'smooth'});
  }
  window.addEventListener('scroll',requestUpdate,{passive:true});
  window.addEventListener('resize',requestUpdate,{passive:true});
  document.getElementById('previous-step').addEventListener('click',()=>go(current-1));
  document.getElementById('next-step').addEventListener('click',()=>go(current+1));
  dots.forEach((dot,i)=>dot.addEventListener('click',event=>{event.preventDefault();go(i);}));
  document.addEventListener('keydown',event=>{
    if(event.target.closest('button,input,textarea,select,[contenteditable]'))return;
    const withinStory = position()>0 && position()<5;
    if(!withinStory)return;
    if(event.key==='ArrowRight'){event.preventDefault();go(current+1);}
    if(event.key==='ArrowLeft'){event.preventDefault();go(current-1);}
  });
  const copyButton=byId('copy-brief');
  copyButton.addEventListener('click', async()=>{
    const text='Здравствуйте! Хотел(а) бы обсудить демонстрацию модульного датчика MEKORA для мониторинга промышленного оборудования. Подскажите, как можно связаться с командой?';
    const feedback=byId('copy-feedback');
    try{
      if(navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(text);
      else {
        const input=document.createElement('textarea');input.value=text;input.style.position='fixed';input.style.opacity='0';document.body.appendChild(input);input.select();
        const copied=document.execCommand('copy');input.remove();if(!copied)throw new Error('Copy unavailable');
      }
      feedback.textContent='Текст запроса скопирован. Можно отправить его вашей команде MEKORA.';
      copyButton.firstChild.textContent='Запрос скопирован ';
    } catch(e){feedback.textContent='Не удалось скопировать автоматически. Выделите текст запроса вручную.';}
  });
  update();
})();
