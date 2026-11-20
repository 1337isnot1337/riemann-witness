import mesh from './art/plate-mesh.js';

const period = 26000;
const frameInterval = 1000 / 24;
const width = 736;
const height = 348;
const tMin = 9;
const tRange = 27;
const ticks = [10,15,20,25,30,35];
const floorCorners = [[-0.52,-0.59],[-0.52,0.59],[0.522,-0.59],[0.522,0.59]];
const tDepth = Math.sqrt((443 * 223 - 72 * 136) * 72 / 136);
const sigmaDepth = -tDepth * 136 / 72;
const axisRatio = Math.hypot(443,72,tDepth) / Math.hypot(223,136,sigmaDepth);

const vertexSource = `
  attribute vec3 position;
  uniform mat4 camera;
  uniform mediump float dotSize;
  void main() {
    gl_Position = camera * vec4(position, 1.0);
    gl_PointSize = max(1.0, dotSize);
  }`;
const fragmentSource = `
  precision mediump float;
  uniform vec4 ink;
  uniform mediump float dotSize;
  void main() {
    float opacity = ink.a;
    if (dotSize > 0.0) {
      opacity *= 1.0 - smoothstep(0.37, 0.50, distance(gl_PointCoord, vec2(0.5)));
    }
    gl_FragColor = vec4(ink.rgb, opacity);
  }`;

function shader(gl, type, source) {
  const handle = gl.createShader(type);
  gl.shaderSource(handle, source);
  gl.compileShader(handle);
  if (!gl.getShaderParameter(handle, gl.COMPILE_STATUS)) throw Error('Plate shader unavailable');
  return handle;
}

function createGeometry() {
  const {rows, ts} = mesh;
  const cols = ts.length;
  const binary = atob(mesh.heights);
  const surface = new Float32Array(rows * cols * 3);
  const faces = [], major = [], minor = [], critical = [], cross = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const i = row * cols + col;
      surface[i * 3] = (ts[col] - tMin) / tRange - 0.5;
      surface[i * 3 + 1] = row / (rows - 1) - 0.5;
      surface[i * 3 + 2] = (binary.charCodeAt(i * 2) + 256 * binary.charCodeAt(i * 2 + 1)) / 8192;
      if (col + 1 < cols) {
        const lines = row * 2 === rows - 1 ? critical : row % 5 === 0 ? major : minor;
        lines.push(i,i + 1);
        if (row + 1 < rows) faces.push(i,i + 1,i + cols, i + 1,i + cols + 1,i + cols);
      }
      if (row + 1 < rows && col % 3 === 0) cross.push(i,i + cols);
    }
  }
  const ground = [];
  for (const s of [-0.59,-0.25,0,0.25,0.59]) ground.push(-0.52,s,0, 0.522,s,0);
  for (let t = 10; t <= 36; t += 2) {
    const x = (t - tMin) / tRange - 0.5;
    ground.push(x,-0.59,0, x,0.59,0);
  }
  for (const t of ticks) {
    const x = (t - tMin) / tRange - 0.5;
    ground.push(x,-0.59,0, x,-0.609,0, x,0.59,0, x,0.609,0);
  }
  const axis = [];
  for (let i = 0; i < 44; i++) axis.push(-0.52 + i * 0.024,0,0, -0.51 + i * 0.024,0,0);
  const zeros = mesh.zeros.flatMap(t => [(t - tMin) / tRange - 0.5,0,0]);
  return {surface, faces, major, minor, critical, cross, ground, axis, zeros};
}

// Match the engraved plate at angle zero. The out-of-plane components make
// the horizontal axes and magnitude axis mutually perpendicular in 3D.
function camera(surface, angle, out) {
  const c = Math.cos(angle), s = Math.sin(angle);
  const tx = c * 443 + s * axisRatio * 223, sx = c * 223 - s * 443 / axisRatio;
  const ty = c * 72 - s * axisRatio * 136, sy = -c * 136 - s * 72 / axisRatio;
  const tz = c * tDepth + s * axisRatio * sigmaDepth;
  const sz = c * sigmaDepth - s * tDepth / axisRatio;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x,y] of floorCorners) {
    const px = tx * x + sx * y, py = ty * x + sy * y;
    minX = Math.min(minX,px); maxX = Math.max(maxX,px);
    minY = Math.min(minY,py); maxY = Math.max(maxY,py);
  }
  for (let i = 0; i < surface.length; i += 3) {
    const y = ty * surface[i] + sy * surface[i + 1] - 48 * surface[i + 2];
    minY = Math.min(minY,y);
  }
  const scale = Math.min(1,(width - 12) / (maxX - minX),(height - 18) / (maxY - minY));
  const offsetX = Math.max(2 - minX * scale,Math.min(363,726 - maxX * scale));
  const offsetY = Math.max(114 - minY * scale,Math.min(314,444 - maxY * scale));
  const xUnits = 2 * scale / width, yUnits = -2 * scale / height;
  out.set([
    tx * xUnits, ty * yUnits, -tz / 800, 0,
    sx * xUnits, sy * yUnits, -sz / 800, 0,
    0, -48 * yUnits, -(3456 / tDepth) / 800, 0,
    2 * (offsetX + 4) / width - 1, 1 - 2 * (offsetY - 105) / height, 0, 1,
  ]);
}

function createRenderer(canvas, gl) {
  const program = gl.createProgram();
  const vertex = shader(gl,gl.VERTEX_SHADER,vertexSource);
  const fragment = shader(gl,gl.FRAGMENT_SHADER,fragmentSource);
  gl.attachShader(program,vertex);
  gl.attachShader(program,fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program,gl.LINK_STATUS)) return null;
  gl.useProgram(program);
  const position = gl.getAttribLocation(program,'position');
  const projection = gl.getUniformLocation(program,'camera');
  const ink = gl.getUniformLocation(program,'ink');
  const dotSize = gl.getUniformLocation(program,'dotSize');
  gl.enableVertexAttribArray(position);
  gl.enable(gl.BLEND);
  gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
  gl.depthFunc(gl.LEQUAL);
  gl.polygonOffset(1,1);

  function upload(target, data, usage = gl.STATIC_DRAW) {
    const buffer = gl.createBuffer();
    gl.bindBuffer(target,buffer);
    gl.bufferData(target,data,usage);
    return {buffer, count: data.length};
  }
  const g = createGeometry();
  const surface = upload(gl.ARRAY_BUFFER,g.surface);
  const ground = upload(gl.ARRAY_BUFFER,new Float32Array(g.ground));
  const axis = upload(gl.ARRAY_BUFFER,new Float32Array(g.axis));
  const zeros = upload(gl.ARRAY_BUFFER,new Float32Array(g.zeros));
  const faces = upload(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(g.faces));
  const lines = [g.minor,g.major,g.cross,g.critical].map(data => upload(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(data)));
  const colors = [[0.60,0.80,0.70,0.67],[0.79,0.95,0.81,0.84],[0.67,0.81,0.69,0.29],[0.93,0.83,0.60,0.96]];
  const data = new Float32Array(mesh.rows * 3);
  const scan = upload(gl.ARRAY_BUFFER,data,gl.DYNAMIC_DRAW);
  const transform = new Float32Array(16);
  let scanAt;

  function bind({buffer}) {
    gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.vertexAttribPointer(position,3,gl.FLOAT,false,0,0);
  }
  function drawArray(buffer, mode, color, size = 0) {
    bind(buffer);
    gl.uniform4fv(ink,color);
    gl.uniform1f(dotSize,size);
    gl.drawArrays(mode,0,buffer.count / 3);
  }
  function drawElements({buffer,count}, mode) {
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,buffer);
    gl.drawElements(mode,count,gl.UNSIGNED_SHORT,0);
  }
  function updateScan(t) {
    if (t === scanAt) return;
    scanAt = t;
    const {ts, rows} = mesh;
    const cols = ts.length;
    const right = Math.max(1,ts.findIndex(sample => sample >= t));
    const portion = (t - ts[right - 1]) / (ts[right] - ts[right - 1]);
    for (let row = 0; row < rows; row++) {
      const i = row * 3, vertex = (row * cols + right) * 3 + 2;
      const low = g.surface[vertex - 3], high = g.surface[vertex];
      data.set([(t - tMin) / tRange - 0.5,row / (rows - 1) - 0.5,low + portion * (high - low)],i);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER,scan.buffer);
    gl.bufferSubData(gl.ARRAY_BUFFER,0,data);
  }
  return function draw(angle, t, cssWidth, cssHeight) {
    const ratio = Math.min(devicePixelRatio || 1,1.5,1600 / cssWidth);
    const w = Math.max(1,Math.round(cssWidth * ratio)), h = Math.max(1,Math.round(cssHeight * ratio));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w; canvas.height = h;
    }
    gl.viewport(0,0,w,h);
    camera(g.surface,angle,transform);
    gl.uniformMatrix4fv(projection,false,transform);
    gl.depthMask(true);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.disable(gl.DEPTH_TEST);
    drawArray(ground,gl.LINES,[0.61,0.59,0.46,0.27]);
    drawArray(axis,gl.LINES,[0.87,0.73,0.50,0.63]);

    // Fill only the depth buffer, then draw the visible wires in front of it.
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.colorMask(false,false,false,false);
    bind(surface);
    drawElements(faces,gl.TRIANGLES);
    gl.colorMask(true,true,true,true);
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.depthMask(false);
    for (let i = 0; i < lines.length; i++) {
      gl.uniform4fv(ink,colors[i]);
      drawElements(lines[i],gl.LINES);
    }
    updateScan(t);
    drawArray(scan,gl.LINE_STRIP,[0.95,0.83,0.60,0.95]);
    gl.disable(gl.DEPTH_TEST);
    drawArray(zeros,gl.POINTS,[0.93,0.78,0.53,0.96],Math.max(3,4.5 * w / width));
    return transform;
  };
}

function axisLabels(stage) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('class','plate-orbit-labels');
  svg.setAttribute('aria-hidden','true');
  svg.setAttribute('focusable','false');
  svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
  svg.setAttribute('font-family','monospace');
  svg.setAttribute('font-size','9');
  svg.setAttribute('fill','#c9c4a7');
  svg.setAttribute('text-anchor','middle');
  const labels = ticks.map(t => {
    const text = document.createElementNS(svg.namespaceURI,'text');
    text.textContent = t;
    svg.append(text);
    return text;
  });
  stage.append(svg);
  return transform => {
    // The near ground edge changes sides as the camera circles the strip.
    const edge = transform[6] > 0 ? -0.59 : 0.59;
    svg.setAttribute('opacity',Math.min(0.9,Math.abs(transform[6]) * 10));
    for (let i = 0; i < ticks.length; i++) {
      const x = (ticks[i] - tMin) / tRange - 0.5;
      const screenX = (transform[0] * x + transform[4] * edge + transform[12] + 1) * width / 2;
      const screenY = (1 - transform[1] * x - transform[5] * edge - transform[13]) * height / 2;
      labels[i].setAttribute('x',Math.max(9,Math.min(width - 9,screenX)).toFixed(1));
      labels[i].setAttribute('y',Math.min(height - 1,screenY + 12).toFixed(1));
    }
  };
}

function attachOrbit(stage) {
  const canvas = document.createElement('canvas');
  canvas.className = 'plate-orbit';
  canvas.setAttribute('aria-hidden','true');
  stage.append(canvas);
  const control = stage.closest('.plate').querySelector('.plate-turn');
  const turn = control.querySelector('input');
  const notice = document.querySelector('[data-webgl-notice]');
  // Check the graph's own context even when animation is paused or below the fold.
  let gl;
  try {
    gl = canvas.getContext('webgl',{
      alpha: true, depth: true, antialias: true, powerPreference: 'low-power',
      preserveDrawingBuffer: true, failIfMajorPerformanceCaveat: false,
    });
  } catch {
    // Some browsers deny graphics contexts through a privacy setting.
  }
  if (!gl) {
    if (notice) notice.hidden = false;
    return;
  }
  const paintLabels = axisLabels(stage);
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let onScreen = !('IntersectionObserver' in window);
  let failed = false, renderer, degrees = 0, t = mesh.zeros[0];
  let manual = false, paintPending = false, pointer = null, touch = null;
  let frame = 0, previous = null, cssWidth = 0, cssHeight = 0;

  function ready(value) {
    if (stage.hasAttribute('data-orbit-ready') === value) return;
    stage.toggleAttribute('data-orbit-ready',value);
    stage.dispatchEvent(new Event('witness-orbit-change'));
  }
  function visible() {
    return !failed && onScreen && !document.hidden;
  }
  function spinning() {
    return !reduced.matches && root.dataset.motion !== 'off' && pointer === null && document.activeElement !== turn;
  }
  function sync() {
    if (!visible() || !spinning()) previous = null;
    if (failed || (reduced.matches && !manual)) ready(false);
    if (visible() && (!renderer || spinning() || paintPending)) {
      if (!frame) frame = requestAnimationFrame(tick);
    } else {
      cancelAnimationFrame(frame);
      frame = 0;
    }
  }
  function tick(now) {
    frame = 0;
    if (!visible()) return;
    if (!cssWidth || !cssHeight) {
      cssWidth = stage.clientWidth;
      cssHeight = stage.clientHeight;
    }
    if (!cssWidth || !cssHeight) return;
    try {
      if (!renderer) {
        renderer = createRenderer(canvas, gl);
        if (!renderer) throw Error('WebGL unavailable');
        control.hidden = false;
      }
      const elapsed = previous === null ? 0 : now - previous;
      const advance = spinning() && (previous === null || elapsed >= frameInterval - 0.5);
      if (advance) {
        previous = now;
        degrees += Math.min(elapsed,120) * 360 / period;
        if (degrees > 180) degrees -= 360;
        turn.value = degrees;
      }
      if ((advance || paintPending) && (!reduced.matches || manual)) {
        paintLabels(renderer(degrees * Math.PI / 180,t,cssWidth,cssHeight));
        ready(true);
      }
      paintPending = false;
    } catch {
      showFallback();
    }
    sync();
  }
  function showFallback() {
    failed = true;
    pointer = null;
    touch = null;
    control.hidden = true;
    if (notice) notice.hidden = false;
  }
  function finishTurn(event) {
    if (event.pointerId !== pointer) return;
    if (touch && !touch.horizontal && touch.value !== null && event.type === 'pointerup'
        && Math.hypot(event.clientX - touch.x,event.clientY - touch.y) < 6) {
      turn.value = touch.value;
      applyTurn();
    }
    pointer = null;
    touch = null;
    sync();
  }
  function resize() {
    paintPending ||= stage.hasAttribute('data-orbit-ready');
    sync();
  }
  function applyTurn() {
    degrees = turn.valueAsNumber;
    manual = true;
    paintPending = true;
    sync();
  }
  turn.addEventListener('focus',sync);
  turn.addEventListener('blur',sync);
  turn.addEventListener('input',() => {
    // A native range may jump on touch-down before the browser recognizes a page scroll.
    if (touch && !touch.horizontal) {
      touch.value = turn.valueAsNumber;
      turn.value = degrees;
    } else applyTurn();
  });
  turn.addEventListener('pointerdown',event => {
    if (!event.isPrimary || event.button !== 0) return;
    pointer = event.pointerId;
    if (event.pointerType === 'touch') {
      touch = {x:event.clientX, y:event.clientY, horizontal:false, value:null};
    }
    sync();
  });
  turn.addEventListener('pointermove',event => {
    if (event.pointerId !== pointer) return;
    event.stopPropagation();
    if (touch && !touch.horizontal) {
      const dx = Math.abs(event.clientX - touch.x);
      touch.horizontal = dx >= 6 && dx > Math.abs(event.clientY - touch.y);
    }
  });
  turn.addEventListener('lostpointercapture',finishTurn);
  window.addEventListener('pointerup',finishTurn);
  window.addEventListener('pointercancel',finishTurn);
  canvas.addEventListener('webglcontextlost',event => {
    event.preventDefault();
    paintPending ||= stage.hasAttribute('data-orbit-ready');
    showFallback();
    sync();
  });
  canvas.addEventListener('webglcontextrestored',() => {
    renderer = undefined;
    failed = false;
    if (notice) notice.hidden = true;
    sync();
  });
  stage.addEventListener('witness-section',({detail}) => {
    if (Number.isFinite(detail)) t = Math.max(tMin,Math.min(tMin + tRange,detail));
  });
  if ('ResizeObserver' in window) {
    new ResizeObserver(([{contentRect}]) => {
      ({width:cssWidth,height:cssHeight} = contentRect);
      resize();
    }).observe(stage);
  } else window.addEventListener('resize',() => {cssWidth = 0; cssHeight = 0; resize();});
  if (!onScreen) {
    new IntersectionObserver(([entry]) => {
      onScreen = entry.intersectionRatio > 0;
      sync();
    }).observe(stage);
  }
  reduced.addEventListener('change',sync);
  document.addEventListener('visibilitychange',sync);
  window.addEventListener('witness-motion-change',sync);
  sync();
}

const stage = document.querySelector('.hero .plate-stage');
if (stage) attachOrbit(stage);
