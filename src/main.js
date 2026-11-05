import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import './style.css';

gsap.registerPlugin(ScrollTrigger);

const FRAME_COUNT = 301;
const FRAME_PATH = (index) => `/frames/frame_${String(index + 1).padStart(4, '0')}.webp`;
const FRAME_CACHE_LIMIT = 48;
const section = document.querySelector('.explore');
const stage = document.querySelector('.explore-stage');
const canvas = document.querySelector('#sensor-canvas');
const context = canvas.getContext('2d', { alpha: false, desynchronized: true });
const fallback = document.querySelector('.sensor-fallback');
const progressValue = document.querySelector('#progress-value');
const stageCopy = document.querySelector('#stage-copy');
const sceneEyebrow = document.querySelector('#scene-eyebrow');
const sceneTitle = document.querySelector('#explore-title');
const sceneDescription = document.querySelector('#scene-description');
const layerNotes = [...document.querySelectorAll('.layer-note')];
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const lowPower = navigator.hardwareConcurrency <= 2 || navigator.deviceMemory <= 2;

const scenes = [
  { at: 0, eyebrow: 'ПОЛНОСТЬЮ СОБРАН', title: 'Один корпус.<br /><em>Много сигналов.</em>', description: 'Прокручивайте, чтобы увидеть, из чего складывается точность MEKORA.' },
  { at: 0.2, eyebrow: 'ЗАЩИТНЫЙ КОРПУС', title: 'Снаружи —<br /><em>спокойствие.</em>', description: 'Герметичный корпус защищает электронику от среды и ежедневной работы.' },
  { at: 0.43, eyebrow: 'СЕНСОРНЫЙ МОДУЛЬ', title: 'Слышит<br /><em>невидимое.</em>', description: 'Сенсор считывает вибрацию и температуру там, где начинается изменение.' },
  { at: 0.68, eyebrow: 'ЭЛЕКТРОННАЯ ПЛАТА', title: 'Сигнал<br /><em>становится данными.</em>', description: 'Плата превращает физическое состояние агрегата в сигнал для системы.' },
  { at: 0.9, eyebrow: 'МЕТАЛЛИЧЕСКОЕ ОСНОВАНИЕ', title: 'Основа<br /><em>точности.</em>', description: 'Каждый слой возвращается на своё место, чтобы снова работать как единое целое.' },
  { at: 1, eyebrow: 'MEKORA / READY', title: 'Видеть.<br /><em>Раньше.</em>', description: 'От измерения физических параметров — к своевременному решению инженера.' },
];

const loaded = new Map();
const pending = new Map();
let lastFrame = 0;
let imageWidth = 1280;
let imageHeight = 720;
let canvasDpr = 1;

function remember(index, image) {
  loaded.delete(index);
  loaded.set(index, image);
  while (loaded.size > FRAME_CACHE_LIMIT) loaded.delete(loaded.keys().next().value);
}

function loadFrame(index) {
  index = Math.max(0, Math.min(FRAME_COUNT - 1, Math.round(index)));
  if (loaded.has(index)) return Promise.resolve(loaded.get(index));
  if (pending.has(index)) return pending.get(index);
  const promise = new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = async () => {
      try { await image.decode(); } catch { /* The browser already decoded the frame. */ }
      imageWidth = image.naturalWidth || imageWidth;
      imageHeight = image.naturalHeight || imageHeight;
      remember(index, image);
      pending.delete(index);
      resolve(image);
    };
    image.onerror = () => { pending.delete(index); reject(new Error(`Frame ${index} failed`)); };
    image.src = FRAME_PATH(index);
  });
  pending.set(index, promise);
  return promise;
}

function draw(image) {
  if (!image) return;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!width || !height) return;
  const scale = Math.min(width / imageWidth, height / imageHeight);
  const drawWidth = imageWidth * scale;
  const drawHeight = imageHeight * scale;
  context.save();
  context.setTransform(canvasDpr, 0, 0, canvasDpr, 0, 0);
  context.fillStyle = '#fff';
  context.fillRect(0, 0, width, height);
  context.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
  context.restore();
}

function resizeCanvas() {
  const bounds = canvas.getBoundingClientRect();
  canvasDpr = Math.min(window.devicePixelRatio || 1, lowPower ? 1.25 : 2);
  canvas.width = Math.max(1, Math.floor(bounds.width * canvasDpr));
  canvas.height = Math.max(1, Math.floor(bounds.height * canvasDpr));
  const image = loaded.get(lastFrame) || loaded.get(0);
  if (image) draw(image);
}

function warmFrames(center) {
  const radius = lowPower ? 2 : 6;
  for (let offset = -radius; offset <= radius; offset += 1) {
    const index = Math.round(center) + offset;
    if (index >= 0 && index < FRAME_COUNT) loadFrame(index).catch(() => {});
  }
}

function updateCopy(progress) {
  const scene = scenes.reduce((current, candidate) => progress >= candidate.at ? candidate : current, scenes[0]);
  sceneEyebrow.textContent = scene.eyebrow;
  sceneTitle.innerHTML = scene.title;
  sceneDescription.textContent = scene.description;
  progressValue.textContent = String(Math.round(progress * 100)).padStart(2, '0');
  stageCopy.dataset.scene = scene.eyebrow;
  layerNotes.forEach((note) => {
    const start = Number(note.dataset.start);
    const end = Number(note.dataset.end);
    note.classList.toggle('is-visible', progress >= start && progress <= end);
  });
}

function showFrame(frame) {
  lastFrame = Math.max(0, Math.min(FRAME_COUNT - 1, Math.round(frame)));
  const cached = loaded.get(lastFrame);
  if (cached) draw(cached);
  else loadFrame(lastFrame).then(draw).catch(() => draw(loaded.get(0)));
  warmFrames(lastFrame);
}

function setupFallback() {
  fallback.hidden = false;
  canvas.hidden = true;
  updateCopy(0);
  if (reduceMotion.matches) stage.dataset.mode = 'reduced-motion';
}

function setupScroller() {
  const playhead = { frame: 0 };
  gsap.to(playhead, {
    frame: FRAME_COUNT - 1,
    ease: 'none',
    snap: 'frame',
    scrollTrigger: {
      trigger: section,
      start: 'top top',
      end: () => `+=${Math.round(window.innerHeight * 2.5)}`,
      pin: stage,
      scrub: true,
      anticipatePin: 1,
      invalidateOnRefresh: true,
      onUpdate: (self) => {
        const progress = self.progress;
        showFrame(playhead.frame);
        updateCopy(progress);
        stage.style.setProperty('--scroll-progress', progress.toFixed(4));
      },
    },
  });
}

async function init() {
  fallback.hidden = true;
  await loadFrame(0).then((image) => {
    draw(image);
    fallback.hidden = true;
  }).catch(setupFallback);
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas, { passive: true });
  updateCopy(0);
  if (reduceMotion.matches || lowPower) {
    setupFallback();
    return;
  }
  setupScroller();
}

document.querySelector('#copy-request').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  const feedback = document.querySelector('#copy-feedback');
  try {
    await navigator.clipboard.writeText('Здравствуйте! Хотел(а) бы обсудить демонстрацию MEKORA для мониторинга промышленного оборудования.');
    button.querySelector('span').textContent = '✓';
    feedback.textContent = 'Запрос скопирован. Можно отправить его вашей команде MEKORA.';
  } catch {
    feedback.textContent = 'Скопировать автоматически не удалось. Свяжитесь с командой MEKORA удобным способом.';
  }
});

init();
