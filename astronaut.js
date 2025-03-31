import * as THREE from "three";
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// SCENE
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xa8def0);

// CAMERA
const camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(-10, 0, 15);

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
const cameraOffset = new THREE.Vector3(-10, 2, 15); // Fixed camera offset from model
let cameraFollowEnabled = true; // Flag to toggle between OrbitControls and auto-follow

// Toggle camera follow mode
window.addEventListener('keydown', (event) => {
  if (event.key === 'c' || event.key === 'C') {
    cameraFollowEnabled = !cameraFollowEnabled;
    console.log(`Camera follow mode: ${cameraFollowEnabled ? 'ENABLED' : 'DISABLED'}`);
    
    if (!cameraFollowEnabled && model) {
      // When disabling follow, set orbit controls target to current model position
      // and maintain current camera-to-model distance
      orbitControls.target.copy(new THREE.Vector3(
        model.position.x,
        model.position.y + 1,
        model.position.z
      ));
      
      // Store the current distance from camera to model
      const currentDistance = camera.position.distanceTo(orbitControls.target);
      
      // Update camera position to maintain the same distance but allow orbit
      const direction = new THREE.Vector3().subVectors(
        camera.position, 
        orbitControls.target
      ).normalize();
      
      camera.position.copy(orbitControls.target).add(
        direction.multiplyScalar(currentDistance)
      );
    }
  }
});

// LIGHTS
const sunLight = new THREE.AmbientLight(0x404040, 100);
scene.add(sunLight);

// FLOOR
const floorGeometry = new THREE.PlaneGeometry(100, 100); // Expanded floor size
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
        model.position.set(0, 0, 0);
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

// Improved camera follow function that maintains consistent distance and angle
function followModel() {
    if (!model || !cameraFollowEnabled) return;
    
    // Calculate ideal camera position based on fixed offset from model
    const idealPosition = new THREE.Vector3(
        model.position.x + cameraOffset.x,
        model.position.y + cameraOffset.y,
        model.position.z + cameraOffset.z
    );
    
    // Update camera position
    camera.position.copy(idealPosition);
    
    // Set the look target slightly above the model's base
    camera.lookAt(
        model.position.x,
        model.position.y + 1,
        model.position.z
    );
}

// ANIMATION LOOP
function animate() {
    const elapsedTime = clock.getElapsedTime();
    
    // Apply custom walk animation
    animateWalk(elapsedTime);
    
    // Follow model with camera if enabled
    if (model && cameraFollowEnabled) {
        followModel();
    }
    
    // Always update orbit controls
    orbitControls.update();
    
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
}

animate();