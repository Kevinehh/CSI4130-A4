import * as THREE from "three";
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// const gui = new dat.GUI();
const canvas = document.querySelector('canvas.webgl');
const scene = new THREE.Scene();

// Instantiate a loader
const loader = new GLTFLoader();

// const textureLoader = new THREE.TextureLoader()

const sizes = {
    width: 1470,
    height: 835
};

// Stars
const starVertices = [];

for (let i=0; i<20000; i++){
    const x = THREE.MathUtils.randFloatSpread( 2000 );
    const y = THREE.MathUtils.randFloatSpread( 2000 );
    const z = THREE.MathUtils.randFloatSpread( 2000 );

    starVertices.push (x, y, z);
}
const starGeometry = new THREE.BufferGeometry();
starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starVertices, 3));
const starMaterial = new THREE.PointsMaterial( {color: 0x888888 });
starMaterial.size = 0.02;
const points = new THREE.Points ( starGeometry, starMaterial );
scene.add(points);

// Load a glTF resource
loader.load(
    // resource URL
    // 'rocket_ship/scene.gltf',
    'astronaut/scene.gltf',
    // called when the resource is loaded
    function ( gltf ) {

        scene.add( gltf.scene );

        gltf.animations; // Array<THREE.AnimationClip>
        gltf.scene; // THREE.Group
        gltf.scenes; // Array<THREE.Group>
        gltf.cameras; // Array<THREE.Camera>
        gltf.asset; // Object

    },
    // called while loading is progressing
    function ( xhr ) {

        console.log( ( xhr.loaded / xhr.total * 100 ) + '% loaded' );

    },
    // called when loading has errors
    function ( error ) {

        console.log( 'An error happened' );

    }
);

// Sun lighting
const sunLight = new THREE.AmbientLight (0x404040, 100);
scene.add(sunLight);

// Camera
const camera = new THREE.PerspectiveCamera(75, sizes.width / sizes.height);
camera.position.x = 10;
camera.position.y = 10;
camera.position.z = 10;
scene.add(camera);

// Renderer
const renderer = new THREE.WebGLRenderer({
    canvas: canvas
});
renderer.setSize(sizes.width, sizes.height);

// Add OrbitControls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; // try without this, its for smoother movement

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

animate();