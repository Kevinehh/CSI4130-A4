import * as THREE from "three";
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';

// SCENE
const scene = new THREE.Scene();
const backgroundTextureLoader = new THREE.TextureLoader();
const backgroundTexture = backgroundTextureLoader.load('resources/sky.jpg', function(texture) {
    // When texture loads, set it as the scene background
    scene.background = texture;
});

let solarSystemVisible = false; // Track if solar system is visible
let asteroidBeltVisible = false; // Track if asteroid belt is visible

// global configuration
const beltRadius = 600; // overall radius of the asteroid belt
const asteroidCount = 500; // total number of asteroids
const radiusVariation = 50; // variation in radial distance for asteroids
const beltThickness = 50; // vertical spread of the belt

let fogVolume = new THREE.Mesh();

// CAMERA
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 5000);

// RENDERER
const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('canvas.webgl') });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;

// CONTROLS
const orbitControls = new OrbitControls(camera, renderer.domElement);
orbitControls.enableDamping = true;
orbitControls.minDistance = 5;
orbitControls.maxDistance = 15;
orbitControls.enablePan = false;
// Allow full rotation around the model
orbitControls.maxPolarAngle = Math.PI; // Allow viewing from below
orbitControls.minPolarAngle = 0; // Allow viewing from above
orbitControls.update();

// Camera follow settings
const cameraOffset = new THREE.Vector3(-10, 2, -15); // Fixed camera offset from model
let cameraFollowEnabled = true; // Flag to toggle between OrbitControls and auto-follow
let currentTarget = null; // Variable to track which object is currently being followed

let rocketPhysics = {
    velocity: new THREE.Vector3(0, 0, 0),
    angularVelocity: new THREE.Vector3(0, 0, 0),
    thrust: 0.002,
    turnSpeed: 0.0001,
    drag: 0.997,
    maxSpeed: 0.3,
    angularDrag: 0.997
};

// Control states for keyboard input
const keyState = {
  w: false, // Forward thrusters
  s: false, // Backward thrusters
  a: false, // Left thrusters
  d: false, // Right thrusters
  q: false, // Up thrusters
  e: false, // Down thrusters
  shift: false, // Boost thrusters
};

// initialize simplex noise 
const simplex = new SimplexNoise();

// global variable for solar system group 
let solarSystemGroup;

// Particle system shader code
const _VS = `
uniform float pointMultiplier;

attribute float size;
attribute float angle;
attribute vec4 colour;

varying vec4 vColour;
varying vec2 vAngle;

void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);

  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = size * pointMultiplier / gl_Position.w;

  vAngle = vec2(cos(angle), sin(angle));
  vColour = colour;
}`;

const _FS = `
uniform sampler2D diffuseTexture;

varying vec4 vColour;
varying vec2 vAngle;

void main() {
  vec2 coords = (gl_PointCoord - 0.5) * mat2(vAngle.x, vAngle.y, -vAngle.y, vAngle.x) + 0.5;
  gl_FragColor = texture2D(diffuseTexture, coords) * vColour;
}`;

// LinearSpline class for particle effects
class LinearSpline {
    constructor(lerp) {
        this._points = [];
        this._lerp = lerp;
    }

    AddPoint(t, d) {
        this._points.push([t, d]);
    }

    Get(t) {
        let p1 = 0;

        for (let i = 0; i < this._points.length; i++) {
            if (this._points[i][0] >= t) {
                break;
            }
            p1 = i;
        }

        const p2 = Math.min(this._points.length - 1, p1 + 1);

        if (p1 == p2) {
            return this._points[p1][1];
        }

        return this._lerp(
            (t - this._points[p1][0]) / (
                this._points[p2][0] - this._points[p1][0]),
            this._points[p1][1], this._points[p2][1]);
    }
}

// ParticleSystem class for rocket exhaust
class ParticleSystem {
    constructor(params) {
        const uniforms = {
            diffuseTexture: {
                value: new THREE.TextureLoader().load('./resources/fire.png')
            },
            pointMultiplier: {
                value: window.innerHeight / (2.0 * Math.tan(0.5 * 60.0 * Math.PI / 180.0))
            }
        };

        this._material = new THREE.ShaderMaterial({
            uniforms: uniforms,
            vertexShader: _VS,
            fragmentShader: _FS,
            blending: THREE.AdditiveBlending,
            depthTest: true,
            depthWrite: false,
            transparent: true,
            vertexColors: true
        });

        this._camera = params.camera;
        this._particles = [];

        this._geometry = new THREE.BufferGeometry();
        this._geometry.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
        this._geometry.setAttribute('size', new THREE.Float32BufferAttribute([], 1));
        this._geometry.setAttribute('colour', new THREE.Float32BufferAttribute([], 4));
        this._geometry.setAttribute('angle', new THREE.Float32BufferAttribute([], 1));

        this._points = new THREE.Points(this._geometry, this._material);

        params.parent.add(this._points);

        this._alphaSpline = new LinearSpline((t, a, b) => {
            return a + t * (b - a);
        });
        this._alphaSpline.AddPoint(0.0, 0.0);
        this._alphaSpline.AddPoint(0.1, 1.0);
        this._alphaSpline.AddPoint(0.6, 1.0);
        this._alphaSpline.AddPoint(1.0, 0.0);

        this._colourSpline = new LinearSpline((t, a, b) => {
            const c = a.clone();
            return c.lerp(b, t);
        });
        this._colourSpline.AddPoint(0.0, new THREE.Color(0xFFFF80));
        this._colourSpline.AddPoint(1.0, new THREE.Color(0xFF8080));

        this._sizeSpline = new LinearSpline((t, a, b) => {
            return a + t * (b - a);
        });
        this._sizeSpline.AddPoint(0.0, 1.0);
        this._sizeSpline.AddPoint(0.5, 5.0);
        this._sizeSpline.AddPoint(1.0, 1.0);

        document.addEventListener('keyup', (e) => this._onKeyUp(e), false);

        this._UpdateGeometry();
    }

    _onKeyUp(event) {
        switch (event.keyCode) {
            case 32: // SPACE
                this._AddParticles();
                break;
        }
    }

    _AddParticles(timeElapsed) {
        if (!this.gdfsghk) {
            this.gdfsghk = 0.0;
        }
        this.gdfsghk += timeElapsed;
        const n = Math.floor(this.gdfsghk * 75.0);
        this.gdfsghk -= n / 75.0;

        for (let i = 0; i < n; i++) {
            const life = (Math.random() * 0.75 + 0.25) * 10.0;
            this._particles.push({
                position: new THREE.Vector3(
                    (Math.random() * 2 - 1) * 1.0,
                    (Math.random() * 2 - 1) * 1.0,
                    (Math.random() * 2 - 1) * 1.0),
                size: (Math.random() * 0.5 + 0.5) * 4.0,
                colour: new THREE.Color(),
                alpha: 1.0,
                life: life,
                maxLife: life,
                rotation: Math.random() * 2.0 * Math.PI,
                velocity: new THREE.Vector3(0, -15, 0),
            });
        }
    }

    _UpdateGeometry() {
        const positions = [];
        const sizes = [];
        const colours = [];
        const angles = [];

        for (let p of this._particles) {
            positions.push(p.position.x, p.position.y, p.position.z);
            colours.push(p.colour.r, p.colour.g, p.colour.b, p.alpha);
            sizes.push(p.currentSize);
            angles.push(p.rotation);
        }

        this._geometry.setAttribute(
            'position', new THREE.Float32BufferAttribute(positions, 3));
        this._geometry.setAttribute(
            'size', new THREE.Float32BufferAttribute(sizes, 1));
        this._geometry.setAttribute(
            'colour', new THREE.Float32BufferAttribute(colours, 4));
        this._geometry.setAttribute(
            'angle', new THREE.Float32BufferAttribute(angles, 1));

        this._geometry.attributes.position.needsUpdate = true;
        this._geometry.attributes.size.needsUpdate = true;
        this._geometry.attributes.colour.needsUpdate = true;
        this._geometry.attributes.angle.needsUpdate = true;
    }

    _UpdateParticles(timeElapsed) {
        for (let p of this._particles) {
            p.life -= timeElapsed;
        }

        this._particles = this._particles.filter(p => {
            return p.life > 0.0;
        });

        for (let p of this._particles) {
            const t = 1.0 - p.life / p.maxLife;

            p.rotation += timeElapsed * 0.5;
            p.alpha = this._alphaSpline.Get(t);
            p.currentSize = p.size * this._sizeSpline.Get(t);
            p.colour.copy(this._colourSpline.Get(t));

            p.position.add(p.velocity.clone().multiplyScalar(timeElapsed));

            const drag = p.velocity.clone();
            drag.multiplyScalar(timeElapsed * 0.1);
            drag.x = Math.sign(p.velocity.x) * Math.min(Math.abs(drag.x), Math.abs(p.velocity.x));
            drag.y = Math.sign(p.velocity.y) * Math.min(Math.abs(drag.y), Math.abs(p.velocity.y));
            drag.z = Math.sign(p.velocity.z) * Math.min(Math.abs(drag.z), Math.abs(p.velocity.z));
            p.velocity.sub(drag);
        }

        this._particles.sort((a, b) => {
            const d1 = this._camera.position.distanceTo(a.position);
            const d2 = this._camera.position.distanceTo(b.position);

            if (d1 > d2) {
                return -1;
            }

            if (d1 < d2) {
                return 1;
            }

            return 0;
        });
    }

    Step(timeElapsed) {
        this._AddParticles(timeElapsed);
        this._UpdateParticles(timeElapsed);
        this._UpdateGeometry();
    }
}

// Add keyboard event listeners for rocket controls
window.addEventListener('keydown', (event) => {
    switch(event.key.toLowerCase()) {
      case 'w': keyState.w = true; break;
      case 's': keyState.s = true; break;
      case 'a': keyState.a = true; break;
      case 'd': keyState.d = true; break;
      case 'q': keyState.q = true; break;
      case 'e': keyState.e = true; break;
      case 'shift': keyState.shift = true; break;
    }
  });
  
  window.addEventListener('keyup', (event) => {
    switch(event.key.toLowerCase()) {
      case 'w': keyState.w = false; break;
      case 's': keyState.s = false; break;
      case 'a': keyState.a = false; break;
      case 'd': keyState.d = false; break;
      case 'q': keyState.q = false; break;
      case 'e': keyState.e = false; break;
      case 'shift': keyState.shift = false; break;
    }
  });
  
  // Add manual rocket activation function for testing
  function activateRocket() {
    if (rocket) {
      isTakingOff = true;
      modelRemoved = true;
      currentTarget = rocket;
      particles._points.visible = true;
      console.log("Rocket manually activated for testing");
    }
  }
  
  // Add key listener for manual activation
  window.addEventListener('keydown', (event) => {
    if (event.key === 'r' || event.key === 'R') {
      activateRocket();
    }
  });

// Add this new event listener to toggle orbit controls behavior
window.addEventListener('keydown', (event) => {
    if (event.key === 'c' || event.key === 'C') {
        cameraFollowEnabled = !cameraFollowEnabled;
        console.log(`Camera follow mode: ${cameraFollowEnabled ? 'ENABLED' : 'DISABLED'}`);

        if (!cameraFollowEnabled && currentTarget) {
            // When disabling follow, set orbit controls target to current object position
            orbitControls.target.copy(new THREE.Vector3(
                currentTarget.position.x,
                currentTarget.position.y + (currentTarget === rocket ? 2 : 1),
                currentTarget.position.z
            ));

            // Store the current distance from camera to object
            const currentDistance = camera.position.distanceTo(orbitControls.target);

            // Update camera position to maintain the same distance but allow orbit
            const direction = new THREE.Vector3().subVectors(
                camera.position,
                orbitControls.target
            ).normalize();

            camera.position.copy(orbitControls.target).add(
                direction.multiplyScalar(currentDistance)
            );

            // Make controls more responsive when in manual mode
            orbitControls.enableDamping = true;
            orbitControls.dampingFactor = 0.1;
        } else {
            // When enabling follow mode, force an immediate camera update
            if (currentTarget) {
                followTarget(currentTarget);
            }
        }
    }
});

// LIGHTS
const ambientLight = new THREE.AmbientLight(0x404040, 2);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 3);
directionalLight.position.set(100, 100, 200);
scene.add(directionalLight);

// global group for shooting stars
const shootingStarsGroup = new THREE.Group();
scene.add(shootingStarsGroup);
const shootingStars = [];
const shootingStarCount = 5;

// load the shaders asynchronously 
let fogMaterial; // declare here, assign after loading

Promise.all([
    fetch('./asteroids/shader/vertexShader.vs').then(response => response.text()),
    fetch('./asteroids/shader/fragmentShader.fs').then(response => response.text())
]).then(([vertexShaderSource, fragmentShaderSource]) => {
    console.log("shaders loaded successfully.");

    // initialize the scene contents after the dhaders are loaded
    initializeScene(vertexShaderSource, fragmentShaderSource);

}).catch(error => {
    console.error("error loading shaders:", error);

});

function initializeScene(vertexShader, fragmentShader) {
    // volumetric fog implementation
    const fogBoundsSize = (beltRadius + radiusVariation) * 2.2;
    const fogBoundingBox = new THREE.BoxGeometry(
        fogBoundsSize,
        fogBoundsSize,
        beltThickness * 3
    );

    fogMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uCameraPos: { value: camera.position },
            uFogColor: { value: new THREE.Color(0xaaaaaa) },
            uBeltRadius: { value: beltRadius },
            uTorusRadius: { value: radiusVariation },
            uNoiseScale: { value: 0.1 },
            uNoiseStrength: { value: 0.2 },
            uDensityScale: { value: 0.005 },
            uSteps: { value: 64 },
            uMaxDist: { value: fogBoundsSize * 1 },
        },
        vertexShader: vertexShader,
        fragmentShader: fragmentShader,
        transparent: true,
        depthWrite: false,
        side: THREE.BackSide
    });

    fogVolume = new THREE.Mesh(fogBoundingBox, fogMaterial);
    fogVolume.visible = false; // Hide fog volume initially
    scene.add(fogVolume);

    // load the solar system
    loadSolarSystem();

    const objLoader = new OBJLoader();
    objLoader.load(
        "./asteroids/resources/asteroid.obj",
        (object) => {
            console.log("./shader/asteroid OBJ loaded.");
            setupAsteroidsAndParticles(object);
            setupShootingStars(); // setup stars after asteroids are conceptually placed

            // start the animation
            animate();
            console.log("scene initialized, starting animation.");
        },
        (xhr) => {
            // console.log((xhr.loaded / xhr.total * 100) + '% loaded'); // Progress
        },
        (error) => {
            console.error("error loading OBJ:", error);
        }
    );
}

// Load the Sun and each planet from separate glTF files,
// applying a scale factor for each model.
function loadSolarSystem() {
    const gltfLoader = new GLTFLoader();
    const solarBodies = [
        { name: "Sun", path: "./asteroids/resources/sun/scene.gltf", orbitRadius: 0, scale: 8.0 },
        { name: "Mercury", path: "./asteroids/resources/mercury/scene.gltf", orbitRadius: 150, scale: 10 },
        { name: "Venus", path: "./asteroids/resources/venus/scene.gltf", orbitRadius: 300, scale: 10 },
        { name: "Earth", path: "./asteroids/resources/earth/scene.gltf", orbitRadius: 400, scale: 10 },
        { name: "Mars", path: "./asteroids/resources/mars/scene.gltf", orbitRadius: 500, scale: 10 },
        { name: "Jupiter", path: "./asteroids/resources/jupiter/scene.gltf", orbitRadius: 850, scale: 20 },
        { name: "Saturn", path: "./asteroids/resources/saturn/scene.gltf", orbitRadius: 1000, scale: 0.1 },
        { name: "Uranus", path: "./asteroids/resources/uranus/scene.gltf", orbitRadius: 1200, scale: 10 },
        { name: "Neptune", path: "./asteroids/resources/neptune/scene.gltf", orbitRadius: 1400, scale: 10 }
    ];

    solarSystemGroup = new THREE.Group();
    solarSystemGroup.visible = false; // Hide solar system initially

    // Load each body and set its position and scale. The Sun stays at the center.
    const promises = solarBodies.map(body => {
        return new Promise((resolve, reject) => {
            gltfLoader.load(
                body.path,
                (gltf) => {
                    const model = gltf.scene;
                    model.name = body.name;
                    // Apply scaling for this model
                    model.scale.set(body.scale, body.scale, body.scale);

                    // Position planets along the positive X axis if they're not the Sun.
                    if (body.orbitRadius !== 0) {
                        // Create a pivot group so the planet can orbit the Sun
                        const pivot = new THREE.Object3D();
                        pivot.add(model);
                        model.position.set(body.orbitRadius, 0, 0);
                        // Set an orbit speed (adjust the factor as desired)
                        pivot.userData.orbitSpeed = 0.005 * (300 / body.orbitRadius);
                        resolve(pivot);
                    } else {
                        resolve(model);
                    }
                },
                undefined,
                (error) => reject(error)
            );
        });
    });

    Promise.all(promises)
        .then(models => {
            models.forEach(model => solarSystemGroup.add(model));
            scene.add(solarSystemGroup);
            console.log("Solar system models loaded successfully.");
        })
        .catch(error => {
            console.error("Error loading solar system models:", error);
        });
}

function setupAsteroidsAndParticles(object) {
    let baseMesh = null;
    object.traverse((child) => {
        if (child.isMesh) {
            baseMesh = child;
        }
    });
    if (!baseMesh) {
        console.error("no mesh found in the obj file.");
        return;
    }

    // material override
    baseMesh.material = new THREE.MeshPhongMaterial({ color: 0x888888 });

    // procedural noise displacement
    baseMesh.geometry.computeBoundingSphere();
    const positionAttr = baseMesh.geometry.attributes.position;
    const center = baseMesh.geometry.boundingSphere.center;

    for (let i = 0; i < positionAttr.count; i++) {
        const x = positionAttr.getX(i);
        const y = positionAttr.getY(i);
        const z = positionAttr.getZ(i);

        const relX = x - center.x;
        const relY = y - center.y;
        const relZ = z - center.z;

        const noiseFactor = 0.15;
        const noiseAmplitude = 0.3;
        const displacement = noiseAmplitude * simplex.noise3D(relX * noiseFactor, relY * noiseFactor, relZ * noiseFactor);

        const vert = new THREE.Vector3(x, y, z);
        const dir = vert.clone().sub(center).normalize();
        vert.addScaledVector(dir, displacement);

        positionAttr.setXYZ(i, vert.x, vert.y, vert.z);
    }
    positionAttr.needsUpdate = true;
    baseMesh.geometry.computeVertexNormals();

    // instanced Mesh
    const instancedMesh = new THREE.InstancedMesh(
        baseMesh.geometry,
        baseMesh.material,
        asteroidCount
    );
    instancedMesh.visible = false; // Hide asteroid belt initially
    scene.add(instancedMesh);

    instancedMesh.frustumCulled = true;
    const dummy = new THREE.Object3D();

    for (let i = 0; i < asteroidCount; i++) {
        const R = beltRadius;
        const r = radiusVariation * Math.sqrt(Math.random());
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.random() * Math.PI * 2;

        const x = (R + r * Math.cos(theta)) * Math.cos(phi);
        const y = (R + r * Math.cos(theta)) * Math.sin(phi);
        const z = r * Math.sin(theta) * (beltThickness / radiusVariation);

        dummy.position.set(x, y, z);
        dummy.rotation.set(
            Math.random() * Math.PI,
            Math.random() * Math.PI,
            Math.random() * Math.PI
        );
        const scale = 0.5 + Math.random() * 1.5;
        dummy.scale.set(scale, scale, scale);
        dummy.updateMatrix();
        instancedMesh.setMatrixAt(i, dummy.matrix);
    }
    instancedMesh.instanceMatrix.needsUpdate = true;
    scene.add(instancedMesh);

    // particles 
    const particleCount = 500;
    const particleGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
        const R = beltRadius;
        const r = radiusVariation * Math.sqrt(Math.random());
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.random() * Math.PI * 2;

        const x = (R + r * Math.cos(theta)) * Math.cos(phi);
        const y = (R + r * Math.cos(theta)) * Math.sin(phi);
        const z = r * Math.sin(theta) * (beltThickness / radiusVariation);

        positions[i * 3 + 0] = x;
        positions[i * 3 + 1] = y;
        positions[i * 3 + 2] = z;

        if (Math.random() < 0.5) {
            colors.set([1.0, 1.0, 1.0], i * 3); // white
        } else {
            colors.set([0.0, 0.0, 1.0], i * 3); // blue
        }
    }
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const particleMaterial = new THREE.PointsMaterial({ size: 2, vertexColors: true });
    const particleSystem = new THREE.Points(particleGeometry, particleMaterial);
    // After creating particleSystem:
    particleSystem.visible = false; // Hide asteroid particles initially
    scene.add(particleSystem);

    // Store references to toggle visibility later
    window.asteroidBelt = instancedMesh;
    window.asteroidParticles = particleSystem;
}

// Add this function to reveal space elements
function revealSpaceElements() {
    if (!asteroidBeltVisible) {
        console.log("Revealing space elements (solar system, asteroid belt, stars)");

        // Show solar system
        if (solarSystemGroup) {
            solarSystemGroup.visible = true;
            solarSystemVisible = true;
        }

        // Show asteroid belt
        if (window.asteroidBelt) {
            window.asteroidBelt.visible = true;
        }

        // Show asteroid particles
        if (window.asteroidParticles) {
            window.asteroidParticles.visible = true;
        }

        // Ensure stars are visible
        stars.visible = true;

        // Show fog if it exists
        if (fogVolume) {
            fogVolume.visible = true;
        }

        asteroidBeltVisible = true;
    }
}

function setupShootingStars() {
    for (let i = 0; i < shootingStarCount; i++) {
        const R = beltRadius;
        const r = radiusVariation * Math.sqrt(Math.random());
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.random() * Math.PI * 2;

        const x = (R + r * Math.cos(theta)) * Math.cos(phi);
        const y = (R + r * Math.cos(theta)) * Math.sin(phi);
        const z = r * Math.sin(theta) * (beltThickness / radiusVariation);
        const startPos = new THREE.Vector3(x, y, z);

        const velocity = startPos.clone().normalize().multiplyScalar(5 + Math.random() * 5);

        const coneGeometry = new THREE.ConeGeometry(0.5, 20, 8);
        const material = new THREE.MeshBasicMaterial({
            color: 0xffffaa,
            transparent: true,
            opacity: 0.7
        });
        const shootingStar = new THREE.Mesh(coneGeometry, material);
        shootingStar.position.copy(startPos);
        shootingStar.quaternion.setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            velocity.clone().normalize()
        );
        shootingStarsGroup.add(shootingStar);
        shootingStars.push({ mesh: shootingStar, velocity: velocity });
    }
}

// FLOOR
// Create textures for grass
const textureLoader = new THREE.TextureLoader();
const grassTexture = textureLoader.load('resources/grass.jpg', function(texture) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(20, 20); // Repeat the texture 20 times
});

// Create a simple floor with the grass texture
const floorGeometry = new THREE.PlaneGeometry(200, 200);
const floorMaterial = new THREE.MeshStandardMaterial({
    map: grassTexture,
    roughness: 0.8,
    metalness: 0.2,
    side: THREE.DoubleSide
});

const floor = new THREE.Mesh(floorGeometry, floorMaterial);
floor.position.set(0, 0, 950); 
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);


// Animation variables
let model;
let bones = {};
let clock = new THREE.Clock();
let walkSpeed = 2; // Steps per second

// Model visibility variables
let startTime = 0;
const disappearAfter = 15; // Time in seconds after which the model disappears
let modelVisible = true;
let rocketVisible = true;
let modelRemoved = false; // Flag to track if the Connor model was removed

// Create the particle system
const particles = new ParticleSystem({
    parent: scene,
    camera: camera,
});

// Initialize stars for space background
const starVertices = [];
for (let i = 0; i < 20000; i++) {
    const x = THREE.MathUtils.randFloatSpread(3000);
    const y = THREE.MathUtils.randFloatSpread(3000);
    const z = THREE.MathUtils.randFloatSpread(3000);
    starVertices.push(x, y, z);
}

const starGeometry = new THREE.BufferGeometry();
starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starVertices, 3));
const starMaterial = new THREE.PointsMaterial({ color: 0x888888, size: 0.5 });
const stars = new THREE.Points(starGeometry, starMaterial);
stars.visible = false; // Hide stars at the beginning
scene.add(stars);

// sun
const sunGeometry = new THREE.SphereGeometry(0.3, 32, 16);
const sunMaterial = new THREE.MeshBasicMaterial({ color: 0xff9633 });
const sun = new THREE.Mesh(sunGeometry, sunMaterial);

// sun lighting
const sunLight = new THREE.AmbientLight(0x404040, 50);
scene.add(sunLight);

// GLTF LOADER
const loader = new GLTFLoader();
let rocket; // Store rocket reference
let floating = false; // Track when the rocket is in space
let isTakingOff = false; // Track when takeoff starts
let previousRAF = null;

// Variables to track camera-target relationship for smooth transitions
let lastModelPosition = new THREE.Vector3(); // Last position of Connor model
let rocketOffset = new THREE.Vector3(); // Offset to apply to rocket to match camera behavior

// Load a glTF resource
loader.load(
    'connor/scene.gltf',
    function (gltf) {
        model = gltf.scene;
        model.position.set(0, 0, 950);
        model.castShadow = true;
        scene.add(model);

        // Set model as current target for camera
        currentTarget = model;

        // Start the timer when model is loaded
        startTime = clock.getElapsedTime();

        // Map important bones by name
        const boneMapping = {
            hips: 'mixamorigHips_01',
            spine: 'mixamorigSpine_02',
            spine1: 'mixamorigSpine1_03',
            spine2: 'mixamorigSpine2_04',
            neck: 'mixamorigNeck_05',
            head: 'mixamorigHead_06',
            leftShoulder: 'mixamorigLeftShoulder_08',
            leftArm: 'mixamorigLeftArm_09',
            leftForeArm: 'mixamorigLeftForeArm_010',
            leftHand: 'mixamorigLeftHand_011',
            rightShoulder: 'mixamorigRightShoulder_032',
            rightArm: 'mixamorigRightArm_033',
            rightForeArm: 'mixamorigRightForeArm_034',
            rightHand: 'mixamorigRightHand_035',
            leftUpLeg: 'mixamorigLeftUpLeg_055',
            leftLeg: 'mixamorigLeftLeg_056',
            leftFoot: 'mixamorigLeftFoot_057',
            leftToeBase: 'mixamorigLeftToeBase_058',
            rightUpLeg: 'mixamorigRightUpLeg_060',
            rightLeg: 'mixamorigRightLeg_061',
            rightFoot: 'mixamorigRightFoot_062',
            rightToeBase: 'mixamorigRightToeBase_063'
        };

        // Find and store references to important bones
        model.traverse((node) => {
            for (const [key, boneName] of Object.entries(boneMapping)) {
                if (node.name === boneName) {
                    bones[key] = node;
                    // Store initial rotation
                    bones[key].userData.initialRotation = node.rotation.clone();
                }
            }
        });

        console.log("Found these bones for animation:", Object.keys(bones));

        // Start animation
        clock.start();
    },
    function (xhr) {
        console.log((xhr.loaded / xhr.total * 100) + '% loaded');
    },
    function (error) {
        console.log('An error happened', error);
    }
);

loader.load(
    'rocket/rocket_ship/scene.gltf',
    function (gltf) {
        rocket = gltf.scene;
        scene.add(rocket);

        // Set rocket on the platform initially
        rocket.position.set(0, -1, 1000);

        // Store initial position for reference
        initialRocketPosition = rocket.position.clone();

        // Attach particles to rocket but keep them hidden initially
        rocket.add(particles._points);
        particles._points.position.set(0, -1, 0); // Adjust for proper exhaust position
        particles._points.visible = false; // Hide particles until takeoff

        // We no longer start the takeoff automatically - will be triggered when model is removed
        console.log("Rocket loaded and waiting for Connor model to be removed");
    },
    function (xhr) {
        console.log((xhr.loaded / xhr.total * 100) + '% loaded');
    },
    function (error) {
        console.log('An error happened');
    }
);
function startTakeoff() {
    if (!rocket) return;
    console.log("Starting rocket takeoff sequence");
    
    isTakingOff = true;
    
    const originalVelocity = rocketPhysics.velocity.clone();
    rocketPhysics.velocity.y = 0.1;
    
    if (particles) {
        particles._points.visible = true;
        particles.Step(0.016);
    }
    
    let takeoffSpeed = 2;
    let maxHeight = 200;
    let accelerationRate = 0.0005;
    
    function animateTakeoff() {
        if (rocket.position.y < maxHeight) {
            takeoffSpeed += accelerationRate;
            
            rocket.position.y += takeoffSpeed * 0.03;
            
            keyState.q = true;
            
            setTimeout(() => {
                keyState.q = false;
            }, 10);
            
            updateBackground(rocket.position.y);
            requestAnimationFrame(animateTakeoff);
        } else {
            keyState.q = false;
            
            if (!floating) {
                floating = true;
                startFloating();
            }
        }
    }
    
    animateTakeoff();
}

// Add this new function to handle camera zooming with callback
function zoomOutCamera(callback) {
    console.log("Zooming camera out before takeoff");

    // Increase the camera offset for a more distant view
    const wideViewOffset = new THREE.Vector3(-15, 5, 25); // Wider view to see the takeoff

    // Animate the camera transition
    let zoomProgress = 0;
    const originalOffset = rocketOffset.clone();

    function animateZoom() {
        if (zoomProgress < 1) {
            zoomProgress += 0.02; // Control zoom speed (higher = faster)

            // Lerp between current offset and wide view offset
            rocketOffset.lerpVectors(originalOffset, wideViewOffset, zoomProgress);

            // Force camera update with new offset
            if (currentTarget === rocket && cameraFollowEnabled) {
                followTarget(rocket);
            }

            requestAnimationFrame(animateZoom);
        } else {
            // When zoom is complete, execute callback if provided
            if (callback && typeof callback === 'function') {
                callback();
            }
        }
    }

    animateZoom();

    // Also increase the orbit controls max distance to allow manual zooming out further
    orbitControls.maxDistance = 40;
}

let hasReachedSpace = false; // Flag to track if space has been reached

function updateBackground(altitude) {
    // If we have reached space before, keep the final scene
    if (hasReachedSpace) {
        return;
    }

    const t = Math.min(altitude / 10, 1); // Normalize altitude to 0-1 range
    const finalScene = new THREE.Color(0x000000);

    if (t < 0.5) {
        // When below halfway to space, use the texture
        if (backgroundTexture.image) {
            scene.background = backgroundTexture;
        } else {
            scene.background = new THREE.Color(0xa8def0);
        }
    } else {
        // When above halfway, blend to space color
        let blendFactor = (t - 0.5) * 2;
        let skyColor = new THREE.Color(0xa8def0).lerp(new THREE.Color(0x000033), blendFactor);
        scene.background = skyColor;
    }

    // Show stars when in space
    if (altitude >= 110) {
        scene.background = finalScene;
        stars.visible = true;
        hasReachedSpace = true; // Lock background to space permanently
    } 
}

// Modify the startFloating function to keep focus on rocket instead of switching to solar system
function startFloating() {

    function float() {
        if (!floating || !rocket) return;

        // Stop exhaust particles when reaching space
        particles._points.visible = false;

        // Rotate the rocket to simulate zero-gravity floating
        rocket.rotation.y += 0.004;
        rocket.rotation.z += 0.001;

        requestAnimationFrame(float);
    }
    scene.remove(floor);
    revealSpaceElements();
    float();

    // Keep camera following the rocket
    cameraFollowEnabled = true;
    currentTarget = rocket;
    console.log("Camera continuing to follow rocket during floating");
}

// Modify the checkModelVisibility function to zoom out after model removal and before takeoff
function checkModelVisibility(model) {
    if (!model || !modelVisible) return;
    //console.log(model.position);
    // Check if enough time has passed
    if (model.position.z > 997) {
        // Store model's last position before disappearing
        lastModelPosition = model.position.clone();

        // Make model disappear
        modelVisible = false;
        scene.remove(model);
        modelRemoved = true; // Set the flag that model has been removed
        console.log(`Model disappeared after ${disappearAfter} seconds`);

        // Switch camera target to rocket when the person disappears
        if (rocket && rocketVisible) {
            // Calculate the offset needed to maintain camera relationship
            // This preserves the same camera angle and distance
            const rocketWorldPos = new THREE.Vector3();
            rocket.getWorldPosition(rocketWorldPos);

            // Calculate the camera's position relative to the model
            const cameraToCurrent = new THREE.Vector3().subVectors(
                camera.position,
                lastModelPosition
            );

            // Store this as our rocket offset to use in followTarget
            rocketOffset = cameraToCurrent.clone();

            // Reset orbit controls parameters to ensure they don't interfere
            orbitControls.enableDamping = true;
            orbitControls.dampingFactor = 0.05;

            // Set rocket as current target
            currentTarget = rocket;
            console.log("Camera now following rocket");

            // Force immediate camera update to prevent jarring transition
            followTarget(rocket);

            // First zoom out the camera BEFORE starting takeoff
            zoomOutCamera(function () {
                // Start rocket takeoff after camera zoom completes
                setTimeout(startTakeoff, 1000);
            });
        }
    }
}

// In the followTarget function, modify it to handle the transition more smoothly:
function followTarget(target) {
    if (!target || !cameraFollowEnabled) return;

    let targetOffset = cameraOffset.clone();
    // let targetOffset = new THREE.Vector3(0, 2, -15);

    // If following rocket, use the calculated offset that matches the model's camera relationship
    if (target === rocket && rocketOffset.length() > 0) {
        targetOffset = new THREE.Vector3(-5, 1, 30);
    }

    // Calculate ideal camera position based on target's position and the appropriate offset
    const idealPosition = new THREE.Vector3(
        target.position.x + targetOffset.x,
        target.position.y + targetOffset.y,
        target.position.z + targetOffset.z
    );

    // Update camera position with smooth transition - increase lerp value for smoother following
    camera.position.lerp(idealPosition, 0.1);

    // Look target height adjustment based on the current target
    let heightAdjust = 1; // Default for model
    if (target === rocket) {
        heightAdjust = 2; // Higher for rocket to look at its center
    }

    // Set the look target at the appropriate height for the current target
    const lookTarget = new THREE.Vector3(
        target.position.x,
        target.position.y + heightAdjust,
        target.position.z
    );

    // Directly update orbit controls target with faster lerp for more responsive following
    orbitControls.target.lerp(lookTarget, 0.2);

    // Force update the camera to look at the target
    camera.lookAt(lookTarget);
}

// Custom walk animation function specifically for this model
function animateWalk(time) {
    if (!model || Object.keys(bones).length === 0 || !modelVisible) return;

    const cycle = (time * walkSpeed) % (Math.PI * 2);

    // Leg animations
    if (bones.leftUpLeg && bones.rightUpLeg) {
        // Upper legs (thighs) - forward/backward swing
        const leftInitial = bones.leftUpLeg.userData.initialRotation;
        bones.leftUpLeg.rotation.x = leftInitial.x + Math.sin(cycle) * 0.45;

        const rightInitial = bones.rightUpLeg.userData.initialRotation;
        bones.rightUpLeg.rotation.x = rightInitial.x + Math.sin(cycle + Math.PI) * 0.45;
    }

    // Lower legs (knees bend during walk)
    if (bones.leftLeg && bones.rightLeg) {
        const leftInitial = bones.leftLeg.userData.initialRotation;
        // More bend when leg is back, less when forward
        bones.leftLeg.rotation.x = -1 * (leftInitial.x + Math.max(0, -Math.sin(cycle)) * 0.5 + 0.2);

        const rightInitial = bones.rightLeg.userData.initialRotation;
        bones.rightLeg.rotation.x = -1 * (rightInitial.x + Math.max(0, -Math.sin(cycle + Math.PI)) * 0.5 + 0.2);
    }

    // Arm animations (opposite to legs)
    if (bones.leftArm && bones.rightArm) {
        const leftInitial = bones.leftArm.userData.initialRotation;
        const rightInitial = bones.rightArm.userData.initialRotation;

        // Arms swing in opposition to legs (natural walking motion)
        bones.leftArm.rotation.z = -1 * (leftInitial.z + Math.sin(cycle + Math.PI) * 0.25); // Backward when right leg forward
        bones.rightArm.rotation.z = rightInitial.z + Math.sin(cycle) * 0.25; // Forward when left leg forward

        // Slight inward tilt to avoid arms going outward
        bones.leftArm.rotation.x = leftInitial.x + 0.5;
        bones.rightArm.rotation.x = rightInitial.x + 0.5;
    }

    // Move the character forward
    model.position.z += 0.03; // Adjust speed as needed

    // Always update orbit controls target to keep model centered
    if (model) {
        // Smoothly update the orbit controls target to follow the model
        const targetPosition = new THREE.Vector3(
            model.position.x,
            model.position.y + 1,
            model.position.z
        );

        orbitControls.target.lerp(targetPosition, 0.1);
    }
}

// ANIMATION LOOP
// In the animate function, update the follow logic to be more assertive
function animate(timestamp) {
    if (previousRAF === null) {
        previousRAF = timestamp;
    }

    const elapsedTime = clock.getElapsedTime();
    const timeElapsed = (timestamp - previousRAF) * 0.001; // Convert to seconds

    // Check if model should disappear
    checkModelVisibility(model);

    // Apply custom walk animation
    animateWalk(elapsedTime);

    // Follow current target with camera if enabled - call this first
    if (cameraFollowEnabled && currentTarget) {
        followTarget(currentTarget);
    }

    // Update particle system if rocket is taking off
    // In your main animation loop
    if (isTakingOff) {
        particles._points.visible = true;
    }
    // Ensure orbit controls update happens AFTER camera positioning
    if (!cameraFollowEnabled) {
        orbitControls.update();
    }

    // the update volumetric fog uniforms (check if material exists yet)
    if (fogMaterial) {
        fogMaterial.uniforms.uCameraPos.value.copy(camera.position);
    }

    if (solarSystemGroup) {
        solarSystemGroup.children.forEach(child => {
            if (child.userData.orbitSpeed !== undefined) {
                child.rotation.z += child.userData.orbitSpeed;
            }
        });

    const thrusterOffset = new THREE.Vector3(0, 1, -2); // Adjust Y to match bottom of model

    if (rocket) {
        // ORIENTATION
        if (keyState.w) rocketPhysics.angularVelocity.x -= rocketPhysics.turnSpeed;
        if (keyState.s) rocketPhysics.angularVelocity.x += rocketPhysics.turnSpeed;
        if (keyState.a) rocketPhysics.angularVelocity.y += rocketPhysics.turnSpeed;
        if (keyState.d) rocketPhysics.angularVelocity.y -= rocketPhysics.turnSpeed;
        
        // Apply rotation velocity
        rocket.rotation.x += rocketPhysics.angularVelocity.x;
        rocket.rotation.y += rocketPhysics.angularVelocity.y;
        rocket.rotation.z += rocketPhysics.angularVelocity.z;
        
        // Apply angular drag
        rocketPhysics.angularVelocity.multiplyScalar(rocketPhysics.angularDrag);
        
        // propulsion
        let thrusterActive = false;
        const acceleration = new THREE.Vector3();

        if (keyState.q) {
            thrusterActive = true;
            const forwardDir = new THREE.Vector3(0, 1, 0);
            let thrustMultiplier = 1;
        
            forwardDir.applyQuaternion(rocket.quaternion);
            let thrustForce = forwardDir.multiplyScalar(rocketPhysics.thrust * thrustMultiplier);
        
            if (keyState.shift) {
                thrustForce.multiplyScalar(100);
            }
        
            acceleration.add(thrustForce);
        }
        
        if (keyState.e) {
            thrusterActive = true;
            const backwardDir = new THREE.Vector3(0, -1, 0);
            backwardDir.applyQuaternion(rocket.quaternion);
            acceleration.add(backwardDir.multiplyScalar(rocketPhysics.thrust));
        }

        // Apply acceleration to velocity
        rocketPhysics.velocity.add(acceleration);

        // Limit speed naturally
        if (rocketPhysics.velocity.length() > rocketPhysics.maxSpeed) {
            rocketPhysics.velocity.normalize().multiplyScalar(rocketPhysics.maxSpeed);
        }

        // Apply velocity to position
        rocket.position.add(rocketPhysics.velocity);

        // Effects
        updateBackground(rocket.position.y);

        // PARTICLE EFFECTS - Properly Attach Thruster Fire
        if (particles) {
            // Convert local thruster position to world space
            const thrusterWorldPos = thrusterOffset.clone();
            rocket.localToWorld(thrusterWorldPos); // Get exact world position of thruster

            particles._points.position.copy(thrusterWorldPos); // Set fire effect position
            particles._points.quaternion.copy(rocket.quaternion); // Ensure it rotates with the rocket
            particles._points.visible = thrusterActive;
        }
    }

}
  // END

    // update shooting stars
    shootingStars.forEach((star) => {
        star.mesh.position.add(star.velocity);
        if (star.mesh.position.length() > beltRadius * 2.5) {
            const R = beltRadius;
            const r = radiusVariation * Math.sqrt(Math.random());
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.random() * Math.PI * 2;
            const x = (R + r * Math.cos(theta)) * Math.cos(phi);
            const y = (R + r * Math.cos(theta)) * Math.sin(phi);
            const z = r * Math.sin(theta) * (beltThickness / radiusVariation);
            const newPos = new THREE.Vector3(x, y, z);
            star.mesh.position.copy(newPos);

            star.velocity = newPos.clone().normalize().multiplyScalar(5 + Math.random() * 5);
            star.mesh.quaternion.setFromUnitVectors(
                new THREE.Vector3(0, 1, 0),
                star.velocity.clone().normalize()
            );
        }
    });

    renderer.render(scene, camera);

    previousRAF = timestamp;
    requestAnimationFrame(animate);
}

// Add instructions to the screen for the rocket controls
function addRocketControlsInfo() {
    const instructions = document.createElement('div');
    instructions.style.position = 'absolute';
    instructions.style.top = '10px';
    instructions.style.right = '10px';
    instructions.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    instructions.style.color = 'white';
    instructions.style.padding = '10px';
    instructions.style.borderRadius = '5px';
    instructions.style.fontFamily = 'Arial, sans-serif';
    instructions.style.maxWidth = '300px';
    instructions.innerHTML = `
        <h3>Rocket Controls:</h3>
        <p>W - Forward</p>
        <p>S - Backward</p>
        <p>A - Left/Turn Left</p>
        <p>D - Right/Turn Right</p>
        <p>Q - Up</p>
        <p>E - Down</p>
        <p>Shift - Boost</p>
        <p>C - Toggle camera follow</p>`;
    document.body.appendChild(instructions);
    }
    
// Add controls info to the screen
addRocketControlsInfo();
    

requestAnimationFrame(animate);