// Experimental retained GPU world. Three.js is loaded only for renderer=three.
let threeWorld = null;
const threeWorldColors = new Map();
const THREE_WORLD_STRIDE = 23;

// Fixed-pixel details are rasterized once at DPR 2, then rendered as GPU
// billboards. Keeping Canvas's own roundRect/shadow kernel avoids approximating
// the original sign corners and signal glow in every frame.
function createThreeWorldSpriteAtlas(pixelRatio) {
  const surface = document.createElement("canvas");
  surface.width = 512; surface.height = 256;
  const painter = surface.getContext("2d");
  painter.scale(2, 2);
  for (let tile = 0; tile < 4; tile++) {
    painter.save(); painter.translate(tile * 64 + 32, 32);
    paintRouteMarker(painter, 0, 0, tile === 0 ? "sign" : "signal",
      ["#ffd786", "#ff6a62", "#ffd85f", "#7dff8e"][tile], 2 / pixelRatio);
    painter.restore();
  }
  // Tile 4 contains an ellipse centered at (32,96). Its geometry applies the
  // original size-dependent screen offset while sharing these texels.
  paintTreeShadow(painter, 18, 91, 20);
  const texture = new THREE.CanvasTexture(surface);
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  return texture;
}

function loadThreeWorldLibrary() {
  if (window.THREE) return Promise.resolve(true);
  return new Promise(resolve => {
    const script = document.createElement("script");
    script.dataset.optional = "true";
    script.src = "three.min.js?v=three-world-1";
    script.onload = () => resolve(!!window.THREE);
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
}

function threeWorldColor(style) {
  if (Array.isArray(style)) return style;
  let color = threeWorldColors.get(style);
  if (!color) {
    // r128 accepts comma-separated HSL; the app's CSS colors use spaces.
    const normalized = style.replace(/hsl\(([-\d.]+) ([-\d.]+)% ([-\d.]+)%\)/, "hsl($1,$2%,$3%)");
    const value = new THREE.Color(normalized);
    color = [value.r, value.g, value.b, 1];
    threeWorldColors.set(style, color);
  }
  return color;
}

class ThreeWorldGeometry {
  constructor(capacity = 0) {
    this.data = capacity ? new Float32Array(capacity * THREE_WORLD_STRIDE) : [];
    this.cursor = 0;
    this.layer = 0.1;
    this.anchor = { x: 0, y: 0, elevation: 0 };
    this.fade = 0;
    this.side = 0;
    this.lineWidth = 0;
    this.minPixels = 0;
    this.other = this.anchor;
    this.pixelX = 0;
    this.pixelY = 0;
    this.pixelScale = 0;
    this.normalX = 0;
    this.normalY = 0;
    this.bounds = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  }

  vertex(point, color) {
    const data = this.data;
    let i = this.cursor;
    data[i++] = point.x; data[i++] = point.y; data[i++] = point.elevation;
    data[i++] = color[0]; data[i++] = color[1]; data[i++] = color[2]; data[i++] = color[3];
    data[i++] = this.other.x; data[i++] = this.other.y; data[i++] = this.other.elevation;
    data[i++] = this.side; data[i++] = this.lineWidth; data[i++] = this.minPixels;
    data[i++] = this.pixelX; data[i++] = this.pixelY; data[i++] = this.pixelScale;
    data[i++] = this.anchor.x; data[i++] = this.anchor.y; data[i++] = this.anchor.elevation;
    data[i++] = this.fade; data[i++] = this.layer;
    data[i++] = this.normalX; data[i++] = this.normalY;
    this.cursor = i;
    const b = this.bounds;
    b[0] = Math.min(b[0], point.x); b[1] = Math.min(b[1], point.y); b[2] = Math.min(b[2], point.elevation);
    b[3] = Math.max(b[3], point.x); b[4] = Math.max(b[4], point.y); b[5] = Math.max(b[5], point.elevation);
  }

  polygon(points, style, concave = false) {
    const color = threeWorldColor(style);
    if (concave) {
      // The view axes never rotate. Triangulate in projected space once so
      // curved/sloped stop ribbons cover the same silhouette as Canvas fill.
      const origin = { x: 0, y: 0, elevation: 0 };
      const contour = points.map(point => {
        const p = worldToScreen(point, origin, 1, 0, 0);
        return new THREE.Vector2(p.x, p.y);
      });
      for (const triangle of THREE.ShapeUtils.triangulateShape(contour, [])) {
        for (const i of triangle) this.vertex(points[i], color);
      }
      return;
    }
    for (let i = 1; i < points.length - 1; i++) {
      this.vertex(points[0], color); this.vertex(points[i], color); this.vertex(points[i + 1], color);
    }
  }

  outline(points, style, width = 0.6) {
    // A tiny depth bias prevents edge z-fighting without pulling hidden edges
    // through the body. Face normals below reject the original invisible sides.
    const layer = this.layer;
    this.layer -= 0.0000005;
    for (let i = 0; i < points.length; i++) this.line(points[i], points[(i+1)%points.length], style, 0, width);
    this.layer = layer;
  }

  line(a, b, style, worldWidth, minPixels = 1) {
    const color = threeWorldColor(style);
    this.lineWidth = worldWidth; this.minPixels = minPixels;
    for (const [point, other, side] of [[a, b, 1], [b, a, -1], [b, a, 1],
      [a, b, 1], [b, a, 1], [a, b, -1]]) {
      this.other = other; this.side = side; this.vertex(point, color);
    }
    this.side = 0;
    this.other = this.anchor;
  }

  billboard(center, offsets, style, worldScale = false) {
    const color = threeWorldColor(style);
    this.pixelScale = worldScale ? 1 : 0;
    for (let i = 1; i < offsets.length - 1; i++) {
      for (const point of [offsets[0], offsets[i], offsets[i + 1]]) {
        this.pixelX = point[0]; this.pixelY = point[1]; this.vertex(center, color);
      }
    }
    this.pixelX = 0; this.pixelY = 0; this.pixelScale = 0;
  }

  circle(center, radius, style, worldScale = false) {
    const offsets = [];
    for (let i = 0; i < 14; i++) offsets.push([Math.cos(i / 14 * Math.PI * 2) * radius, Math.sin(i / 14 * Math.PI * 2) * radius]);
    this.billboard(center, offsets, style, worldScale);
  }

  sprite(center, tile, size = 1, offsetX = 0, offsetY = 0, worldScale = false) {
    const corners = [[-32,-32], [32,-32], [32,32], [-32,32]];
    this.pixelScale = worldScale ? 1 : 0;
    for (const i of [0,1,2,0,2,3]) {
      const [x, y] = corners[i];
      this.pixelX = x * size + offsetX; this.pixelY = y * size + offsetY;
      // lineInfo's two width fields double as atlas UVs for sprite vertices.
      this.side = 2; this.lineWidth = ((tile % 4) * 64 + x + 32) / 256;
      this.minPixels = 1 - (Math.floor(tile / 4) * 64 + y + 32) / 128;
      this.vertex(center, [1,1,1,1]);
    }
    this.pixelX = 0; this.pixelY = 0; this.pixelScale = 0;
    this.side = 0; this.lineWidth = 0; this.minPixels = 0;
  }

  treeShadow(point, size) {
    this.sprite(point, 4, size / 20, size * 0.7, size * 0.25, true);
  }

  box(center, length, width, height, heading, colors, dynamicFacing = false) {
    const fx = Math.cos(heading), fy = Math.sin(heading);
    const bottom = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => ({
      x: center.x + fx * a * length * 0.5 - fy * b * width * 0.5,
      y: center.y + fy * a * length * 0.5 + fx * b * width * 0.5, elevation: center.elevation }));
    const top = bottom.map(point => ({ ...point, elevation: point.elevation + height }));
    for (let i = 0; i < 4; i++) {
      const next = (i + 1) % 4;
      const dx = bottom[next].x-bottom[i].x, dy = bottom[next].y-bottom[i].y;
      // The isometric camera axes are fixed. Static boxes never need their
      // hidden sides; vehicles retain all faces for heading/derail transforms.
      if (!dynamicFacing && dy - dx <= 0) continue;
      const magnitude = Math.hypot(dx,dy);
      this.normalX = dy/magnitude; this.normalY = -dx/magnitude;
      const points = [bottom[i], bottom[next], top[next], top[i]];
      this.polygon(points, colors[i % 2 ? 2 : 1]);
      const fade = this.fade;
      if (fade === 2) this.fade = 0;
      this.outline(points, [20/255,35/255,27/255,0.2]);
      this.fade = fade;
    }
    this.normalX = 0; this.normalY = 0;
    const fade = this.fade;
    if (fade === 2) this.fade = 0; // Warning changes the locomotive sides only.
    this.polygon(top, colors[0]);
    this.outline(top, [1,1,1,0.3]);
    this.fade = fade;
  }

  geometry(dynamic = false) {
    const values = Array.isArray(this.data) ? new Float32Array(this.data) : this.data;
    const data = new THREE.InterleavedBuffer(values, THREE_WORLD_STRIDE);
    if (dynamic) data.setUsage(THREE.DynamicDrawUsage);
    const geometry = new THREE.BufferGeometry();
    for (const [name, size, offset] of [["position", 3, 0], ["tint", 4, 3], ["lineOther", 3, 7],
      ["lineInfo", 3, 10], ["pixelOffset", 2, 13], ["pixelScale", 1, 15], ["propAnchor", 3, 16],
      ["fadeable", 1, 19], ["layerDepth", 1, 20], ["faceNormal", 2, 21]]) {
      geometry.setAttribute(name, new THREE.InterleavedBufferAttribute(data, size, offset));
    }
    geometry.setDrawRange(0, this.cursor / THREE_WORLD_STRIDE);
    geometry.userData.buffer = data;
    geometry.userData.bytes = values.byteLength;
    geometry.userData.bounds = this.bounds;
    return geometry;
  }
}

class ThreeWorldRenderer {
  constructor(terrain) {
    this.terrain = terrain;
    this.renderer = new THREE.WebGLRenderer({ canvas: terrain.canvas, context: terrain.gl,
      antialias: true, alpha: false, stencil: false });
    this.renderer.autoClear = false;
    this.renderer.outputEncoding = THREE.LinearEncoding;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.scene = new THREE.Scene();
    this.camera = new THREE.Camera();
    this.uniforms = { viewOrigin: { value: new THREE.Vector3() }, viewportSize: { value: new THREE.Vector2() },
      zoomScale: { value: 1 }, anchorY: { value: 0 }, trainBounds: { value: new THREE.Vector4() }, warning: { value: 0 },
      spriteAtlas: { value: createThreeWorldSpriteAtlas(1) } };
    this.atlasPixelRatio = 1;
    const vertexShader = `
      attribute vec4 tint;
      attribute vec3 lineOther;
      attribute vec3 lineInfo;
      attribute vec2 pixelOffset;
      attribute float pixelScale;
      attribute vec3 propAnchor;
      attribute float fadeable;
      attribute float layerDepth;
      attribute vec2 faceNormal;
      uniform vec3 viewOrigin;
      uniform vec2 viewportSize;
      uniform float zoomScale;
      uniform float anchorY;
      uniform vec4 trainBounds;
      uniform float warning;
      varying vec4 vertexTint;
      varying vec2 spriteUv;
      varying float isSprite;
      vec2 project(vec3 point) {
        vec3 d = point - viewOrigin;
        return vec2(viewportSize.x * 0.5 + (d.x-d.y) * 0.7071067811865476 * zoomScale,
          anchorY + ((d.x+d.y) * 0.4082482904638631 - d.z * 0.816496580927726) * zoomScale);
      }
      void main() {
        vec3 point = (modelMatrix * vec4(position, 1.0)).xyz;
        vec2 screen = project(point);
        if (abs(lineInfo.x) == 1.0) {
          vec2 direction = project((modelMatrix * vec4(lineOther, 1.0)).xyz) - screen;
          float segmentLength = max(length(direction), 0.00001);
          screen += vec2(-direction.y, direction.x) / segmentLength * lineInfo.x
            * max(lineInfo.y * zoomScale, lineInfo.z) * 0.5;
        }
        screen += pixelOffset * mix(1.0, zoomScale, pixelScale);
        vertexTint = tint;
        vec2 normal = (modelMatrix * vec4(faceNormal, 0.0, 0.0)).xy;
        if (normal.x + normal.y < -0.00001) vertexTint.a = 0.0;
        isSprite = lineInfo.x == 2.0 ? 1.0 : 0.0;
        spriteUv = lineInfo.yz;
        if (fadeable > 1.5) vertexTint.rgb = mix(tint.rgb, vec3(1.0, 0.60784, 0.42745), warning);
        if (fadeable > 0.5 && fadeable < 1.5) {
          vec2 base = project(propAnchor);
          if (base.x > trainBounds.x && base.x < trainBounds.z && base.y > trainBounds.y && base.y-100.0 < trainBounds.w)
            vertexTint.a *= 0.35;
        }
        float depth = layerDepth - ((point.x-viewOrigin.x) + (point.y-viewOrigin.y) + point.z) * 0.00001;
        gl_Position = vec4(screen.x * 2.0 / viewportSize.x - 1.0, 1.0-screen.y * 2.0 / viewportSize.y, depth, 1.0);
      }`;
    const fragmentShader = `uniform sampler2D spriteAtlas;
      varying vec4 vertexTint; varying vec2 spriteUv; varying float isSprite;
      void main() {
        vec4 color = vertexTint;
        if (isSprite > 0.5) color *= texture2D(spriteAtlas, spriteUv);
        if (color.a < 0.001) discard;
        gl_FragColor = color;
      }`;
    const material = (transparent, depthWrite) => new THREE.ShaderMaterial({ uniforms: this.uniforms,
      vertexShader, fragmentShader, side: THREE.DoubleSide, transparent, depthWrite, depthTest: true });
    this.opaque = material(true, true);
    this.transparent = material(true, true);
    this.overlay = material(true, false);
    this.staticMeshes = [];
    this.trainMeshes = [];
    this.markerMeshes = [];
    this.routeData = null;
    this.markerKey = null;
    this.lastViewKey = null;
    this.ownsContext = true;
    this.drawCalls = 0;
    this.size = new THREE.Vector2();
    terrain.canvas.addEventListener("webglcontextrestored", () => {
      this.lastViewKey = null;
      this.ownsContext = true;
      if (terrainRendererRequested === "three") {
        terrainRendererActive = "three";
        terrainSurface.hidden = false;
      }
    });
  }

  resetRoute(nextRoute) {
    for (const mesh of [...this.scene.children]) { mesh.geometry.dispose(); this.scene.remove(mesh); }
    this.renderer.renderLists.dispose();
    this.staticMeshes = []; this.trainMeshes = []; this.markerMeshes = [];
    this.routeData = nextRoute; this.built = false; this.markerKey = null; this.lastViewKey = null;
    threeWorldColors.clear();
  }

  mesh(builder, material, bounded = false) {
    const mesh = new THREE.Mesh(builder.geometry(), material);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    if (bounded) this.staticMeshes.push(mesh);
    return mesh;
  }

  buildRoute() {
    const track = new Map(), props = new Map();
    const batch = (map, distance) => {
      const key = Math.floor(distance / 512);
      if (!map.has(key)) map.set(key, new ThreeWorldGeometry());
      return map.get(key);
    };
    const step = TUNING.visuals.trackSampleStep;
    for (let distance = -TRAIN_TOTAL_LENGTH - 60; distance < route.totalLength; distance += step) {
      const builder = batch(track, distance), end = Math.min(distance + step, route.totalLength);
      builder.layer = 0.55;
      for (const [halfWidth, color] of [[11, "#b6aa86"], [5, "#68695e"]]) {
        builder.polygon([offsetRoutePoint(distance, -halfWidth), offsetRoutePoint(end, -halfWidth),
          offsetRoutePoint(end, halfWidth), offsetRoutePoint(distance, halfWidth)], color);
        builder.layer -= 0.001;
      }
      builder.layer = 0.54;
      if (Math.round(distance / step) % 2 === 0) builder.line(offsetRoutePoint(distance, -3.5, 0.2), offsetRoutePoint(distance, 3.5, 0.2), "#c4ab80", 1.6, 1);
      builder.layer = 0.53;
      for (const side of [-1, 1]) builder.line(offsetRoutePoint(distance, side * TRACK_WIDTH * 0.5, 0.45),
        offsetRoutePoint(end, side * TRACK_WIDTH * 0.5, 0.45), "#d5e0dc", 0.65, 1);
    }
    for (const item of route.scenery) {
      const builder = batch(props, item.distance), point = getSceneryPoint(item);
      builder.anchor = point; builder.fade = 1;
      const { size } = getSceneryBounds(item);
      if (["tree", "bush", "cactus", "stump"].includes(item.kind)) {
        const radius = ["bush", "stump"].includes(item.kind) ? size * 0.4 : size;
        builder.treeShadow(point, radius);
        builder.box(point, 2, 2, radius * 1.1, 0, ["#8b7554", "#735c40", "#574835"]);
        for (let layer = 0; layer < 3; layer++) {
          const r = radius * (1 - layer * 0.2), elevation = point.elevation + radius * (0.6 + layer * 0.65);
          const a = { x: point.x-r, y: point.y, elevation }, b = { x: point.x, y: point.y+r, elevation };
          const c = { x: point.x+r, y: point.y, elevation }, d = { x: point.x, y: point.y-r, elevation };
          const top = { ...point, elevation: elevation + radius * 1.5 };
          builder.polygon([a, d, top], item.tint > 0 ? "#5b8751" : "#4b794b");
          builder.polygon([a, b, top], item.tint > 0 ? "#436d40" : "#365f40");
          builder.polygon([b, c, top], item.tint > 0 ? "#315635" : "#284e37");
        }
      } else if (item.kind === "pond") {
        const points = [];
        for (let i = 0; i < 14; i++) points.push({ x: point.x + Math.cos(i / 14 * Math.PI * 2) * size * 2,
          y: point.y + Math.sin(i / 14 * Math.PI * 2) * size * 1.3, elevation: point.elevation + 0.2 });
        builder.polygon(points, "#61999a");
        builder.outline(points, "#a6bb9a");
      } else if (["rock", "ruins", "hayBale"].includes(item.kind)) {
        builder.box(point, size * 1.5, size, size * 0.75, item.rotation,
          item.kind === "hayBale" ? ["#d6bd76", "#b69b54", "#988044"] : ["#a6aaa0", "#838c85", "#69776e"]);
      } else {
        builder.box(point, size * 2.4, size * 1.7, size * 1.4, item.rotation, ["#9a6350", "#d1b38a", "#b59171"]);
        builder.box({ ...point, elevation: point.elevation + size * 1.4 }, size * 2.7, size * 1.95, 1.6,
          item.rotation, ["#725346", "#5e473e", "#503f36"]);
      }
    }
    for (const builder of track.values()) this.mesh(builder, this.opaque, true);
    for (const builder of props.values()) this.mesh(builder, this.transparent, true);
    for (const unit of TRAIN_CONSIST) this.buildVehicle(unit);
    this.dynamic = new ThreeWorldGeometry(Math.max(1024, (TRAIN_CONSIST.length - 1) * 6 + 20 * 36));
    this.dynamicMesh = new THREE.Mesh(this.dynamic.geometry(true), this.overlay);
    this.dynamicMesh.frustumCulled = false;
    this.scene.add(this.dynamicMesh);
    this.built = true;
  }

  buildVehicle(unit) {
    const b = new ThreeWorldGeometry(), zero = { x: 0, y: 0, elevation: 0 };
    const bodyHeight = TUNING.train.bodyHeight;
    b.box({ ...zero, elevation: -0.6 }, unit.length * 0.86, unit.width + 1.8, 1, 0, ["#3d4d47", "#293b34", "#1e302a"], true);
    b.fade = unit.type === "locomotive" ? 2 : 0;
    b.box(zero, unit.length, unit.width + 1, bodyHeight, 0, [unit.roofColor, unit.bodyColor, unit.bodyColor], true);
    b.fade = 0;
    if (unit.type === "locomotive") {
      b.box({ x: unit.length * 0.2, y: 0, elevation: bodyHeight }, unit.length * 0.28, unit.width * 0.9, 2.4,
        0, ["#d3ddd1", "#476878", "#36545d"], true);
      b.circle({ x: unit.length * 0.5, y: 0, elevation: bodyHeight * 0.45 }, 2.5, "#fff1a5");
    } else {
      for (const side of [-1, 1]) {
        for (let i = 0; i < 5; i++) {
          const along = (i / 4 - 0.5) * unit.length * 0.7, y = side * (unit.width + 1) * 0.505;
          b.polygon([{ x: along-1.6, y, elevation: bodyHeight * 0.45 }, { x: along+1.6, y, elevation: bodyHeight * 0.45 },
            { x: along+1.6, y, elevation: bodyHeight * 0.8 }, { x: along-1.6, y, elevation: bodyHeight * 0.8 }], "#3e5e63");
        }
      }
      b.box({ ...zero, elevation: bodyHeight }, unit.length * 0.84, unit.width * 0.72, 0.65, 0, [unit.roofColor, "#748680", "#536963"], true);
    }
    const mesh = this.mesh(b, this.opaque);
    mesh.matrixAutoUpdate = false;
    this.trainMeshes.push(mesh);
  }

  buildMarkers() {
    for (const mesh of this.markerMeshes) { mesh.geometry.dispose(); this.scene.remove(mesh); }
    const b = new ThreeWorldGeometry(), zones = new ThreeWorldGeometry();
    zones.layer = 0.49;
    const zone = (start, end, style) => {
      const points = [];
      for (let d = start; d < end; d += 10) points.push(offsetRoutePoint(d, -7, 0.7));
      points.push(offsetRoutePoint(end, -7, 0.7));
      for (let d = end; d > start; d -= 10) points.push(offsetRoutePoint(d, 7, 0.7));
      points.push(offsetRoutePoint(start, 7, 0.7));
      zones.polygon(points, style, true);
    };
    for (let i = 0; i < route.stations.length; i++) {
      const station = route.stations[i], metrics = getStationStopMetrics(station), point = evaluateRoute(station.distance);
      zone(metrics.targetDistance - metrics.tolerance, metrics.targetDistance + metrics.tolerance,
        [113/255, 245/255, 171/255, i === state.stationIndex ? 0.36 : 0.15]);
      zones.line(offsetRoutePoint(metrics.targetDistance, -10, 0.8), offsetRoutePoint(metrics.targetDistance, 10, 0.8), "#e1ffbc", 0, 2);
      for (const side of [-1, 1]) {
        b.box(offsetRoutePoint(station.distance, side * 13), metrics.zoneLength, 10, 2, point.heading,
          [i === state.stationIndex ? "#dae0c8" : "#bbc6b2", "#8b998a", "#6e8075"]);
        b.line(offsetRoutePoint(station.distance - metrics.zoneLength * 0.5, side * 8.5, 2.1),
          offsetRoutePoint(station.distance + metrics.zoneLength * 0.5, side * 8.5, 2.1), "#f2d87e", 0, 2);
      }
      const visual = station.visual || { buildingSide: 1, buildingColor: "#c7b28b", roofColor: "#6c6251" };
      const building = offsetRoutePoint(station.distance - 25, visual.buildingSide * 36);
      b.box(building, 34, 20, 14, point.heading, [visual.roofColor, visual.buildingColor, "#aa9275"]);
      b.box({ ...building, elevation: building.elevation + 14 }, 39, 25, 3, point.heading, [visual.roofColor, "#665b4c", "#514d43"]);
    }
    for (const segment of route.segments) {
      if (segment.speedLimit == null) continue;
      const point = offsetRoutePoint(segment.start + 12, -18), top = { ...point, elevation: point.elevation + 15 };
      b.line(point, top, "#dddeca", 0, 2);
      b.sprite(top, 0);
    }
    for (const signal of route.signals) {
      const point = offsetRoutePoint(signal.distance, signal.side * (TRACK_WIDTH * 0.8 + TUNING.signals.sideOffset));
      const top = { ...point, elevation: point.elevation + 20 }, aspect = getSignalAspect(signal);
      b.line(point, top, "#e1e2cd", 0, 2);
      b.sprite(top, aspect === "red" ? 1 : aspect === "yellow" ? 2 : 3);
      if (aspect === "red") {
        const stop = getRedStopMetrics(signal);
        zone(stop.zoneStart, stop.zoneEnd, [1, 106/255, 98/255, 0.28]);
      }
    }
    this.markerMeshes = [this.mesh(b, this.opaque), this.mesh(zones, this.overlay)];
  }

  prepareRaw() {
    this.renderer.resetState();
    const gl = this.terrain.gl;
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true);
    gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE); gl.disable(gl.SCISSOR_TEST); gl.disable(gl.DITHER);
    this.ownsContext = false;
  }

  draw(frame) {
    if (this.terrain.lost) return false;
    if (this.routeData !== route) this.resetRoute(route);
    if (!this.built) this.buildRoute();
    const markerKey = `${state.stationIndex}|${route.signals.map(getSignalAspect).join(",")}`;
    if (markerKey !== this.markerKey) { this.buildMarkers(); this.markerKey = markerKey; }
    const pixelRatio = Math.round(canvas.width / frame.width * 100) / 100;
    if (pixelRatio !== this.atlasPixelRatio) {
      this.uniforms.spriteAtlas.value.dispose();
      this.uniforms.spriteAtlas.value = createThreeWorldSpriteAtlas(pixelRatio);
      this.atlasPixelRatio = pixelRatio;
      this.lastViewKey = null;
    }
    const { camera, scale, anchorY } = frame.view;
    const warning = state.overspeedTimer > 0.2 || !!state.derailment;
    const key = [canvas.width, canvas.height, camera.x, camera.y, camera.elevation, scale, anchorY,
      frame.biomeBlend.primary, frame.biomeBlend.secondary, frame.biomeBlend.mix, markerKey, warning].join("|");
    this.drawCalls = 0;
    if ((state.speed === 0 || state.finished) && !state.derailment && !state.exhaustPuffs.length && this.lastViewKey === key) return true;
    // A frame with exhaust cannot become the clean stationary cache. The next
    // frame must redraw once when the final puff expires.
    this.lastViewKey = state.exhaustPuffs.length ? null : key;
    const u = this.uniforms;
    u.viewOrigin.value.set(camera.x, camera.y, camera.elevation);
    u.viewportSize.value.set(frame.width, frame.height);
    u.zoomScale.value = scale; u.anchorY.value = anchorY; u.warning.value = warning ? 1 : 0;
    const screens = frame.renderedUnits.map(unit => projectPoint({ x: unit.renderX, y: unit.renderY, elevation: unit.renderElevation }, frame));
    u.trainBounds.value.set(Math.min(...screens.map(p => p.x))-25, Math.min(...screens.map(p => p.y))-20,
      Math.max(...screens.map(p => p.x))+25, Math.max(...screens.map(p => p.y))+20);
    const screen = {};
    for (const mesh of this.staticMeshes) {
      const b = mesh.geometry.userData.bounds;
      worldToScreen({ x: (b[0]+b[3])*0.5, y: (b[1]+b[4])*0.5, elevation: (b[2]+b[5])*0.5 }, camera, scale, frame.width, anchorY, screen);
      const rx = ((b[3]-b[0])+(b[4]-b[1])) * Math.SQRT1_2 * scale * 0.5 + 120;
      const ry = (((b[3]-b[0])+(b[4]-b[1])) / Math.sqrt(6) + (b[5]-b[2])*Math.sqrt(2/3)) * scale * 0.5 + 120;
      mesh.visible = screen.x + rx >= 0 && screen.x - rx <= frame.width && screen.y + ry >= 0 && screen.y - ry <= frame.height;
    }
    for (let i = 0; i < frame.renderedUnits.length; i++) {
      const unit = frame.renderedUnits[i], c = Math.cos(unit.renderHeading), s = Math.sin(unit.renderHeading);
      this.trainMeshes[i].matrix.set(c, -s, 0, unit.renderX, s, c, 0, unit.renderY,
        Math.tan(unit.renderPitch), 0, 1, unit.renderElevation + 1, 0, 0, 0, 1);
      this.trainMeshes[i].matrixWorldNeedsUpdate = true;
    }
    const dynamic = this.dynamic;
    dynamic.cursor = 0;
    for (let i = 0; i < frame.renderedUnits.length - 1; i++) {
      const a = frame.renderedUnits[i], b = frame.renderedUnits[i+1];
      dynamic.line({ x: a.rearX, y: a.rearY, elevation: a.rearElevation+1.5 },
        { x: b.frontX, y: b.frontY, elevation: b.frontElevation+1.5 }, "#33463e", 1, 1);
    }
    for (const puff of state.exhaustPuffs) {
      const progress = puff.age / puff.life;
      dynamic.circle({ x: puff.x, y: puff.y, elevation: puff.elevation+TUNING.train.bodyHeight+3.4+progress*15 }, puff.radius+puff.growth*progress,
        [48/255, 58/255, 52/255, Math.max(0, (1-progress)*puff.opacity)], true);
    }
    const buffer = this.dynamicMesh.geometry.userData.buffer;
    if (dynamic.cursor > 0) {
      buffer.updateRange.offset = 0;
      buffer.updateRange.count = dynamic.cursor;
      buffer.needsUpdate = true;
    }
    this.dynamicMesh.geometry.setDrawRange(0, dynamic.cursor / THREE_WORLD_STRIDE);
    this.renderer.getSize(this.size);
    if (this.size.x !== canvas.width || this.size.y !== canvas.height) this.renderer.setSize(canvas.width, canvas.height, false);
    else this.renderer.setViewport(0, 0, canvas.width, canvas.height);
    this.prepareRaw();
    this.terrain.lastViewKey = null;
    this.terrain.draw(frame);
    this.renderer.resetState();
    this.renderer.clearDepth();
    this.renderer.render(this.scene, this.camera);
    this.drawCalls = this.renderer.info.render.calls;
    this.ownsContext = true;
    return true;
  }

  labels(frame) {
    frame.signTexts = [];
    for (let i = 0; i < route.stations.length; i++) {
      const station = route.stations[i], visual = station.visual || { buildingSide: 1 };
      const building = offsetRoutePoint(station.distance - 25, visual.buildingSide * 36);
      frame.labels.push({ point: { ...building, elevation: building.elevation + 25 }, text: station.name,
        color: i === state.stationIndex ? "#dcffbd" : "#edf3e1" });
    }
    for (const segment of route.segments) {
      if (segment.speedLimit == null) continue;
      const point = offsetRoutePoint(segment.start + 12, -18);
      frame.signTexts.push({ point: { ...point, elevation: point.elevation+15 }, text: `${toKph(segment.speedLimit)}` });
    }
    for (const signal of route.signals) {
      const point = offsetRoutePoint(signal.distance, signal.side * (TRACK_WIDTH*0.8+TUNING.signals.sideOffset));
      const aspect = getSignalAspect(signal);
      if (signal.kind === "yellow") frame.labels.push({ point: { ...point, elevation: point.elevation+35 },
        text: `${toKph(signal.speedLimit)} km/h`, color: "#ffd85f" });
      const gap = signal.distance-state.distance;
      if (aspect === "red" && gap >= 0 && gap <= TUNING.signals.redCountdownDisplayDistance) frame.labels.push({
        point: { ...point, elevation: point.elevation+35 }, text: `Stop · ${Math.max(0, signal.clearAfter-signal.waitTimer).toFixed(1)}s`, color: "#ff6a62" });
    }
  }
}

function getThreeWorldStatus() {
  const atlas = threeWorld?.uniforms.spriteAtlas.value.image;
  return { vehicles: threeWorld?.trainMeshes.length || 0, drawCalls: threeWorld?.drawCalls || 0,
    geometries: threeWorld?.renderer.info.memory.geometries || 0,
    textures: threeWorld?.renderer.info.memory.textures || 0,
    atlasBytes: atlas ? atlas.width * atlas.height * 4 : 0,
    staticVertices: threeWorld?.staticMeshes.reduce((sum, mesh) => sum + mesh.geometry.drawRange.count, 0) || 0,
    geometryBytes: threeWorld?.scene.children.reduce((sum, mesh) => sum + mesh.geometry.userData.bytes, 0) || 0 };
}

function drawThreeWorldFrame(frame) {
  if (terrainRendererActive !== "three") return false;
  try {
    if (!threeWorld.draw(frame)) return false;
    ctx.clearRect(0, 0, frame.width, frame.height);
    threeWorld.labels(frame);
    drawWorldLabels(frame);
    trimTerrainCaches();
    return true;
  } catch (error) {
    setTerrainRendererMode("webgl2");
    terrainRendererReason = error.message;
    return false;
  }
}
