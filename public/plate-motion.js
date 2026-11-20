export const zeros = [14.134725, 21.022040, 25.010858, 30.424876, 32.935062];
const tMin = 9;
const tMax = 36;
const range = tMax - tMin;
const terms = 32;
const steps = 40;
const logarithms = Array.from({length: terms}, (_, i) => Math.log(i + 1));
const sections = Array.from({length: steps + 1}, (_, i) => {
  const sigma = i / steps;
  return {sigma, weights: logarithms.map(log => Math.exp(-sigma * log))};
});
const bernoulli = [1 / 384, 0, -1 / (720 * terms ** 3), 0, 1 / (30240 * terms ** 5)];

// This projection and the Euler–Maclaurin expansion match art/make_plate.py.
export function project(t, sigma, magnitude = 0) {
  const x = (t - tMin) / range;
  return [30 + 443 * x + 223 * sigma, 346 + 72 * x - 136 * sigma - 48 * magnitude];
}

export function criticalSection(t) {
  const phases = logarithms.map(log => -t * log);
  const cos = phases.map(Math.cos);
  const sin = phases.map(Math.sin);
  return sections.map(({sigma, weights}) => {
    let real = 0;
    let imaginary = 0;
    for (let i = 0; i < terms - 1; i++) {
      real += weights[i] * cos[i];
      imaginary += weights[i] * sin[i];
    }

    const reciprocal = terms / ((sigma - 1) ** 2 + t ** 2);
    let tailReal = 0.5 + reciprocal * (sigma - 1);
    let tailImaginary = -reciprocal * t;
    let productReal = 1;
    let productImaginary = 0;
    for (let i = 0; i < bernoulli.length; i++) {
      const shifted = sigma + i;
      const nextReal = productReal * shifted - productImaginary * t;
      productImaginary = productReal * t + productImaginary * shifted;
      productReal = nextReal;
      tailReal += bernoulli[i] * productReal;
      tailImaginary += bernoulli[i] * productImaginary;
    }

    const last = terms - 1;
    real += weights[last] * (cos[last] * tailReal - sin[last] * tailImaginary);
    imaginary += weights[last] * (sin[last] * tailReal + cos[last] * tailImaginary);
    return project(t, sigma, Math.hypot(real, imaginary));
  });
}

function attachMotion(hero, stage) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '-4 105 736 348');
  svg.setAttribute('class', 'plate-motion');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  Object.assign(svg.style, {position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', visibility: 'hidden'});
  svg.innerHTML = `
    <defs><linearGradient id="critical-section-ink">
      <stop offset="0%" stop-color="#b5e5c8" stop-opacity=".55"/>
      <stop offset="52%" stop-color="#f2d49b"/>
      <stop offset="100%" stop-color="#b5e5c8" stop-opacity=".8"/>
    </linearGradient></defs>
    <polyline stroke="url(#critical-section-ink)" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" fill="none"/>
    <circle r="4.8" stroke="#f2d49b" stroke-width="1" vector-effect="non-scaling-stroke" fill="none" opacity="0"/>
  `;
  stage.append(svg);
  const contour = svg.querySelector('polyline');
  const zeroRing = svg.querySelector('circle');
  const ordinate = hero.querySelector('[data-ordinate]');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let onScreen = !('IntersectionObserver' in window);
  let cursorX = null;
  let t = zeros[0];
  let phase = Math.acos(1 - 2 * (t - tMin) / range);
  let lastDraw = null;
  let lastText = null;
  let frame = null;

  function enabled() {
    return onScreen && !document.hidden && !reducedMotion.matches && document.documentElement.dataset.motion !== 'off';
  }

  function schedule() {
    if (frame === null && enabled()) frame = requestAnimationFrame(draw);
  }

  function paintSection() {
    const points = criticalSection(t);
    contour.setAttribute('points', points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' '));
    const nearest = zeros.reduce((best, zero) => Math.abs(t - zero) < Math.abs(t - best) ? zero : best);
    const [x, y] = project(nearest, 0.5);
    zeroRing.setAttribute('cx', x);
    zeroRing.setAttribute('cy', y);
    zeroRing.setAttribute('opacity', Math.max(0, 0.85 * (1 - Math.abs(t - nearest) / 1.35)));
    svg.style.visibility = 'visible';
  }

  function draw(now) {
    frame = null;
    if (!enabled()) return;
    const interval = cursorX === null ? 1000 / 24 : 1000 / 45;
    const elapsed = lastDraw === null ? interval : now - lastDraw;
    if (elapsed + 1 < interval) {
      schedule();
      return;
    }
    lastDraw = now;
    const dt = Math.min(elapsed, 80);
    let moving = true;

    if (cursorX === null) {
      phase = (phase + dt * 2 * Math.PI / 26000) % (2 * Math.PI);
      t = tMin + (1 - Math.cos(phase)) * range / 2;
    } else {
      const {left, width} = hero.getBoundingClientRect();
      const fraction = Math.max(0, Math.min(1, (cursorX - left) / width));
      const target = tMin + fraction * range;
      t += (target - t) * (1 - Math.exp(-dt / 95));
      moving = Math.abs(target - t) > 0.01;
      if (!moving) t = target;
    }

    stage.dispatchEvent(new CustomEvent('witness-section', {detail: t}));
    if (!stage.hasAttribute('data-orbit-ready')) paintSection();
    if (ordinate && (lastText === null || now - lastText >= 150 || !moving)) {
      ordinate.textContent = `t = ${t.toFixed(2)}`;
      ordinate.hidden = false;
      lastText = now;
    }
    if (moving) schedule();
    else lastDraw = null;
  }

  function syncMotion() {
    if (enabled()) {
      schedule();
    } else {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      lastDraw = null;
      lastText = null;
      if (ordinate) ordinate.hidden = true;
      svg.style.visibility = 'hidden';
    }
  }

  hero.addEventListener('pointermove', event => {
    if (event.pointerType === 'touch') return;
    cursorX = event.clientX;
    schedule();
  }, {passive: true});
  hero.addEventListener('pointerleave', event => {
    if (event.pointerType === 'touch' || cursorX === null) return;
    cursorX = null;
    const angle = Math.acos(Math.max(-1, Math.min(1, 1 - 2 * (t - tMin) / range)));
    phase = phase > Math.PI ? 2 * Math.PI - angle : angle;
    schedule();
  }, {passive: true});
  if (!onScreen) {
    new IntersectionObserver(([entry]) => {
      onScreen = entry.intersectionRatio >= 0.02;
      syncMotion();
    }, {threshold: 0.02}).observe(stage);
  }
  reducedMotion.addEventListener('change', syncMotion);
  document.addEventListener('visibilitychange', syncMotion);
  window.addEventListener('witness-motion-change', syncMotion);
  stage.addEventListener('witness-orbit-change', () => {
    if (stage.hasAttribute('data-orbit-ready')) svg.style.visibility = 'hidden';
    lastDraw = null;
    schedule();
  });
  syncMotion();
}

if (typeof document !== 'undefined') {
  const hero = document.querySelector('.hero');
  const stage = hero?.querySelector('.plate-stage');
  if (stage && !stage.querySelector('.plate-motion')) attachMotion(hero, stage);
}
