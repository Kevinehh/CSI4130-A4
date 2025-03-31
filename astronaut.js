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
let currentTarget = null; // Variable to track which object is currently being followed
let initialRocketPosition = null; // Store initial rocket position to calculate proper offsets

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
    switch(event.keyCode) {
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
  const x = THREE.MathUtils.randFloatSpread(2000);
  const y = THREE.MathUtils.randFloatSpread(2000);
  const z = THREE.MathUtils.randFloatSpread(2000);
  starVertices.push(x, y, z);
}

const starGeometry = new THREE.BufferGeometry();
starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starVertices, 3));
const starMaterial = new THREE.PointsMaterial({ color: 0x888888, size: 0.5 });
const stars = new THREE.Points(starGeometry, starMaterial);
stars.visible = false; // Hide stars at the beginning
scene.add(stars);

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
        model.position.set(0, 0, 0);
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
        rocket.position.set(0, -1, 30);
        
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

// This function would replace your existing startTakeoff function
function startTakeoff() {
    if (!rocket) return;

    console.log("Starting rocket takeoff sequence");
    isTakingOff = true;
    particles._points.visible = true; // Show particles when takeoff starts

    let takeoffSpeed = 4; // Speed of ascent
    function animateTakeoff() {
        if (rocket.position.y < 50) { // Move until Y=50
            rocket.position.y += takeoffSpeed * 0.03;

            // Transition background as the rocket ascends
            updateBackground(rocket.position.y);

            requestAnimationFrame(animateTakeoff);
        } else {
            // When reaching max height, start floating and zoom out
            if (!floating) {
                floating = true;
                startFloating();
                zoomOutCamera(); // Call new function to zoom out
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

// Function to update background based on rocket altitude
function updateBackground(altitude) {
    // Transition background from day to space
    const t = Math.min(altitude / 10, 1); // Normalize altitude to 0-1 range
    const skyColor = new THREE.Color(0xa8def0).lerp(new THREE.Color(0x000033), t);
    scene.background = skyColor;

    // Show stars when in space
    if (altitude >= 10) {
        stars.visible = true;
    }
}

// Zero Gravity Floating Effect
function startFloating() {
    function float() {
        if (!floating || !rocket) return;

        // Rotate the rocket to simulate zero-gravity floating
        rocket.rotation.y += 0.004;
        rocket.rotation.z += 0.001;

        requestAnimationFrame(float);
    }
    float();
}

// Modify the checkModelVisibility function to zoom out after model removal and before takeoff
function checkModelVisibility(currentTime, model) {
    if (!model || !modelVisible) return;
    
    // Check if enough time has passed
    if ((currentTime - startTime) > disappearAfter) {
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
            zoomOutCamera(function() {
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
    
    // If following rocket, use the calculated offset that matches the model's camera relationship
    if (target === rocket && rocketOffset.length() > 0) {
        targetOffset = rocketOffset;
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
    checkModelVisibility(elapsedTime, model);
    
    // Apply custom walk animation
    animateWalk(elapsedTime);
    
    // Follow current target with camera if enabled - call this first
    if (cameraFollowEnabled && currentTarget) {
        followTarget(currentTarget);
    }
    
    // Update particle system if rocket is taking off
    if (isTakingOff) {
        particles.Step(timeElapsed);
    }
    
    // Ensure orbit controls update happens AFTER camera positioning
    if (!cameraFollowEnabled) {
        orbitControls.update();
    }
    
    renderer.render(scene, camera);
    
    previousRAF = timestamp;
    requestAnimationFrame(animate);
}

requestAnimationFrame(animate);