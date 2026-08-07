import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'meshoptimizer';
import { Octree } from 'three/addons/math/Octree.js';
import { Capsule } from 'three/addons/math/Capsule.js';
import './style.css';

const canvas = document.querySelector('#scene');
const loading = document.querySelector('#loading');
const progress = document.querySelector('#progress');
const loadingText = document.querySelector('#loadingText');
const start = document.querySelector('#start');
const startButton = document.querySelector('#startButton');
const hint = document.querySelector('#hint');
const modeLabel = document.querySelector('#mode');
const errorBox = document.querySelector('#error');
const mobileControls = document.querySelector('#mobileControls');
const joystick = document.querySelector('#joystick');
const joystickKnob = document.querySelector('#joystickKnob');
const lookArea = document.querySelector('#lookArea');
const mobileJump = document.querySelector('#mobileJump');
const mobileFly = document.querySelector('#mobileFly');
const mobileSprint = document.querySelector('#mobileSprint');
const mobileCrouch = document.querySelector('#mobileCrouch');
const mobileDown = document.querySelector('#mobileDown');
const mobileFullscreen = document.querySelector('#mobileFullscreen');
const mobileSound = document.querySelector('#mobileSound');
const backgroundMusic = document.querySelector('#backgroundMusic');
const installButton = document.querySelector('#installButton');
const isTouchDevice = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
const isiOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xa9c7d8);
scene.fog = new THREE.FogExp2(0xa9c7d8, 0.00018);

const camera = new THREE.PerspectiveCamera(100, innerWidth / innerHeight, 0.05, 100000);
camera.rotation.order = 'YXZ';
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isTouchDevice, powerPreference: 'high-performance' });
renderer.setPixelRatio(isTouchDevice ? 1 : Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

scene.add(new THREE.HemisphereLight(0xd9efff, 0x59624b, 2.2));
const sun = new THREE.DirectionalLight(0xfff2d6, 2.4);
sun.position.set(1, 2, 1);
scene.add(sun);

const velocity = new THREE.Vector3();
const worldOctree = new Octree();
const playerCollider = new Capsule(new THREE.Vector3(), new THREE.Vector3(), 0.35);
const keys = Object.create(null);
const clock = new THREE.Clock();
const mobileMove = new THREE.Vector2();
let bounds;
let ready = false;
let flightMode = false;
let moveSpeed = 12;
let lastSpacePress = 0;
let verticalSpeed = 0;
let onFloor = false;
let physicsReady = false;
const sprintMultiplier = 4.5;
const flightMultiplier = 2.5;
const mapDownloadBytes = 57567660;
backgroundMusic.volume = 0.65;
let installPrompt = null;

const serviceWorkerReady = 'serviceWorker' in navigator
  ? navigator.serviceWorker.register('/sw.js').then(() => navigator.serviceWorker.ready).catch((error) => console.warn(error))
  : Promise.resolve();
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event;
});

// Blender: X=116.24, Y=-78.65, Z=7.7027.
// GLB/Three.js меняет оси: (X, Y, Z) -> (X, Z, -Y).
const entrance = new THREE.Vector3(116.24, 7.7027, 78.65);
const entrancePitch = THREE.MathUtils.degToRad(97.85 - 90);
const entranceYaw = THREE.MathUtils.degToRad(-21.2);

const draco = new DRACOLoader();
draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
const loader = new GLTFLoader().setDRACOLoader(draco).setMeshoptDecoder(MeshoptDecoder);

// При изменении модели увеличьте версию, чтобы браузер загрузил новые части.
serviceWorkerReady.then(() => loadSplitModel(['/map.glb?v=6'])).then((arrayBuffer) => {
  loader.parse(arrayBuffer, '/', (gltf) => {
  const model = gltf.scene;
  model.updateMatrixWorld(true);
  model.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = false;
    object.receiveShadow = false;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => { if (material) material.side = THREE.DoubleSide; });
  });
  scene.add(model);
  bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  const maxSize = Math.max(size.x, size.y, size.z, 1);
  camera.far = Math.max(2000, maxSize * 4);
  camera.updateProjectionMatrix();
  scene.fog.density = 0.65 / Math.max(maxSize, 500);
  moveSpeed = THREE.MathUtils.clamp(maxSize * 0.025, 8, 250);
  resetToEntrance();
  loadCollisionWorld();
  }, (error) => showError(`Не удалось разобрать карту\n${error.message || error}`));
}).catch((error) => showError(`Не удалось загрузить карту\n${error.message || error}`));

async function loadSplitModel(urls) {
  const loaded = new Array(urls.length).fill(0);
  const totals = urls.map((url) => url.startsWith('/map.glb') ? mapDownloadBytes : 0);
  const updateDownloadProgress = () => {
    const total = totals.reduce((sum, value) => sum + value, 0);
    const current = loaded.reduce((sum, value) => sum + value, 0);
    if (total <= 0) return;
    const value = Math.min(100, Math.round(current / total * 100));
    progress.style.width = `${value}%`;
    loadingText.textContent = `${formatMegabytes(current)} / ${formatMegabytes(total)} МБ (${value}%)`;
  };
  const parts = await Promise.all(urls.map((url, index) => new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('GET', url, true);
    request.responseType = 'arraybuffer';
    request.onprogress = (event) => {
      loaded[index] = event.loaded;
      totals[index] = event.lengthComputable ? event.total : totals[index];
      updateDownloadProgress();
    };
    request.onload = () => {
      if (request.status < 200 || request.status >= 300) return reject(new Error(`${url}: HTTP ${request.status}`));
      loaded[index] = request.response.byteLength;
      updateDownloadProgress();
      resolve(new Uint8Array(request.response));
    };
    request.onerror = () => reject(new Error(`${url}: ошибка сети`));
    request.send();
  })));
  if (parts.length === 1) return parts[0].buffer;
  const size = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const combined = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { combined.set(part, offset); offset += part.byteLength; }
  return combined.buffer;
}

function formatMegabytes(bytes) {
  return (bytes / 1_000_000).toFixed(1).replace('.', ',');
}

function loadCollisionWorld() {
  loading.classList.remove('hidden');
  loadingText.textContent = 'Подготовка физики…';
  progress.style.width = '100%';
  loader.load('/collision.glb?v=9', (gltf) => {
    gltf.scene.updateMatrixWorld(true);
    setTimeout(() => {
      worldOctree.fromGraphNode(gltf.scene);
      physicsReady = true;
      ready = true;
      resetToEntrance();
      loading.classList.add('hidden');
      start.classList.remove('hidden');
      if (isTouchDevice) modeLabel.classList.remove('hidden');
    }, 30);
  }, undefined, (error) => showError(`Не удалось подготовить физику\n${error.message || error}`));
}

function syncColliderToCamera() {
  playerCollider.start.copy(camera.position).add(new THREE.Vector3(0, -1.3, 0));
  playerCollider.end.copy(camera.position);
}

function resetToEntrance() {
  velocity.set(0, 0, 0);
  verticalSpeed = 0;
  camera.position.copy(entrance);
  syncColliderToCamera();
  onFloor = false;
  camera.rotation.set(entrancePitch, entranceYaw, 0);
  flightMode = false;
  updateModeLabel();
}

function updatePlayer(delta) {
  if (!ready) return;
  velocity.addScaledVector(velocity, Math.exp(-4 * delta) - 1);
  if (document.pointerLockElement === canvas || (isTouchDevice && !mobileControls.classList.contains('hidden'))) {
    const sprinting = keys.ShiftLeft || keys.ShiftRight;
    const crouching = !flightMode && (keys.KeyC || keys.ControlLeft || keys.ControlRight);
    const speedMultiplier = crouching ? 0.45 : (sprinting ? sprintMultiplier : (flightMode ? flightMultiplier : 1));
    const acceleration = moveSpeed * speedMultiplier * delta;
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    right.y = 0;
    right.normalize();
    if (keys.KeyW || keys.ArrowUp) velocity.addScaledVector(forward, acceleration);
    if (keys.KeyS || keys.ArrowDown) velocity.addScaledVector(forward, -acceleration);
    if (keys.KeyA || keys.ArrowLeft) velocity.addScaledVector(right, -acceleration);
    if (keys.KeyD || keys.ArrowRight) velocity.addScaledVector(right, acceleration);
    velocity.addScaledVector(forward, -mobileMove.y * acceleration);
    velocity.addScaledVector(right, mobileMove.x * acceleration);
    if (flightMode && keys.Space) velocity.y += acceleration;
    if (flightMode && (keys.ControlLeft || keys.ControlRight)) velocity.y -= acceleration;
  }
  if (flightMode) {
    camera.position.addScaledVector(velocity, delta);
    verticalSpeed = 0;
    syncColliderToCamera();
  } else if (physicsReady) {
    verticalSpeed -= 24 * delta;
    const movement = new THREE.Vector3(velocity.x, verticalSpeed, velocity.z).multiplyScalar(delta);
    const steps = THREE.MathUtils.clamp(Math.ceil(movement.length() / 0.3), 1, 20);
    movement.multiplyScalar(1 / steps);
    onFloor = false;
    for (let i = 0; i < steps; i += 1) {
      playerCollider.translate(movement);
      playerCollisions();
    }
    camera.position.copy(playerCollider.end);
    if (keys.KeyC || keys.ControlLeft || keys.ControlRight) camera.position.y -= 0.65;
  }
  if (bounds && camera.position.y < bounds.min.y - 1000) resetToEntrance();
}

function playerCollisions() {
  const result = worldOctree.capsuleIntersect(playerCollider);
  if (!result) return;
  if (result.normal.y > 0.35) onFloor = true;
  const speed = new THREE.Vector3(velocity.x, verticalSpeed, velocity.z);
  const intoSurface = speed.dot(result.normal);
  if (intoSurface < 0) {
    speed.addScaledVector(result.normal, -intoSurface);
    velocity.x = speed.x;
    velocity.z = speed.z;
    verticalSpeed = speed.y;
  }
  if (onFloor && verticalSpeed < 0) verticalSpeed = 0;
  playerCollider.translate(result.normal.multiplyScalar(result.depth));
}

function animate() {
  updatePlayer(Math.min(0.05, clock.getDelta()));
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();

function beginExperience() {
  start.classList.add('hidden');
  backgroundMusic.play().catch(() => {});
  requestPersistentStorage();
  if (isTouchDevice) {
    mobileControls.classList.remove('hidden');
    modeLabel.classList.remove('hidden');
  } else canvas.requestPointerLock();
}

async function requestPersistentStorage() {
  if (!navigator.storage?.persist) return;
  try { await navigator.storage.persist(); } catch (error) { console.warn(error); }
}

installButton.addEventListener('click', async () => {
  if (installPrompt) {
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    return;
  }
  const isiOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  alert(isiOS
    ? 'На iPhone нажмите «Поделиться», затем «На экран Домой».'
    : 'Откройте меню браузера и выберите «Установить приложение» или «Добавить на главный экран».');
});
startButton.addEventListener('click', beginExperience);
canvas.addEventListener('click', () => { if (ready && !isTouchDevice && document.pointerLockElement !== canvas) canvas.requestPointerLock(); });
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  if (locked) start.classList.add('hidden');
  hint.classList.toggle('hidden', locked || !ready);
  modeLabel.classList.toggle('hidden', !ready);
});
document.addEventListener('mousemove', (event) => {
  if (document.pointerLockElement !== canvas) return;
  camera.rotation.y -= event.movementX * 0.00235;
  camera.rotation.x = THREE.MathUtils.clamp(camera.rotation.x - event.movementY * 0.00235, -Math.PI / 2, Math.PI / 2);
});
document.addEventListener('keydown', (event) => {
  keys[event.code] = true;
  if (event.code === 'KeyM' && !event.repeat) toggleSound();
  if (event.code === 'KeyR' && ready) resetToEntrance();
  if (event.code === 'KeyF' && ready && !event.repeat) {
    toggleFlight();
  }
  if (event.code === 'Space' && ready && !event.repeat) handleJumpPress();
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
});
document.addEventListener('keyup', (event) => { keys[event.code] = false; });
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(isTouchDevice ? 1 : Math.min(devicePixelRatio, 2));
});

document.addEventListener('dblclick', (event) => event.preventDefault(), { passive: false });
document.addEventListener('contextmenu', (event) => { if (isTouchDevice) event.preventDefault(); });
let lastTouchEndTime = 0;
document.addEventListener('touchend', (event) => {
  const now = performance.now();
  if (now - lastTouchEndTime < 400) event.preventDefault();
  lastTouchEndTime = now;
}, { passive: false, capture: true });
document.addEventListener('touchmove', (event) => {
  if (event.touches.length > 1) event.preventDefault();
}, { passive: false, capture: true });
for (const eventName of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(eventName, (event) => event.preventDefault(), { passive: false });
}
document.addEventListener('selectstart', (event) => event.preventDefault());

function updateModeLabel() {
  modeLabel.textContent = flightMode
    ? 'Полёт · Space вверх · Ctrl вниз · Shift ускорение · двойной Space/F — ходьба'
    : 'Ходьба · C/Ctrl сесть · Space прыжок · Shift ускорение · двойной Space/F — полёт';
}

function toggleSound() {
  backgroundMusic.muted = !backgroundMusic.muted;
  mobileSound.textContent = backgroundMusic.muted ? 'Звук: выкл.' : 'Звук: вкл.';
  mobileSound.classList.toggle('is-active', !backgroundMusic.muted);
  if (!backgroundMusic.muted && backgroundMusic.paused) backgroundMusic.play().catch(() => {});
}

function toggleFlight() {
  flightMode = !flightMode;
  velocity.y = 0;
  verticalSpeed = 0;
  syncColliderToCamera();
  mobileFly.classList.toggle('is-active', flightMode);
  updateModeLabel();
}

function handleJumpPress() {
  const now = performance.now();
  if (now - lastSpacePress < 320) {
    toggleFlight();
    lastSpacePress = 0;
  } else {
    lastSpacePress = now;
    if (!flightMode && onFloor) {
      verticalSpeed = 8.5;
      onFloor = false;
    }
  }
}

let joystickPointer = null;
function updateJoystick(event) {
  const rect = joystick.getBoundingClientRect();
  const radius = rect.width * 0.34;
  let x = event.clientX - (rect.left + rect.width / 2);
  let y = event.clientY - (rect.top + rect.height / 2);
  const length = Math.hypot(x, y);
  if (length > radius) { x *= radius / length; y *= radius / length; }
  mobileMove.set(x / radius, y / radius);
  joystickKnob.style.transform = `translate(${x}px, ${y}px)`;
}
joystick.addEventListener('pointerdown', (event) => { joystickPointer = event.pointerId; joystick.setPointerCapture(event.pointerId); updateJoystick(event); });
joystick.addEventListener('pointermove', (event) => { if (event.pointerId === joystickPointer) updateJoystick(event); });
function releaseJoystick(event) { if (event.pointerId !== joystickPointer) return; joystickPointer = null; mobileMove.set(0, 0); joystickKnob.style.transform = ''; }
joystick.addEventListener('pointerup', releaseJoystick);
joystick.addEventListener('pointercancel', releaseJoystick);

let lookPointer = null;
let lastLookX = 0;
let lastLookY = 0;
lookArea.addEventListener('pointerdown', (event) => { lookPointer = event.pointerId; lastLookX = event.clientX; lastLookY = event.clientY; lookArea.setPointerCapture(event.pointerId); });
lookArea.addEventListener('pointermove', (event) => {
  if (event.pointerId !== lookPointer) return;
  camera.rotation.y -= (event.clientX - lastLookX) * 0.0048;
  camera.rotation.x = THREE.MathUtils.clamp(camera.rotation.x - (event.clientY - lastLookY) * 0.0048, -Math.PI / 2, Math.PI / 2);
  lastLookX = event.clientX; lastLookY = event.clientY;
});
lookArea.addEventListener('pointerup', () => { lookPointer = null; });
lookArea.addEventListener('pointercancel', () => { lookPointer = null; });

mobileJump.addEventListener('pointerdown', (event) => { event.preventDefault(); keys.Space = true; handleJumpPress(); });
mobileJump.addEventListener('pointerup', () => { keys.Space = false; });
mobileJump.addEventListener('pointercancel', () => { keys.Space = false; });
mobileFly.addEventListener('click', toggleFlight);
function bindHoldButton(button, code) {
  button.addEventListener('pointerdown', (event) => { event.preventDefault(); keys[code] = true; button.classList.add('is-active'); });
  const release = () => { keys[code] = false; button.classList.remove('is-active'); };
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('pointerleave', release);
}
bindHoldButton(mobileSprint, 'ShiftLeft');
bindHoldButton(mobileCrouch, 'KeyC');
bindHoldButton(mobileDown, 'ControlLeft');
mobileSound.addEventListener('click', toggleSound);

mobileFullscreen.addEventListener('click', async () => {
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      if (screen.orientation?.lock) await screen.orientation.lock('landscape').catch(() => {});
    } else await document.exitFullscreen();
  } catch (error) {
    console.warn('Полноэкранный режим недоступен:', error);
  }
});
document.addEventListener('fullscreenchange', () => {
  mobileFullscreen.textContent = document.fullscreenElement ? 'Выйти из полного экрана' : 'На весь экран';
});

function showError(message) {
  loading.classList.add('hidden');
  errorBox.textContent = message;
  errorBox.classList.remove('hidden');
}
