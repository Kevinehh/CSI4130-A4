import * as THREE from "three";
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import WebGL from "three/addons/capabilities/WebGL.js";
import { GUI } from "dat.gui";
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';


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

// // register our resize event function
// window.addEventListener("resize", onResize, true);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );
scene.background = new THREE.Color(0x87CEEB); // Light blue


const renderer = new THREE.WebGLRenderer();
renderer.setSize( window.innerWidth, window.innerHeight );
renderer.setAnimationLoop( raf );
document.body.appendChild( renderer.domElement );

// CONTROLS
// const orbitControls = new OrbitControls(camera, renderer.domElement);
// orbitControls.enableDamping = true;
// orbitControls.minDistance = 5;
// orbitControls.maxDistance = 15;
// orbitControls.enablePan = false;
// orbitControls.maxPolarAngle = Math.PI / 2 - 0.05;
// orbitControls.update();

// const geometry = new THREE.BoxGeometry( 1, 1, 1 );
// const material = new THREE.MeshBasicMaterial( { color: 0x00ff00 } );
// const cube = new THREE.Mesh( geometry, material );
// scene.add( cube );

// const gltfLoader = new GLTFLoader();
// const rocketgltf = await gltfLoader.loadAsync('./rocket_ship/scene.gltf');
// const rocket = rocketgltf.scene;
// scene.add(rocket);
const light = new THREE.AmbientLight(0xffffff, 1); // Soft white light
scene.add(light);

const loader = new GLTFLoader();
let rocket; // Store rocket reference
let isTakingOff = false; // Track when takeoff starts

loader.load(
    'rocket_ship/scene.gltf',
    function (gltf) {
        rocket = gltf.scene;
        scene.add(rocket);

        // Set rocket on the platform initially
        rocket.position.set(0, 0, 0);

        // Attach particles but keep them hidden initially
        rocket.add(particles._points);
        //particles._points.position.set(0, -1, 0); // Adjust for proper exhaust position
        particles._points.visible = false; // Hide particles until takeoff

        // Start rocket takeoff after 5 seconds
        setTimeout(startTakeoff, 5000);
    },
    function (xhr) {
        console.log((xhr.loaded / xhr.total * 100) + '% loaded');
    },
    function (error) {
        console.log('An error happened');
    }
);

// Add a platform under the rocket
const platformGeometry = new THREE.CylinderGeometry(3, 3, 0.5, 32);
const platformMaterial = new THREE.MeshStandardMaterial({ color: 0x808080 });
const platform = new THREE.Mesh(platformGeometry, platformMaterial);
platform.position.set(0, -0.25, 0); // Slightly raised to ensure contact with rocket
scene.add(platform);

// Animate the rocket taking off
function startTakeoff() {
    if (!rocket) return;

    isTakingOff = true;
    particles._points.visible = true; // Show particles when takeoff starts

    let takeoffSpeed = 0.2; // Speed of ascent
    function animateTakeoff() {
        if (rocket.position.y < 10) { // Move until Y=10
            rocket.position.y += takeoffSpeed;

            // Transition background as the rocket ascends
            updateBackground(rocket.position.y);

            requestAnimationFrame(animateTakeoff);
        }
    }
    animateTakeoff();
}

// Smoothly move the camera to follow the rocket
function followRocket() {
  if (!rocket) return;

  let targetPosition = new THREE.Vector3(
      rocket.position.x,
      rocket.position.y + 2,  // Keep camera slightly above
      rocket.position.z + 15   // Maintain some distance
  );

  camera.position.lerp(targetPosition, 0.05); // Smoothly move camera
  camera.lookAt(rocket.position); // Always look at the rocket
}


// Create Stars but Keep Hidden Initially
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

// Smooth background transition
function updateBackground(height) {
  let skyColor = new THREE.Color(0x87CEEB); // Sky blue
  let spaceColor = new THREE.Color(0x000000); // Black (space)

  let transitionHeight = 7; // Start transition at Y=7
  let maxHeight = 10; // Fully space by Y=10

  let t = Math.min(Math.max((height - transitionHeight) / (maxHeight - transitionHeight), 0), 1);
  scene.background = skyColor.lerp(spaceColor, t);

    // Show stars when in space
    if (height >= maxHeight) {
      stars.visible = true;
  }
}

camera.position.z = 15;

const particles = new ParticleSystem({
    parent: scene,
    camera: camera,
});

let _previousRAF = null;

function raf() {
    requestAnimationFrame((t) => {
        if (_previousRAF === null) {
          _previousRAF = t;
        }
  
        raf();

        if (isTakingOff) {
          followRocket();
      }
  
        renderer.render( scene, camera );
        //orbitControls.update();
        _Step(t - _previousRAF);
        _previousRAF = t;
      });
}

function _Step(timeElapsed) {
  if (isTakingOff) {
      const timeElapsedS = timeElapsed * 0.001;
      particles.Step(timeElapsedS);
  }
}

// function animate() {

// 	// cube.rotation.x += 0.01;
// 	// cube.rotation.y += 0.01;

// 	renderer.render( scene, camera );

// }