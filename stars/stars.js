import * as THREE from "three";
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const canvas = document.querySelector('canvas.webgl');
const scene = new THREE.Scene();
const loader = new GLTFLoader();

const sizes = {
    width: 700,
    height: 700
};

// Stars
const starVertices = [];
for (let i=0; i<20000; i++){
    const x = THREE.MathUtils.randFloatSpread(2000);
    const y = THREE.MathUtils.randFloatSpread(2000);
    const z = THREE.MathUtils.randFloatSpread(2000);
    starVertices.push(x, y, z);
}
const starGeometry = new THREE.BufferGeometry();
starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starVertices, 3));
const starMaterial = new THREE.PointsMaterial({color: 0x888888});
starMaterial.size = 0.02;
const points = new THREE.Points(starGeometry, starMaterial);
scene.add(points);

let rocket;
let rocketPhysics = {
    velocity: new THREE.Vector3(0, 0, 0),
    rotation: new THREE.Vector3(0, 0, 0),
    thrust: 0.0005,
    rotationThrust: 0.0002,
    maxThrust: 0.0015,
    drag: 0.995
};

// Control states - keeping only propulsion controls
const keyState = {
    w: false, // Forward thrusters
    s: false, // Backward thrusters
    a: false, // Left thrusters
    d: false, // Right thrusters
    q: false, // Up thrusters
    e: false, // Down thrusters
    shift: false, // Boost thrusters
};

// Load the rocket model
loader.load(
    'rocket_ship/scene.gltf',
    function(gltf) {
        rocket = gltf.scene;
        scene.add(rocket);
        
        // Scale and initial position
        rocket.scale.set(0.5, 0.5, 0.5);
        rocket.position.set(0, 0, 0);
        
        // Add a point light to the rocket to simulate engine glow
        const engineLight = new THREE.PointLight(0x00ffff, 2, 1);
        engineLight.position.set(0, -0.5, 0);
        rocket.add(engineLight);
        
        console.log('Rocket loaded successfully');
    },
    function(xhr) {
        console.log((xhr.loaded / xhr.total * 100) + '% loaded');
    },
    function(error) {
        console.log('An error happened while loading the rocket:', error);
    }
);

// Sun lighting
const sunLight = new THREE.AmbientLight(0x404040, 50);
scene.add(sunLight);

// Camera
const camera = new THREE.PerspectiveCamera(75, sizes.width / sizes.height);
camera.position.z = 3;
scene.add(camera);

// Renderer
const renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: true
});
renderer.setSize(sizes.width, sizes.height);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

// Camera follow behavior - removed the lock
let cameraOffset = new THREE.Vector3(0, 1, 5);
let lookAtOffset = new THREE.Vector3(0, 0, -10);

// orbitControls for manual camera control - always enabled
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;
controls.maxDistance = 50;
controls.minDistance = 1;
controls.enabled = true;

// event listeners for keyboard controls
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

const createThruster = (color) => {
    const particleCount = 30; 
    const particles = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    
    const baseColor = new THREE.Color(color);
    
    for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;
        // Smaller emission area
        positions[i3] = (Math.random() - 0.5) * 0.05;
        positions[i3 + 1] = -0.2 - Math.random() * 0.2;
        positions[i3 + 2] = (Math.random() - 0.5) * 0.05;
        
        colors[i3] = baseColor.r * (0.8 + Math.random() * 0.2);
        colors[i3 + 1] = baseColor.g * (0.8 + Math.random() * 0.2);
        colors[i3 + 2] = baseColor.b * (0.8 + Math.random() * 0.2);
    }
    
    particles.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particles.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    
    const particleMaterial = new THREE.PointsMaterial({
        size: 0.03,
        vertexColors: true,
        transparent: true,
        opacity: 0.6
    });
    
    const thrusterSystem = new THREE.Points(particles, particleMaterial);
    
    return {
        mesh: thrusterSystem,
        active: false,
        update: function() {
            if (!this.active) {
                // Hide particles when thruster is inactive
                this.mesh.visible = false;
                return;
            }
            
            this.mesh.visible = true;
            
            const positions = this.mesh.geometry.attributes.position.array;
            for (let i = 0; i < particleCount; i++) {
                const i3 = i * 3;
                // Move particle down but with shorter distance
                positions[i3 + 1] -= 0.08;
                
                // Add minor randomness
                positions[i3] += (Math.random() - 0.5) * 0.01;
                positions[i3 + 2] += (Math.random() - 0.5) * 0.01;
                
                // Reset particle if it's too far - shorter reset distance
                if (positions[i3 + 1] < -0.4) {
                    positions[i3] = (Math.random() - 0.5) * 0.05;
                    positions[i3 + 1] = -0.2;
                    positions[i3 + 2] = (Math.random() - 0.5) * 0.05;
                }
            }
            this.mesh.geometry.attributes.position.needsUpdate = true;
        }
    };
};

// Thruster systems
let thrusters = {
    main: null,
    reverse: null,
    left: null,
    right: null,
    up: null,
    down: null
};

// Create thrusters when rocket is loaded
const setupThrusters = () => {
    if (!rocket) return;
    
    // Main thruster (rear) - positioned inside the rocket model
    thrusters.main = createThruster(0xff6600); // Orange
    thrusters.main.mesh.position.set(0, -0.3, 0.1);
    thrusters.main.mesh.scale.set(0.5, 0.5, 0.5);
    rocket.add(thrusters.main.mesh);
    
    // Reverse thruster (front)
    thrusters.reverse = createThruster(0x66ccff); // Blue
    thrusters.reverse.mesh.position.set(0, 0, -0.3);
    thrusters.reverse.mesh.rotation.x = Math.PI;
    thrusters.reverse.mesh.scale.set(0.3, 0.3, 0.3);
    rocket.add(thrusters.reverse.mesh);
    
    // Side thrusters - smaller and more compact
    thrusters.left = createThruster(0x66ffcc); // Teal
    thrusters.left.mesh.position.set(0.2, 0, 0);
    thrusters.left.mesh.rotation.z = -Math.PI/2;
    thrusters.left.mesh.scale.set(0.2, 0.2, 0.2);
    rocket.add(thrusters.left.mesh);
    
    thrusters.right = createThruster(0x66ffcc); // Teal
    thrusters.right.mesh.position.set(-0.2, 0, 0);
    thrusters.right.mesh.rotation.z = Math.PI/2;
    thrusters.right.mesh.scale.set(0.2, 0.2, 0.2);
    rocket.add(thrusters.right.mesh);
    
    // Vertical thrusters - smaller and more compact
    thrusters.up = createThruster(0xccff66); // Lime
    thrusters.up.mesh.position.set(0, -0.2, 0);
    thrusters.up.mesh.rotation.x = -Math.PI/2;
    thrusters.up.mesh.scale.set(0.2, 0.2, 0.2);
    rocket.add(thrusters.up.mesh);
    
    thrusters.down = createThruster(0xccff66); // Lime
    thrusters.down.mesh.position.set(0, 0.2, 0);
    thrusters.down.mesh.rotation.x = Math.PI/2;
    thrusters.down.mesh.scale.set(0.2, 0.2, 0.2);
    rocket.add(thrusters.down.mesh);
};

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    
    // Update rocket physics if it's loaded
    if (rocket) {
        if (!thrusters.main) {
            setupThrusters();
        }
        
        // Calculate thrust based on boost
        const thrustPower = keyState.shift ? rocketPhysics.maxThrust : rocketPhysics.thrust;
        
        
        // Apply thrusters
        // Forward/backward thrusters
        if (keyState.w) {
            // Get the direction the rocket is facing
            const direction = new THREE.Vector3(0, 0, -1);
            direction.applyQuaternion(rocket.quaternion);
            direction.normalize();
            direction.multiplyScalar(thrustPower * 0.1);
            
            rocketPhysics.velocity.add(direction);
            thrusters.main.active = true;
        } else {
            thrusters.main.active = false;
        }
        
        // reverse thrusters
        if (keyState.s) {
            const direction = new THREE.Vector3(0, 0, 1);
            direction.applyQuaternion(rocket.quaternion);
            direction.normalize();
            direction.multiplyScalar(thrustPower * 0.1);
            
            rocketPhysics.velocity.add(direction);
            thrusters.reverse.active = true;
        } else {
            thrusters.reverse.active = false;
        }
        
        // Lateral thrusters
        if (keyState.a) {
            const direction = new THREE.Vector3(1, 0, 0);
            direction.applyQuaternion(rocket.quaternion);
            direction.normalize();
            direction.multiplyScalar(thrustPower * 0.1);
            
            rocketPhysics.velocity.add(direction);
            thrusters.left.active = true;
        } else {
            thrusters.left.active = false;
        }
        
        if (keyState.d) {
            const direction = new THREE.Vector3(-1, 0, 0);
            direction.applyQuaternion(rocket.quaternion);
            direction.normalize();
            direction.multiplyScalar(thrustPower * 0.1);
            
            rocketPhysics.velocity.add(direction);
            thrusters.right.active = true;
        } else {
            thrusters.right.active = false;
        }
        
        // Vertical thrusters
        if (keyState.q) {
            const direction = new THREE.Vector3(0, 1, 0);
            direction.applyQuaternion(rocket.quaternion);
            direction.normalize();
            direction.multiplyScalar(thrustPower * 0.3);
            
            rocketPhysics.velocity.add(direction);
            thrusters.up.active = true;
        } else {
            thrusters.up.active = false;
        }
        
        if (keyState.e) {
            const direction = new THREE.Vector3(0, -1, 0);
            direction.applyQuaternion(rocket.quaternion);
            direction.normalize();
            direction.multiplyScalar(thrustPower * 0.3);
            
            rocketPhysics.velocity.add(direction);
            thrusters.down.active = true;
        } else {
            thrusters.down.active = false;
        }
        
        const maxSpeed = 0.05;
        if (rocketPhysics.velocity.length() > maxSpeed) {
            rocketPhysics.velocity.normalize().multiplyScalar(maxSpeed);
        }
        
        // Apply velocity to position
        rocket.position.add(rocketPhysics.velocity);
        
        rocketPhysics.velocity.multiplyScalar(rocketPhysics.drag);
        
        // Update all active thrusters
        for (const key in thrusters) {
            if (thrusters[key]) {
                thrusters[key].update();
            }
        }
    }
    
    // Update orbit controls
    controls.update();
    
    renderer.render(scene, camera);
}

animate();

const addInstructions = () => {
    const instructions = document.createElement('div');
    instructions.style.position = 'absolute';
    instructions.style.top = '10px';
    instructions.style.left = '10px';
    instructions.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    instructions.style.color = 'white';
    instructions.style.padding = '10px';
    instructions.style.borderRadius = '5px';
    instructions.style.fontFamily = 'Arial, sans-serif';
    instructions.style.maxWidth = '300px';
    instructions.innerHTML = `
        <h3>Space Rocket Controls:</h3>
        <p><b>Propulsion:</b></p>
        <p>W - Forward thrusters</p>
        <p>S - Reverse thrusters</p>
        <p>A - Left thrusters</p>
        <p>D - Right thrusters</p>
        <p>Q - Up thrusters</p>
        <p>E - Down thrusters</p>
        <p>Shift - Boost thrusters</p>
        
        <p><b>Camera:</b></p>
        <p>Mouse - Orbit camera </p>`;
    document.body.appendChild(instructions);
};

addInstructions();