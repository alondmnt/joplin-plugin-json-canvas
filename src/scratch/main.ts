// Hello-world: SVG + pointer events. One rectangle, pan with drag, zoom with wheel.

const root = document.getElementById('root')!;
const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
svg.setAttribute('width', '100%');
svg.setAttribute('height', '100%');

const view = document.createElementNS('http://www.w3.org/2000/svg', 'g');
svg.appendChild(view);

const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
rect.setAttribute('x', '0');
rect.setAttribute('y', '0');
rect.setAttribute('width', '200');
rect.setAttribute('height', '120');
rect.setAttribute('rx', '8');
rect.setAttribute('fill', '#5b8def');
view.appendChild(rect);

const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
text.setAttribute('x', '100');
text.setAttribute('y', '65');
text.setAttribute('text-anchor', 'middle');
text.setAttribute('fill', 'white');
text.setAttribute('font-family', 'system-ui, sans-serif');
text.setAttribute('font-size', '16');
text.textContent = 'from-scratch';
view.appendChild(text);

let tx = window.innerWidth / 2 - 100;
let ty = window.innerHeight / 2 - 60;
let scale = 1;
const apply = () => view.setAttribute('transform', `translate(${tx} ${ty}) scale(${scale})`);
apply();

let panning = false;
let lastX = 0;
let lastY = 0;

svg.addEventListener('pointerdown', (e) => {
  panning = true;
  lastX = e.clientX;
  lastY = e.clientY;
  svg.setPointerCapture(e.pointerId);
});
svg.addEventListener('pointermove', (e) => {
  if (!panning) return;
  tx += e.clientX - lastX;
  ty += e.clientY - lastY;
  lastX = e.clientX;
  lastY = e.clientY;
  apply();
});
svg.addEventListener('pointerup', (e) => {
  panning = false;
  svg.releasePointerCapture(e.pointerId);
});
svg.addEventListener('wheel', (e) => {
  e.preventDefault();
  const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
  const cx = e.clientX;
  const cy = e.clientY;
  // zoom around the cursor
  tx = cx - (cx - tx) * factor;
  ty = cy - (cy - ty) * factor;
  scale *= factor;
  apply();
}, { passive: false });

root.appendChild(svg);
