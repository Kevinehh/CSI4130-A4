// global configuration
const beltRadius = 600; // overall radius of the asteroid belt
const asteroidCount = 500; // total number of asteroids
const radiusVariation = 50; // variation in radial distance for asteroids
const beltThickness = 50; // vertical spread of the belt

// fog configuration
const fogParticleCount = 20000; // number of particles for the fog effct
const fogColor = new THREE.Color(0xaaaaaa);
const fogParticleSize = 5;    
const fogOpacity = 0.05;  

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
const ambientLight = new THREE.AmbientLight(0x404040, 3.0);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
directionalLight.position.set(100, 100, 200);
scene.add(directionalLight);

// global group for shooting stars
const shootingStarsGroup = new THREE.Group();
scene.add(shootingStarsGroup);
// array to hold shooting star data (mesh and velocity)
const shootingStars = [];
const shootingStarCount = 5;

// fog/cloud particle system
const fogGeometry = new THREE.BufferGeometry();
const fogPositions = new Float32Array(fogParticleCount * 3);

for (let i = 0; i < fogParticleCount; i++) {
  const angle = Math.random() * Math.PI * 2;
  // distribute more evenly across the radius variation
  const radius = beltRadius - radiusVariation + Math.random() * radiusVariation * 2;
  const x = radius * Math.cos(angle);
  const y = radius * Math.sin(angle);
  const z = (Math.random() - 0.5) * beltThickness * 2; // wider spread for fog

  fogPositions[i * 3 + 0] = x;
  fogPositions[i * 3 + 1] = y;
  fogPositions[i * 3 + 2] = z;
}

fogGeometry.setAttribute('position', new THREE.BufferAttribute(fogPositions, 3));

// soft texture for smoother particles
const textureLoader = new THREE.TextureLoader();
const fogTexture = textureLoader.load('https://threejs.org/examples/textures/sprites/disc.png'); 

const fogMaterial = new THREE.PointsMaterial({
  color: fogColor,
  size: fogParticleSize,
  map: fogTexture, // use the loaded texture
  transparent: true,
  opacity: fogOpacity,
  blending: THREE.NormalBlending, 
  depthWrite: false, 
  sizeAttenuation: true 
});

const fogCloud = new THREE.Points(fogGeometry, fogMaterial);
scene.add(fogCloud);


// load the asteroid model
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
  baseMesh.material = new THREE.MeshPhongMaterial({ color: 0x888888 });

  // procedural noise displacement
  baseMesh.geometry.computeBoundingSphere();
  const positionAttr = baseMesh.geometry.attributes.position;
  for (let i = 0; i < positionAttr.count; i++) {
    const x = positionAttr.getX(i);
    const y = positionAttr.getY(i);
    const z = positionAttr.getZ(i);
    // generate a small displacement using simplex noise.
    const displacement = 0.2 * simplex.noise3D(x * 0.1, y * 0.1, z * 0.1);
    positionAttr.setXYZ(i, x + displacement, y + displacement, z + displacement);
  }
  positionAttr.needsUpdate = true;
  baseMesh.geometry.computeVertexNormals();

  // create an instancedmesh for the asteroids
  const instancedMesh = new THREE.InstancedMesh(
    baseMesh.geometry,
    baseMesh.material,
    asteroidCount
  );
  instancedMesh.frustumCulled = true; // Ensure this is true for performance
  const dummy = new THREE.Object3D();

  // arrange asteroids in a torus-like belt.
  for (let i = 0; i < asteroidCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    // use the same radius distribution logic as the fog for consisten
    // const radius = beltRadius + (Math.random() - 0.5) * radiusVariation;
    const radius = beltRadius - radiusVariation + Math.random() * radiusVariation * 2;

    const x = radius * Math.cos(angle);
    const y = radius * Math.sin(angle);
    const z = (Math.random() - 0.5) * beltThickness; // keep asteroid thickness perhaps tighter than fog
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

  // add specks of white and blue to enhance the belt
  const particleCount = 500;
  const particleGeometry = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  const colors = new Float32Array(particleCount * 3);

  for (let i = 0; i < particleCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    // const radius = beltRadius + (Math.random() - 0.5) * radiusVariation;
    const radius = beltRadius - radiusVariation + Math.random() * radiusVariation * 2;
    const x = radius * Math.cos(angle);
    const y = radius * Math.sin(angle);
    const z = (Math.random() - 0.5) * beltThickness;

    positions[i * 3 + 0] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;

    // randomly assign white or blue.
    if (Math.random() < 0.5) {
      colors[i * 3 + 0] = 1.0;
      colors[i * 3 + 1] = 1.0;
      colors[i * 3 + 2] = 1.0;
    } else {
      colors[i * 3 + 0] = 0.0;
      colors[i * 3 + 1] = 0.0;
      colors[i * 3 + 2] = 1.0;
    }
  }

  particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const particleMaterial = new THREE.PointsMaterial({
    size: 2,
    vertexColors: true
  });
  const particleSystem = new THREE.Points(particleGeometry, particleMaterial);
  scene.add(particleSystem);

  // create shooting stars (simulated as shooting rocks)
  // for a few shooting stars, choose random starting positions on the belt
  for (let i = 0; i < shootingStarCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    // const radius = beltRadius + (Math.random() - 0.5) * radiusVariation;
    const radius = beltRadius - radiusVariation + Math.random() * radiusVariation * 2;
    const x = radius * Math.cos(angle);
    const y = radius * Math.sin(angle);
    const z = (Math.random() - 0.5) * beltThickness;
    const startPos = new THREE.Vector3(x, y, z);

    // determine a velocity vector that points roughly outward from the belt center.
    const velocity = startPos.clone().normalize().multiplyScalar(2 + Math.random());

    // cone is created along +y; we will rotate it to align with its velocity.
    const coneGeometry = new THREE.ConeGeometry(0.5, 10, 8);
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffaa,
      transparent: true,
      opacity: 0.9
    });
    const shootingStar = new THREE.Mesh(coneGeometry, material);
    shootingStar.position.copy(startPos);
    // rotate the cone so its tip (default +y) aligns with the velocity direction.
    shootingStar.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      velocity.clone().normalize()
    );
    shootingStarsGroup.add(shootingStar);
    shootingStars.push({ mesh: shootingStar, velocity: velocity });
  }
});

// animation loop
function animate() {
  requestAnimationFrame(animate);
  controls.update();

  // update shooting stars
  shootingStars.forEach((star) => {
    star.mesh.position.add(star.velocity);
    // if the shooting star moves too far from the center, reset it to a new position on the belt.
    if (star.mesh.position.length() > beltRadius * 2) {
      const angle = Math.random() * Math.PI * 2;
      // const radius = beltRadius + (Math.random() - 0.5) * radiusVariation;
      const radius = beltRadius - radiusVariation + Math.random() * radiusVariation * 2;
      const x = radius * Math.cos(angle);
      const y = radius * Math.sin(angle);
      const z = (Math.random() - 0.5) * beltThickness;
      const newPos = new THREE.Vector3(x, y, z);
      star.mesh.position.copy(newPos);
      // new velocity pointing outward from the center.
      star.velocity = newPos.clone().normalize().multiplyScalar(2 + Math.random());
      star.mesh.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        star.velocity.clone().normalize()
      );
    }
  });



  renderer.render(scene, camera);
}
animate();

// handle window resize
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
