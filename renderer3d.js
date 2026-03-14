(function attachTrainDriver3DInsetRenderer(global) {
  const THREE = global.THREE;

  function applyShadowFlags(object, castShadow, receiveShadow) {
    object.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = castShadow;
        child.receiveShadow = receiveShadow;
      }
    });
  }

  function clearGroup(group) {
    while (group.children.length) {
      const child = group.children.pop();
      if (child.children && child.children.length) {
        clearGroup(child);
      }
      if (child.geometry) {
        child.geometry.dispose();
      }
      if (Array.isArray(child.material)) {
        child.material.forEach((material) => material.dispose());
      } else if (child.material) {
        child.material.dispose();
      }
      group.remove(child);
    }
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function normalizeAngle(angle) {
    let normalized = angle;
    while (normalized > Math.PI) {
      normalized -= Math.PI * 2;
    }
    while (normalized < -Math.PI) {
      normalized += Math.PI * 2;
    }
    return normalized;
  }

  function lerpAngle(current, target, t) {
    const delta = normalizeAngle(target - current);
    return current + delta * t;
  }

  function normalizeCssColor(colorValue) {
    if (typeof colorValue !== "string") {
      return colorValue;
    }

    const trimmed = colorValue.trim();
    const hslMatch = trimmed.match(/^hsla?\((.+)\)$/i);
    if (!hslMatch) {
      return trimmed;
    }

    const inner = hslMatch[1].replace(/\s*\/\s*/g, ", ");
    if (inner.includes(",")) {
      return trimmed;
    }

    const parts = inner.split(/\s+/).filter(Boolean);
    if (parts.length < 3) {
      return trimmed;
    }

    const fnName = trimmed.slice(0, trimmed.indexOf("(") + 1);
    return `${fnName}${parts.join(", ")})`;
  }

  function createThreeColor(colorValue) {
    return new THREE.Color(normalizeCssColor(colorValue));
  }

  function threeColorToChannels(color) {
    return [color.r * 255, color.g * 255, color.b * 255];
  }

  function applyChannelsToMaterial(material, channels) {
    if (!material || !material.color || !channels) {
      return;
    }

    material.color.setRGB(
      clamp(channels[0], 0, 255) / 255,
      clamp(channels[1], 0, 255) / 255,
      clamp(channels[2], 0, 255) / 255,
    );
  }

  function applyLitFlatColor(material, colorValue, emissiveIntensity) {
    if (!material) {
      return;
    }

    const normalizedColor = normalizeCssColor(colorValue);
    material.color.set(normalizedColor);
    if (material.emissive) {
      material.emissive.set(normalizedColor);
      material.emissiveIntensity = emissiveIntensity;
    }
  }

  function hashNoise(x, y) {
    const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
    return value - Math.floor(value);
  }

  function getBiomePalette(theme) {
    if (theme === "desert") {
      return {
        base: [197, 168, 103],
        alt: [173, 145, 84],
        detail: [151, 123, 66],
      };
    }
    if (theme === "snow") {
      return {
        base: [196, 208, 222],
        alt: [150, 168, 186],
        detail: [236, 241, 247],
      };
    }
    if (theme === "mountain") {
      return {
        base: [120, 130, 126],
        alt: [90, 98, 94],
        detail: [68, 76, 74],
      };
    }
    if (theme === "river") {
      return {
        base: [98, 143, 104],
        alt: [72, 125, 128],
        detail: [80, 160, 194],
      };
    }
    if (theme === "farmland") {
      return {
        base: [167, 152, 92],
        alt: [142, 126, 74],
        detail: [204, 186, 111],
      };
    }
    if (theme === "autumn") {
      return {
        base: [149, 103, 58],
        alt: [118, 74, 42],
        detail: [191, 137, 72],
      };
    }
    if (theme === "marsh") {
      return {
        base: [91, 121, 90],
        alt: [73, 97, 76],
        detail: [110, 146, 124],
      };
    }
    if (theme === "canyon") {
      return {
        base: [170, 103, 73],
        alt: [132, 78, 56],
        detail: [209, 147, 109],
      };
    }
    return {
      base: [123, 156, 86],
      alt: [84, 129, 69],
      detail: [90, 128, 58],
    };
  }

  function getBiomeOverlayPalette(theme) {
    if (theme === "desert") {
      return {
        base: [197, 168, 103, 0.44],
        alt: [173, 145, 84, 0.34],
        detail: [151, 123, 66, 0.18],
      };
    }
    if (theme === "snow") {
      return {
        base: [214, 225, 232, 0.48],
        alt: [173, 193, 207, 0.32],
        detail: [244, 248, 252, 0.22],
      };
    }
    if (theme === "mountain") {
      return {
        base: [120, 130, 126, 0.42],
        alt: [90, 98, 94, 0.36],
        detail: [68, 76, 74, 0.22],
      };
    }
    if (theme === "river") {
      return {
        base: [98, 143, 104, 0.38],
        alt: [72, 125, 128, 0.34],
        detail: [80, 160, 194, 0.22],
      };
    }
    if (theme === "farmland") {
      return {
        base: [167, 152, 92, 0.42],
        alt: [142, 126, 74, 0.34],
        detail: [204, 186, 111, 0.18],
      };
    }
    if (theme === "autumn") {
      return {
        base: [149, 103, 58, 0.42],
        alt: [118, 74, 42, 0.34],
        detail: [191, 137, 72, 0.2],
      };
    }
    if (theme === "marsh") {
      return {
        base: [91, 121, 90, 0.42],
        alt: [73, 97, 76, 0.35],
        detail: [110, 146, 124, 0.2],
      };
    }
    if (theme === "canyon") {
      return {
        base: [170, 103, 73, 0.42],
        alt: [132, 78, 56, 0.34],
        detail: [209, 147, 109, 0.2],
      };
    }
    return {
      base: [123, 156, 86, 0.42],
      alt: [84, 129, 69, 0.34],
      detail: [90, 128, 58, 0.18],
    };
  }

  function mixColorChannels(colorA, colorB, t) {
    return [
      lerp(colorA[0], colorB[0], t),
      lerp(colorA[1], colorB[1], t),
      lerp(colorA[2], colorB[2], t),
    ];
  }

  function colorChannelsToCss(color, alpha = 1) {
    return `rgba(${Math.round(color[0])}, ${Math.round(color[1])}, ${Math.round(color[2])}, ${alpha})`;
  }

  function mixColorWithAlpha(colorA, colorB, t) {
    return [
      lerp(colorA[0], colorB[0], t),
      lerp(colorA[1], colorB[1], t),
      lerp(colorA[2], colorB[2], t),
      lerp(colorA[3], colorB[3], t),
    ];
  }

  function rgbaColorToCss(color) {
    return `rgba(${Math.round(color[0])}, ${Math.round(color[1])}, ${Math.round(color[2])}, ${color[3].toFixed(3)})`;
  }

  class TrainDriver3DInsetRenderer {
    constructor({ container, statusElement }) {
      this.container = container;
      this.statusElement = statusElement;
      this.available = Boolean(THREE && container);
      this.routeRef = null;
      this.routeState = null;
      this.signalRefs = [];
      this.stationRefs = [];
      this.sceneryRefs = [];
      this.trainMeshes = [];
      this.cameraReady = false;
      this.cameraPosition = null;
      this.cameraTarget = null;
      this.cameraHeading = 0;
      this.lastCameraUpdateTime = 0;
      this.lastViewportWidth = 0;
      this.lastViewportHeight = 0;
      this.groundTextureKey = "";

      if (!this.available) {
        if (this.statusElement) {
          this.statusElement.textContent = "3D unavailable";
        }
        return;
      }

      this.renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      });
      this.renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      if ("outputColorSpace" in this.renderer && THREE.SRGBColorSpace) {
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      } else if ("outputEncoding" in this.renderer && THREE.sRGBEncoding) {
        this.renderer.outputEncoding = THREE.sRGBEncoding;
      }
      this.renderer.domElement.setAttribute("aria-hidden", "true");
      this.container.appendChild(this.renderer.domElement);

      this.scene = new THREE.Scene();
      this.scene.fog = new THREE.Fog(0x6b8ea8, 360, 2500);

      this.camera = new THREE.PerspectiveCamera(48, 1, 4, 3200);
      this.scene.add(this.camera);

      this.root = new THREE.Group();
      this.scene.add(this.root);

      this.groundTextureCanvas = global.document.createElement("canvas");
      this.groundTextureCanvas.width = 512;
      this.groundTextureCanvas.height = 512;
      this.groundTextureContext = this.groundTextureCanvas.getContext("2d");
      this.groundTexture = new THREE.CanvasTexture(this.groundTextureCanvas);
      this.groundTexture.wrapS = THREE.RepeatWrapping;
      this.groundTexture.wrapT = THREE.RepeatWrapping;
      this.groundTexture.repeat.set(16, 16);
      this.groundTexture.minFilter = THREE.LinearMipmapLinearFilter || THREE.LinearFilter;
      this.groundTexture.magFilter = THREE.LinearFilter;
      this.groundTexture.generateMipmaps = true;
      this.groundWorldSize = 40000;
      if (this.renderer.capabilities && this.renderer.capabilities.getMaxAnisotropy) {
        this.groundTexture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
      }
      if ("colorSpace" in this.groundTexture && THREE.SRGBColorSpace) {
        this.groundTexture.colorSpace = THREE.SRGBColorSpace;
      } else if ("encoding" in this.groundTexture && THREE.sRGBEncoding) {
        this.groundTexture.encoding = THREE.sRGBEncoding;
      }
      this.groundTexture.needsUpdate = true;
      this.rebuildGroundTexture({ primary: "green", secondary: "green", mix: 0 });

      this.ground = new THREE.Mesh(
        new THREE.PlaneGeometry(this.groundWorldSize, this.groundWorldSize),
        new THREE.MeshStandardMaterial({
          color: 0x6c8d55,
          map: this.groundTexture,
          roughness: 0.98,
          metalness: 0.02,
          polygonOffset: true,
          polygonOffsetFactor: 2,
          polygonOffsetUnits: 2,
        }),
      );
      this.ground.rotation.x = -Math.PI * 0.5;
      this.ground.position.y = -0.08;
      this.ground.receiveShadow = true;
      this.root.add(this.ground);

      this.trackGroup = new THREE.Group();
      this.stationGroup = new THREE.Group();
      this.signalGroup = new THREE.Group();
      this.sceneryGroup = new THREE.Group();
      this.trainGroup = new THREE.Group();
      this.root.add(this.trackGroup, this.stationGroup, this.signalGroup, this.sceneryGroup, this.trainGroup);

      this.hemiLight = new THREE.HemisphereLight(0xd9f1ff, 0x334024, 1.2);
      this.scene.add(this.hemiLight);

      this.sunLight = new THREE.DirectionalLight(0xfff3d8, 1.8);
      this.sunLight.position.set(180, 260, 120);
      this.sunLight.castShadow = true;
      this.sunLight.shadow.mapSize.width = 2048;
      this.sunLight.shadow.mapSize.height = 2048;
      this.sunLight.shadow.camera.near = 10;
      this.sunLight.shadow.camera.far = 1200;
      this.sunLight.shadow.camera.left = -320;
      this.sunLight.shadow.camera.right = 320;
      this.sunLight.shadow.camera.top = 320;
      this.sunLight.shadow.camera.bottom = -320;
      this.scene.add(this.sunLight);

      this.fillLight = new THREE.DirectionalLight(0x8cc8ff, 0.5);
      this.fillLight.position.set(-120, 140, -140);
      this.scene.add(this.fillLight);

      this.resizeObserver = typeof ResizeObserver === "function"
        ? new ResizeObserver(() => this.resize())
        : null;
      if (this.resizeObserver) {
        this.resizeObserver.observe(this.container);
      }

      this.resize();
    }

    resize() {
      if (!this.available) {
        return;
      }

      const rect = this.container.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      if (width === this.lastViewportWidth && height === this.lastViewportHeight) {
        return;
      }

      this.lastViewportWidth = width;
      this.lastViewportHeight = height;
      this.renderer.setSize(width, height, false);
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    }

    setRoute({ route, trackWidth, trainConsist, tuning, sampleRoute, getSceneryPoint }) {
      if (!this.available || !route || this.routeRef === route) {
        return;
      }

      this.routeRef = route;
      this.routeState = {
        route,
        trackWidth,
        trainConsist,
        tuning,
        sampleRoute,
        getSceneryPoint,
      };

      clearGroup(this.trackGroup);
      clearGroup(this.stationGroup);
      clearGroup(this.signalGroup);
      clearGroup(this.sceneryGroup);
      clearGroup(this.trainGroup);
      this.signalRefs = [];
      this.stationRefs = [];
      this.sceneryRefs = [];
      this.trainMeshes = [];
      this.cameraReady = false;
      this.lastCameraUpdateTime = 0;

      this.buildTrack();
      this.buildStations();
      this.buildSignals();
      this.buildScenery();
      this.buildTrainMeshes();

      if (this.statusElement) {
        this.statusElement.textContent = "Drone follow";
      }
    }

    buildTrack() {
      const { route, trackWidth, sampleRoute } = this.routeState;
      const visualGauge = trackWidth * 0.84;
      const bedWidth = visualGauge * 2.45;
      const sleeperWidth = visualGauge * 1.95;
      const sampleStep = 12;
      const samples = [];
      for (let distance = 0; distance <= route.totalLength; distance += sampleStep) {
        const point = sampleRoute(distance);
        samples.push({ x: point.x, z: point.y, heading: point.heading, distance });
      }
      const lastPoint = sampleRoute(route.totalLength);
      const lastSample = samples[samples.length - 1];
      if (!lastSample || Math.abs(lastSample.distance - route.totalLength) > 0.001) {
        samples.push({ x: lastPoint.x, z: lastPoint.y, heading: lastPoint.heading, distance: route.totalLength });
      }

      const bedMaterial = new THREE.MeshStandardMaterial({
        color: 0x3b3a36,
        roughness: 0.96,
        metalness: 0.04,
        side: THREE.DoubleSide,
      });
      const railMaterial = new THREE.MeshStandardMaterial({
        color: 0xbfd0df,
        roughness: 0.35,
        metalness: 0.72,
        side: THREE.DoubleSide,
      });

      const bedMesh = this.createRibbonMesh(samples, bedWidth * 1.08, 0.04, bedMaterial);
      bedMesh.frustumCulled = false;
      bedMesh.receiveShadow = true;
      this.trackGroup.add(bedMesh);

      const leftRailSamples = samples.map((sample) => {
        const normalX = -Math.sin(sample.heading);
        const normalZ = Math.cos(sample.heading);
        return {
          x: sample.x + normalX * visualGauge * 0.5,
          z: sample.z + normalZ * visualGauge * 0.5,
          heading: sample.heading,
        };
      });
      const rightRailSamples = samples.map((sample) => {
        const normalX = -Math.sin(sample.heading);
        const normalZ = Math.cos(sample.heading);
        return {
          x: sample.x - normalX * visualGauge * 0.5,
          z: sample.z - normalZ * visualGauge * 0.5,
          heading: sample.heading,
        };
      });

      const leftRail = this.createRibbonMesh(leftRailSamples, 0.24, 0.22, railMaterial.clone());
      const rightRail = this.createRibbonMesh(rightRailSamples, 0.24, 0.22, railMaterial.clone());
      leftRail.frustumCulled = false;
      rightRail.frustumCulled = false;
      leftRail.castShadow = true;
      leftRail.receiveShadow = true;
      rightRail.castShadow = true;
      rightRail.receiveShadow = true;
      this.trackGroup.add(leftRail, rightRail);

      const sleeperGeometry = new THREE.BoxGeometry(sleeperWidth, 0.16, 1.7);
      const sleeperMaterial = new THREE.MeshStandardMaterial({
        color: 0x8d6c4e,
        roughness: 0.98,
        metalness: 0.02,
      });
      const sleeperStep = 18;
      for (let distance = 0; distance <= route.totalLength; distance += sleeperStep) {
        const point = sampleRoute(distance);
        const sleeper = new THREE.Mesh(sleeperGeometry, sleeperMaterial);
        sleeper.position.set(point.x, 0.1, point.y);
        sleeper.rotation.y = Math.PI * 0.5 - point.heading;
        sleeper.castShadow = true;
        sleeper.receiveShadow = true;
        this.trackGroup.add(sleeper);
      }
    }

    createRibbonMesh(samples, width, y, material) {
      const positions = [];
      const normals = [];
      const uvs = [];
      const indices = [];

      samples.forEach((sample, index) => {
        const normalX = -Math.sin(sample.heading);
        const normalZ = Math.cos(sample.heading);
        positions.push(sample.x + normalX * width * 0.5, y, sample.z + normalZ * width * 0.5);
        positions.push(sample.x - normalX * width * 0.5, y, sample.z - normalZ * width * 0.5);
        normals.push(0, 1, 0, 0, 1, 0);
        const v = samples.length <= 1 ? 0 : index / (samples.length - 1);
        uvs.push(0, v, 1, v);

        if (index < samples.length - 1) {
          const baseIndex = index * 2;
          indices.push(baseIndex, baseIndex + 1, baseIndex + 2);
          indices.push(baseIndex + 1, baseIndex + 3, baseIndex + 2);
        }
      });

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
      geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      geometry.setIndex(indices);
      geometry.computeBoundingSphere();
      return new THREE.Mesh(geometry, material);
    }

    buildStations() {
      const { route, trackWidth, sampleRoute } = this.routeState;
      route.stations.slice(1).forEach((station, index) => {
        const point = sampleRoute(station.distance);
        const group = new THREE.Group();
        const normalX = -Math.sin(point.heading);
        const normalZ = Math.cos(point.heading);
        const platformMaterial = new THREE.MeshStandardMaterial({
          color: 0xa8bf98,
          roughness: 0.92,
          metalness: 0.02,
        });
        const markerMaterial = new THREE.MeshStandardMaterial({
          color: 0x77e6a0,
          emissive: 0x1f8e59,
          emissiveIntensity: 0.6,
          roughness: 0.45,
          metalness: 0.08,
        });

        [-1, 1].forEach((side) => {
          const platform = new THREE.Mesh(
            new THREE.BoxGeometry(8.5, 1.1, 48),
            platformMaterial,
          );
          platform.position.set(
            point.x + normalX * side * (trackWidth * 1.75 + 5.8),
            0.55,
            point.y + normalZ * side * (trackWidth * 1.75 + 5.8),
          );
          platform.rotation.y = Math.PI * 0.5 - point.heading;
          platform.castShadow = true;
          platform.receiveShadow = true;
          group.add(platform);
        });

        const marker = new THREE.Mesh(
          new THREE.CylinderGeometry(1.15, 1.15, 12, 20),
          markerMaterial,
        );
        marker.position.set(point.x, 6.2, point.y);
        marker.castShadow = true;
        group.add(marker);

        const halo = new THREE.Mesh(
          new THREE.CylinderGeometry(9, 9, 0.22, 32),
          new THREE.MeshStandardMaterial({
            color: 0x8affb6,
            emissive: 0x4ee28f,
            emissiveIntensity: 0.8,
            transparent: true,
            opacity: 0.55,
            roughness: 0.8,
            metalness: 0.04,
          }),
        );
        halo.position.set(point.x, 0.12, point.y);
        halo.receiveShadow = true;
        group.add(halo);

        this.stationGroup.add(group);
        this.stationRefs.push({
          index: index + 1,
          marker,
          halo,
        });
      });
    }

    buildSignals() {
      const { route, trackWidth, tuning, sampleRoute } = this.routeState;
      route.signals.forEach((signal) => {
        const point = sampleRoute(signal.distance);
        const normalX = -Math.sin(point.heading);
        const normalZ = Math.cos(point.heading);
        const signalX = point.x + normalX * signal.side * (trackWidth * 0.8 + tuning.signals.sideOffset);
        const signalZ = point.y + normalZ * signal.side * (trackWidth * 0.8 + tuning.signals.sideOffset);
        const mast = new THREE.Mesh(
          new THREE.CylinderGeometry(0.34, 0.42, 11.5, 14),
          new THREE.MeshStandardMaterial({
            color: 0xd1dde7,
            roughness: 0.58,
            metalness: 0.42,
          }),
        );
        mast.position.set(signalX, 5.75, signalZ);
        mast.castShadow = true;
        mast.receiveShadow = true;

        const housing = new THREE.Mesh(
          new THREE.BoxGeometry(2, 3.1, 1.7),
          new THREE.MeshStandardMaterial({
            color: 0x111921,
            roughness: 0.76,
            metalness: 0.18,
          }),
        );
        housing.position.set(signalX, 11.1, signalZ);
        housing.castShadow = true;

        const light = new THREE.Mesh(
          new THREE.SphereGeometry(0.68, 18, 18),
          new THREE.MeshStandardMaterial({
            color: 0x7dff8e,
            emissive: 0x2aff55,
            emissiveIntensity: 1.4,
            roughness: 0.35,
            metalness: 0.08,
          }),
        );
        light.position.set(signalX, 11.2, signalZ + signal.side * 0.18);
        light.castShadow = true;

        const base = new THREE.Mesh(
          new THREE.CylinderGeometry(0.95, 1.15, 0.7, 16),
          new THREE.MeshStandardMaterial({
            color: 0x5e6872,
            roughness: 0.82,
            metalness: 0.18,
          }),
        );
        base.position.set(signalX, 0.35, signalZ);
        base.castShadow = true;
        base.receiveShadow = true;

        this.signalGroup.add(base, mast, housing, light);
        this.signalRefs.push({ signal, light });
      });
    }

    buildScenery() {
      const { route, getSceneryPoint } = this.routeState;
      route.scenery.forEach((item) => {
        const point = getSceneryPoint(item);
        const object = this.createSceneryObject(item);
        object.position.set(point.x, 0, point.y);
        object.rotation.y = item.rotation;
        object.scale.setScalar(item.size * 1.15);
        applyShadowFlags(object, true, true);
        this.sceneryGroup.add(object);
        this.sceneryRefs.push({ biomeMaterials: object.userData.biomeMaterials || [] });
      });
    }

    createSceneryObject(item) {
      const tintShift = item.tint / 255;
      const group = new THREE.Group();

      group.userData.biomeMaterials = [];

      const registerBiomeMaterial = (material, biomeRole, biomeStrength = 0.24) => {
        if (!material || !material.color) {
          return material;
        }

        group.userData.biomeMaterials.push({
          material,
          baseColor: threeColorToChannels(material.color),
          biomeRole,
          biomeStrength,
        });
        return material;
      };

      const makeMaterial = (base, biomeRole = "structure", biomeStrength = 0.24, overrides = null) => {
        const color = new THREE.Color(base);
        color.offsetHSL(0, 0, tintShift);
        return registerBiomeMaterial(new THREE.MeshStandardMaterial({
          color,
          roughness: 0.86,
          metalness: 0.05,
          ...(overrides || {}),
        }), biomeRole, biomeStrength);
      };

      if (item.kind === "tree" || item.kind === "bush") {
        const trunk = new THREE.Mesh(
          new THREE.CylinderGeometry(0.35, 0.45, item.kind === "tree" ? 3.8 : 1.6, 10),
          makeMaterial("#70513e", "wood", 0.14),
        );
        trunk.position.y = item.kind === "tree" ? 1.9 : 0.8;
        group.add(trunk);

        const canopy = new THREE.Mesh(
          new THREE.SphereGeometry(item.kind === "tree" ? 2.6 : 1.8, 14, 14),
          makeMaterial(item.kind === "tree" ? "#3d7c49" : "#4d8a57", "foliage", 0.72),
        );
        canopy.position.y = item.kind === "tree" ? 5.4 : 1.9;
        canopy.scale.set(item.kind === "tree" ? 1.2 : 1.4, 1, item.kind === "tree" ? 1.1 : 1.3);
        group.add(canopy);
        return group;
      }

      if (item.kind === "rock" || item.kind === "stump") {
        const rock = new THREE.Mesh(
          new THREE.DodecahedronGeometry(item.kind === "rock" ? 1.7 : 1.1, 0),
          makeMaterial(item.kind === "rock" ? "#7b8792" : "#7e5c43", item.kind === "rock" ? "rock" : "wood", item.kind === "rock" ? 0.3 : 0.16),
        );
        rock.position.y = item.kind === "rock" ? 1.3 : 0.7;
        rock.scale.set(1.2, 0.8, 1);
        group.add(rock);
        return group;
      }

      if (item.kind === "pond") {
        const pondMaterial = registerBiomeMaterial(new THREE.MeshStandardMaterial({
          color: new THREE.Color("#4f9fd0"),
          transparent: true,
          opacity: 0.78,
          roughness: 0.08,
          metalness: 0.1,
        }), "water", 0.78);
        const pond = new THREE.Mesh(
          new THREE.CylinderGeometry(3.4, 3.8, 0.18, 20),
          pondMaterial,
        );
        pond.position.y = 0.09;
        pond.scale.set(1.4, 1, 1);
        group.add(pond);
        return group;
      }

      if (item.kind === "billboard") {
        const post = new THREE.Mesh(
          new THREE.BoxGeometry(0.35, 4.4, 0.35),
          makeMaterial("#60483a", "wood", 0.16),
        );
        post.position.y = 2.2;
        group.add(post);
        const board = new THREE.Mesh(
          new THREE.BoxGeometry(4.8, 2.2, 0.3),
          makeMaterial(item.tint > 0 ? "#ffe28a" : "#9ad7ff", "accent", 0.2),
        );
        board.position.y = 4.6;
        group.add(board);
        return group;
      }

      if (item.kind === "cactus") {
        const stem = new THREE.Mesh(
          new THREE.BoxGeometry(1.1, 4.8, 1.1),
          makeMaterial("#3d7e50", "foliage", 0.6),
        );
        stem.position.y = 2.4;
        const arm = new THREE.Mesh(
          new THREE.BoxGeometry(0.8, 2.6, 0.8),
          makeMaterial("#3d7e50", "foliage", 0.6),
        );
        arm.position.set(0.9, 2.5, 0);
        group.add(stem, arm);
        return group;
      }

      if (item.kind === "windmill") {
        const mast = new THREE.Mesh(
          new THREE.CylinderGeometry(0.3, 0.45, 7, 10),
          makeMaterial("#d5dce2", "structure", 0.14),
        );
        mast.position.y = 3.5;
        group.add(mast);
        const hub = new THREE.Mesh(
          new THREE.SphereGeometry(0.45, 10, 10),
          makeMaterial("#e7eef3", "structure", 0.12),
        );
        hub.position.y = 7.2;
        group.add(hub);
        for (let bladeIndex = 0; bladeIndex < 4; bladeIndex += 1) {
          const blade = new THREE.Mesh(
            new THREE.BoxGeometry(0.18, 2.8, 0.45),
            makeMaterial("#f1f5f8", "structure", 0.08),
          );
          blade.position.y = 7.2;
          blade.rotation.z = bladeIndex * Math.PI * 0.5 + item.rotation * 3;
          blade.position.x = Math.cos(blade.rotation.z) * 1.1;
          blade.position.z = Math.sin(blade.rotation.z) * 1.1;
          group.add(blade);
        }
        return group;
      }

      const building = new THREE.Mesh(
        new THREE.BoxGeometry(4.5, item.kind === "silo" ? 8 : 4.2, 4.2),
        makeMaterial(item.kind === "barn" ? "#b34f43" : item.kind === "hut" ? "#c6935f" : item.kind === "silo" ? "#aab4bc" : "#8a7a6a", item.kind === "barn" ? "accent" : "structure", item.kind === "barn" ? 0.24 : 0.18),
      );
      building.position.y = item.kind === "silo" ? 4 : 2.1;
      group.add(building);

      if (item.kind !== "silo") {
        const roof = new THREE.Mesh(
          new THREE.ConeGeometry(3.6, 1.8, 4),
          makeMaterial(item.kind === "barn" ? "#7c2c24" : "#71492f", "wood", 0.18),
        );
        roof.position.y = item.kind === "barn" ? 5.2 : 4.8;
        roof.rotation.y = Math.PI * 0.25;
        group.add(roof);
      }

      return group;
    }

    updateSceneryAppearance(biomeBlend) {
      if (!biomeBlend) {
        return;
      }

      const primaryPalette = getBiomePalette(biomeBlend.primary);
      const secondaryPalette = getBiomePalette(biomeBlend.secondary);
      const pickRoleColor = (palette, role) => {
        if (role === "foliage") {
          return mixColorChannels(palette.base, palette.alt, 0.35);
        }
        if (role === "wood") {
          return mixColorChannels(palette.alt, palette.detail, 0.2);
        }
        if (role === "rock") {
          return mixColorChannels(palette.alt, palette.detail, 0.55);
        }
        if (role === "water") {
          return mixColorChannels(palette.detail, palette.alt, 0.7);
        }
        if (role === "accent") {
          return mixColorChannels(palette.detail, palette.base, 0.3);
        }
        return mixColorChannels(palette.base, palette.alt, 0.55);
      };

      this.sceneryRefs.forEach(({ biomeMaterials }) => {
        biomeMaterials.forEach(({ material, baseColor, biomeRole, biomeStrength }) => {
          const biomeTarget = mixColorChannels(
            pickRoleColor(primaryPalette, biomeRole),
            pickRoleColor(secondaryPalette, biomeRole),
            biomeBlend.mix || 0,
          );
          const finalColor = mixColorChannels(baseColor, biomeTarget, biomeStrength);
          applyChannelsToMaterial(material, finalColor);
        });
      });
    }

    buildTrainMeshes() {
      const { trainConsist } = this.routeState;
      trainConsist.slice(0, 2).forEach((unit) => {
        const group = new THREE.Group();

        const bodyMaterial = new THREE.MeshBasicMaterial({
          color: createThreeColor(unit.bodyColor),
          toneMapped: false,
        });
        const roofMaterial = new THREE.MeshBasicMaterial({
          color: createThreeColor(unit.roofColor),
          toneMapped: false,
        });

        const body = new THREE.Mesh(
          new THREE.BoxGeometry(unit.width, unit.type === "locomotive" ? 4.8 : 4.2, unit.length),
          bodyMaterial,
        );
        body.position.y = unit.type === "locomotive" ? 2.4 : 2.1;
        body.castShadow = true;
        body.receiveShadow = true;
        group.add(body);

        const roof = new THREE.Mesh(
          new THREE.BoxGeometry(unit.width * 0.62, unit.type === "locomotive" ? 1.1 : 0.92, unit.length * 0.44),
          roofMaterial,
        );
        roof.position.y = unit.type === "locomotive" ? 4.35 : 3.72;
        roof.castShadow = true;
        roof.receiveShadow = true;
        group.add(roof);

        if (unit.type === "locomotive") {
          const lightBar = new THREE.Mesh(
            new THREE.BoxGeometry(unit.width * 0.34, 0.28, 1.1),
            new THREE.MeshStandardMaterial({
              color: 0xfff2b6,
              emissive: 0xf9de85,
              emissiveIntensity: 0.9,
              roughness: 0.28,
              metalness: 0.08,
            }),
          );
          lightBar.position.set(0, 2.7, unit.length * 0.43);
          group.add(lightBar);
        }

        this.trainGroup.add(group);
        this.trainMeshes.push({ group, bodyMaterial, roofMaterial });
      });
    }

    rebuildGroundTexture(biomeBlend) {
      const context = this.groundTextureContext;
      if (!context || !biomeBlend) {
        return;
      }

      const quantizedMix = Math.round(clamp(biomeBlend.mix || 0, 0, 1) * 8);
      const textureKey = `${biomeBlend.primary}:${biomeBlend.secondary}:${quantizedMix}`;
      if (textureKey === this.groundTextureKey) {
        return;
      }
      this.groundTextureKey = textureKey;

      const primaryPalette = getBiomeOverlayPalette(biomeBlend.primary);
      const secondaryPalette = getBiomeOverlayPalette(biomeBlend.secondary);
      const base = mixColorWithAlpha(primaryPalette.base, secondaryPalette.base, biomeBlend.mix || 0);
      const alt = mixColorWithAlpha(primaryPalette.alt, secondaryPalette.alt, biomeBlend.mix || 0);
      const detail = mixColorWithAlpha(primaryPalette.detail, secondaryPalette.detail, biomeBlend.mix || 0);

      context.clearRect(0, 0, this.groundTextureCanvas.width, this.groundTextureCanvas.height);
      const gradient = context.createLinearGradient(0, 0, 0, this.groundTextureCanvas.height);
      gradient.addColorStop(0, "#a6c57d");
      gradient.addColorStop(0.36, "#88aa68");
      gradient.addColorStop(0.68, "#ccb57e");
      gradient.addColorStop(1, "#769760");
      context.fillStyle = gradient;
      context.fillRect(0, 0, this.groundTextureCanvas.width, this.groundTextureCanvas.height);

      const cellSize = 74;
      for (let gridY = 0; gridY < this.groundTextureCanvas.height / cellSize; gridY += 1) {
        for (let gridX = 0; gridX < this.groundTextureCanvas.width / cellSize; gridX += 1) {
          const biomeSeed = hashNoise(gridX * 0.7, gridY * 0.7);
          const toneSeed = hashNoise(gridX * 1.9 + 4, gridY * 1.7 + 9);
          let topColor = base;
          let bottomColor = base;

          if (biomeSeed > 0.72) {
            topColor = toneSeed > 0.5 ? mixColorWithAlpha(base, alt, 0.55) : alt;
            bottomColor = toneSeed > 0.5 ? mixColorWithAlpha(base, alt, 0.55) : alt;
          } else if (biomeSeed > 0.44) {
            topColor = toneSeed > 0.5 ? mixColorWithAlpha(alt, detail, 0.35) : alt;
            bottomColor = toneSeed > 0.5 ? mixColorWithAlpha(alt, detail, 0.35) : alt;
          } else {
            topColor = toneSeed > 0.45 ? mixColorWithAlpha(base, detail, 0.25) : base;
            bottomColor = toneSeed > 0.45 ? mixColorWithAlpha(base, detail, 0.25) : base;
          }

          const tileX = gridX * cellSize;
          const tileY = gridY * cellSize;
          const tileGradient = context.createLinearGradient(0, tileY, 0, tileY + cellSize);
          tileGradient.addColorStop(0, rgbaColorToCss(topColor));
          tileGradient.addColorStop(1, rgbaColorToCss(bottomColor));
          context.fillStyle = tileGradient;
          context.fillRect(tileX, tileY, cellSize + 1, cellSize + 1);

          const tuftSize = 6 + hashNoise(gridX + 14, gridY + 3) * 16;
          const detailColor = mixColorWithAlpha(detail, detail, 0.5);
          context.fillStyle = rgbaColorToCss(detailColor);
          context.beginPath();
          context.ellipse(
            tileX + hashNoise(gridX + 2, gridY + 5) * cellSize,
            tileY + hashNoise(gridX + 8, gridY + 11) * cellSize,
            tuftSize,
            tuftSize * 0.6,
            hashNoise(gridX + 12, gridY + 15) * Math.PI,
            0,
            Math.PI * 2,
          );
          context.fill();

          const riverMix = biomeBlend.primary === "river"
            ? Math.max(0.45, 1 - (biomeBlend.mix || 0) * 0.4)
            : biomeBlend.secondary === "river"
              ? biomeBlend.mix || 0
              : 0;
          if (riverMix > 0) {
            const worldX = tileX;
            const worldY = tileY;
            const ribbon = Math.sin((worldY + worldX * 0.25) * 0.008) * cellSize * 0.36;
            const riverCenter = tileX + cellSize * 0.5 + ribbon;
            context.fillStyle = `rgba(84, 154, 194, ${(0.08 + riverMix * 0.14).toFixed(3)})`;
            context.fillRect(riverCenter - cellSize * 0.18, tileY - 1, cellSize * 0.36, cellSize + 2);
          }
        }
      }

      this.groundTexture.needsUpdate = true;
      if (this.ground && this.ground.material) {
        this.ground.material.map = this.groundTexture;
        this.ground.material.needsUpdate = true;
      }
    }

    updateGroundAppearance(biomeBlend) {
      if (!biomeBlend) {
        return;
      }

      const colors = {
        green: "#88aa68",
        desert: "#96a86f",
        snow: "#9db08f",
        mountain: "#87a06f",
        river: "#7da27c",
        farmland: "#97a167",
        autumn: "#928d5f",
        marsh: "#75906d",
        canyon: "#9d9066",
      };
      const primary = new THREE.Color(colors[biomeBlend.primary] || colors.green);
      const secondary = new THREE.Color(colors[biomeBlend.secondary] || colors.green);
      primary.lerp(secondary, biomeBlend.mix || 0);
      this.ground.material.color.copy(primary);
      this.scene.fog.color.copy(primary).lerp(new THREE.Color("#9db58a"), 0.28);
      this.rebuildGroundTexture(biomeBlend);
    }

    updateSignals() {
      this.signalRefs.forEach(({ signal, light }) => {
        const aspect = signal.kind === "red" ? signal.aspect : signal.kind;
        const color = aspect === "red" ? 0xff7f72 : aspect === "yellow" ? 0xffd75c : 0x7dff8e;
        light.material.color.setHex(color);
        light.material.emissive.setHex(color);
        light.material.emissiveIntensity = aspect === "red" ? 1.8 : 1.3;
      });
    }

    updateStations(activeStationIndex) {
      this.stationRefs.forEach(({ index, marker, halo }) => {
        const isActive = index === activeStationIndex;
        marker.material.emissiveIntensity = isActive ? 1.4 : 0.6;
        marker.material.color.set(isActive ? "#9bffd8" : "#77e6a0");
        halo.material.opacity = isActive ? 0.82 : 0.42;
      });
    }

    updateTrain(renderedUnits, overspeedTimer, derailment) {
      if (!renderedUnits) {
        return;
      }

      renderedUnits.slice(0, 2).forEach((unit, index) => {
        const entry = this.trainMeshes[index];
        if (!entry) {
          return;
        }

        const bodyColor = (overspeedTimer > 0.2 || derailment) && unit.type === "locomotive"
          ? "#ff9b6d"
          : unit.bodyColor;

        entry.group.position.set(unit.renderX, 0, unit.renderY);
        entry.group.rotation.y = Math.PI * 0.5 - unit.renderHeading;
        applyLitFlatColor(entry.bodyMaterial, bodyColor, 0.18);
        applyLitFlatColor(entry.roofMaterial, unit.roofColor, 0.12);
      });
    }

    updateGroundMotion(trainPose) {
      if (!trainPose) {
        return;
      }

      const repeatX = this.groundTexture.repeat.x;
      const repeatY = this.groundTexture.repeat.y;
      const offsetScaleX = repeatX / this.groundWorldSize;
      const offsetScaleY = repeatY / this.groundWorldSize;
      const offsetX = ((trainPose.x * offsetScaleX) % 1 + 1) % 1;
      const offsetY = ((-trainPose.y * offsetScaleY) % 1 + 1) % 1;
      this.groundTexture.offset.set(offsetX, offsetY);
    }

    updateCamera(trainPose, renderedUnits, trainLength, speedRatio) {
      if (!trainPose) {
        return;
      }

      const now = global.performance && typeof global.performance.now === "function"
        ? global.performance.now()
        : Date.now();
      const deltaSeconds = this.lastCameraUpdateTime > 0
        ? Math.max(1 / 240, Math.min(0.08, (now - this.lastCameraUpdateTime) / 1000))
        : 1 / 60;
      this.lastCameraUpdateTime = now;

      const leadUnit = renderedUnits && renderedUnits.length ? renderedUnits[0] : null;
      const tailUnit = renderedUnits && renderedUnits.length ? renderedUnits[renderedUnits.length - 1] : null;
      const frontX = leadUnit && leadUnit.frontX != null
        ? leadUnit.frontX
        : trainPose.x + Math.cos(trainPose.heading) * trainLength * 0.5;
      const frontZ = leadUnit && leadUnit.frontY != null
        ? leadUnit.frontY
        : trainPose.y + Math.sin(trainPose.heading) * trainLength * 0.5;
      const rearX = tailUnit && tailUnit.rearX != null
        ? tailUnit.rearX
        : trainPose.x - Math.cos(trainPose.heading) * trainLength * 0.5;
      const rearZ = tailUnit && tailUnit.rearY != null
        ? tailUnit.rearY
        : trainPose.y - Math.sin(trainPose.heading) * trainLength * 0.5;
      const consistCenterX = (frontX + rearX) * 0.5;
      const consistCenterZ = (frontZ + rearZ) * 0.5;
      const dynamicZoom = 1 + speedRatio * 0.5;
      const lookAhead = 24 + trainLength * 0.18 + speedRatio * 120;
      const centerBack = 58 + trainLength * 0.4 + speedRatio * 58;
      const height = (54 + trainLength * 0.27) * dynamicZoom;
      const headingDelta = Math.abs(normalizeAngle(trainPose.heading - this.cameraHeading));

      if (!this.cameraReady) {
        this.cameraHeading = trainPose.heading;
      } else {
        const headingFollowRate = lerp(1.9, 0.85, Math.min(1, headingDelta / 0.7));
        const headingBlend = 1 - Math.exp(-headingFollowRate * deltaSeconds);
        this.cameraHeading = lerpAngle(this.cameraHeading, trainPose.heading, headingBlend);
      }

      const sideExposure = Math.min(1, headingDelta / 0.55);
      const sideBias = 7 + speedRatio * 5 + sideExposure * (8 + speedRatio * 4);
      const normalX = -Math.sin(this.cameraHeading);
      const normalZ = Math.cos(this.cameraHeading);
      const forwardX = Math.cos(this.cameraHeading);
      const forwardZ = Math.sin(this.cameraHeading);
      const desiredTarget = new THREE.Vector3(
        consistCenterX + forwardX * (lookAhead * (1 - sideExposure * 0.24)) + normalX * sideExposure * 4.5,
        5 + sideExposure * 1.4,
        consistCenterZ + forwardZ * (lookAhead * (1 - sideExposure * 0.24)) + normalZ * sideExposure * 4.5,
      );
      const desiredPosition = new THREE.Vector3(
        consistCenterX - forwardX * (centerBack * (1 - sideExposure * 0.12)) + normalX * (sideBias + 1.5),
        height + sideExposure * 8,
        consistCenterZ - forwardZ * (centerBack * (1 - sideExposure * 0.12)) + normalZ * (sideBias + 1.5),
      );

      if (!this.cameraReady) {
        this.cameraPosition = desiredPosition.clone();
        this.cameraTarget = desiredTarget.clone();
        this.cameraReady = true;
      } else {
        this.cameraPosition.lerp(desiredPosition, 0.12);
        this.cameraTarget.lerp(desiredTarget, 0.16);
      }

      this.camera.position.copy(this.cameraPosition);
      this.camera.lookAt(this.cameraTarget);
      this.sunLight.target.position.set(trainPose.x, 0, trainPose.y);
      this.root.add(this.sunLight.target);
      this.ground.position.set(trainPose.x, -0.08, trainPose.y);
      this.updateGroundMotion(trainPose);
    }

    renderFrame({ trainPose, renderedUnits, trainLength, activeStationIndex, overspeedTimer, derailment, maxLineSpeed, speed, biomeBlend }) {
      if (!this.available || !this.routeState) {
        return;
      }

      this.resize();
      this.updateGroundAppearance(biomeBlend);
      this.updateSceneryAppearance(biomeBlend);
      this.updateSignals();
      this.updateStations(activeStationIndex);
      this.updateTrain(renderedUnits, overspeedTimer, derailment);
      this.updateCamera(
        trainPose,
        renderedUnits,
        trainLength,
        Math.max(0, Math.min(1.2, speed / Math.max(maxLineSpeed, 1e-6))),
      );
      this.renderer.render(this.scene, this.camera);
    }
  }

  global.TrainDriver3DInsetRenderer = TrainDriver3DInsetRenderer;
})(window);
