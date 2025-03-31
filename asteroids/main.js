import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// global configuration
const beltRadius = 600; // overall radius of the asteroid belt
const asteroidCount = 500; // total number of asteroids
const radiusVariation = 50; // variation in radial distance for asteroids
const beltThickness = 50; // vertical spread of the belt

// initialize simplex noise 
const simplex = new SimplexNoise();

// global variable for solar system group 
let solarSystemGroup;

// scene, camera & renderer setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    5000
);
camera.position.set(0, -beltRadius * 1.2, beltRadius * 0.8);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// orbitcontrols for mouse interaction
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 50;
controls.maxDistance = 3000;

// lighting
const ambientLight = new THREE.AmbientLight(0x404040, 3.0);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
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
    fetch('./shader/vertexShader.vs').then(response => response.text()),
    fetch('./shader/fragmentShader.fs').then(response => response.text())
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

    const fogVolume = new THREE.Mesh(fogBoundingBox, fogMaterial);
    scene.add(fogVolume);

    // load the solar system
    loadSolarSystem();

    const objLoader = new OBJLoader();
    objLoader.load(
        "./resources/asteroid.obj", 
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
        { name: "Sun", path: "./resources/sun/scene.gltf", orbitRadius: 0, scale: 8.0 },
        { name: "Mercury", path: "./resources/mercury/scene.gltf", orbitRadius: 150, scale: 10 },
        { name: "Venus", path: "./resources/venus/scene.gltf", orbitRadius: 300, scale: 10 },
        { name: "Earth", path: "./resources/earth/scene.gltf", orbitRadius: 400, scale: 10 },
        { name: "Mars", path: "./resources/mars/scene.gltf", orbitRadius: 500, scale: 10 },
        { name: "Jupiter", path: "./resources/jupiter/scene.gltf", orbitRadius: 850, scale: 20 },
        { name: "Saturn", path: "./resources/saturn/scene.gltf", orbitRadius: 1000, scale: 0.1 },
        { name: "Uranus", path: "./resources/uranus/scene.gltf", orbitRadius: 1200, scale: 10 },
        { name: "Neptune", path: "./resources/neptune/scene.gltf", orbitRadius: 1400, scale: 10 }
    ];

    solarSystemGroup = new THREE.Group();

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
    scene.add(particleSystem);
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


// animation loop
function animate() {
    requestAnimationFrame(animate);
    controls.update();

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
    }

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
}

// handle window resize
window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
