// global configuration
const beltRadius = 300; // overall radius of the asteroid belt
const asteroidCount = 300; // total number of asteroids
const radiusVariation = 50; // variation in radial distance
const beltThickness = 50; // vertical spread of the belt

// initialize simplex noise
const simplex = new SimplexNoise();

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
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 50;
controls.maxDistance = 3000;

// lighting
const ambientLight = new THREE.AmbientLight(0x404040, 2.0);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
directionalLight.position.set(100, 100, 200);
scene.add(directionalLight);

// load the asteroid model (obj only)
const objLoader = new THREE.OBJLoader();
objLoader.load("uploads_files_4462300_Astreoid-1.obj", (object) => {
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

  // override any existing material with a grey meshphongmaterial.
  baseMesh.material = new THREE.MeshPhongMaterial({ color: 0x696060 });

  // procedural noise displacement
  baseMesh.geometry.computeBoundingSphere();
  const positionAttr = baseMesh.geometry.attributes.position;
  for (let i = 0; i < positionAttr.count; i++) {
    const x = positionAttr.getX(i);
    const y = positionAttr.getY(i);
    const z = positionAttr.getZ(i);

    // generate a small displacement using simplex noise.
    const displacement = 0.2 * simplex.noise3D(x * 0.1, y * 0.1, z * 0.1);
    positionAttr.setXYZ(
      i,
      x + displacement,
      y + displacement,
      z + displacement
    );
  }
  positionAttr.needsUpdate = true;
  baseMesh.geometry.computeVertexNormals();

  // create an instancedmesh for the asteroids
  const instancedMesh = new THREE.InstancedMesh(
    baseMesh.geometry,
    baseMesh.material,
    asteroidCount
  );
  instancedMesh.frustumCulled = true;
  const dummy = new THREE.Object3D();

  // distribute asteroids in a torus-like belt.
  for (let i = 0; i < asteroidCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = beltRadius + (Math.random() - 0.5) * radiusVariation;
    const x = radius * Math.cos(angle);
    const y = radius * Math.sin(angle);
    const z = (Math.random() - 0.5) * beltThickness;
    dummy.position.set(x, y, z);

    // random rotation for a natural look.
    dummy.rotation.set(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      Math.random() * Math.PI
    );

    // random scale for variety.
    const scale = 0.5 + Math.random() * 1.5;
    dummy.scale.set(scale, scale, scale);

    dummy.updateMatrix();
    instancedMesh.setMatrixAt(i, dummy.matrix);
  }
  instancedMesh.instanceMatrix.needsUpdate = true;
  scene.add(instancedMesh);
});

// animation loop
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();

// handle window resize
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
