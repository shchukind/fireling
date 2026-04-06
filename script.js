import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.171.0/build/three.module.js";

const viewportEl = document.querySelector(".viewport");
const container = document.getElementById("game");
const heatFillEl = document.getElementById("heat-fill");
const heatSecondsEl = document.getElementById("heat-seconds");
const woodCountEl = document.getElementById("wood-count");
const survivalTimeEl = document.getElementById("survival-time");
const bestTimeEl = document.getElementById("best-time");
const hazardNoteEl = document.getElementById("hazard-note");
const dashLabelEl = document.getElementById("dash-label-top");
const dashFillEl = document.getElementById("dash-fill-top");
const statusEl = document.getElementById("status");
const restartButton = document.getElementById("restart");
const startScreenEl = document.getElementById("start-screen");
const startGameButton = document.getElementById("start-game");
const rotateScreenEl = document.getElementById("rotate-screen");
const gameOverEl = document.getElementById("game-over");
const gameOverTextEl = document.getElementById("game-over-text");
const newRecordEl = document.getElementById("new-record");
const restartFromGameOverButton = document.getElementById("restart-from-game-over");
const mobileKeyButtons = Array.from(document.querySelectorAll(".mobile-action"));
const mobileJoystickEl = document.getElementById("mobile-joystick");
const mobileJoystickThumbEl = document.getElementById("mobile-joystick-thumb");

const fullscreenButton = document.createElement("button");
fullscreenButton.id = "fullscreen";
fullscreenButton.type = "button";
fullscreenButton.className = "button-secondary";
fullscreenButton.textContent = "Полный экран";
restartButton.parentElement.insertBefore(fullscreenButton, restartButton);

const fullscreenHud = document.createElement("div");
fullscreenHud.className = "fullscreen-hud";
fullscreenHud.innerHTML = `
  <div class="fullscreen-hud-hint">
    <span class="hud-chip"><kbd>← ↑ ↓ →</kbd><span>движение</span></span>
    <span class="hud-chip"><kbd>Shift</kbd><span>рывок</span></span>
    <span class="hud-chip"><kbd>Space</kbd><span>прыжок</span></span>
    <span class="hud-chip"><kbd>R</kbd><span>заново</span></span>
    <span class="hud-chip"><kbd>Esc</kbd><span>выход</span></span>
  </div>
`;
viewportEl.appendChild(fullscreenHud);

const worldRadius = 34;
const woodCount = 11;
const maxHeat = 30;
const jumpVelocity = 7.6;
const gravity = 18;
const rainInterval = { min: 14, max: 25 };
const rainDuration = { min: 10, max: 16 };
const windInterval = { min: 18, max: 32 };
const windDuration = { min: 8, max: 13 };
const fogInterval = { min: 28, max: 46 };
const fogDuration = { min: 10, max: 15 };
const stormOverlapChance = 0.2;

const keys = new Set();
const clock = new THREE.Clock();
const cameraForward = new THREE.Vector3();
const cameraRight = new THREE.Vector3();
const moveDirection = new THREE.Vector3(0, 0, 1);
const cameraLookTarget = new THREE.Vector3();
const worldUp = new THREE.Vector3(0, 1, 0);
const previousPlayerXZ = new THREE.Vector3();
const rainSpawnPoint = new THREE.Vector3();
const burstScale = new THREE.Vector3();
const windDirectionVector = new THREE.Vector3(1, 0, 0);
const windSideVector = new THREE.Vector3();
const windOffsetVector = new THREE.Vector3();
const mobileMoveInput = new THREE.Vector2();
const bestSurvivalStorageKey = "fireling-best-survival";
const storedBestSurvival = Number(window.localStorage.getItem(bestSurvivalStorageKey) || 0);
const AudioContextClass = window.AudioContext || window.webkitAudioContext;

const audio = {
  context: null,
  masterGain: null,
  ambienceGain: null,
  sfxGain: null,
  fireGain: null,
  rainGain: null,
  windGain: null,
  musicGain: null,
  noiseBuffer: null,
  crackleTimer: 0,
  musicNoteTimer: 0,
  ready: false,
};

function updateStandaloneState() {
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;
  document.body.classList.toggle("standalone-app", standalone);
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || location.protocol === "file:") {
    return;
  }

  try {
    await navigator.serviceWorker.register("./service-worker.js");
  } catch (error) {
    console.warn("Service worker registration failed:", error);
  }
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1f3c5d);
scene.fog = new THREE.FogExp2(0x22405f, 0.0072);

const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 180);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.56;
container.appendChild(renderer.domElement);

const ambientLight = new THREE.HemisphereLight(0xb2caee, 0x24170d, 2.34);
scene.add(ambientLight);

const moonLight = new THREE.DirectionalLight(0xcfe0ff, 1.2);
moonLight.position.set(22, 34, 14);
moonLight.shadow.camera.left = -38;
moonLight.shadow.camera.right = 38;
moonLight.shadow.camera.top = 38;
moonLight.shadow.camera.bottom = -38;
scene.add(moonLight);

const moon = new THREE.Mesh(
  new THREE.SphereGeometry(2.4, 24, 24),
  new THREE.MeshBasicMaterial({ color: 0xfcfeff, fog: false })
);
moon.position.set(-22, 26, -32);
scene.add(moon);

const moonHalo = new THREE.Mesh(
  new THREE.SphereGeometry(4.8, 24, 24),
  new THREE.MeshBasicMaterial({
    color: 0x87aef5,
    transparent: true,
    opacity: 0.16,
    fog: false,
  })
);
moonHalo.position.copy(moon.position);
scene.add(moonHalo);

function createForestBandTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#16304b";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const skyGlow = ctx.createLinearGradient(0, 0, 0, canvas.height);
  skyGlow.addColorStop(0, "rgba(135, 170, 220, 0.2)");
  skyGlow.addColorStop(0.45, "rgba(70, 105, 145, 0.08)");
  skyGlow.addColorStop(1, "rgba(10, 18, 24, 0)");
  ctx.fillStyle = skyGlow;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < 180; i += 1) {
    const x = (i / 180) * canvas.width + rand(-10, 10);
    const baseY = 205 + rand(-10, 18);
    const width = rand(18, 42);
    const height = rand(55, 120);

    ctx.beginPath();
    ctx.moveTo(x, baseY - height);
    ctx.lineTo(x - width * 0.55, baseY);
    ctx.lineTo(x + width * 0.55, baseY);
    ctx.closePath();
    ctx.fillStyle = i % 3 === 0 ? "#0d1718" : i % 3 === 1 ? "#132021" : "#1a2b28";
    ctx.fill();

    ctx.fillStyle = "#221811";
    ctx.fillRect(x - width * 0.06, baseY - 12, width * 0.12, 18);
  }

  const mist = ctx.createLinearGradient(0, 140, 0, canvas.height);
  mist.addColorStop(0, "rgba(100, 145, 195, 0)");
  mist.addColorStop(0.65, "rgba(80, 122, 160, 0.08)");
  mist.addColorStop(1, "rgba(30, 55, 70, 0.22)");
  ctx.fillStyle = mist;
  ctx.fillRect(0, 140, canvas.width, canvas.height - 140);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.repeat.set(2, 1);
  texture.needsUpdate = true;
  return texture;
}

function createDarknessTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(256, 256, 90, 256, 256, 256);
  gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
  gradient.addColorStop(0.55, "rgba(0, 0, 0, 0.06)");
  gradient.addColorStop(0.72, "rgba(0, 0, 0, 0.26)");
  gradient.addColorStop(0.88, "rgba(0, 0, 0, 0.58)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0.9)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return new THREE.CanvasTexture(canvas);
}

const forestBand = new THREE.Mesh(
  new THREE.CylinderGeometry(worldRadius + 18, worldRadius + 18, 18, 56, 1, true),
  new THREE.MeshBasicMaterial({
    map: createForestBandTexture(),
    transparent: true,
    opacity: 0.9,
    side: THREE.BackSide,
    fog: true,
  })
);
forestBand.position.y = 8.4;
scene.add(forestBand);

const darknessVeil = new THREE.Mesh(
  new THREE.RingGeometry(worldRadius - 8, worldRadius + 10, 80),
  new THREE.MeshBasicMaterial({
    color: 0x05070a,
    transparent: true,
    opacity: 0.22,
    side: THREE.DoubleSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
  })
);
darknessVeil.rotation.x = -Math.PI / 2;
darknessVeil.position.y = 0.045;
darknessVeil.renderOrder = 4;
scene.add(darknessVeil);

const darknessEdge = new THREE.Mesh(
  new THREE.RingGeometry(worldRadius - 1.5, worldRadius + 18, 80),
  new THREE.MeshBasicMaterial({
    color: 0x020304,
    transparent: true,
    opacity: 0.42,
    side: THREE.DoubleSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -5,
  })
);
darknessEdge.rotation.x = -Math.PI / 2;
darknessEdge.position.y = 0.05;
darknessEdge.renderOrder = 5;
scene.add(darknessEdge);

const fogShells = [
  { radius: 16, height: 5.8, opacity: 0.12 },
  { radius: 24, height: 8.4, opacity: 0.18 },
  { radius: 34, height: 11.5, opacity: 0.24 },
].map((layer, index) => {
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(layer.radius, 26, 18),
    new THREE.MeshBasicMaterial({
      color: index === 0 ? 0xd6e0ea : index === 1 ? 0xc8d5e2 : 0xbcccdc,
      transparent: true,
      opacity: 0,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    })
  );
  shell.visible = false;
  shell.scale.y = layer.height / layer.radius;
  shell.renderOrder = 2;
  scene.add(shell);
  return { mesh: shell, ...layer };
});

const starField = new THREE.Points(
  new THREE.BufferGeometry(),
  new THREE.PointsMaterial({
    color: 0xf5f7ff,
    size: 1.45,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.88,
    fog: false,
  })
);
const starPositions = [];
for (let i = 0; i < 96; i += 1) {
  const angle = Math.random() * Math.PI * 2;
  const radius = 18 + Math.random() * 44;
  const height = 22 + Math.random() * 20;
  starPositions.push(
    Math.cos(angle) * radius,
    height,
    Math.sin(angle) * radius
  );
}
starField.geometry.setAttribute("position", new THREE.Float32BufferAttribute(starPositions, 3));
scene.add(starField);

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(worldRadius + 8, 80),
  new THREE.MeshStandardMaterial({
    color: 0x243a2f,
    roughness: 0.98,
    metalness: 0,
  })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const clearingRing = new THREE.Mesh(
  new THREE.RingGeometry(worldRadius + 1.5, worldRadius + 8, 72),
  new THREE.MeshBasicMaterial({
    color: 0x0e1718,
    transparent: true,
    opacity: 0.42,
    side: THREE.DoubleSide,
  })
);
clearingRing.rotation.x = -Math.PI / 2;
clearingRing.position.y = 0.03;
scene.add(clearingRing);

const ashRing = new THREE.Mesh(
  new THREE.RingGeometry(worldRadius - 5, worldRadius + 3, 64),
  new THREE.MeshBasicMaterial({
    color: 0x334553,
    transparent: true,
    opacity: 0.16,
    side: THREE.DoubleSide,
  })
);
ashRing.rotation.x = -Math.PI / 2;
ashRing.position.y = 0.02;
scene.add(ashRing);

const rainCurtain = new THREE.Mesh(
  new THREE.CircleGeometry(worldRadius + 6, 64),
  new THREE.MeshBasicMaterial({
    color: 0x78b8ff,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
  })
);
rainCurtain.rotation.x = -Math.PI / 2;
rainCurtain.position.y = 0.05;
scene.add(rainCurtain);

const player = new THREE.Group();
scene.add(player);

const emberCoal = new THREE.Mesh(
  new THREE.DodecahedronGeometry(0.58, 0),
  new THREE.MeshStandardMaterial({
    color: 0x2b1910,
    emissive: 0xff6b22,
    emissiveIntensity: 1.8,
    roughness: 0.85,
  })
);
emberCoal.position.y = 0.62;
emberCoal.castShadow = true;
player.add(emberCoal);

const emberCore = new THREE.Mesh(
  new THREE.OctahedronGeometry(0.62, 0),
  new THREE.MeshStandardMaterial({
    color: 0xffb45d,
    emissive: 0xff7a24,
    emissiveIntensity: 2.5,
    transparent: true,
    opacity: 0.95,
  })
);
emberCore.position.y = 1.1;
emberCore.castShadow = true;
player.add(emberCore);

const emberFlame = new THREE.Mesh(
  new THREE.OctahedronGeometry(0.52, 0),
  new THREE.MeshStandardMaterial({
    color: 0xffdf85,
    emissive: 0xff9a3d,
    emissiveIntensity: 2.8,
    transparent: true,
    opacity: 0.86,
  })
);
emberFlame.position.set(0.16, 1.72, 0);
emberFlame.scale.set(0.82, 1.55, 0.82);
emberFlame.castShadow = true;
player.add(emberFlame);

const emberFlameBack = new THREE.Mesh(
  new THREE.OctahedronGeometry(0.4, 0),
  new THREE.MeshStandardMaterial({
    color: 0xfff0b2,
    emissive: 0xffb04d,
    emissiveIntensity: 2.2,
    transparent: true,
    opacity: 0.72,
  })
);
emberFlameBack.position.set(-0.14, 1.48, 0.08);
emberFlameBack.scale.set(0.65, 1.2, 0.65);
player.add(emberFlameBack);

const emberFlameLeft = new THREE.Mesh(
  new THREE.OctahedronGeometry(0.28, 0),
  new THREE.MeshStandardMaterial({
    color: 0xffd782,
    emissive: 0xff8a34,
    emissiveIntensity: 2.1,
    transparent: true,
    opacity: 0.76,
  })
);
emberFlameLeft.position.set(-0.34, 1.38, 0.12);
emberFlameLeft.scale.set(0.52, 1.05, 0.52);
player.add(emberFlameLeft);

const emberFlameRight = new THREE.Mesh(
  new THREE.OctahedronGeometry(0.24, 0),
  new THREE.MeshStandardMaterial({
    color: 0xffefb0,
    emissive: 0xffa348,
    emissiveIntensity: 2,
    transparent: true,
    opacity: 0.68,
  })
);
emberFlameRight.position.set(0.32, 1.28, -0.08);
emberFlameRight.scale.set(0.46, 0.92, 0.46);
player.add(emberFlameRight);

const emberLogA = new THREE.Mesh(
  new THREE.CylinderGeometry(0.11, 0.13, 1.08, 10),
  new THREE.MeshStandardMaterial({
    color: 0x4c2d1b,
    roughness: 0.96,
  })
);
emberLogA.rotation.z = Math.PI / 2;
emberLogA.rotation.y = 0.42;
emberLogA.position.set(0.04, 0.28, 0.08);
emberLogA.castShadow = true;
player.add(emberLogA);

const emberLogB = emberLogA.clone();
emberLogB.rotation.y = -0.72;
emberLogB.position.set(-0.06, 0.24, -0.06);
player.add(emberLogB);

const emberGlow = new THREE.PointLight(0xff9a3d, 5.1, 21, 1.2);
emberGlow.position.set(0, 1.8, 0);
emberGlow.castShadow = true;
player.add(emberGlow);

const particleMaterial = new THREE.MeshBasicMaterial({
  color: 0xffd28a,
  transparent: true,
  opacity: 0.9,
});

const particles = [];
for (let i = 0; i < 34; i += 1) {
  const spark = new THREE.Mesh(new THREE.SphereGeometry(0.04 + Math.random() * 0.035, 8, 8), particleMaterial);
  scene.add(spark);
  particles.push({
    mesh: spark,
    angle: Math.random() * Math.PI * 2,
    radius: 0.25 + Math.random() * 0.5,
    speed: 0.6 + Math.random() * 1.4,
    drift: 0.3 + Math.random() * 0.7,
    offset: Math.random() * 10,
    height: 1.4 + Math.random() * 1.8,
  });
}

const rainMaterial = new THREE.MeshBasicMaterial({
  color: 0xa7d0ff,
  transparent: true,
  opacity: 0,
});

const rainDrops = [];
for (let i = 0; i < 120; i += 1) {
  const drop = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.7, 0.03), rainMaterial);
  scene.add(drop);
  rainDrops.push({
    mesh: drop,
    offset: Math.random() * 20,
    radius: 3 + Math.random() * 14,
    angle: Math.random() * Math.PI * 2,
    speed: 10 + Math.random() * 6,
  });
}

const windMaterial = new THREE.MeshBasicMaterial({
  color: 0xdce9ff,
  transparent: true,
  opacity: 0,
  depthWrite: false,
  side: THREE.DoubleSide,
});

const windStreaks = [];
for (let i = 0; i < 18; i += 1) {
  const streak = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.1), windMaterial.clone());
  streak.visible = false;
  scene.add(streak);
  windStreaks.push({
    mesh: streak,
    offset: Math.random() * 10,
    lateral: rand(-1, 1),
    height: rand(0.6, 3.4),
    radius: rand(4, 11),
    speed: rand(1.2, 2.1),
    stretch: rand(0.8, 1.6),
  });
}

const fogMoteMaterial = new THREE.MeshBasicMaterial({
  color: 0xe8edf3,
  transparent: true,
  opacity: 0,
  depthWrite: false,
});

const fogMotes = [];
for (let i = 0; i < 28; i += 1) {
  const mote = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.24), fogMoteMaterial.clone());
  mote.visible = false;
  scene.add(mote);
  fogMotes.push({
    mesh: mote,
    offset: Math.random() * 20,
    radius: rand(1.8, 8.5),
    height: rand(0.7, 3.8),
    speed: rand(0.14, 0.38),
    drift: rand(0.2, 0.55),
    size: rand(0.8, 1.8),
  });
}

const burstMaterial = new THREE.MeshBasicMaterial({
  color: 0xe3d7bf,
  transparent: true,
  opacity: 0,
});

const effectBursts = [];
for (let i = 0; i < 14; i += 1) {
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.6, 0.08, 10, 24),
    burstMaterial
  );
  ring.rotation.x = Math.PI / 2;
  ring.visible = false;
  scene.add(ring);
  effectBursts.push({ mesh: ring, life: 0, active: false });
}

const effectSpheres = [];
for (let i = 0; i < 10; i += 1) {
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.35, 18, 18),
    new THREE.MeshBasicMaterial({
      color: 0xf1c58c,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
    })
  );
  sphere.visible = false;
  scene.add(sphere);
  effectSpheres.push({ mesh: sphere, life: 0, active: false });
}

const effectDebris = [];
for (let i = 0; i < 36; i += 1) {
  const shard = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.12, 0.12),
    new THREE.MeshStandardMaterial({
      color: 0x9a6a3f,
      emissive: 0x3a1d08,
      emissiveIntensity: 0.25,
      roughness: 0.95,
      transparent: true,
      opacity: 0,
    })
  );
  shard.visible = false;
  scene.add(shard);
  effectDebris.push({
    mesh: shard,
    active: false,
    life: 0,
    velocity: new THREE.Vector3(),
    spin: new THREE.Vector3(),
  });
}

const woodMaterial = new THREE.MeshStandardMaterial({
  color: 0x825333,
  roughness: 0.92,
});
const leafMaterial = new THREE.MeshStandardMaterial({
  color: 0x315742,
  roughness: 1,
});
const stoneMaterial = new THREE.MeshStandardMaterial({
  color: 0x7b8794,
  roughness: 1,
});
const grassMaterial = new THREE.MeshStandardMaterial({
  color: 0x6d9160,
  roughness: 1,
  side: THREE.DoubleSide,
});

const woods = [];
const trees = [];
const decorations = [];
const forestBackdrop = [];
const puddles = [];
const barriers = [];

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function randomPoint(minRadius, maxRadius) {
  const angle = Math.random() * Math.PI * 2;
  const radius = rand(minRadius, maxRadius);
  return new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
}

function createTree(position, scale) {
  const tree = new THREE.Group();

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22 * scale, 0.34 * scale, 2.2 * scale, 8),
    woodMaterial
  );
  trunk.position.y = 1.05 * scale;
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  tree.add(trunk);

  const crown = new THREE.Mesh(
    new THREE.ConeGeometry(1.3 * scale, 3.1 * scale, 10),
    leafMaterial
  );
  crown.position.y = 3.1 * scale;
  crown.castShadow = true;
  tree.add(crown);

  tree.position.copy(position);
  scene.add(tree);

  trees.push({
    mesh: tree,
    trunk,
    crown,
    position: position.clone(),
    baseScale: scale,
    growth: rand(0.03, 1),
    fallTimer: rand(8, 30),
    growthRate: rand(0.012, 0.03),
    state: "growing",
    radius: 0.95 * scale,
  });
}

function createDecoration(position) {
  const decoration = new THREE.Group();
  const variant = Math.random();

  if (variant < 0.45) {
    const grass = new THREE.Mesh(
      new THREE.ConeGeometry(rand(0.22, 0.38), rand(0.7, 1.2), 5),
      grassMaterial
    );
    grass.rotation.z = rand(-0.12, 0.12);
    grass.position.y = 0.36;
    decoration.add(grass);
  } else {
    const stone = new THREE.Mesh(
      new THREE.DodecahedronGeometry(rand(0.18, 0.44), 0),
      stoneMaterial
    );
    stone.position.y = rand(0.14, 0.24);
    stone.rotation.set(rand(0, Math.PI), rand(0, Math.PI), rand(0, Math.PI));
    stone.castShadow = true;
    stone.receiveShadow = true;
    decoration.add(stone);
  }

  decoration.position.copy(position);
  scene.add(decoration);
  decorations.push(decoration);
}

function createForestBackdrop(position, scale) {
  const tree = new THREE.Group();

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16 * scale, 0.22 * scale, 1.8 * scale, 6),
    new THREE.MeshStandardMaterial({
      color: 0x2d2018,
      roughness: 1,
    })
  );
  trunk.position.y = 0.9 * scale;
  tree.add(trunk);

  const crownBottom = new THREE.Mesh(
    new THREE.ConeGeometry(1.2 * scale, 2.6 * scale, 8),
    new THREE.MeshStandardMaterial({
      color: 0x162820,
      roughness: 1,
    })
  );
  crownBottom.position.y = 2.4 * scale;
  tree.add(crownBottom);

  const crownTop = new THREE.Mesh(
    new THREE.ConeGeometry(0.92 * scale, 2 * scale, 8),
    new THREE.MeshStandardMaterial({
      color: 0x1d3126,
      roughness: 1,
    })
  );
  crownTop.position.y = 3.55 * scale;
  tree.add(crownTop);

  tree.position.copy(position);
  tree.rotation.y = Math.random() * Math.PI * 2;
  scene.add(tree);
  forestBackdrop.push(tree);
}

function createPuddle() {
  const puddle = new THREE.Mesh(
    new THREE.CircleGeometry(2.2, 28),
    new THREE.MeshStandardMaterial({
      color: 0x7ec7ff,
      emissive: 0x2a6f96,
      emissiveIntensity: 0.22,
      transparent: true,
      opacity: 0,
      roughness: 0.18,
      metalness: 0.05,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -4,
    })
  );
  puddle.rotation.x = -Math.PI / 2;
  puddle.position.y = 0.08;
  puddle.visible = false;
  puddle.renderOrder = 3;
  scene.add(puddle);

  puddles.push({
    mesh: puddle,
    radius: 0,
    targetRadius: 0,
    active: false,
    drying: false,
    dryTimer: 0,
    wobble: Math.random() * Math.PI * 2,
  });
}

function createBarrier() {
  const barrier = new THREE.Group();
  const width = rand(2.2, 4.4);
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.34, width, 12),
    woodMaterial
  );
  body.rotation.z = Math.PI / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  barrier.add(body);

  const branchA = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.13, rand(1, 1.8), 8),
    woodMaterial
  );
  branchA.position.set(rand(-0.6, 0.6), rand(0.3, 0.65), rand(-0.2, 0.2));
  branchA.rotation.set(rand(-0.4, 0.4), rand(0, Math.PI), rand(-1.1, -0.3));
  branchA.castShadow = true;
  barrier.add(branchA);

  const branchB = branchA.clone();
  branchB.position.set(rand(-0.8, 0.8), rand(0.3, 0.7), rand(-0.2, 0.2));
  branchB.rotation.set(rand(-0.4, 0.4), rand(0, Math.PI), rand(0.3, 1.1));
  barrier.add(branchB);

  barrier.visible = false;
  scene.add(barrier);

  barriers.push({
    mesh: barrier,
    radius: width * 0.42,
    height: 0.72,
    life: 0,
    active: false,
  });
}

for (let i = 0; i < 26; i += 1) {
  createTree(randomPoint(4, worldRadius - 6), rand(0.9, 1.4));
}

for (let i = 0; i < 90; i += 1) {
  createDecoration(randomPoint(3, worldRadius + 2));
}

for (let i = 0; i < 44; i += 1) {
  const angle = (i / 44) * Math.PI * 2 + rand(-0.08, 0.08);
  const radius = worldRadius + rand(5.5, 10.5);
  createForestBackdrop(
    new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius),
    rand(1.6, 2.8)
  );
}

for (let i = 0; i < 14; i += 1) {
  createPuddle();
}

for (let i = 0; i < 10; i += 1) {
  createBarrier();
}

function createWoodPickup() {
  const log = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.45, 12), woodMaterial);
  body.rotation.z = Math.PI / 2;
  body.castShadow = true;
  log.add(body);

  const cutFaceGeometry = new THREE.CylinderGeometry(0.24, 0.24, 0.08, 16);
  const cutFaceMaterial = new THREE.MeshStandardMaterial({
    color: 0xbd8652,
    roughness: 0.9,
  });

  const faceA = new THREE.Mesh(cutFaceGeometry, cutFaceMaterial);
  faceA.rotation.z = Math.PI / 2;
  faceA.position.x = 0.75;
  log.add(faceA);

  const faceB = faceA.clone();
  faceB.position.x = -0.75;
  log.add(faceB);

  const glow = new THREE.Mesh(
    new THREE.TorusGeometry(0.86, 0.06, 10, 32),
    new THREE.MeshBasicMaterial({
      color: 0xffd06a,
      transparent: true,
      opacity: 0.5,
    })
  );
  glow.rotation.x = Math.PI / 2;
  glow.position.y = 0.05;
  log.add(glow);

  log.visible = false;
  scene.add(log);
  woods.push({
    mesh: log,
    glow,
    bobOffset: Math.random() * Math.PI * 2,
    active: false,
    life: 0,
  });
}

for (let i = 0; i < woodCount; i += 1) {
  createWoodPickup();
}

function getSpawnPoint(minDistance, maxDistance, from = player.position) {
  let next = randomPoint(minDistance, maxDistance);
  let attempts = 0;

  while (next.distanceTo(from) < minDistance && attempts < 16) {
    next = randomPoint(minDistance, maxDistance);
    attempts += 1;
  }

  return next;
}

function respawnWood(pickup, origin = player.position) {
  const next = getSpawnPoint(8, worldRadius - 4, origin);
  pickup.mesh.position.copy(next);
  pickup.mesh.position.y = 0.8;
  pickup.mesh.rotation.y = Math.random() * Math.PI * 2;
  pickup.mesh.visible = true;
  pickup.active = true;
  pickup.life = rand(18, 34);
}

function spawnWoodAt(position, count = 1) {
  let spawned = 0;

  woods.forEach((pickup) => {
    if (spawned >= count || pickup.active) {
      return;
    }

    const angle = Math.random() * Math.PI * 2;
    const radius = rand(0.6, 1.5);
    pickup.mesh.position.set(
      position.x + Math.cos(angle) * radius,
      0.8,
      position.z + Math.sin(angle) * radius
    );
    pickup.mesh.rotation.y = Math.random() * Math.PI * 2;
    pickup.mesh.visible = true;
    pickup.active = true;
    pickup.life = rand(20, 38);
    spawned += 1;
  });

  return spawned;
}

function forceSpawnWoodAt(position, count = 1) {
  let spawned = spawnWoodAt(position, count);

  while (spawned < count) {
    const pickup =
      woods.find((item) => !item.active) ||
      woods
        .filter((item) => item.active)
        .sort((left, right) => left.life - right.life)[0];

    if (!pickup) {
      break;
    }

    const angle = Math.random() * Math.PI * 2;
    const radius = rand(0.65, 1.7);
    pickup.mesh.position.set(
      position.x + Math.cos(angle) * radius,
      0.8,
      position.z + Math.sin(angle) * radius
    );
    pickup.mesh.rotation.y = Math.random() * Math.PI * 2;
    pickup.mesh.visible = true;
    pickup.active = true;
    pickup.life = rand(24, 42);
    spawned += 1;
  }

  return spawned;
}

const state = {
  heat: maxHeat,
  survival: 0,
  woodCollected: 0,
  gameOver: false,
  started: false,
  bestSurvival: Number.isFinite(storedBestSurvival) ? storedBestSurvival : 0,
  hasNewRecord: false,
  speedBoost: 0,
  jumpSpeed: 0,
  isGrounded: true,
  slowFactor: 1,
  dashEnergy: 1,
  dashActive: false,
  dashTimer: 0,
  dashHeld: false,
  dashQueued: false,
  lastHazardMessageAt: -10,
  isRaining: false,
  rainTimer: rand(rainInterval.min, rainInterval.max),
  rainStrength: 0,
  rainPuddleTimer: rand(1.8, 3.2),
  isWindy: false,
  windTimer: rand(windInterval.min, windInterval.max),
  windStrength: 0,
  windAngle: 0,
  isFoggy: false,
  fogTimer: rand(fogInterval.min, fogInterval.max),
  fogStrength: 0,
  lastSteamAt: -10,
  lastSparkAt: -10,
  puddlesShouldDry: false,
  extinguish: 0,
};

function setStatus(text) {
  if (statusEl) {
    statusEl.textContent = text;
  }
}

function createNoiseBuffer(context) {
  const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

function ensureAudio() {
  if (audio.ready || !AudioContextClass) {
    return;
  }

  const context = new AudioContextClass();
  const masterGain = context.createGain();
  const ambienceGain = context.createGain();
  const sfxGain = context.createGain();
  const fireGain = context.createGain();
  const rainGain = context.createGain();
  const windGain = context.createGain();
  const musicGain = context.createGain();

  masterGain.gain.value = 0.62;
  ambienceGain.gain.value = 0.44;
  sfxGain.gain.value = 0.34;
  fireGain.gain.value = 0;
  rainGain.gain.value = 0;
  windGain.gain.value = 0;
  musicGain.gain.value = 0;

  ambienceGain.connect(masterGain);
  sfxGain.connect(masterGain);
  masterGain.connect(context.destination);
  fireGain.connect(ambienceGain);
  rainGain.connect(ambienceGain);
  windGain.connect(ambienceGain);
  musicGain.connect(ambienceGain);

  audio.context = context;
  audio.masterGain = masterGain;
  audio.ambienceGain = ambienceGain;
  audio.sfxGain = sfxGain;
  audio.fireGain = fireGain;
  audio.rainGain = rainGain;
  audio.windGain = windGain;
  audio.musicGain = musicGain;
  audio.noiseBuffer = createNoiseBuffer(context);
  audio.ready = true;

  const fireNoise = context.createBufferSource();
  fireNoise.buffer = audio.noiseBuffer;
  fireNoise.loop = true;
  const fireFilter = context.createBiquadFilter();
  fireFilter.type = "bandpass";
  fireFilter.frequency.value = 72;
  fireFilter.Q.value = 0.22;
  fireNoise.connect(fireFilter);
  fireFilter.connect(fireGain);
  fireNoise.start();

  const rainNoise = context.createBufferSource();
  rainNoise.buffer = audio.noiseBuffer;
  rainNoise.loop = true;
  const rainFilter = context.createBiquadFilter();
  rainFilter.type = "bandpass";
  rainFilter.frequency.value = 240;
  rainFilter.Q.value = 0.55;
  rainNoise.connect(rainFilter);
  rainFilter.connect(rainGain);
  rainNoise.start();

  const windNoise = context.createBufferSource();
  windNoise.buffer = audio.noiseBuffer;
  windNoise.loop = true;
  const windFilter = context.createBiquadFilter();
  windFilter.type = "lowpass";
  windFilter.frequency.value = 360;
  const windLfo = context.createOscillator();
  const windLfoGain = context.createGain();
  windLfo.frequency.value = 0.18;
  windLfoGain.gain.value = 40;
  windLfo.connect(windLfoGain);
  windLfoGain.connect(windFilter.frequency);
  windNoise.connect(windFilter);
  windFilter.connect(windGain);
  windNoise.start();
  windLfo.start();

  const musicOscA = context.createOscillator();
  const musicFilter = context.createBiquadFilter();
  const musicPulse = context.createGain();
  musicOscA.type = "sine";
  musicOscA.frequency.value = 98;
  musicFilter.type = "lowpass";
  musicFilter.frequency.value = 240;
  musicPulse.gain.value = 0.028;
  musicOscA.connect(musicPulse);
  musicPulse.connect(musicFilter);
  musicFilter.connect(musicGain);
  musicOscA.start();
}

function resumeAudio() {
  if (!audio.ready) {
    ensureAudio();
  }
  if (audio.context && audio.context.state === "suspended") {
    audio.context.resume().catch(() => {});
  }
}

function playToneSweep(fromFreq, toFreq, duration, gainValue, type = "sine") {
  if (!audio.ready || !audio.context) {
    return;
  }

  const now = audio.context.currentTime;
  const osc = audio.context.createOscillator();
  const gain = audio.context.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(fromFreq, now);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, toFreq), now + duration);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(gainValue, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(gain);
  gain.connect(audio.sfxGain);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

function playMusicNote(frequency, duration = 1.8, gainValue = 0.042) {
  if (!audio.ready || !audio.context) {
    return;
  }

  const now = audio.context.currentTime;
  const osc = audio.context.createOscillator();
  const shimmer = audio.context.createOscillator();
  const filter = audio.context.createBiquadFilter();
  const gain = audio.context.createGain();

  osc.type = "triangle";
  shimmer.type = "sine";
  osc.frequency.setValueAtTime(frequency, now);
  shimmer.frequency.setValueAtTime(frequency * 1.5, now);
  filter.type = "lowpass";
  filter.frequency.value = 860;

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(gainValue, now + 0.14);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  osc.connect(filter);
  shimmer.connect(filter);
  filter.connect(gain);
  gain.connect(audio.musicGain);

  osc.start(now);
  shimmer.start(now);
  osc.stop(now + duration + 0.04);
  shimmer.stop(now + duration + 0.04);
}

function playPickupSound() {
  playToneSweep(260, 420, 0.22, 0.05, "triangle");
  playToneSweep(340, 520, 0.16, 0.025, "sine");
}

function playDashSound() {
  playToneSweep(170, 70, 0.18, 0.055, "triangle");
}

function playJumpSound() {
  playToneSweep(180, 260, 0.18, 0.04, "triangle");
}

function playGameOverSound() {
  playToneSweep(170, 55, 0.95, 0.05, "triangle");
}

function playRecordSound() {
  playToneSweep(260, 420, 0.28, 0.04, "sine");
  playToneSweep(320, 520, 0.24, 0.02, "triangle");
}

function updateAudio(deltaTime, elapsedTime) {
  if (!audio.ready || !audio.context) {
    return;
  }

  const now = audio.context.currentTime;
  const liveHeat = THREE.MathUtils.clamp(state.heat / maxHeat, 0, 1);
  audio.fireGain.gain.setTargetAtTime(0.0006 + liveHeat * 0.0032, now, 0.62);
  audio.rainGain.gain.setTargetAtTime(state.rainStrength * 0.022, now, 0.34);
  audio.windGain.gain.setTargetAtTime(state.windStrength * 0.028 + state.fogStrength * 0.008, now, 0.34);
  audio.musicGain.gain.setTargetAtTime(state.started && !state.gameOver ? 0.09 : 0.02, now, 0.5);

  audio.crackleTimer -= deltaTime;
  if (audio.crackleTimer <= 0 && state.started && !state.gameOver) {
    audio.crackleTimer = rand(0.16, 0.42) / Math.max(0.42, liveHeat + 0.18);
    playToneSweep(rand(55, 105), rand(34, 55), rand(0.02, 0.04), 0.0003 + liveHeat * 0.0007, "square");
  }

  audio.musicNoteTimer -= deltaTime;
  if (audio.musicNoteTimer <= 0 && state.started && !state.gameOver) {
    const notes = state.fogStrength > 0.1
      ? [73.42, 82.41, 98, 110]
      : [146.83, 164.81, 196, 220];
    const gainValue = state.fogStrength > 0.1 ? 0.014 + Math.random() * 0.008 : 0.038 + Math.random() * 0.02;
    const duration = state.fogStrength > 0.1 ? rand(3.8, 6.2) : rand(2.4, 4.1);
    playMusicNote(notes[Math.floor(Math.random() * notes.length)], duration, gainValue);
    audio.musicNoteTimer = state.fogStrength > 0.1 ? rand(4.6, 8.4) : rand(2.2, 4.4);
  }
}

function spawnBurst(position, color = 0xe3d7bf) {
  const burst = effectBursts.find((item) => !item.active);
  if (!burst) {
    return;
  }

  burst.active = true;
  burst.life = 1;
  burst.mesh.visible = true;
  burst.mesh.position.set(position.x, 0.18, position.z);
  burst.mesh.material = burst.mesh.material.clone();
  burst.mesh.material.color.setHex(color);
  burst.mesh.material.opacity = 0.7;
  burst.mesh.scale.setScalar(0.4);
}

function spawnSphereBurst(position, color = 0xf1c58c) {
  const sphere = effectSpheres.find((item) => !item.active);
  if (!sphere) {
    return;
  }

  sphere.active = true;
  sphere.life = 1;
  sphere.mesh.visible = true;
  sphere.mesh.position.set(position.x, 0.8, position.z);
  sphere.mesh.material.color.setHex(color);
  sphere.mesh.material.opacity = 0.45;
  sphere.mesh.scale.setScalar(0.25);
}

function updateHud() {
  const heatRatio = THREE.MathUtils.clamp(state.heat / maxHeat, 0, 1);
  const dashRatio = THREE.MathUtils.clamp(state.dashEnergy, 0, 1);
  const displayedBest = Math.max(state.bestSurvival, state.survival);
  heatFillEl.style.transform = `scaleX(${heatRatio})`;
  heatFillEl.style.filter = state.heat < 8 ? "saturate(1.3) brightness(0.9)" : "none";
  heatSecondsEl.textContent = `${state.heat.toFixed(1)}с`;
  woodCountEl.textContent = String(state.woodCollected);
  survivalTimeEl.textContent = `${state.survival.toFixed(1)}с`;
  if (bestTimeEl) {
    bestTimeEl.textContent = `Рекорд: ${displayedBest.toFixed(1)}с`;
  }
  if (hazardNoteEl) {
    if (state.rainStrength > 0.08 && state.windStrength > 0.12) {
      hazardNoteEl.textContent = "Дождь и ветер: идти тяжелее";
    } else if (state.rainStrength > 0.08) {
      hazardNoteEl.textContent = "Дождь: пламя гаснет быстрее";
    } else if (state.windStrength > 0.12) {
      hazardNoteEl.textContent = "Ветер: сносит в сторону";
    } else if (state.fogStrength > 0.12) {
      hazardNoteEl.textContent = "Туман: далеко не видно";
    } else {
      hazardNoteEl.textContent = "Лес тихий";
    }
  }
  if (dashFillEl) {
    dashFillEl.style.transform = `scaleX(${dashRatio})`;
  }
  if (dashLabelEl) {
    dashLabelEl.textContent = "Рывок";
  }
}
function spawnDebris(position, color = 0x9a6a3f, count = 8) {
  let emitted = 0;

  effectDebris.forEach((debris) => {
    if (emitted >= count || debris.active) {
      return;
    }

    debris.active = true;
    debris.life = rand(0.75, 1.25);
    debris.mesh.visible = true;
    debris.mesh.position.set(
      position.x + rand(-0.4, 0.4),
      rand(0.45, 1.4),
      position.z + rand(-0.4, 0.4)
    );
    debris.mesh.rotation.set(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      Math.random() * Math.PI
    );
    debris.mesh.scale.setScalar(rand(0.75, 1.5));
    debris.mesh.material.color.setHex(color);
    debris.velocity.set(rand(-3.6, 3.6), rand(2.2, 5.8), rand(-3.6, 3.6));
    debris.spin.set(rand(-7, 7), rand(-7, 7), rand(-7, 7));
    emitted += 1;
  });
}

function spawnTreeImpact(position) {
  spawnBurst(position, 0xd8c19a);
  spawnBurst(
    new THREE.Vector3(position.x + rand(-0.45, 0.45), 0, position.z + rand(-0.45, 0.45)),
    0xffb45d
  );
  spawnSphereBurst(position, 0xf5c47e);
  spawnDebris(position, 0x8f6239, 12);
}

function spawnDashImpact(position) {
  spawnBurst(position, 0xffb45d);
  spawnSphereBurst(position, 0xffd38a);
  spawnDebris(position, 0xf2c27a, 5);
}

function resetTree(tree) {
  tree.baseScale = rand(0.85, 1.45);
  tree.growth = rand(0.03, 0.12);
  tree.fallTimer = rand(7, 30);
  tree.growthRate = rand(0.012, 0.03);
  tree.state = "growing";
  tree.mesh.visible = true;
  tree.mesh.rotation.set(0, Math.random() * Math.PI * 2, 0);
  tree.mesh.position.copy(tree.position);
  tree.mesh.scale.setScalar(tree.baseScale * tree.growth);
}

function deactivateBarrier(barrier) {
  barrier.active = false;
  barrier.life = 0;
  barrier.mesh.visible = false;
}

function activateBarrierFromTree(tree) {
  const barrier =
    barriers.find((item) => !item.active) ||
    barriers
      .filter((item) => item.active)
      .sort((left, right) => left.life - right.life)[0];
  if (!barrier) {
    return false;
  }

  barrier.active = true;
  barrier.life = rand(30, 40);
  barrier.mesh.visible = true;
  barrier.mesh.position.set(tree.position.x, 0.42, tree.position.z);
  barrier.mesh.rotation.set(0, Math.random() * Math.PI * 2, rand(-0.12, 0.12));
  barrier.mesh.scale.setScalar(1);
  spawnBurst(tree.position, 0xc4ae84);
  spawnSphereBurst(tree.position, 0xe3c39a);
  spawnDebris(tree.position, 0xa57b4f, 8);
  return true;
}

function triggerRainPuddle() {
  const puddle = puddles.find((item) => !item.active && !item.drying);
  if (!puddle) {
    return;
  }

  const next = getSpawnPoint(7, worldRadius - 6, player.position);
  puddle.active = true;
  puddle.drying = false;
  puddle.radius = Math.max(puddle.radius, 0.18);
  puddle.targetRadius = rand(1.6, 2.8);
  puddle.dryTimer = 0;
  puddle.mesh.visible = true;
  puddle.mesh.position.set(next.x, 0.08, next.z);
}

function resetGame(startImmediately = false) {
  state.heat = maxHeat;
  state.survival = 0;
  state.woodCollected = 0;
  state.gameOver = false;
  state.started = false;
  state.hasNewRecord = false;
  state.speedBoost = 0;
  state.jumpSpeed = 0;
  state.dashEnergy = 1;
  state.dashActive = false;
  state.dashTimer = 0;
  state.dashHeld = false;
  state.dashQueued = false;
  state.slowFactor = 1;
  state.lastHazardMessageAt = -10;
  state.isRaining = false;
  state.rainStrength = 0;
  state.rainTimer = rand(rainInterval.min, rainInterval.max);
  state.rainPuddleTimer = rand(0.9, 1.8);
  state.isWindy = false;
  state.windStrength = 0;
  state.windTimer = rand(windInterval.min, windInterval.max);
  state.windAngle = 0;
  state.isFoggy = false;
  state.fogStrength = 0;
  state.fogTimer = rand(fogInterval.min, fogInterval.max);
  state.lastSteamAt = -10;
  state.lastSparkAt = -10;
  state.puddlesShouldDry = false;
  state.extinguish = 0;

  if (gameOverEl) {
    gameOverEl.classList.add("hidden");
  }
  if (newRecordEl) {
    newRecordEl.classList.add("hidden");
  }

  player.position.set(0, 0, 0);
  player.rotation.y = 0;
  moveDirection.set(0, 0, 1);
  cameraLookTarget.set(0, 1.4, 0);
  camera.position.set(0, 7.6, -7.8);
  camera.lookAt(cameraLookTarget);
  previousPlayerXZ.set(0, 0, 0);

  woods.forEach((pickup) => {
    pickup.active = false;
    pickup.life = 0;
    pickup.mesh.visible = false;
  });
  puddles.forEach((puddle) => {
    puddle.active = false;
    puddle.drying = false;
    puddle.radius = 0;
    puddle.targetRadius = 0;
    puddle.dryTimer = 0;
    puddle.mesh.visible = false;
  });
  barriers.forEach((barrier) => deactivateBarrier(barrier));
  trees.forEach((tree) => resetTree(tree));
  trees.forEach((tree, index) => {
    if (index < Math.ceil(trees.length * 0.35)) {
      tree.growth = rand(0.82, 1);
      tree.fallTimer = rand(4, 16);
      tree.mesh.scale.setScalar(tree.baseScale * tree.growth);
    }
  });
  effectBursts.forEach((burst) => {
    burst.active = false;
    burst.life = 0;
    burst.mesh.visible = false;
  });
  effectSpheres.forEach((sphere) => {
    sphere.active = false;
    sphere.life = 0;
    sphere.mesh.visible = false;
  });
  effectDebris.forEach((debris) => {
    debris.active = false;
    debris.life = 0;
    debris.mesh.visible = false;
    debris.velocity.set(0, 0, 0);
    debris.spin.set(0, 0, 0);
  });
  windStreaks.forEach((streak) => {
    streak.mesh.visible = false;
    streak.mesh.material.opacity = 0;
  });
  fogShells.forEach((shell) => {
    shell.mesh.visible = false;
    shell.mesh.material.opacity = 0;
  });
  fogMotes.forEach((mote) => {
    mote.mesh.visible = false;
    mote.mesh.material.opacity = 0;
  });

  rainCurtain.material.opacity = 0;
  rainCurtain.scale.setScalar(1);

  for (let i = 0; i < Math.min(6, woods.length); i += 1) {
    respawnWood(woods[i], new THREE.Vector3());
  }

  setStatus("РџР»Р°РјСЏ СЃРЅРѕРІР° СЂР°Р·РіРѕСЂРµР»РѕСЃСЊ. РќРѕС‡СЊ С‚РёС…Р°СЏ, РЅРѕ Р»РµСЃ СѓР¶Рµ СЃР»РµРґРёС‚ Р·Р° С‚РѕР±РѕР№.");
  if (startImmediately) {
    beginGame();
  } else {
    showStartScreen();
  }
  updateHud();
}

function endGame() {
  if (state.gameOver) {
    return;
  }

  resumeAudio();
  state.gameOver = true;
  state.extinguish = 0;
  state.hasNewRecord = state.survival >= state.bestSurvival && state.survival > 0;
  if (state.hasNewRecord) {
    state.bestSurvival = state.survival;
    window.localStorage.setItem(bestSurvivalStorageKey, String(state.bestSurvival));
    playRecordSound();
  }
  playGameOverSound();
  if (gameOverTextEl) {
    gameOverTextEl.textContent = `Он горел ${state.survival.toFixed(1)}с`;
  }
  if (newRecordEl) {
    newRecordEl.classList.toggle("hidden", !state.hasNewRecord);
  }
  if (gameOverEl) {
    gameOverEl.classList.remove("hidden");
  }
  setStatus(`РћРіРѕРЅСЊ РїРѕРіР°СЃ С‡РµСЂРµР· ${state.survival.toFixed(1)}СЃ. РќР°Р¶РјРё R РёР»Рё РєРЅРѕРїРєСѓ СЃРїСЂР°РІР°, С‡С‚РѕР±С‹ РїРѕРїСЂРѕР±РѕРІР°С‚СЊ РµС‰Рµ СЂР°Р·.`);
  updateHud();
}

function collectWood() {
  resumeAudio();
  state.woodCollected += 1;
  state.heat = Math.min(maxHeat, state.heat + 8.5);
  state.dashEnergy = Math.min(1, state.dashEnergy + 0.2);
  state.speedBoost = Math.min(2.5, state.speedBoost + 0.03);
  playPickupSound();
  setStatus(`РџРѕР»РµРЅРѕ РїРѕР№РјР°РЅРѕ. РџР»Р°РјСЏ РѕР¶РёР»Рѕ Рё СЃС‚Р°Р»Рѕ СЏСЂС‡Рµ. РЎРѕР±СЂР°РЅРѕ: ${state.woodCollected}.`);
  updateHud();
}

function resize() {
  const width = container.clientWidth;
  const height = container.clientHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function updateMobileViewportState() {
  const mobileLandscape = window.innerWidth <= 980 && window.innerWidth > window.innerHeight;
  document.body.classList.toggle("mobile-landscape", mobileLandscape);
  document.body.classList.toggle("mobile-portrait", window.innerWidth <= 980 && window.innerHeight >= window.innerWidth);
}

function updateFullscreenButton() {
  fullscreenButton.textContent = document.fullscreenElement ? "Обычный экран" : "Полный экран";
}

fullscreenHud.classList.toggle("active", document.fullscreenElement === viewportEl);

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await viewportEl.requestFullscreen();
    }
  } catch (error) {
    console.error("Fullscreen failed", error);
  } finally {
    updateFullscreenButton();
    resize();
  }
}

function showStartScreen() {
  state.started = false;
  if (startScreenEl) {
    startScreenEl.classList.remove("hidden");
  }
}

function beginGame() {
  resumeAudio();
  state.started = true;
  audio.musicNoteTimer = 0.4;
  playMusicNote(164.81, 3.2, 0.03);
  if (startScreenEl) {
    startScreenEl.classList.add("hidden");
  }
}

function setVirtualKey(code, pressed) {
  if (pressed) {
    keys.add(code);
    if ((code === "ShiftLeft" || code === "ShiftRight") && !state.dashHeld) {
      state.dashQueued = true;
    }
    if (code === "Space") {
      tryJump();
    }
  } else {
    keys.delete(code);
  }
}

function readInput() {
  const keyX = Number(keys.has("KeyD") || keys.has("ArrowRight")) - Number(keys.has("KeyA") || keys.has("ArrowLeft"));
  const keyZ = Number(keys.has("KeyW") || keys.has("ArrowUp")) - Number(keys.has("KeyS") || keys.has("ArrowDown"));
  const x = keyX !== 0 ? keyX : mobileMoveInput.x;
  const z = keyZ !== 0 ? keyZ : mobileMoveInput.y;

  camera.getWorldDirection(cameraForward);
  cameraForward.y = 0;
  cameraForward.normalize();
  cameraRight.crossVectors(cameraForward, worldUp).normalize();

  return cameraForward.multiplyScalar(z).add(cameraRight.multiplyScalar(x));
}

function tryJump() {
  if (state.gameOver || !state.isGrounded) {
    return;
  }

  resumeAudio();
  state.jumpSpeed = jumpVelocity;
  state.isGrounded = false;
  playJumpSound();
  setStatus("РљРѕСЃС‚РµСЂ РїРѕРґРїСЂС‹РіРЅСѓР» РЅР°Рґ СЃС‹СЂРѕР№ Р·РµРјР»РµР№.");
}

function animatePlayer(elapsedTime) {
  const liveHeat = THREE.MathUtils.clamp(state.heat / maxHeat, 0, 1);
  const extinguish = state.gameOver ? state.extinguish : 0;
  const flameFactor = 1 - extinguish;
  const emberFactor = Math.max(0.18, flameFactor);
  const windLeanX = windDirectionVector.z * state.windStrength * 0.24;
  const windLeanZ = -windDirectionVector.x * state.windStrength * 0.24;

  emberCoal.scale.setScalar(0.84 + liveHeat * 0.18 + Math.sin(elapsedTime * 4.5) * 0.04 * emberFactor);
  emberCoal.rotation.y += 0.015;
  emberCore.scale.set(
    (0.38 + liveHeat * 0.52 + Math.cos(elapsedTime * 7.2) * 0.08) * emberFactor,
    (0.52 + liveHeat * 0.63 + Math.sin(elapsedTime * 10.8) * 0.2) * emberFactor,
    (0.42 + liveHeat * 0.5) * emberFactor
  );
  emberCore.position.x = Math.sin(elapsedTime * 2.8) * 0.03 * emberFactor;
  emberFlame.scale.set(
    (0.18 + liveHeat * 0.6 + Math.cos(elapsedTime * 7.8) * 0.1) * flameFactor,
    (0.22 + liveHeat * 1 + Math.sin(elapsedTime * 10.2) * 0.26 + liveHeat / 3.6) * flameFactor,
    (0.18 + liveHeat * 0.6 + Math.sin(elapsedTime * 8.6) * 0.07) * flameFactor
  );
  emberFlame.rotation.z = Math.sin(elapsedTime * 3.5) * 0.12 + windLeanZ;
  emberFlame.rotation.x = Math.cos(elapsedTime * 2.8) * 0.08 + windLeanX;
  emberFlameBack.scale.set(
    (0.16 + liveHeat * 0.46 + Math.sin(elapsedTime * 6.4) * 0.08) * flameFactor,
    (0.2 + liveHeat * 0.72 + Math.cos(elapsedTime * 8.2) * 0.18) * flameFactor,
    (0.16 + liveHeat * 0.46) * flameFactor
  );
  emberFlameBack.rotation.z = Math.cos(elapsedTime * 2.6) * -0.14 + windLeanZ * 0.88;
  emberFlameLeft.scale.set(
    (0.14 + liveHeat * 0.34 + Math.sin(elapsedTime * 9.6) * 0.08) * flameFactor,
    (0.18 + liveHeat * 0.7 + Math.cos(elapsedTime * 7.4) * 0.2) * flameFactor,
    (0.14 + liveHeat * 0.34) * flameFactor
  );
  emberFlameLeft.rotation.z = Math.sin(elapsedTime * 4.2) * -0.2 + windLeanZ * 1.1;
  emberFlameRight.scale.set(
    (0.12 + liveHeat * 0.32 + Math.cos(elapsedTime * 8.8) * 0.07) * flameFactor,
    (0.16 + liveHeat * 0.56 + Math.sin(elapsedTime * 6.8) * 0.18) * flameFactor,
    (0.12 + liveHeat * 0.32) * flameFactor
  );
  emberFlameRight.rotation.z = Math.sin(elapsedTime * 5.1) * 0.18 + windLeanZ * 0.95;
  emberLogA.rotation.x = Math.sin(elapsedTime * 1.6) * 0.03;
  emberLogB.rotation.x = Math.cos(elapsedTime * 1.9) * -0.03;

  emberCoal.material.emissiveIntensity = 0.58 + liveHeat * 1.58 * emberFactor;
  emberCore.material.opacity = 0.25 + liveHeat * 0.7 * emberFactor;
  emberFlame.material.opacity = 0.12 + liveHeat * 0.84 * flameFactor;
  emberFlameBack.material.opacity = 0.09 + liveHeat * 0.7 * flameFactor;
  emberFlameLeft.material.opacity = 0.08 + liveHeat * 0.74 * flameFactor;
  emberFlameRight.material.opacity = 0.07 + liveHeat * 0.66 * flameFactor;
  emberGlow.intensity = (0.3 + liveHeat * 3.95 + Math.sin(elapsedTime * 12) * 0.36) * emberFactor - state.rainStrength * 0.34;
  emberGlow.distance = 4.8 + liveHeat * 9.8 * emberFactor;

  particles.forEach((particle, index) => {
    const t = elapsedTime * particle.speed + particle.offset;
    const swirl = particle.radius + Math.sin(t * 1.4 + index) * 0.08;
    const lift = (t % 1.7) / 1.7;
    particle.mesh.position.set(
      player.position.x + Math.cos(particle.angle + t * particle.drift) * swirl + windDirectionVector.x * state.windStrength * lift * 1.9,
      0.45 + (t % 1.7) * particle.height + player.position.y * 0.3,
      player.position.z + Math.sin(particle.angle + t * particle.drift) * swirl + windDirectionVector.z * state.windStrength * lift * 1.9
    );
    particle.mesh.material.opacity =
      (0.18 + (1 - ((t % 1.7) / 1.7)) * 0.9) * (1 - state.rainStrength * 0.38) * flameFactor;
    particle.mesh.scale.setScalar((0.7 + (1 - ((t % 1.7) / 1.7)) * 0.9) * Math.max(flameFactor, 0.12));
  });
}

function updateWoods(elapsedTime) {
  woods.forEach((pickup, index) => {
    if (!pickup.active) {
      pickup.mesh.visible = false;
      return;
    }

    pickup.mesh.position.y = 0.78 + Math.sin(elapsedTime * 2.4 + pickup.bobOffset) * 0.22;
    pickup.mesh.rotation.y += 0.01 + index * 0.0002;
    pickup.glow.material.opacity = 0.32 + Math.sin(elapsedTime * 3.2 + pickup.bobOffset) * 0.18;
  });
}

function updateWoodLifecycle(deltaTime) {
  woods.forEach((pickup) => {
    if (!pickup.active) {
      return;
    }

    pickup.life -= deltaTime;
    if (pickup.life <= 0) {
      pickup.active = false;
      pickup.life = 0;
      pickup.mesh.visible = false;
    }
  });
}

function updateRain(elapsedTime, deltaTime) {
  state.rainTimer -= deltaTime;

  if (!state.isRaining && state.rainTimer <= 0) {
    if (state.isFoggy) {
      state.rainTimer = rand(6, 11);
    } else if (state.isWindy && Math.random() > stormOverlapChance) {
      state.rainTimer = rand(6, 11);
    } else {
      state.isRaining = true;
      state.puddlesShouldDry = false;
      state.rainTimer = rand(rainDuration.min, rainDuration.max);
      state.rainPuddleTimer = 0.4;
      setStatus("Начался дождь. Пламя шипит, а на земле быстро собирается вода.");
    }
  } else if (state.isRaining && state.rainTimer <= 0) {
    state.isRaining = false;
    state.rainTimer = rand(rainInterval.min, rainInterval.max);
    state.puddlesShouldDry = false;
    setStatus("Дождь стих. Лужи ещё держатся, но уже начинают сохнуть.");
  }

  if (state.isRaining) {
    state.rainPuddleTimer -= deltaTime;
    if (state.rainPuddleTimer <= 0) {
      triggerRainPuddle();
      state.rainPuddleTimer = rand(0.8, 1.7);
    }
  }

  const targetStrength = state.isRaining ? 1 : 0;
  state.rainStrength = THREE.MathUtils.lerp(state.rainStrength, targetStrength, 1 - Math.exp(-deltaTime * 2.5));
  if (!state.isRaining && state.rainStrength < 0.06) {
    state.puddlesShouldDry = true;
  }
  rainCurtain.material.opacity = state.rainStrength * 0.11;
  rainCurtain.scale.setScalar(1 + Math.sin(elapsedTime * 1.8) * 0.01);

  rainDrops.forEach((drop, index) => {
    const activeOpacity = state.rainStrength * (0.18 + (index % 5) * 0.01);
    drop.mesh.material.opacity = activeOpacity;
    if (state.rainStrength < 0.02) {
      drop.mesh.visible = false;
      return;
    }

    drop.mesh.visible = true;
    const t = (elapsedTime * drop.speed + drop.offset) % 2.8;
    rainSpawnPoint.set(
      player.position.x + Math.cos(drop.angle) * drop.radius,
      6.5 - t * 3,
      player.position.z + Math.sin(drop.angle) * drop.radius
    );
    drop.mesh.position.copy(rainSpawnPoint);
  });
}

function updateWind(elapsedTime, deltaTime) {
  state.windTimer -= deltaTime;

  if (!state.isWindy && state.windTimer <= 0) {
    if (state.isFoggy) {
      state.windTimer = rand(7, 12);
    } else if (state.isRaining && Math.random() > stormOverlapChance) {
      state.windTimer = rand(7, 12);
    } else {
      state.isWindy = true;
      state.windTimer = rand(windDuration.min, windDuration.max);
      state.windAngle = Math.floor(Math.random() * 4) * (Math.PI / 2);
      setStatus("Поднялся ветер. Искры тянет в сторону, а костёр начинает сносить.");
    }
  } else if (state.isWindy && state.windTimer <= 0) {
    state.isWindy = false;
    state.windTimer = rand(windInterval.min, windInterval.max);
    setStatus("Ветер стих. Двигаться стало легче.");
  }

  const targetStrength = state.isWindy ? 1 : 0;
  state.windStrength = THREE.MathUtils.lerp(state.windStrength, targetStrength, 1 - Math.exp(-deltaTime * 2.2));
  windDirectionVector.set(Math.cos(state.windAngle), 0, Math.sin(state.windAngle));
  windSideVector.set(-windDirectionVector.z, 0, windDirectionVector.x);

  windStreaks.forEach((streak, index) => {
    if (state.windStrength < 0.05) {
      streak.mesh.visible = false;
      return;
    }

    const progress = ((elapsedTime * streak.speed) + streak.offset) % 1;
    const along = (progress - 0.5) * (12 + streak.radius * 2.2);
    const side = streak.lateral * streak.radius;
    windOffsetVector.copy(windDirectionVector).multiplyScalar(along);
    windOffsetVector.addScaledVector(windSideVector, side);
    windOffsetVector.y = streak.height + Math.sin(elapsedTime * 3.4 + index) * 0.12;

    streak.mesh.visible = true;
    streak.mesh.position.copy(player.position).add(windOffsetVector);
    streak.mesh.rotation.y = Math.atan2(windDirectionVector.x, windDirectionVector.z);
    streak.mesh.scale.set(0.8 + state.windStrength * (2.1 + streak.stretch), 0.8 + state.windStrength * 0.45, 1);
    streak.mesh.material.opacity = state.windStrength * (0.08 + (1 - Math.abs(progress - 0.5) * 1.4) * 0.16);
  });
}

function updateFog(deltaTime) {
  state.fogTimer -= deltaTime;

  if (!state.isFoggy && state.fogTimer <= 0) {
    if (state.isRaining || state.isWindy) {
      state.fogTimer = rand(6, 10);
    } else {
      state.isFoggy = true;
      state.fogTimer = rand(fogDuration.min, fogDuration.max);
      setStatus("Поднялся туман. Дальняя поляна почти исчезла из виду.");
    }
  } else if (state.isFoggy && state.fogTimer <= 0) {
    state.isFoggy = false;
    state.fogTimer = rand(fogInterval.min, fogInterval.max);
    setStatus("Туман рассеялся. Лес снова видно дальше.");
  }

  const targetStrength = state.isFoggy ? 1 : 0;
  state.fogStrength = THREE.MathUtils.lerp(state.fogStrength, targetStrength, 1 - Math.exp(-deltaTime * 1.9));
}

function updateAtmosphere(elapsedTime) {
  const rain = state.rainStrength;
  const fog = state.fogStrength;
  ambientLight.intensity = 2.34 - rain * 0.28 - fog * 0.34;
  moonLight.intensity = 1.2 - rain * 0.18 - fog * 0.32;
  moonHalo.material.opacity = Math.max(0.015, 0.16 - rain * 0.03 - fog * 0.12);
  starField.material.opacity = Math.max(0.005, 0.88 - rain * 0.2 - fog * 0.92);
  forestBand.material.opacity = Math.max(0.005, 0.2 - rain * 0.06 - fog * 0.19);
  darknessVeil.material.opacity = 0.22 - rain * 0.04 + fog * 0.11;
  darknessEdge.material.opacity = 0.42 - rain * 0.06 + fog * 0.08;
  scene.fog.density = 0.0072 + rain * 0.004 + fog * 0.024;
  renderer.toneMappingExposure = 1.56 - rain * 0.06 - fog * 0.12 + Math.min(state.heat / maxHeat, 1) * 0.035;
  forestBand.position.y = 8.4 + Math.sin(elapsedTime * 0.35) * fog * 0.18;
  fogShells.forEach((shell, index) => {
    shell.mesh.visible = fog > 0.04;
    shell.mesh.position.set(player.position.x, shell.height * 0.58, player.position.z);
    shell.mesh.material.opacity = fog * (shell.opacity + index * 0.03);
    shell.mesh.scale.x = 1 + Math.sin(elapsedTime * (0.18 + index * 0.05)) * fog * 0.02;
    shell.mesh.scale.z = 1 + Math.cos(elapsedTime * (0.16 + index * 0.04)) * fog * 0.03;
  });
  fogMotes.forEach((mote, index) => {
    if (fog < 0.08) {
      mote.mesh.visible = false;
      return;
    }

    const t = elapsedTime * mote.speed + mote.offset;
    mote.mesh.visible = true;
    mote.mesh.position.set(
      player.position.x + Math.cos(t * mote.drift + index) * mote.radius,
      mote.height + Math.sin(t * 0.8 + index) * 0.3,
      player.position.z + Math.sin(t * mote.drift + index * 1.7) * mote.radius
    );
    mote.mesh.lookAt(camera.position);
    mote.mesh.scale.setScalar((0.28 + mote.size * 0.24) * (0.85 + fog * 0.7));
    mote.mesh.material.opacity = fog * (0.06 + (Math.sin(t * 1.7 + index) * 0.5 + 0.5) * 0.12);
  });
}

function updatePuddles(elapsedTime, deltaTime) {
  puddles.forEach((puddle) => {
    if (!puddle.active && !puddle.drying) {
      puddle.mesh.visible = false;
      return;
    }

    const rainVisiblyActive = state.isRaining || state.rainStrength > 0.08;

    if (rainVisiblyActive) {
      puddle.active = true;
      puddle.drying = false;
      puddle.radius = THREE.MathUtils.lerp(puddle.radius, puddle.targetRadius, 1 - Math.exp(-deltaTime * 2.4));
    } else if (state.puddlesShouldDry || puddle.drying) {
      puddle.drying = true;
      puddle.radius = THREE.MathUtils.lerp(puddle.radius, 0, 1 - Math.exp(-deltaTime * 0.2));

      if (puddle.radius < 0.03) {
        puddle.active = false;
        puddle.drying = false;
        puddle.radius = 0;
        puddle.targetRadius = 0;
        puddle.mesh.visible = false;
        return;
      }
    }

    const scale = Math.max(puddle.radius / 2.2, 0.001);
    puddle.mesh.visible = true;
    puddle.mesh.scale.set(scale, scale, scale);
    puddle.mesh.material.opacity = 0.2 + scale * 0.5 + Math.sin(elapsedTime * 1.8 + puddle.wobble) * 0.04;
  });
}

function updateTrees(deltaTime) {
  trees.forEach((tree) => {
    if (tree.state === "growing") {
      tree.growth = Math.min(1, tree.growth + deltaTime * tree.growthRate);
      tree.fallTimer -= deltaTime * (0.42 + state.survival * 0.012);
      tree.mesh.scale.setScalar(tree.baseScale * tree.growth);
      tree.crown.rotation.y += deltaTime * 0.35;

      if (tree.growth >= 1 && tree.fallTimer <= 0) {
        tree.state = "falling";
        setStatus("РЎС‚Р°СЂРѕРµ РґРµСЂРµРІРѕ С‚СЂРµСЃРЅСѓР»Рѕ Рё РЅР°С‡Р°Р»Рѕ Р·Р°РІР°Р»РёРІР°С‚СЊСЃСЏ, РїСЂРµРІСЂР°С‰Р°СЏСЃСЊ РІ РєРѕСЂСЏРіСѓ.");
      }
    } else if (tree.state === "falling") {
      tree.mesh.rotation.z = THREE.MathUtils.lerp(tree.mesh.rotation.z, -Math.PI / 2, 1 - Math.exp(-deltaTime * 2.8));
      if (Math.abs(tree.mesh.rotation.z + Math.PI / 2) < 0.08) {
        tree.state = "hidden";
        tree.mesh.visible = false;
        spawnTreeImpact(tree.position);

        if (Math.random() < 0.4) {
          const createdBarrier = activateBarrierFromTree(tree);
          if (createdBarrier) {
            setStatus("РЈРїР°РІС€РµРµ РґРµСЂРµРІРѕ СЂР°СЃСЃС‹РїР°Р»РѕСЃСЊ РІ С‰РµРїСѓ Рё СЃР¶Р°Р»РѕСЃСЊ РІ РєРѕСЂСЏРіСѓ-РїСЂРµРїСЏС‚СЃС‚РІРёРµ.");
          } else {
            forceSpawnWoodAt(tree.position, 1 + Math.floor(rand(0, 3)));
            setStatus("РЈРїР°РІС€РµРµ РґРµСЂРµРІРѕ СЂР°СЃСЃС‹РїР°Р»РѕСЃСЊ РЅР° РїРѕР»РµРЅСЊСЏ.");
          }
        } else {
          forceSpawnWoodAt(tree.position, 1 + Math.floor(rand(0, 3)));
          setStatus("Р”РµСЂРµРІРѕ СЂСѓС…РЅСѓР»Рѕ Рё СЂР°СЃРїР°Р»РѕСЃСЊ РЅР° РїРѕР»РµРЅСЊСЏ РґР»СЏ РєРѕСЃС‚СЂР°.");
        }

        resetTree(tree);
      }
    }
  });
}

function updateBarriers(deltaTime) {
  barriers.forEach((barrier) => {
    if (!barrier.active) {
      return;
    }

    barrier.life -= deltaTime;
    const lifeRatio = THREE.MathUtils.clamp(barrier.life / 30, 0, 1);
    barrier.mesh.scale.setScalar(0.5 + lifeRatio * 0.7);
    barrier.mesh.position.y = 0.22 + lifeRatio * 0.2;

    if (barrier.life <= 0) {
      spawnBurst(barrier.mesh.position, 0xd6cab4);
      deactivateBarrier(barrier);
      return;
    }
  });
}

function updateBursts(deltaTime) {
  effectBursts.forEach((burst) => {
    if (!burst.active) {
      return;
    }

    burst.life -= deltaTime * 1.7;
    const life = Math.max(burst.life, 0);
    burstScale.setScalar(0.3 + (1 - life) * 1.8);
    burst.mesh.scale.copy(burstScale);
    burst.mesh.material.opacity = life * 0.55;
    burst.mesh.position.y = 0.18 + (1 - life) * 0.45;

    if (burst.life <= 0) {
      burst.active = false;
      burst.mesh.visible = false;
    }
  });

  effectSpheres.forEach((sphere) => {
    if (!sphere.active) {
      return;
    }

    sphere.life -= deltaTime * 1.35;
    const life = Math.max(sphere.life, 0);
    const bloom = 1 - life;
    sphere.mesh.scale.setScalar(0.25 + bloom * 4.6);
    sphere.mesh.material.opacity = life * 0.36;
    sphere.mesh.position.y = 0.8 + bloom * 0.35;

    if (sphere.life <= 0) {
      sphere.active = false;
      sphere.mesh.visible = false;
    }
  });

  effectDebris.forEach((debris) => {
    if (!debris.active) {
      return;
    }

    debris.life -= deltaTime;
    debris.velocity.y -= 8.8 * deltaTime;
    debris.mesh.position.addScaledVector(debris.velocity, deltaTime);
    debris.mesh.rotation.x += debris.spin.x * deltaTime;
    debris.mesh.rotation.y += debris.spin.y * deltaTime;
    debris.mesh.rotation.z += debris.spin.z * deltaTime;

    const life = Math.max(debris.life, 0);
    debris.mesh.material.opacity = Math.min(life, 1);

    if (debris.mesh.position.y < 0.12) {
      debris.mesh.position.y = 0.12;
      debris.velocity.multiplyScalar(0.45);
      debris.velocity.y = Math.abs(debris.velocity.y) * 0.18;
    }

    if (debris.life <= 0) {
      debris.active = false;
      debris.mesh.visible = false;
      debris.velocity.set(0, 0, 0);
      debris.spin.set(0, 0, 0);
    }
  });
}

function updateCamera(deltaTime) {
  starField.position.set(player.position.x, 0, player.position.z);
  cameraLookTarget.lerp(new THREE.Vector3(player.position.x, 1.4 + player.position.y * 0.2, player.position.z), 1 - Math.exp(-deltaTime * 6));
  const desired = new THREE.Vector3(
    player.position.x - moveDirection.x * 7.8,
    7.6 + player.position.y * 0.35,
    player.position.z - moveDirection.z * 7.8
  );

  camera.position.lerp(desired, 1 - Math.exp(-deltaTime * 4));
  camera.lookAt(cameraLookTarget);
}

function handleHazards(deltaTime, elapsedTime) {
  state.slowFactor = 1;

  puddles.forEach((puddle) => {
    if (!puddle.active) {
      return;
    }

    const distance = puddle.mesh.position.distanceTo(player.position);
    if (distance < puddle.radius + 0.6 && player.position.y < 0.65) {
      state.slowFactor = 0.58;
      state.heat = Math.max(0, state.heat - (2.6 + state.rainStrength * 1.6) * deltaTime);
      if (elapsedTime - state.lastSteamAt > 0.35) {
        spawnBurst(player.position, 0xd8e6ef);
        state.lastSteamAt = elapsedTime;
      }
      if (elapsedTime - state.lastHazardMessageAt > 1.8) {
        setStatus("РЎС‹СЂР°СЏ Р»СѓР¶Р° С€РёРїРёС‚ РїРѕРґ СѓРіР»СЏРјРё Рё Р±С‹СЃС‚СЂРѕ С‚СѓС€РёС‚ РїР»Р°РјСЏ.");
        state.lastHazardMessageAt = elapsedTime;
      }
    }
  });

  trees.forEach((tree) => {
    if (tree.state !== "growing") {
      return;
    }

    const distance = tree.mesh.position.distanceTo(player.position);
    const collisionRadius = tree.radius * tree.growth * 0.55 + 0.35;
    if (distance < collisionRadius && player.position.y < 1.2) {
      player.position.x = previousPlayerXZ.x;
      player.position.z = previousPlayerXZ.z;
      if (elapsedTime - state.lastSparkAt > 0.18) {
        spawnBurst(tree.mesh.position, 0xffb45d);
        state.lastSparkAt = elapsedTime;
      }
      if (elapsedTime - state.lastHazardMessageAt > 1.2) {
        setStatus("РњРѕР»РѕРґРѕРµ РґРµСЂРµРІРѕ СѓРїСЂСѓРіРѕ РѕСЃС‚Р°РЅРѕРІРёР»Рѕ РєРѕСЃС‚РµСЂ. РќСѓР¶РЅРѕ РѕР±Р±РµР¶Р°С‚СЊ РёР»Рё РїРµСЂРµР¶РґР°С‚СЊ РїР°РґРµРЅРёРµ.");
        state.lastHazardMessageAt = elapsedTime;
      }
    }
  });

  barriers.forEach((barrier) => {
    if (!barrier.active) {
      return;
    }

    const distance = barrier.mesh.position.distanceTo(player.position);
    if (distance < barrier.radius + 0.55 && player.position.y < barrier.height) {
      player.position.x = previousPlayerXZ.x;
      player.position.z = previousPlayerXZ.z;
      if (elapsedTime - state.lastSparkAt > 0.18) {
        spawnBurst(barrier.mesh.position, 0xffa73c);
        state.lastSparkAt = elapsedTime;
      }
      if (elapsedTime - state.lastHazardMessageAt > 1.2) {
        setStatus("РЈРїР°РІС€РёР№ СЃС‚РІРѕР» РїРµСЂРµРіРѕСЂРѕРґРёР» РїСѓС‚СЊ. Р•РіРѕ РЅСѓР¶РЅРѕ РїРµСЂРµРїСЂС‹РіРЅСѓС‚СЊ.");
        state.lastHazardMessageAt = elapsedTime;
      }
    }
  });
}

function updateGame(deltaTime, elapsedTime) {
  if (!state.started) {
    animatePlayer(elapsedTime);
    updateWoods(elapsedTime);
    updateCamera(deltaTime);
    updateHud();
    updateAudio(deltaTime, elapsedTime);
    return;
  }

  updateRain(elapsedTime, deltaTime);
  updateWind(elapsedTime, deltaTime);
  updateFog(deltaTime);
  updateAtmosphere(elapsedTime);
  updatePuddles(elapsedTime, deltaTime);
  updateTrees(deltaTime);
  updateBarriers(deltaTime);
  updateWoodLifecycle(deltaTime);
  updateBursts(deltaTime);

  if (state.gameOver) {
    state.extinguish = Math.min(1, state.extinguish + deltaTime * 1.15);
    animatePlayer(elapsedTime);
    updateWoods(elapsedTime);
    updateCamera(deltaTime);
    updateHud();
    updateAudio(deltaTime, elapsedTime);
    return;
  }

  state.survival += deltaTime;
  const drain = 1.9 + state.survival * 0.022 + state.rainStrength * 0.9;
  state.heat -= drain * deltaTime;
  const input = readInput();
  const wantsDash = keys.has("ShiftLeft") || keys.has("ShiftRight");
  const dashTriggered =
    (state.dashQueued || (wantsDash && !state.dashHeld)) &&
    input.lengthSq() > 0 &&
    state.dashEnergy >= 0.45;
  state.dashHeld = wantsDash;

  if (dashTriggered) {
    resumeAudio();
    state.dashActive = true;
    state.dashTimer = 0.26;
    state.dashEnergy = Math.max(0, state.dashEnergy - 0.45);
    playDashSound();
    spawnDashImpact(player.position);
    state.dashQueued = false;
  } else if (!wantsDash) {
    state.dashQueued = false;
  }

  if (state.dashActive) {
    state.dashTimer -= deltaTime;
    if (state.dashTimer <= 0) {
      state.dashActive = false;
      state.dashTimer = 0;
    }
  } else {
    state.dashEnergy = THREE.MathUtils.clamp(state.dashEnergy + 0.16 * deltaTime, 0, 1);
  }

  previousPlayerXZ.set(player.position.x, 0, player.position.z);
  if (input.lengthSq() > 0) {
    input.normalize();
    const dashBonus = state.dashActive ? 13.5 : 0;
    const moveSpeed = (7.4 + dashBonus + state.speedBoost) * state.slowFactor;
    moveDirection.lerp(input, 1 - Math.exp(-deltaTime * 12)).normalize();
    player.position.addScaledVector(input, moveSpeed * deltaTime);
    player.rotation.y = Math.atan2(moveDirection.x, moveDirection.z);
  }
  if (state.windStrength > 0.03 && player.position.y < 1.2) {
    player.position.addScaledVector(windDirectionVector, (1.45 + state.rainStrength * 0.35) * state.windStrength * deltaTime);
  }

  state.jumpSpeed -= gravity * deltaTime;
  player.position.y = Math.max(0, player.position.y + state.jumpSpeed * deltaTime);
  if (player.position.y === 0) {
    state.jumpSpeed = 0;
    state.isGrounded = true;
  }

  const distanceFromCenter = player.position.length();
  if (distanceFromCenter > worldRadius - 2) {
    player.position.multiplyScalar((worldRadius - 2) / distanceFromCenter);
  }

  handleHazards(deltaTime, elapsedTime);

  woods.forEach((pickup) => {
    if (pickup.active && pickup.mesh.position.distanceTo(player.position) < 1.8) {
      collectWood();
      pickup.active = false;
      pickup.life = 0;
      pickup.mesh.visible = false;
    }
  });

  if (state.heat <= 0) {
    state.heat = 0;
    endGame();
  } else if (state.heat < 7) {
    setStatus("РџР»Р°РјСЏ РїРѕС‡С‚Рё РїРѕРіР°СЃР»Рѕ. РЎСЂРѕС‡РЅРѕ РёС‰Рё Р±Р»РёР¶Р°Р№С€РµРµ РїРѕР»РµРЅРѕ.");
  }

  animatePlayer(elapsedTime);
  updateWoods(elapsedTime);
  updateCamera(deltaTime);
  updateHud();
  updateAudio(deltaTime, elapsedTime);
}

function render() {
  const deltaTime = Math.min(clock.getDelta(), 0.05);
  const elapsedTime = clock.elapsedTime;
  updateGame(deltaTime, elapsedTime);
  renderer.render(scene, camera);
  requestAnimationFrame(render);
}

window.addEventListener("resize", () => {
  updateMobileViewportState();
  resize();
});
window.addEventListener("orientationchange", () => {
  updateMobileViewportState();
  setTimeout(resize, 60);
});
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", () => {
    updateMobileViewportState();
    resize();
  });
}
document.addEventListener("fullscreenchange", () => {
  fullscreenHud.classList.toggle("active", document.fullscreenElement === viewportEl);
  updateFullscreenButton();
  updateMobileViewportState();
  resize();
});

document.addEventListener("keydown", (event) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) {
    event.preventDefault();
  }

  if (!state.started && ["Enter", "Space"].includes(event.code)) {
    beginGame();
    return;
  }

  if ((event.code === "ShiftLeft" || event.code === "ShiftRight") && !event.repeat) {
    state.dashQueued = true;
  }

  keys.add(event.code);

  if (event.code === "Space") {
    tryJump();
  }

  if (event.code === "KeyR") {
    resetGame();
  }
});

document.addEventListener("keyup", (event) => {
  keys.delete(event.code);
});

function updateMobileJoystick(dx = 0, dy = 0) {
  mobileMoveInput.set(dx, dy);
  if (mobileJoystickThumbEl) {
    mobileJoystickThumbEl.style.transform = `translate(calc(-50% + ${dx * 28}px), calc(-50% + ${-dy * 28}px))`;
  }
}

if (mobileJoystickEl) {
  const releaseJoystick = () => updateMobileJoystick(0, 0);

  mobileJoystickEl.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    resumeAudio();
    mobileJoystickEl.setPointerCapture(event.pointerId);
  });

  mobileJoystickEl.addEventListener("pointermove", (event) => {
    if (!(event.buttons & 1)) {
      return;
    }
    const rect = mobileJoystickEl.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const radius = rect.width * 0.34;
    let dx = (event.clientX - centerX) / radius;
    let dy = (event.clientY - centerY) / radius;
    const length = Math.hypot(dx, dy);
    if (length > 1) {
      dx /= length;
      dy /= length;
    }
    updateMobileJoystick(dx, -dy);
  });

  mobileJoystickEl.addEventListener("pointerup", releaseJoystick);
  mobileJoystickEl.addEventListener("pointercancel", releaseJoystick);
  mobileJoystickEl.addEventListener("lostpointercapture", releaseJoystick);
}

mobileKeyButtons.forEach((button) => {
  const code = button.dataset.key;
  if (!code) {
    return;
  }

  const press = (event) => {
    event.preventDefault();
    resumeAudio();
    if (!state.started && (code === "ArrowUp" || code === "ArrowDown" || code === "ArrowLeft" || code === "ArrowRight")) {
      return;
    }
    setVirtualKey(code, true);
  };

  const release = (event) => {
    event.preventDefault();
    setVirtualKey(code, false);
  };

  button.addEventListener("pointerdown", press);
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("pointerleave", release);
});

restartButton.addEventListener("click", resetGame);
fullscreenButton.addEventListener("click", toggleFullscreen);
if (startGameButton) {
  startGameButton.addEventListener("click", beginGame);
}
if (restartFromGameOverButton) {
  restartFromGameOverButton.addEventListener("click", () => resetGame(true));
}

const standaloneMediaQuery = window.matchMedia("(display-mode: standalone)");

updateStandaloneState();
if (typeof standaloneMediaQuery.addEventListener === "function") {
  standaloneMediaQuery.addEventListener("change", updateStandaloneState);
} else if (typeof standaloneMediaQuery.addListener === "function") {
  standaloneMediaQuery.addListener(updateStandaloneState);
}
window.addEventListener("appinstalled", updateStandaloneState);
registerServiceWorker();
updateMobileViewportState();
resize();
fullscreenHud.classList.toggle("active", false);
updateFullscreenButton();
resetGame();
render();
