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
      if (child.children?.length) {
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
        base: [214, 225, 232],
        alt: [173, 193, 207],
        detail: [244, 248, 252],
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

  class TrainDriver3DInsetRenderer {
    constructor({ container, statusElement }) {
      this.container = container;
      this.statusElement = statusElement;
      this.available = Boolean(THREE && container);
      this.routeRef = null;
      this.routeState = null;
      this.signalRefs = [];
      this.stationRefs = [];
      this.trainMeshes = [];
      this.cameraReady = false;
      this.cameraPosition = null;
      this.cameraTarget = null;
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
      this.scene.fog = new THREE.Fog(0x6b8ea8, 320, 2100);

      this.camera = new THREE.PerspectiveCamera(38, 1, 1, 5000);
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
      this.groundTexture.repeat.set(34, 34);
      if (this.renderer.capabilities?.getMaxAnisotropy) {
        this.groundTexture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
      }
      if ("colorSpace" in this.groundTexture && THREE.SRGBColorSpace) {
        this.groundTexture.colorSpace = THREE.SRGBColorSpace;
      } else if ("encoding" in this.groundTexture && THREE.sRGBEncoding) {
        this.groundTexture.encoding = THREE.sRGBEncoding;
      }
      this.groundTexture.needsUpdate = true;

      this.ground = new THREE.Mesh(
        new THREE.PlaneGeometry(40000, 40000),
        new THREE.MeshStandardMaterial({
          color: 0x6c8d55,
          map: this.groundTexture,
          roughness: 0.98,
          metalness: 0.02,
        }),
      );
      this.ground.rotation.x = -Math.PI * 0.5;
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
      this.resizeObserver?.observe(this.container);

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
      this.trainMeshes = [];
      this.cameraReady = false;

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

      const bedMesh = this.createRibbonMesh(samples, trackWidth * 2.6, 0.1, bedMaterial);
      bedMesh.receiveShadow = true;
      this.trackGroup.add(bedMesh);

      const leftRailSamples = samples.map((sample) => {
        const normalX = -Math.sin(sample.heading);
        const normalZ = Math.cos(sample.heading);
        return {
          x: sample.x + normalX * trackWidth * 0.5,
          z: sample.z + normalZ * trackWidth * 0.5,
          heading: sample.heading,
        };
      });
      const rightRailSamples = samples.map((sample) => {
        const normalX = -Math.sin(sample.heading);
        const normalZ = Math.cos(sample.heading);
        return {
          x: sample.x - normalX * trackWidth * 0.5,
          z: sample.z - normalZ * trackWidth * 0.5,
          heading: sample.heading,
        };
      });

      const leftRail = this.createRibbonMesh(leftRailSamples, 0.24, 0.22, railMaterial.clone());
      const rightRail = this.createRibbonMesh(rightRailSamples, 0.24, 0.22, railMaterial.clone());
      leftRail.castShadow = true;
      leftRail.receiveShadow = true;
      rightRail.castShadow = true;
      rightRail.receiveShadow = true;
      this.trackGroup.add(leftRail, rightRail);

      const sleeperGeometry = new THREE.BoxGeometry(trackWidth * 1.65, 0.16, 1.7);
      const sleeperMaterial = new THREE.MeshStandardMaterial({
        color: 0x8d6c4e,
        roughness: 0.98,
        metalness: 0.02,
      });
      const sleeperStep = 18;
      for (let distance = 0; distance <= route.totalLength; distance += sleeperStep) {
        const point = sampleRoute(distance);
        const sleeper = new THREE.Mesh(sleeperGeometry, sleeperMaterial);
        sleeper.position.set(point.x, 0.08, point.y);
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
            new THREE.BoxGeometry(6.5, 0.9, 38),
            platformMaterial,
          );
          platform.position.set(
            point.x + normalX * side * (trackWidth * 1.65 + 4.8),
            0.45,
            point.y + normalZ * side * (trackWidth * 1.65 + 4.8),
          );
          platform.rotation.y = Math.PI * 0.5 - point.heading;
          platform.castShadow = true;
          platform.receiveShadow = true;
          group.add(platform);
        });

        const marker = new THREE.Mesh(
          new THREE.CylinderGeometry(0.75, 0.75, 8, 18),
          markerMaterial,
        );
        marker.position.set(point.x, 4.2, point.y);
        marker.castShadow = true;
        group.add(marker);

        const halo = new THREE.Mesh(
          new THREE.CylinderGeometry(6.5, 6.5, 0.18, 28),
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
          new THREE.CylinderGeometry(0.24, 0.3, 8.2, 12),
          new THREE.MeshStandardMaterial({
            color: 0xd1dde7,
            roughness: 0.58,
            metalness: 0.42,
          }),
        );
        mast.position.set(signalX, 4.1, signalZ);
        mast.castShadow = true;
        mast.receiveShadow = true;

        const housing = new THREE.Mesh(
          new THREE.BoxGeometry(1.4, 2.2, 1.2),
          new THREE.MeshStandardMaterial({
            color: 0x111921,
            roughness: 0.76,
            metalness: 0.18,
          }),
        );
        housing.position.set(signalX, 8.4, signalZ);
        housing.castShadow = true;

        const light = new THREE.Mesh(
          new THREE.SphereGeometry(0.42, 16, 16),
          new THREE.MeshStandardMaterial({
            color: 0x7dff8e,
            emissive: 0x2aff55,
            emissiveIntensity: 1.4,
            roughness: 0.35,
            metalness: 0.08,
          }),
        );
        light.position.set(signalX, 8.45, signalZ + signal.side * 0.12);
        light.castShadow = true;

        this.signalGroup.add(mast, housing, light);
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
        object.scale.setScalar(item.size);
        applyShadowFlags(object, true, true);
        this.sceneryGroup.add(object);
      });
    }

    createSceneryObject(item) {
      const tintShift = item.tint / 255;
      const group = new THREE.Group();

      const makeMaterial = (base) => {
        const color = new THREE.Color(base);
        color.offsetHSL(0, 0, tintShift);
        return new THREE.MeshStandardMaterial({
          color,
          roughness: 0.86,
          metalness: 0.05,
        });
      };

      if (item.kind === "tree" || item.kind === "bush") {
        const trunk = new THREE.Mesh(
          new THREE.CylinderGeometry(0.35, 0.45, item.kind === "tree" ? 3.8 : 1.6, 10),
          makeMaterial("#70513e"),
        );
        trunk.position.y = item.kind === "tree" ? 1.9 : 0.8;
        group.add(trunk);

        const canopy = new THREE.Mesh(
          new THREE.SphereGeometry(item.kind === "tree" ? 2.6 : 1.8, 14, 14),
          makeMaterial(item.kind === "tree" ? "#3d7c49" : "#4d8a57"),
        );
        canopy.position.y = item.kind === "tree" ? 5.4 : 1.9;
        canopy.scale.set(item.kind === "tree" ? 1.2 : 1.4, 1, item.kind === "tree" ? 1.1 : 1.3);
        group.add(canopy);
        return group;
      }

      if (item.kind === "rock" || item.kind === "stump") {
        const rock = new THREE.Mesh(
          new THREE.DodecahedronGeometry(item.kind === "rock" ? 1.7 : 1.1, 0),
          makeMaterial(item.kind === "rock" ? "#7b8792" : "#7e5c43"),
        );
        rock.position.y = item.kind === "rock" ? 1.3 : 0.7;
        rock.scale.set(1.2, 0.8, 1);
        group.add(rock);
        return group;
      }

      if (item.kind === "pond") {
        const pond = new THREE.Mesh(
          new THREE.CylinderGeometry(3.4, 3.8, 0.18, 20),
          new THREE.MeshStandardMaterial({
            color: new THREE.Color("#4f9fd0"),
            transparent: true,
            opacity: 0.78,
            roughness: 0.08,
            metalness: 0.1,
          }),
        );
        pond.position.y = 0.09;
        pond.scale.set(1.4, 1, 1);
        group.add(pond);
        return group;
      }

      if (item.kind === "billboard") {
        const post = new THREE.Mesh(
          new THREE.BoxGeometry(0.35, 4.4, 0.35),
          makeMaterial("#60483a"),
        );
        post.position.y = 2.2;
        group.add(post);
        const board = new THREE.Mesh(
          new THREE.BoxGeometry(4.8, 2.2, 0.3),
          makeMaterial(item.tint > 0 ? "#ffe28a" : "#9ad7ff"),
        );
        board.position.y = 4.6;
        group.add(board);
        return group;
      }

      if (item.kind === "cactus") {
        const stem = new THREE.Mesh(
          new THREE.BoxGeometry(1.1, 4.8, 1.1),
          makeMaterial("#3d7e50"),
        );
        stem.position.y = 2.4;
        const arm = new THREE.Mesh(
          new THREE.BoxGeometry(0.8, 2.6, 0.8),
          makeMaterial("#3d7e50"),
        );
        arm.position.set(0.9, 2.5, 0);
        group.add(stem, arm);
        return group;
      }

      if (item.kind === "windmill") {
        const mast = new THREE.Mesh(
          new THREE.CylinderGeometry(0.3, 0.45, 7, 10),
          makeMaterial("#d5dce2"),
        );
        mast.position.y = 3.5;
        group.add(mast);
        const hub = new THREE.Mesh(
          new THREE.SphereGeometry(0.45, 10, 10),
          makeMaterial("#e7eef3"),
        );
        hub.position.y = 7.2;
        group.add(hub);
        for (let bladeIndex = 0; bladeIndex < 4; bladeIndex += 1) {
          const blade = new THREE.Mesh(
            new THREE.BoxGeometry(0.18, 2.8, 0.45),
            makeMaterial("#f1f5f8"),
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
        makeMaterial(item.kind === "barn" ? "#b34f43" : item.kind === "hut" ? "#c6935f" : item.kind === "silo" ? "#aab4bc" : "#8a7a6a"),
      );
      building.position.y = item.kind === "silo" ? 4 : 2.1;
      group.add(building);

      if (item.kind !== "silo") {
        const roof = new THREE.Mesh(
          new THREE.ConeGeometry(3.6, 1.8, 4),
          makeMaterial(item.kind === "barn" ? "#7c2c24" : "#71492f"),
        );
        roof.position.y = item.kind === "barn" ? 5.2 : 4.8;
        roof.rotation.y = Math.PI * 0.25;
        group.add(roof);
      }

      return group;
    }

    buildTrainMeshes() {
      const { trainConsist } = this.routeState;
      trainConsist.forEach((unit) => {
        const group = new THREE.Group();

        const bodyMaterial = new THREE.MeshStandardMaterial({
          color: new THREE.Color(unit.bodyColor),
          roughness: 0.52,
          metalness: 0.2,
        });
        const roofMaterial = new THREE.MeshStandardMaterial({
          color: new THREE.Color(unit.roofColor),
          roughness: 0.36,
          metalness: 0.12,
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
          new THREE.BoxGeometry(unit.width * 0.72, unit.type === "locomotive" ? 1.2 : 1, unit.length * 0.56),
          roofMaterial,
        );
        roof.position.y = unit.type === "locomotive" ? 4.45 : 3.85;
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
        this.trainMeshes.push({ group, bodyMaterial });
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

      const primaryPalette = getBiomePalette(biomeBlend.primary);
      const secondaryPalette = getBiomePalette(biomeBlend.secondary);
      const base = mixColorChannels(primaryPalette.base, secondaryPalette.base, biomeBlend.mix || 0);
      const alt = mixColorChannels(primaryPalette.alt, secondaryPalette.alt, biomeBlend.mix || 0);
      const detail = mixColorChannels(primaryPalette.detail, secondaryPalette.detail, biomeBlend.mix || 0);

      context.clearRect(0, 0, this.groundTextureCanvas.width, this.groundTextureCanvas.height);
      const gradient = context.createLinearGradient(0, 0, 0, this.groundTextureCanvas.height);
      gradient.addColorStop(0, colorChannelsToCss(mixColorChannels(base, detail, 0.12)));
      gradient.addColorStop(0.52, colorChannelsToCss(base));
      gradient.addColorStop(1, colorChannelsToCss(mixColorChannels(base, alt, 0.28)));
      context.fillStyle = gradient;
      context.fillRect(0, 0, this.groundTextureCanvas.width, this.groundTextureCanvas.height);

      const cellSize = 32;
      for (let gridY = 0; gridY < this.groundTextureCanvas.height / cellSize; gridY += 1) {
        for (let gridX = 0; gridX < this.groundTextureCanvas.width / cellSize; gridX += 1) {
          const seed = hashNoise(gridX * 0.7, gridY * 0.7);
          const tone = hashNoise(gridX * 1.9 + 4, gridY * 1.7 + 9);
          let fill = base;
          if (seed > 0.72) {
            fill = tone > 0.5 ? mixColorChannels(base, alt, 0.55) : alt;
          } else if (seed > 0.44) {
            fill = tone > 0.5 ? mixColorChannels(alt, detail, 0.35) : alt;
          } else if (tone > 0.45) {
            fill = mixColorChannels(base, detail, 0.25);
          }

          context.fillStyle = colorChannelsToCss(fill, 0.88);
          context.fillRect(gridX * cellSize, gridY * cellSize, cellSize + 1, cellSize + 1);

          const tuftSize = 4 + hashNoise(gridX + 2, gridY + 5) * 10;
          context.fillStyle = colorChannelsToCss(mixColorChannels(detail, alt, 0.35), 0.34);
          context.beginPath();
          context.ellipse(
            gridX * cellSize + hashNoise(gridX + 8, gridY + 11) * cellSize,
            gridY * cellSize + hashNoise(gridX + 12, gridY + 15) * cellSize,
            tuftSize,
            tuftSize * 0.66,
            hashNoise(gridX + 14, gridY + 3) * Math.PI,
            0,
            Math.PI * 2,
          );
          context.fill();
        }
      }

      const riverMix = biomeBlend.primary === "river"
        ? Math.max(0.45, 1 - (biomeBlend.mix || 0) * 0.4)
        : biomeBlend.secondary === "river"
          ? biomeBlend.mix || 0
          : 0;
      if (riverMix > 0) {
        context.strokeStyle = colorChannelsToCss([84, 154, 194], 0.22 + riverMix * 0.18);
        context.lineWidth = 22;
        context.beginPath();
        context.moveTo(-32, 90);
        for (let x = -32; x <= this.groundTextureCanvas.width + 32; x += 32) {
          const y = 90 + Math.sin(x * 0.025) * 26 + Math.cos(x * 0.011) * 14;
          context.lineTo(x, y);
        }
        context.stroke();
      }

      for (let index = 0; index < 44; index += 1) {
        const x = hashNoise(index * 2.1, 7.3) * this.groundTextureCanvas.width;
        const y = hashNoise(index * 1.7, 12.4) * this.groundTextureCanvas.height;
        const radius = 5 + hashNoise(index * 0.9, 2.8) * 16;
        context.fillStyle = colorChannelsToCss(mixColorChannels(base, detail, 0.5), 0.08);
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fill();
      }

      this.groundTexture.needsUpdate = true;
    }

    updateGroundAppearance(biomeBlend) {
      if (!biomeBlend) {
        return;
      }

      const colors = {
        green: "#7ea666",
        desert: "#cba86a",
        snow: "#cdd9e0",
        mountain: "#7d857f",
        river: "#6a958b",
        farmland: "#a8945e",
        autumn: "#9c6a43",
        marsh: "#69846b",
        canyon: "#b06e50",
      };
      const primary = new THREE.Color(colors[biomeBlend.primary] || colors.green);
      const secondary = new THREE.Color(colors[biomeBlend.secondary] || colors.green);
      primary.lerp(secondary, biomeBlend.mix || 0);
      this.ground.material.color.copy(primary);
      this.scene.fog.color.copy(primary).lerp(new THREE.Color("#91b6d1"), 0.36);
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

      renderedUnits.forEach((unit, index) => {
        const entry = this.trainMeshes[index];
        if (!entry) {
          return;
        }

        entry.group.position.set(unit.renderX, 0, unit.renderY);
        entry.group.rotation.y = Math.PI * 0.5 - unit.renderHeading;
        entry.bodyMaterial.color.set((overspeedTimer > 0.2 || derailment) && unit.type === "locomotive" ? "#ff9b6d" : unit.bodyColor);
      });
    }

    updateCamera(trainPose, speedRatio) {
      if (!trainPose) {
        return;
      }

      const lookAhead = 36 + speedRatio * 58;
      const followBack = 64 + speedRatio * 42;
      const height = 92 + speedRatio * 34;
      const sideBias = 10;
      const normalX = -Math.sin(trainPose.heading);
      const normalZ = Math.cos(trainPose.heading);
      const desiredTarget = new THREE.Vector3(
        trainPose.x + Math.cos(trainPose.heading) * lookAhead,
        5,
        trainPose.y + Math.sin(trainPose.heading) * lookAhead,
      );
      const desiredPosition = new THREE.Vector3(
        trainPose.x - Math.cos(trainPose.heading) * followBack + normalX * sideBias,
        height,
        trainPose.y - Math.sin(trainPose.heading) * followBack + normalZ * sideBias,
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
      this.ground.position.set(trainPose.x, 0, trainPose.y);
    }

    renderFrame({ trainPose, renderedUnits, activeStationIndex, overspeedTimer, derailment, maxLineSpeed, speed, biomeBlend }) {
      if (!this.available || !this.routeState) {
        return;
      }

      this.resize();
      this.updateGroundAppearance(biomeBlend);
      this.updateSignals();
      this.updateStations(activeStationIndex);
      this.updateTrain(renderedUnits, overspeedTimer, derailment);
      this.updateCamera(trainPose, Math.max(0, Math.min(1.2, speed / Math.max(maxLineSpeed, 1e-6))));
      this.renderer.render(this.scene, this.camera);
    }
  }

  global.TrainDriver3DInsetRenderer = TrainDriver3DInsetRenderer;
})(window);
