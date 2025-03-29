// Wait for all resources to load before initializing
window.addEventListener('DOMContentLoaded', () => {
    // Make sure Three.js is loaded
    if (typeof THREE === 'undefined') {
      console.error('Three.js library not loaded');
      document.body.innerHTML = '<div style="color: white; padding: 20px;">Error: Three.js library not loaded. Check console for details.</div>';
      return;
    }
  
    try {
      // Scene setup
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x000000);
  
      // Camera setup
      const camera = new THREE.PerspectiveCamera(
        60,
        window.innerWidth / window.innerHeight,
        0.1,
        5000
      );
      camera.position.set(0, 200, 800);
      camera.lookAt(0, 0, 0);
  
      // Renderer
      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(window.innerWidth, window.innerHeight);
      document.body.appendChild(renderer.domElement);
  
      // Global controls with mouse
      setupMouseControls(camera);
  
      // Lighting
      const ambientLight = new THREE.AmbientLight(0x404040, 2.0);
      scene.add(ambientLight);
  
      const directionalLight = new THREE.DirectionalLight(0xffffff, 2.0);
      directionalLight.position.set(100, 100, 100);
      scene.add(directionalLight);
  
      // Sun at the center
      const sunGeometry = new THREE.SphereGeometry(50, 32, 32);
      const sunMaterial = new THREE.MeshBasicMaterial({ 
        color: 0xffff00
      });
      const sun = new THREE.Mesh(sunGeometry, sunMaterial);
      scene.add(sun);
  
      // Point light from the sun
      const sunLight = new THREE.PointLight(0xffffff, 2, 2000);
      scene.add(sunLight);
  
      // Planets data with real proportions (scaled down)
      const planetsData = [
        // Mercury
        {
          name: 'Mercury',
          radius: 5,
          distance: 100,
          color: 0xA9A9A9,
          rotationSpeed: 0.004,
          revolutionSpeed: 0.008
        },
        // Venus
        {
          name: 'Venus',
          radius: 8,
          distance: 150,
          color: 0xE39E1C,
          rotationSpeed: 0.002,
          revolutionSpeed: 0.006
        },
        // Earth
        {
          name: 'Earth',
          radius: 9,
          distance: 200,
          color: 0x1C7AE3,
          rotationSpeed: 0.01,
          revolutionSpeed: 0.005
        },
        // Mars
        {
          name: 'Mars',
          radius: 6,
          distance: 250,
          color: 0xE31C1C,
          rotationSpeed: 0.008,
          revolutionSpeed: 0.004
        },
        // Jupiter
        {
          name: 'Jupiter',
          radius: 25,
          distance: 350,
          color: 0xE3A91C,
          rotationSpeed: 0.02,
          revolutionSpeed: 0.002
        },
        // Saturn
        {
          name: 'Saturn',
          radius: 20,
          distance: 450,
          color: 0xEED7A0,
          rotationSpeed: 0.018,
          revolutionSpeed: 0.0015,
          hasRings: true
        },
        // Uranus
        {
          name: 'Uranus',
          radius: 15,
          distance: 550,
          color: 0x1CE3E3,
          rotationSpeed: 0.012,
          revolutionSpeed: 0.001
        },
        // Neptune
        {
          name: 'Neptune',
          radius: 14,
          distance: 650,
          color: 0x1C1CE3,
          rotationSpeed: 0.01,
          revolutionSpeed: 0.0008
        },
        // Pluto (dwarf planet)
        {
          name: 'Pluto',
          radius: 3,
          distance: 750,
          color: 0xA07C5E,
          rotationSpeed: 0.005,
          revolutionSpeed: 0.0005
        }
      ];
  
      // Create planet objects and orbits
      const planets = [];
      const orbits = [];
  
      planetsData.forEach(planet => {
        // Create orbit
        const orbitGeometry = new THREE.RingGeometry(planet.distance - 0.5, planet.distance + 0.5, 128);
        const orbitMaterial = new THREE.MeshBasicMaterial({ 
          color: 0x444444, 
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.3
        });
        const orbit = new THREE.Mesh(orbitGeometry, orbitMaterial);
        orbit.rotation.x = Math.PI / 2;
        scene.add(orbit);
        orbits.push(orbit);
        
        // Create planet
        const planetGeometry = new THREE.SphereGeometry(planet.radius, 32, 32);
        const planetMaterial = new THREE.MeshPhongMaterial({ 
          color: planet.color,
          shininess: 30
        });
        const planetMesh = new THREE.Mesh(planetGeometry, planetMaterial);
        
        // Create a group for the planet (and potentially rings)
        const planetGroup = new THREE.Group();
        planetGroup.add(planetMesh);
        
        // Add rings for Saturn
        if (planet.hasRings) {
          const ringGeometry = new THREE.RingGeometry(planet.radius * 1.3, planet.radius * 2, 64);
          const ringMaterial = new THREE.MeshBasicMaterial({ 
            color: 0xCDBB99,
            side: THREE.DoubleSide, 
            transparent: true,
            opacity: 0.8
          });
          const ring = new THREE.Mesh(ringGeometry, ringMaterial);
          ring.rotation.x = Math.PI / 3;
          planetGroup.add(ring);
        }
        
        // Position planet at initial position
        const angle = Math.random() * Math.PI * 2;
        planetGroup.position.x = Math.cos(angle) * planet.distance;
        planetGroup.position.z = Math.sin(angle) * planet.distance;
        
        // Store revolution angle
        planetGroup.userData = {
          revolutionAngle: angle,
          data: planet
        };
        
        scene.add(planetGroup);
        planets.push(planetGroup);
      });
  
      // Animation parameters
      const animationParams = {
        running: true,
        speed: 1
      };
      
      // Setup dat.GUI for controls
      setupDatGUI(camera, sun, planets, animationParams);
  
      // Animation loop
      function animate() {
        requestAnimationFrame(animate);
        
        if (animationParams.running) {
          // Rotate the sun
          sun.rotation.y += 0.001 * animationParams.speed;
          
          // Update each planet
          planets.forEach(planetGroup => {
            const planet = planetGroup.children[0];  // The planet mesh is the first child
            const data = planetGroup.userData.data;
            
            // Rotate planet around its axis
            planet.rotation.y += data.rotationSpeed * animationParams.speed;
            
            // Revolve around the sun
            planetGroup.userData.revolutionAngle += data.revolutionSpeed * animationParams.speed;
            const angle = planetGroup.userData.revolutionAngle;
            
            planetGroup.position.x = Math.cos(angle) * data.distance;
            planetGroup.position.z = Math.sin(angle) * data.distance;
          });
        }
        
        renderer.render(scene, camera);
      }
  
      // Manual mouse controls for rotation and zoom
      function setupMouseControls(camera) {
        let isDragging = false;
        let previousMousePosition = { x: 0, y: 0 };
        let cameraDistance = 800;
        let cameraRotation = { x: 0, y: 0 };
        
        document.addEventListener('mousedown', (e) => {
          isDragging = true;
          previousMousePosition = { x: e.clientX, y: e.clientY };
        });
        
        document.addEventListener('mousemove', (e) => {
          if (isDragging) {
            const deltaMove = {
              x: e.clientX - previousMousePosition.x,
              y: e.clientY - previousMousePosition.y
            };
            
            // Update camera rotation
            cameraRotation.x += deltaMove.y * 0.005;
            cameraRotation.y += deltaMove.x * 0.005;
            
            // Limit vertical rotation to avoid flipping
            cameraRotation.x = Math.max(-Math.PI/2, Math.min(Math.PI/2, cameraRotation.x));
            
            updateCameraPosition();
            
            previousMousePosition = { x: e.clientX, y: e.clientY };
          }
        });
        
        document.addEventListener('mouseup', () => {
          isDragging = false;
        });
        
        document.addEventListener('wheel', (e) => {
          // Zoom in/out with mouse wheel
          cameraDistance += e.deltaY * 0.5;
          cameraDistance = Math.max(100, Math.min(3000, cameraDistance));
          updateCameraPosition();
          e.preventDefault();
        });
        
        function updateCameraPosition() {
          const x = cameraDistance * Math.sin(cameraRotation.y) * Math.cos(cameraRotation.x);
          const y = cameraDistance * Math.sin(cameraRotation.x);
          const z = cameraDistance * Math.cos(cameraRotation.y) * Math.cos(cameraRotation.x);
          
          camera.position.set(x, y, z);
          camera.lookAt(0, 0, 0);
        }
        
        // Initial camera position
        updateCameraPosition();
      }
  
      // Setup dat.GUI controls
      function setupDatGUI(camera, sun, planets, animationParams) {
        // Check if dat.GUI is loaded
        if (typeof dat === 'undefined') {
          console.warn('dat.GUI not loaded, skipping GUI controls');
          return;
        }
        
        const gui = new dat.GUI();
        
        // Animation folder
        const animationFolder = gui.addFolder('Animation');
        animationFolder.add(animationParams, 'running').name('Play/Pause');
        animationFolder.add(animationParams, 'speed', 0.1, 5).name('Speed');
        animationFolder.open();
        
        // Camera folder
        const cameraFolder = gui.addFolder('Camera');
        cameraFolder.add(camera.position, 'x', -1000, 1000).listen();
        cameraFolder.add(camera.position, 'y', -1000, 1000).listen();
        cameraFolder.add(camera.position, 'z', -1000, 1000).listen();
        
        // Sun folder
        const sunFolder = gui.addFolder('Sun');
        sunFolder.addColor(new ColorController(sunMaterial), 'color').name('Color');
        sunFolder.add(sun.scale, 'x', 0.5, 2).name('Scale').onChange((value) => {
          sun.scale.set(value, value, value);
        });
        
        // Planets folder
        const planetsFolder = gui.addFolder('Planets');
        
        planets.forEach((planetGroup, index) => {
          const planetData = planetGroup.userData.data;
          const planet = planetGroup.children[0]; // The actual mesh
          
          const planetFolder = planetsFolder.addFolder(planetData.name);
          
          planetFolder.add(planetData, 'distance', 50, 1000).name('Orbit Radius').onChange((value) => {
            // Update orbit mesh
            if (orbits[index]) {
              scene.remove(orbits[index]);
              
              const orbitGeometry = new THREE.RingGeometry(value - 0.5, value + 0.5, 128);
              const orbitMaterial = new THREE.MeshBasicMaterial({
                color: 0x444444,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.3
              });
              
              orbits[index] = new THREE.Mesh(orbitGeometry, orbitMaterial);
              orbits[index].rotation.x = Math.PI / 2;
              scene.add(orbits[index]);
            }
          });
          
          planetFolder.add(planetData, 'radius', 1, 50).name('Size').onChange((value) => {
            // Update planet geometry
            const newGeometry = new THREE.SphereGeometry(value, 32, 32);
            planet.geometry.dispose();
            planet.geometry = newGeometry;
            
            // Update rings for Saturn
            if (planetData.name === 'Saturn' && planetGroup.children.length > 1) {
              const ring = planetGroup.children[1];
              const newRingGeometry = new THREE.RingGeometry(value * 1.3, value * 2, 64);
              ring.geometry.dispose();
              ring.geometry = newRingGeometry;
            }
          });
          
          planetFolder.add(planetData, 'rotationSpeed', 0, 0.05).name('Rotation');
          planetFolder.add(planetData, 'revolutionSpeed', 0, 0.02).name('Revolution');
          
          planetFolder.addColor(new ColorController(planet.material), 'color').name('Color');
        });
      }
  
      // Helper for dat.GUI color controls
      function ColorController(material) {
        return {
          get color() {
            return '#' + material.color.getHexString();
          },
          set color(hexString) {
            material.color.set(hexString);
          }
        };
      }
  
      // Start animation
      animate();
  
      // Handle window resize
      window.addEventListener("resize", () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      });
  
      console.log("Solar system initialized successfully");
    } catch (error) {
      console.error("Error initializing solar system:", error);
      document.body.innerHTML = '<div style="color: white; padding: 20px;">Error: ' + error.message + '</div>';
    }
  });