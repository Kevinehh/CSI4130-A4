import * as THREE from "three";
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// SCENE
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xa8def0);

// CAMERA
const camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(-10, 5, 25);

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
orbitControls.maxPolarAngle = Math.PI / 2 - 0.05;
orbitControls.update();

// LIGHTS
const sunLight = new THREE.AmbientLight(0x404040, 100);
scene.add(sunLight);

// FLOOR
const floorGeometry = new THREE.PlaneGeometry(20, 20);
const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x808080, side: THREE.DoubleSide });
const floor = new THREE.Mesh(floorGeometry, floorMaterial);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// Animation variables
let model;
let bones = {};
let clock = new THREE.Clock();
let walkSpeed = 2; // Steps per second

// GLTF LOADER
const loader = new GLTFLoader();

// Load a glTF resource
loader.load(
    'connor/scene.gltf',
    function (gltf) {
        model = gltf.scene;
        model.position.set(0, 1, 0);
        model.castShadow = true;
        scene.add(model);
        
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

// Custom walk animation function specifically for this model
function animateWalk(time) {
    if (!model || Object.keys(bones).length === 0) return;
    
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

        if (bones.leftArm && bones.rightArm) {
            // Move arms downward
            bones.leftArm.rotation.x -= Math.PI / 4;  // Rotate 45° down
            bones.rightArm.rotation.x -= Math.PI / 4;
        
            // Slight inward rotation to move them closer to the torso
            bones.leftArm.rotation.z += 1;
            bones.rightArm.rotation.z -= 1;
        }        
    
        // Arms swing in opposition to legs (natural walking motion)
        bones.leftArm.rotation.z = leftInitial.z + Math.sin(cycle + Math.PI) * 0.25; // Backward when right leg forward
        bones.rightArm.rotation.z = rightInitial.z + Math.sin(cycle) * 0.25; // Forward when left leg forward
    
        // Slight inward tilt to avoid arms going outward
        bones.leftArm.rotation.x = leftInitial.x - 0.05;  
        bones.rightArm.rotation.x = rightInitial.x - 0.05;
    }
    
    
    // Move the character forward
    model.position.z += 0.03; // Adjust speed as needed
}

let target = new THREE.Vector3();

function updateCamera(){
    const offset = new THREE.Vector3(0, 3, 8);
    model.getWorldPosition(target)
    camera.position.copy(target).add(offset)
    camera.lookAt(target);
}

// ANIMATION LOOP
function animate() {
    const elapsedTime = clock.getElapsedTime();
    
    // Apply custom walk animation
    animateWalk(elapsedTime);
    
    // if (model) {
    //     // Define an offset behind the model
    //     const offset = new THREE.Vector3(0, 3, 8); // (x, y, z)
        
    //     // Compute new camera position relative to the model
    //     const modelWorldPosition = new THREE.Vector3();
    //     model.getWorldPosition(modelWorldPosition);
        
    //     camera.position.copy(modelWorldPosition).add(offset);
    //     camera.lookAt(modelWorldPosition);
    // }
    if(model){
        updateCamera();
    }
    orbitControls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
}


animate();
