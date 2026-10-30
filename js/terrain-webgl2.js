// Experimental terrain-only backend. The world, labels, and HUD stay on Canvas.
class WebglTerrainRenderer {
  constructor(surface) {
    this.canvas = surface;
    this.gl = surface.getContext("webgl2", { alpha: false, antialias: true,
      depth: true, stencil: false, powerPreference: "high-performance" });
    if (!this.gl) throw new Error("WebGL 2 is unavailable");
    this.chunkCells = 16;
    this.chunkLimit = 48;
    this.chunks = new Map();
    this.routeData = null;
    this.lost = false;
    this.drawCalls = 0;
    this.buildCount = 0;
    this.bufferBytes = 0;
    this.lastViewKey = null;
    this.createResources();
    surface.addEventListener("webglcontextlost", event => {
      event.preventDefault();
      this.lost = true;
      this.chunks.clear();
      this.bufferBytes = 0;
      this.lastViewKey = null;
      terrainRendererActive = "canvas";
      terrainRendererReason = "WebGL context lost";
      surface.hidden = true;
    });
    surface.addEventListener("webglcontextrestored", () => {
      this.lost = false;
      try {
        this.createResources();
        if (terrainRendererRequested === "webgl2") {
          terrainRendererActive = "webgl2";
          terrainRendererReason = null;
          surface.hidden = false;
        }
      } catch (error) {
        terrainRendererReason = error.message;
      }
    });
  }

  createResources() {
    const gl = this.gl;
    const vertex = `#version 300 es
      precision highp float;
      layout(location = 0) in vec3 position;
      layout(location = 1) in float tone;
      layout(location = 2) in float cellDepth;
      uniform vec2 cameraOffset;
      uniform float cameraElevation;
      uniform vec2 viewportSize;
      uniform float scale;
      uniform float anchorY;
      uniform float chunkDepth;
      flat out float triangleTone;
      void main() {
        vec2 delta = position.xy + cameraOffset;
        vec2 screen = vec2(viewportSize.x * 0.5 + (delta.x - delta.y) * 0.7071067811865476 * scale,
          anchorY + ((delta.x + delta.y) * 0.4082482904638631
            - (position.z - cameraElevation) * 0.816496580927726) * scale);
        // Ground-cell depth preserves the existing diagonal painter order.
        // Terrain remains a cutaway layer beneath all track and world props.
        gl_Position = vec4(screen.x * 2.0 / viewportSize.x - 1.0,
          1.0 - screen.y * 2.0 / viewportSize.y, -(chunkDepth + cellDepth) * 0.00001, 1.0);
        triangleTone = tone;
      }`;
    const fragment = `#version 300 es
      precision highp float;
      flat in float triangleTone;
      uniform vec3 baseColor;
      out vec4 color;
      void main() {
        color = vec4(floor(clamp(baseColor * triangleTone, 0.0, 255.0) + 0.5) / 255.0, 1.0);
      }`;
    const shaders = [];
    const program = gl.createProgram();
    try {
      for (const [kind, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]]) {
        const shader = gl.createShader(kind);
        shaders.push(shader);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
        gl.attachShader(program, shader);
      }
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
      this.program = program;
      this.uniforms = Object.fromEntries(["cameraOffset", "cameraElevation", "viewportSize", "scale",
        "anchorY", "chunkDepth", "baseColor"].map(name => [name, gl.getUniformLocation(program, name)]));
    } catch (error) {
      gl.deleteProgram(program);
      throw error;
    } finally {
      for (const shader of shaders) gl.deleteShader(shader);
    }
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.BLEND);
    gl.disable(gl.DITHER);
  }

  resetRoute(nextRoute) {
    if (!this.lost) {
      for (const chunk of this.chunks.values()) this.deleteChunk(chunk);
    }
    this.chunks.clear();
    this.bufferBytes = 0;
    this.routeData = nextRoute;
    this.lastViewKey = null;
  }

  deleteChunk(chunk) {
    this.gl.deleteBuffer(chunk.buffer);
    this.gl.deleteVertexArray(chunk.vao);
    this.bufferBytes -= chunk.bytes;
  }

  buildChunk(cx, cy) {
    const gl = this.gl;
    const cells = this.chunkCells;
    const size = TUNING.terrain.cellSize;
    const gx0 = cx * cells, gy0 = cy * cells;
    const originX = gx0 * size, originY = gy0 * size;
    const points = [];
    for (let y = 0; y <= cells; y++) {
      for (let x = 0; x <= cells; x++) points.push(getTerrainVertex(gx0 + x, gy0 + y));
    }
    const data = new Float32Array(cells * cells * 6 * 5);
    let cursor = 0;
    const emit = (point, tone, depth) => {
      data[cursor++] = point.x - originX;
      data[cursor++] = point.y - originY;
      data[cursor++] = point.elevation;
      data[cursor++] = tone;
      data[cursor++] = depth;
    };
    for (let y = 0; y < cells; y++) {
      for (let x = 0; x < cells; x++) {
        const a = points[y * (cells + 1) + x], b = points[y * (cells + 1) + x + 1];
        const c = points[(y + 1) * (cells + 1) + x + 1], d = points[(y + 1) * (cells + 1) + x];
        const noise = hashNoise(gx0 + x, gy0 + y);
        const toneA = getTerrainTone(a, b, c, noise), toneB = getTerrainTone(a, c, d, noise);
        const depth = (x + y) * size;
        emit(a, toneA, depth); emit(b, toneA, depth); emit(c, toneA, depth);
        emit(a, toneB, depth); emit(c, toneB, depth); emit(d, toneB, depth);
      }
    }
    const buffer = gl.createBuffer();
    const vao = gl.createVertexArray();
    if (!buffer || !vao) {
      if (buffer) gl.deleteBuffer(buffer);
      if (vao) gl.deleteVertexArray(vao);
      throw new Error("Could not allocate terrain buffers");
    }
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 20, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 20, 16);
    this.bufferBytes += data.byteLength;
    this.buildCount++;
    return { buffer, vao, originX, originY, count: data.length / 5, bytes: data.byteLength };
  }

  draw(frame) {
    if (this.lost) return false;
    if (this.routeData !== route) this.resetRoute(route);
    const gl = this.gl;
    const { camera, scale, anchorY } = frame.view;
    const blend = frame.biomeBlend;
    const key = [canvas.width, canvas.height, frame.width, frame.height, camera.x, camera.y,
      camera.elevation, scale, anchorY, blend.primary, blend.secondary, blend.mix].join("|");
    this.drawCalls = 0;
    if ((state.speed === 0 || state.finished) && key === this.lastViewKey) return true;
    this.lastViewKey = key;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(120 / 255, 151 / 255, 107 / 255, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.program);
    const u = this.uniforms;
    gl.uniform2f(u.viewportSize, frame.width, frame.height);
    gl.uniform1f(u.scale, scale);
    gl.uniform1f(u.anchorY, anchorY);
    gl.uniform1f(u.cameraElevation, camera.elevation);
    const a = getBiomePalette(blend.primary).base, b = getBiomePalette(blend.secondary).base;
    gl.uniform3f(u.baseColor, lerp(a[0], b[0], blend.mix), lerp(a[1], b[1], blend.mix), lerp(a[2], b[2], blend.mix));
    const corners = [];
    const extent = 60 + TUNING.terrain.relief * 1.35;
    const top = Math.max(...route.elevationNodes.map(node => node.elevation));
    for (const elevation of [56 - extent, Math.max(56 + extent, top + 1)]) {
      for (const x of [-64, frame.width + 64]) {
        for (const y of [-64, frame.height + 64]) corners.push(screenToGround(x, y, frame.view, frame.width, elevation));
      }
    }
    const chunkSize = TUNING.terrain.cellSize * this.chunkCells;
    const minX = Math.floor(Math.min(...corners.map(p => p.x)) / chunkSize);
    const maxX = Math.floor(Math.max(...corners.map(p => p.x)) / chunkSize);
    const minY = Math.floor(Math.min(...corners.map(p => p.y)) / chunkSize);
    const maxY = Math.floor(Math.max(...corners.map(p => p.y)) / chunkSize);
    for (let cy = minY; cy <= maxY; cy++) {
      for (let cx = minX; cx <= maxX; cx++) {
        const chunkKey = `${cx},${cy}`;
        let chunk = this.chunks.get(chunkKey);
        if (chunk) this.chunks.delete(chunkKey);
        else chunk = this.buildChunk(cx, cy);
        this.chunks.set(chunkKey, chunk);
        gl.uniform2f(u.cameraOffset, chunk.originX - camera.x, chunk.originY - camera.y);
        gl.uniform1f(u.chunkDepth, chunk.originX + chunk.originY - camera.x - camera.y);
        gl.bindVertexArray(chunk.vao);
        gl.drawArrays(gl.TRIANGLES, 0, chunk.count);
        this.drawCalls++;
        while (this.chunks.size > this.chunkLimit) {
          const oldest = this.chunks.keys().next().value;
          this.deleteChunk(this.chunks.get(oldest));
          this.chunks.delete(oldest);
        }
      }
    }
    gl.bindVertexArray(null);
    return true;
  }
}

const terrainSurface = document.getElementById("terrainCanvas");
let webglTerrain = null;
let terrainRendererRequested = "canvas";
let terrainRendererActive = "canvas";
let terrainRendererReason = null;

function resizeTerrainSurface(width, height) {
  if (terrainSurface.width !== width) terrainSurface.width = width;
  if (terrainSurface.height !== height) terrainSurface.height = height;
  if (webglTerrain) webglTerrain.lastViewKey = null;
  if (threeWorld) threeWorld.lastViewKey = null;
}

function setTerrainRendererMode(mode) {
  terrainRendererRequested = mode === "canvas" ? "canvas" : mode === "three" ? "three" : "webgl2";
  terrainRendererActive = "canvas";
  terrainRendererReason = null;
  if (terrainRendererRequested !== "canvas") {
    try {
      if (!webglTerrain) webglTerrain = new WebglTerrainRenderer(terrainSurface);
      if (!webglTerrain.lost) {
        terrainRendererActive = "webgl2";
        webglTerrain.lastViewKey = null;
        if (terrainRendererRequested === "three" && window.THREE) {
          if (!threeWorld) threeWorld = new ThreeWorldRenderer(webglTerrain);
          terrainRendererActive = "three";
        }
      }
    } catch (error) {
      terrainRendererReason = error.message;
    }
  }
  terrainSurface.hidden = terrainRendererActive === "canvas";
  resizeTerrainSurface(canvas.width, canvas.height);
  return terrainRendererActive;
}

function getTerrainRendererStatus() {
  return { requested: terrainRendererRequested, active: terrainRendererActive, reason: terrainRendererReason,
    chunkCount: webglTerrain?.chunks.size || 0, chunkLimit: webglTerrain?.chunkLimit || 48,
    bufferBytes: webglTerrain?.bufferBytes || 0, drawCalls: webglTerrain?.drawCalls || 0,
    buildCount: webglTerrain?.buildCount || 0, contextLost: webglTerrain?.lost || false };
}

function drawTerrainBackground(frame) {
  if (terrainRendererActive !== "canvas") {
    try {
      if (threeWorld?.ownsContext) threeWorld.prepareRaw();
      if (terrainRendererActive === "three") threeWorld.lastViewKey = null;
      if (webglTerrain.draw(frame)) {
        ctx.clearRect(0, 0, frame.width, frame.height);
        trimTerrainCaches();
        return;
      }
    } catch (error) {
      terrainRendererReason = error.message;
    }
    terrainRendererActive = "canvas";
    terrainSurface.hidden = true;
  }
  drawBackground(frame);
}
