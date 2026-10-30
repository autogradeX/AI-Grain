import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import {
  BOARD,
  buildSample,
  CUP_GROUPS,
  CUP_X,
  cupZ,
  type KernelSpec,
} from "./layout";

/*
 * The landing page's scroll story, drawn with Three.js. Everything is a pure
 * function of `progress` (0–1, from the scroll position) and the clock, so
 * scrolling back plays the story backwards:
 *
 *   0.00–0.16  kernels swirl above the board (hero)
 *   0.16–0.36  they fall and settle on the grid board
 *   0.36–0.42  the phone frames the board and takes the photo
 *   0.42–0.60  a scan line passes; each kernel gets a ring: green sound, orange defect
 *   0.62–0.80  defects fly into the cup of their group
 *   0.80–1.00  the camera pulls back for the result
 */

export const STAGES = {
  settle: [0.16, 0.36],
  photo: [0.36, 0.42],
  scan: [0.42, 0.6],
  sort: [0.62, 0.8],
} as const;

/** Ring colours, the same as the demo page: validated on the dark board. */
const SOUND_RING = 0x199e70;
const DEFECT_RING = 0xd95926;
const SCAN = 0x3987e5;
/** Defects warm towards the ring colour while flagged. */
const GLOW = new THREE.Color(DEFECT_RING);

export interface SceneQuality {
  dpr: number;
  shadows: boolean;
  dust: number;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const range = (p: number, [a, b]: readonly [number, number]) =>
  clamp01((p - a) / (b - a));
const smooth = (t: number) => t * t * (3 - 2 * t);
const easeInOut = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

function boardTexture(): THREE.CanvasTexture {
  const px = 48;
  const margin = 40;
  const canvas = document.createElement("canvas");
  canvas.width = BOARD.width * px + margin * 2;
  canvas.height = BOARD.depth * px + margin * 2;
  const g = canvas.getContext("2d")!;
  g.fillStyle = "#121519";
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.strokeStyle = "#2a323b";
  g.lineWidth = 2;
  for (let c = 0; c <= BOARD.width; c++) {
    g.beginPath();
    g.moveTo(margin + c * px, margin);
    g.lineTo(margin + c * px, margin + BOARD.depth * px);
    g.stroke();
  }
  for (let r = 0; r <= BOARD.depth; r++) {
    g.beginPath();
    g.moveTo(margin, margin + r * px);
    g.lineTo(margin + BOARD.width * px, margin + r * px);
    g.stroke();
  }
  g.fillStyle = "#4b5763";
  g.font = "600 20px system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  for (let c = 0; c < BOARD.width; c++)
    g.fillText(
      String.fromCharCode(65 + c),
      margin + (c + 0.5) * px,
      margin / 2,
    );
  for (let r = 0; r < BOARD.depth; r++)
    g.fillText(String(r + 1), margin / 2, margin + (r + 0.5) * px);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** A wheat-like kernel: a spindle with a flatter belly, long axis along x. */
function kernelGeometry(): THREE.BufferGeometry {
  const points: THREE.Vector2[] = [];
  const steps = 18;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    points.push(
      new THREE.Vector2(0.27 * Math.pow(Math.sin(Math.PI * t), 0.75), t - 0.5),
    );
  }
  const geometry = new THREE.LatheGeometry(points, 20);
  geometry.rotateZ(Math.PI / 2);
  geometry.scale(0.85, 0.8, 1);
  geometry.computeVertexNormals();
  return geometry;
}

/** An open cup: a lathe profile with a wall and a floor. */
function cupGeometry(): THREE.BufferGeometry {
  const profile = [
    [0, 0],
    [1.35, 0],
    [1.5, 0.12],
    [1.6, 1.6],
    [1.5, 1.62],
    [1.42, 0.2],
    [0, 0.2],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  return new THREE.LatheGeometry(profile, 48);
}

const dustVertex = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uFade;
  attribute float aSeed;
  varying float vAlpha;
  void main() {
    vec3 p = position;
    float t = uTime * (0.15 + aSeed * 0.2);
    p.x += sin(t + aSeed * 31.0) * 1.6;
    p.y += sin(t * 0.7 + aSeed * 17.0) * 1.2;
    p.z += cos(t * 0.9 + aSeed * 11.0) * 1.6;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (2.0 + aSeed * 5.0) * uPixelRatio * (24.0 / -mv.z);
    vAlpha = uFade * (0.25 + 0.55 * aSeed);
  }
`;

const dustFragment = /* glsl */ `
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d) * vAlpha;
    gl_FragColor = vec4(0.95, 0.78, 0.42, a);
  }
`;

export class GrainScene {
  readonly sample: KernelSpec[] = buildSample();
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(38, 1, 0.1, 400);
  private kernels: THREE.InstancedMesh;
  private rings: THREE.InstancedMesh;
  private scanBar: THREE.Mesh;
  private scanGlow: THREE.Mesh;
  private flash: THREE.Mesh;
  private frame: THREE.LineSegments;
  private cups: THREE.Group;
  private dust: THREE.Points;
  private dustUniforms = {
    uTime: { value: 0 },
    uPixelRatio: { value: 1 },
    uFade: { value: 1 },
  };
  private target = 0;
  private progress = 0;
  private pointer = new THREE.Vector2();
  private pointerSmooth = new THREE.Vector2();
  private clock = new THREE.Clock();
  private frameId = 0;
  private running = false;
  private aspect = 1;
  private disposables: { dispose(): void }[] = [];
  // Scratch objects, reused every frame.
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private c = new THREE.Color();
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();

  constructor(canvas: HTMLCanvasElement, quality: SceneQuality) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(quality.dpr);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = quality.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.dustUniforms.uPixelRatio.value = quality.dpr;

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = env;
    this.scene.environmentIntensity = 0.35;
    this.scene.fog = new THREE.Fog(0x0a0d0b, 60, 140);
    pmrem.dispose();
    this.disposables.push(env);

    this.addLights(quality.shadows);
    this.addBoard();
    this.cups = this.addCups();
    this.kernels = this.addKernels(quality.shadows);
    this.rings = this.addRings();
    [this.scanBar, this.scanGlow] = this.addScan();
    this.flash = this.addFlash();
    this.frame = this.addFrame();
    this.dust = this.addDust(quality.dust);
  }

  private track<T extends { dispose(): void }>(x: T): T {
    this.disposables.push(x);
    return x;
  }

  private addLights(shadows: boolean) {
    this.scene.add(new THREE.HemisphereLight(0xfff1d6, 0x0b0f0c, 0.9));
    const key = new THREE.DirectionalLight(0xffe2b0, 2.2);
    key.position.set(-14, 34, 18);
    if (shadows) {
      key.castShadow = true;
      key.shadow.mapSize.set(2048, 2048);
      const cam = key.shadow.camera;
      cam.left = -24;
      cam.right = 24;
      cam.top = 24;
      cam.bottom = -24;
      cam.near = 1;
      cam.far = 90;
      key.shadow.bias = -0.0004;
      key.shadow.radius = 4;
    }
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x8fc4ff, 0.8);
    rim.position.set(18, 10, -26);
    this.scene.add(rim);
  }

  private addBoard() {
    const top = this.track(
      new THREE.MeshStandardMaterial({
        map: this.track(boardTexture()),
        roughness: 0.92,
        metalness: 0,
      }),
    );
    const side = this.track(
      new THREE.MeshStandardMaterial({ color: 0x0d1013, roughness: 0.8 }),
    );
    // The texture has a 40 px margin around the grid: the board is that much bigger.
    const w = BOARD.width * (1 + 80 / (BOARD.width * 48));
    const d = BOARD.depth * (1 + 80 / (BOARD.depth * 48));
    const board = new THREE.Mesh(this.track(new THREE.BoxGeometry(w, 0.3, d)), [
      side,
      side,
      top,
      side,
      side,
      side,
    ]);
    board.position.y = -0.15;
    board.receiveShadow = true;
    this.scene.add(board);
  }

  private addCups(): THREE.Group {
    const group = new THREE.Group();
    const geometry = this.track(cupGeometry());
    const material = this.track(
      new THREE.MeshPhysicalMaterial({
        color: 0xf1efe8,
        roughness: 0.35,
        clearcoat: 0.6,
        side: THREE.DoubleSide,
      }),
    );
    CUP_GROUPS.forEach((_, i) => {
      const cup = new THREE.Mesh(geometry, material);
      cup.position.set(CUP_X, 0, cupZ(i));
      cup.castShadow = true;
      cup.receiveShadow = true;
      group.add(cup);
    });
    this.scene.add(group);
    return group;
  }

  private addKernels(shadows: boolean): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(
      this.track(kernelGeometry()),
      this.track(
        new THREE.MeshStandardMaterial({ roughness: 0.48, metalness: 0.02 }),
      ),
      this.sample.length,
    );
    mesh.castShadow = shadows;
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.sample.forEach((k, i) => mesh.setColorAt(i, this.c.setHex(k.color)));
    this.scene.add(mesh);
    return mesh;
  }

  private addRings(): THREE.InstancedMesh {
    const geometry = this.track(new THREE.RingGeometry(0.62, 0.76, 48));
    geometry.rotateX(-Math.PI / 2);
    const mesh = new THREE.InstancedMesh(
      geometry,
      this.track(new THREE.MeshBasicMaterial({ toneMapped: false })),
      this.sample.length,
    );
    mesh.frustumCulled = false;
    this.sample.forEach((k, i) =>
      mesh.setColorAt(
        i,
        this.c.setHex(k.kind === "sound" ? SOUND_RING : DEFECT_RING),
      ),
    );
    this.scene.add(mesh);
    return mesh;
  }

  private addScan(): [THREE.Mesh, THREE.Mesh] {
    const bar = new THREE.Mesh(
      this.track(new THREE.PlaneGeometry(BOARD.width + 1.6, 0.14)),
      this.track(
        new THREE.MeshBasicMaterial({
          color: SCAN,
          toneMapped: false,
          transparent: true,
        }),
      ),
    );
    bar.rotation.x = -Math.PI / 2;
    // A soft band trailing the bar: alpha fades away from it.
    const canvas = document.createElement("canvas");
    canvas.width = 4;
    canvas.height = 128;
    const g = canvas.getContext("2d")!;
    const grad = g.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, "rgba(57,135,229,0)");
    grad.addColorStop(1, "rgba(57,135,229,0.55)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 128);
    const glow = new THREE.Mesh(
      this.track(new THREE.PlaneGeometry(BOARD.width + 1.6, 4)),
      this.track(
        new THREE.MeshBasicMaterial({
          map: this.track(new THREE.CanvasTexture(canvas)),
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
        }),
      ),
    );
    glow.rotation.x = -Math.PI / 2;
    this.scene.add(bar, glow);
    return [bar, glow];
  }

  private addFlash(): THREE.Mesh {
    const flash = new THREE.Mesh(
      this.track(new THREE.PlaneGeometry(BOARD.width + 2, BOARD.depth + 2)),
      this.track(
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
        }),
      ),
    );
    flash.rotation.x = -Math.PI / 2;
    flash.position.y = 0.6;
    this.scene.add(flash);
    return flash;
  }

  /** Viewfinder brackets around the board, like the app's camera guide. */
  private addFrame(): THREE.LineSegments {
    const w = BOARD.width / 2 + 1;
    const d = BOARD.depth / 2 + 1;
    const l = 3;
    const pts: number[] = [];
    for (const [sx, sz] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ] as const) {
      const x = sx * w;
      const z = sz * d;
      pts.push(x, 0, z, x - sx * l, 0, z, x, 0, z, x, 0, z - sz * l);
    }
    const geometry = this.track(new THREE.BufferGeometry());
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    const frame = new THREE.LineSegments(
      geometry,
      this.track(
        new THREE.LineBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0,
          toneMapped: false,
        }),
      ),
    );
    this.scene.add(frame);
    return frame;
  }

  private addDust(count: number): THREE.Points {
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    const rand = (a: number, b: number) => a + Math.random() * (b - a);
    for (let i = 0; i < count; i++) {
      const r = rand(4, 46);
      const a = rand(0, Math.PI * 2);
      positions.set([Math.cos(a) * r, rand(-2, 26), Math.sin(a) * r], i * 3);
      seeds[i] = Math.random();
    }
    const geometry = this.track(new THREE.BufferGeometry());
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
    const points = new THREE.Points(
      geometry,
      this.track(
        new THREE.ShaderMaterial({
          uniforms: this.dustUniforms,
          vertexShader: dustVertex,
          fragmentShader: dustFragment,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      ),
    );
    points.frustumCulled = false;
    this.scene.add(points);
    return points;
  }

  /** Where the scroll says the story is; the scene eases towards it. */
  setProgress(p: number) {
    this.target = clamp01(p);
  }

  /** Pointer position, -1 to 1 on both axes, for a little parallax. */
  setPointer(x: number, y: number) {
    this.pointer.set(x, y);
  }

  resize(width: number, height: number) {
    this.aspect = width / Math.max(1, height);
    this.camera.aspect = this.aspect;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.clock.getDelta();
    const loop = () => {
      if (!this.running) return;
      this.frameId = requestAnimationFrame(loop);
      const dt = Math.min(this.clock.getDelta(), 0.05);
      this.progress += (this.target - this.progress) * (1 - Math.exp(-dt * 5));
      this.render(this.progress, this.clock.elapsedTime);
    };
    loop();
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.frameId);
  }

  /** Draws one still frame, for reduced motion. */
  renderStill(p: number) {
    this.progress = this.target = p;
    this.render(p, 0);
  }

  private render(p: number, time: number) {
    this.updateKernels(p, time);
    this.updateEffects(p, time);
    this.updateCamera(p, time);
    this.renderer.render(this.scene, this.camera);
  }

  private updateKernels(p: number, time: number) {
    const settle = STAGES.settle;
    const sortRange = STAGES.sort;
    const scanZ = this.scanZ(p);
    this.sample.forEach((k, i) => {
      // Swirl position, turning slowly.
      const a = k.orbit.a + time * k.orbit.speed;
      const swirlX = Math.cos(a) * k.orbit.r;
      const swirlZ = Math.sin(a) * k.orbit.r * 0.75;
      const swirlY = k.orbit.y + Math.sin(time * 0.6 + k.delay * 9) * 0.6;

      // Each kernel lands in its own slice of the settle stage.
      const span = settle[1] - settle[0];
      const t = smooth(
        clamp01((p - settle[0] - k.delay * span * 0.55) / (span * 0.45)),
      );
      let x = swirlX + (k.boardX - swirlX) * t;
      let z = swirlZ + (k.boardZ - swirlZ) * t;
      let y = swirlY + (0.2 - swirlY) * t + Math.sin(Math.PI * t) * 2.5;

      // Tumbling in the air, lying still on the board.
      const tumble = 1 - t;
      this.e.set(
        (time * 0.9 + k.delay * 6) * tumble,
        k.yaw + (time * 0.5 + k.delay * 4) * tumble,
        (time * 0.7 + k.delay * 3) * tumble,
      );

      // Scanned defects glow, then fly to their cup.
      let glow = 0;
      if (k.cup >= 0) {
        glow =
          smooth(clamp01((scanZ - k.boardZ) / 1.5)) * (1 - range(p, sortRange));
        const sSpan = sortRange[1] - sortRange[0];
        const s = easeInOut(
          clamp01((p - sortRange[0] - k.delay * sSpan * 0.5) / (sSpan * 0.5)),
        );
        if (s > 0) {
          const cx = CUP_X + k.cupX;
          const cz = cupZ(k.cup) + k.cupZ;
          x += (cx - x) * s;
          z += (cz - z) * s;
          y += (k.cupY - y) * s + Math.sin(Math.PI * s) * 7;
          this.e.x += Math.sin(Math.PI * s) * 4;
        }
      }

      this.q.setFromEuler(this.e);
      this.s.set(k.scale[0], k.scale[1], k.scale[2]).multiplyScalar(1.05);
      this.m.compose(this.v.set(x, y, z), this.q, this.s);
      this.kernels.setMatrixAt(i, this.m);
      this.c.setHex(k.color);
      if (glow > 0) this.c.lerp(GLOW, glow * 0.45);
      this.kernels.setColorAt(i, this.c);
    });
    this.kernels.instanceMatrix.needsUpdate = true;
    if (this.kernels.instanceColor)
      this.kernels.instanceColor.needsUpdate = true;
  }

  /** Where the scan line is along the board; past the end once the scan is over. */
  private scanZ(p: number) {
    const t = range(p, STAGES.scan);
    return -BOARD.depth / 2 - 1 + t * (BOARD.depth + 2);
  }

  private updateEffects(p: number, time: number) {
    const scanT = range(p, STAGES.scan);
    const scanZ = this.scanZ(p);
    const scanning = scanT > 0 && scanT < 1;
    this.scanBar.visible = this.scanGlow.visible = scanning;
    this.scanBar.position.set(0, 0.25, scanZ);
    this.scanGlow.position.set(0, 0.24, scanZ - 2);

    // Rings appear as the scan line passes; defect rings leave with the kernel.
    const sortT = range(p, STAGES.sort);
    this.sample.forEach((k, i) => {
      let size = smooth(clamp01((scanZ - k.boardZ) / 1.2));
      if (k.cup >= 0) {
        size *= 1 - smooth(clamp01(sortT * 2 - k.delay));
        size *= 1 + Math.sin(time * 4 + k.delay * 10) * 0.06;
      }
      const sx = k.scale[0] * 0.95 + 0.25;
      this.s.set(size * sx, 1, size * sx);
      this.q.setFromAxisAngle(this.v.set(0, 1, 0), k.yaw);
      this.m.compose(this.v.set(k.boardX, 0.03, k.boardZ), this.q, this.s);
      this.rings.setMatrixAt(i, this.m);
    });
    this.rings.instanceMatrix.needsUpdate = true;

    // The photo: viewfinder brackets close in, then a flash.
    const photoT = range(p, STAGES.photo);
    const frameMat = this.frame.material as THREE.LineBasicMaterial;
    frameMat.opacity = Math.sin(Math.PI * clamp01((p - 0.33) / 0.12)) * 0.9;
    this.frame.position.y = 0.05;
    this.frame.scale.setScalar(1.25 - 0.25 * smooth(photoT));
    (this.flash.material as THREE.MeshBasicMaterial).opacity =
      Math.max(0, 1 - Math.abs(photoT - 0.85) / 0.15) * 0.55;

    // Cups rise into view for the sort.
    const cupT = smooth(clamp01((p - 0.56) / 0.08));
    this.cups.visible = cupT > 0.001;
    this.cups.children.forEach((cup, i) => {
      const local = smooth(clamp01(cupT * 1.6 - i * 0.15));
      cup.position.y = -2 + 2 * local;
      cup.scale.setScalar(Math.max(0.001, local));
    });

    this.dustUniforms.uTime.value = time;
    this.dustUniforms.uFade.value = 1 - 0.6 * smooth(range(p, STAGES.settle));
  }

  private updateCamera(p: number, time: number) {
    // Keyframes: [progress, camera position, look-at point, sideways shift].
    // The shift moves the board clear of the captions on wide screens:
    // negative puts it right of the caption, positive left of the result card.
    const keys: [
      number,
      [number, number, number],
      [number, number, number],
      number,
    ][] = [
      [0.0, [0, 15, 40], [0, 7, 0], 0],
      [0.14, [0, 17, 36], [0, 5, 0], 0],
      [0.34, [0, 38, 24], [0, 0, 1], -8],
      [0.44, [0, 50, 4], [0, 0, 0.5], -9],
      [0.6, [0, 46, 12], [0, 0, 0.5], -9],
      [0.72, [10, 36, 30], [6, 0, 0], -4],
      [1.0, [6, 46, 40], [4, 0, 0], 10],
    ];
    let i = 0;
    while (i < keys.length - 2 && p > keys[i + 1]![0]) i++;
    const [p0, pos0, look0, shift0] = keys[i]!;
    const [p1, pos1, look1, shift1] = keys[i + 1]!;
    const t = easeInOut(clamp01((p - p0) / (p1 - p0)));
    this.camPos.set(...pos0).lerp(this.v.set(...pos1), t);
    this.camLook.set(...look0).lerp(this.v.set(...look1), t);
    const wide = clamp01((this.aspect - 1.1) / 0.5);
    const shift = (shift0 + (shift1 - shift0) * t) * wide;
    this.camPos.x += shift;
    this.camLook.x += shift;
    // Portrait screens show captions and the result card at the bottom:
    // aim lower on the board so it sits in the upper part of the screen.
    const portrait = clamp01((1 - this.aspect) / 0.4);
    const lift =
      portrait *
      (8 * smooth(clamp01((p - 0.12) / 0.2)) +
        10 * smooth(clamp01((p - 0.8) / 0.12)));
    this.camPos.z += lift;
    this.camLook.z += lift;

    // Portrait screens need more distance to fit the board and cups.
    const fit = this.aspect < 1 ? Math.min(2.1, 1 / this.aspect) * 0.95 : 1;
    this.camPos.sub(this.camLook).multiplyScalar(fit).add(this.camLook);

    // Pointer parallax and a slow drift.
    this.pointerSmooth.lerp(this.pointer, 0.05);
    this.camPos.x += this.pointerSmooth.x * 2.2 + Math.sin(time * 0.2) * 0.6;
    this.camPos.y += this.pointerSmooth.y * 1.2;
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
  }

  dispose() {
    this.stop();
    for (const d of this.disposables) d.dispose();
    this.kernels.dispose();
    this.rings.dispose();
    this.renderer.dispose();
  }
}
