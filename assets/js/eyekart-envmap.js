/* EyeKart shared studio environment map.
 *
 * Why this exists: the parametric catalog GLBs use high-metalness frame
 * materials (metallicFactor 0.9). A metallic PBR material with no
 * environment map has nothing to reflect, so under plain directional
 * lights it renders near-black — on the live homepage this made the hero
 * glasses read as scattered black wireframe fragments. A small generated
 * room environment gives the metal something to reflect and the frames
 * read as frames again.
 *
 * Works with the vendored Three.js r128 global build: PMREMGenerator and
 * fromScene() both exist there. No external HDR file is fetched, so the
 * page works fully offline / on Render with no new asset.
 */
(function (global) {
  var cached = null;

  function buildEnvironment(renderer) {
    if (cached) return cached;
    var THREE = global.THREE;
    if (!THREE || !THREE.PMREMGenerator) return null;
    try {
      var scene = new THREE.Scene();
      // Bright "studio room": a warm key wall, a cool fill wall, a dark
      // floor strip and a bright ceiling strip. These are not rendered to
      // screen; they are only convolved into the environment map.
      var geo = new THREE.PlaneGeometry(10, 10);
      function panel(color, intensity, x, y, z, ry) {
        var mat = new THREE.MeshBasicMaterial({ color: color });
        mat.color.multiplyScalar(intensity);
        var m = new THREE.Mesh(geo, mat);
        m.position.set(x, y, z);
        if (ry) m.rotation.y = ry;
        scene.add(m);
      }
      panel(0xfff4e0, 4.0, 0, 5, 0, 0);       // ceiling (rotated below)
      scene.children[scene.children.length - 1].rotation.x = Math.PI / 2;
      panel(0xffffff, 2.2, -5, 0, 0, Math.PI / 2);  // left wall
      panel(0xddeeff, 1.6, 5, 0, 0, -Math.PI / 2);  // right wall (cool)
      panel(0xffffff, 2.6, 0, 0, -5, 0);            // back wall
      panel(0x1a1a1a, 0.6, 0, -5, 0, 0);            // floor strip
      scene.children[scene.children.length - 1].rotation.x = -Math.PI / 2;
      var pmrem = new THREE.PMREMGenerator(renderer);
      pmrem.compileCubemapShader();
      var rt = pmrem.fromScene(scene, 0.04);
      cached = rt.texture;
      return cached;
    } catch (e) {
      return null;
    }
  }

  global.EyeKartEnvMap = {
    applyTo: function (renderer, scene) {
      if (!renderer || !scene || scene.environment) return false;
      var tex = buildEnvironment(renderer);
      if (!tex) return false;
      scene.environment = tex;
      return true;
    }
  };
})(typeof window !== 'undefined' ? window : this);
