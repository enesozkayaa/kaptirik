// =============================================================
// Kaptirik - 3D masa (Three.js)
// Yeşil çuhalı masa, ahşap ıstakalar (arkalarında oyuncunun adı kazılı), rakiplerin ters taşları,
// ortada deste ve gösterge, köşelerde atılan taşlar, ortada açılan gruplar.
// Kendi taşlarımız ekranın altında (HTML) durur; masa her değişiklikte yeniden çizilir.
// Koltuklar ekrana göre: 0 alt (ben), 1 sağ, 2 üst, 3 sol.
// =============================================================

const Sahne = (() => {
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const RENKLER = ['#d99a00', '#1f6feb', '#1d1d1d', '#d62828'];
  const TAS_G = 0.24, TAS_Y = 0.33, TAS_K = 0.05;  // masaya yatan taş ölçüsü
  let renderer, sahne, kamera, dinamik, istakaGrubu;
  const isin = new THREE.Raycaster();
  const fare = new THREE.Vector2();
  let tiklaninca = () => {};
  let tiklanabilir = [];
  const bakis = { konum: V(0, 8.6, 5.6), hedef: V(0, 0, 0.5) };

  // ---------- Kurulum ----------
  function baslat(kap) {
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    kap.appendChild(renderer.domElement);
    sahne = new THREE.Scene();
    sahne.background = new THREE.Color(0x2a1a12);
    kamera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);

    sahne.add(new THREE.HemisphereLight(0xfff4e0, 0x3a2a1a, 1.2));
    const lamba = new THREE.DirectionalLight(0xfff0d8, 1.8);
    lamba.position.set(2, 10, 4);
    lamba.castShadow = true;
    lamba.shadow.mapSize.set(2048, 2048);
    Object.assign(lamba.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6 });
    lamba.shadow.bias = -0.0004;
    sahne.add(lamba);

    masaKur();
    istakaGrubu = new THREE.Group();
    sahne.add(istakaGrubu);
    dinamik = new THREE.Group();
    sahne.add(dinamik);

    boyutla();
    window.addEventListener('resize', boyutla);
    renderer.domElement.addEventListener('pointerup', tikla);
    renderer.setAnimationLoop(() => {
      kamera.position.copy(bakis.konum);
      kamera.lookAt(bakis.hedef);
      renderer.render(sahne, kamera);
    });
  }

  function dokuKanvas(gen, yuk, ciz) {
    const c = document.createElement('canvas');
    c.width = gen;
    c.height = yuk;
    ciz(c.getContext('2d'), gen, yuk);
    const d = new THREE.CanvasTexture(c);
    d.colorSpace = THREE.SRGBColorSpace;
    d.anisotropy = 4;
    return d;
  }

  function masaKur() {
    // Yeşil çuha
    const cuha = dokuKanvas(256, 256, (g, w, h) => {
      g.fillStyle = '#1f6b45';
      g.fillRect(0, 0, w, h);
      for (let k = 0; k < 6000; k++) {
        g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,30,10' : '80,160,110'},0.12)`;
        g.fillRect(Math.random() * w, Math.random() * h, 1, 1);
      }
    });
    cuha.wrapS = cuha.wrapT = THREE.RepeatWrapping;
    cuha.repeat.set(4, 4);
    const masa = new THREE.Mesh(new THREE.BoxGeometry(9.4, 0.2, 9.4), new THREE.MeshStandardMaterial({ map: cuha, roughness: 0.95 }));
    masa.position.y = -0.1;
    masa.receiveShadow = true;
    sahne.add(masa);
    // Ahşap kenar
    const ahsap = new THREE.MeshStandardMaterial({ color: 0x5a3418, roughness: 0.6 });
    [[0, 4.85, 10, 0.5], [0, -4.85, 10, 0.5], [4.85, 0, 0.5, 9.2], [-4.85, 0, 0.5, 9.2]].forEach(([x, z, w, d]) => {
      const kenar = new THREE.Mesh(new THREE.BoxGeometry(w, 0.35, d), ahsap);
      kenar.position.set(x, 0.05, z);
      kenar.castShadow = kenar.receiveShadow = true;
      sahne.add(kenar);
    });
  }

  // ---------- Taş dokuları ----------
  const onbellek = new Map();
  function tasYuzu(t, okey) {
    const k = t.sahte ? 'sahte' : `${t.renk}-${t.sayi}`;
    if (onbellek.has(k)) return onbellek.get(k);
    const d = dokuKanvas(128, 176, (g, w, h) => {
      g.fillStyle = '#f6efdc';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = '#cbbd9a';
      g.lineWidth = 6;
      g.strokeRect(3, 3, w - 6, h - 6);
      if (t.sahte) {
        g.fillStyle = '#1d6b3a';
        g.font = 'bold 96px serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('★', w / 2, h / 2);
        return;
      }
      g.fillStyle = RENKLER[t.renk];
      g.font = 'bold 84px Arial, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(t.sayi, w / 2, h * 0.42);
      g.beginPath();
      g.arc(w / 2, h * 0.78, 12, 0, Math.PI * 2);
      g.fill();
    });
    onbellek.set(k, d);
    return d;
  }

  let sirtDokusu;
  function tasSirti() {
    sirtDokusu ??= dokuKanvas(128, 176, (g, w, h) => {
      g.fillStyle = '#e8dfc6';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = '#b9a986';
      g.lineWidth = 6;
      g.strokeRect(3, 3, w - 6, h - 6);
      g.strokeStyle = '#c7b78f';
      g.lineWidth = 3;
      for (let y = 20; y < h; y += 18) {
        g.beginPath();
        g.moveTo(14, y);
        g.lineTo(w - 14, y);
        g.stroke();
      }
    });
    return sirtDokusu;
  }

  const govdeMalz = new THREE.MeshStandardMaterial({ color: 0xefe6cf, roughness: 0.5 });

  // Masaya yatan taş (yüzü yukarı ya da ters)
  function yatanTas(t, ters, olcek = 1) {
    const grup = new THREE.Group();
    const govde = new THREE.Mesh(new THREE.BoxGeometry(TAS_G * olcek, TAS_K, TAS_Y * olcek), govdeMalz);
    govde.castShadow = true;
    const yuz = new THREE.Mesh(
      new THREE.PlaneGeometry(TAS_G * olcek * 0.96, TAS_Y * olcek * 0.96),
      new THREE.MeshStandardMaterial({ map: ters ? tasSirti() : tasYuzu(t), roughness: 0.45 }),
    );
    yuz.rotation.x = -Math.PI / 2;
    yuz.position.y = TAS_K / 2 + 0.001;
    grup.add(govde, yuz);
    return grup;
  }

  // Istakada dik duran rakip taşı (sırtı bize dönük)
  function dikTas() {
    const grup = new THREE.Group();
    const govde = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.33, 0.06), govdeMalz);
    govde.castShadow = true;
    const sirt = new THREE.Mesh(new THREE.PlaneGeometry(0.23, 0.32), new THREE.MeshStandardMaterial({ map: tasSirti(), roughness: 0.5 }));
    sirt.position.z = 0.031;
    grup.add(govde, sirt);
    return grup;
  }

  // ---------- Istaka: arkasında oyuncunun adı kazılı ----------
  function istaka(ad, renk) {
    const grup = new THREE.Group();
    const ahsap = dokuKanvas(512, 64, (g, w, h) => {
      g.fillStyle = '#7a4a24';
      g.fillRect(0, 0, w, h);
      for (let k = 0; k < 30; k++) {  // ağaç damarları
        g.strokeStyle = `rgba(${Math.random() < 0.5 ? '50,25,10' : '150,95,50'},0.35)`;
        g.lineWidth = 1 + Math.random() * 2;
        g.beginPath();
        const y = Math.random() * h;
        g.moveTo(0, y);
        g.bezierCurveTo(w * 0.3, y + 6, w * 0.6, y - 6, w, y + (Math.random() - 0.5) * 8);
        g.stroke();
      }
      // Kazılı ad: koyu oyuk + alt kenarında ışık
      g.font = 'bold 34px Georgia, serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = 'rgba(255,220,170,0.35)';
      g.fillText(ad, w / 2 + 1, h / 2 + 2);
      g.fillStyle = '#2a1408';
      g.fillText(ad, w / 2, h / 2);
      g.fillStyle = renk;
      g.fillRect(14, h / 2 - 5, 10, 10);
    });
    const malz = new THREE.MeshStandardMaterial({ color: 0x8a5530, roughness: 0.55 });
    const arkaMalz = new THREE.MeshStandardMaterial({ map: ahsap, roughness: 0.6 });
    // Raf (taşlar üstünde durur) ve masanın ortasına bakan pano (yerel +z yönü = masanın ortası).
    // Panonun ortaya bakan yüzüne oyuncunun adı kazılı; taşların üst kısmı panonun üstünden görünür.
    const raf = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.08, 0.55), malz);
    raf.position.set(0, 0.04, 0);
    const pano = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.3, 0.08), [malz, malz, malz, malz, arkaMalz, malz]);
    pano.position.set(0, 0.19, 0.26);
    raf.castShadow = pano.castShadow = true;
    grup.add(raf, pano);
    return grup;
  }

  // Koltuk konumu ve dönüşü (ekrana göre). Dönüş, ıstakanın yerel +z yönünü masanın ortasına çevirir.
  const KOLTUK = [
    { x: 0, z: 4.1, don: Math.PI },        // alt (ben)
    { x: 4.1, z: 0, don: -Math.PI / 2 },   // sağ
    { x: 0, z: -4.1, don: 0 },             // üst
    { x: -4.1, z: 0, don: Math.PI / 2 },   // sol
  ];

  let istakaAnahtari = '';
  function istakalariKur(adlar, renkler) {
    const anahtar = adlar.join('|');
    if (anahtar === istakaAnahtari) return;
    istakaAnahtari = anahtar;
    while (istakaGrubu.children.length) istakaGrubu.remove(istakaGrubu.children[0]);
    adlar.forEach((ad, koltuk) => {
      const k = KOLTUK[koltuk];
      const i = istaka(ad, renkler[koltuk]);
      i.position.set(k.x, 0, k.z);
      i.rotation.y = k.don;
      istakaGrubu.add(i);
    });
  }

  // ---------- Masayı çiz ----------
  // gorunum: { koltuklar: [{ ad, renk, tasSayisi, atilanlar }], gosterge, desteSayisi, masa: [grup], okey, isaretli: Set(grupId), benimNo }
  function ciz(g) {
    while (dinamik.children.length) dinamik.remove(dinamik.children[0]);
    tiklanabilir = [];
    istakalariKur(g.koltuklar.map(k => k.ad), g.koltuklar.map(k => k.renk));

    // Rakiplerin ıstakalarındaki ters taşlar
    g.koltuklar.forEach((k, koltuk) => {
      if (koltuk === 0) return;
      const yer = KOLTUK[koltuk];
      const n = Math.min(k.tasSayisi, 16);
      for (let i = 0; i < n; i++) {
        const t = dikTas();
        const u = (i - (n - 1) / 2) * 0.25;
        const yerel = V(u, 0.25, 0.1).applyAxisAngle(V(0, 1, 0), yer.don);
        t.position.set(yer.x + yerel.x, yerel.y, yer.z + yerel.z);
        // Sırtı masanın ortasına (bize) dönük, panoya hafif yaslanmış
        t.rotation.set(0, yer.don, 0);
        t.rotateX(0.18);
        dinamik.add(t);
      }
    });

    // Ortada deste ve gösterge
    const deste = new THREE.Group();
    const kat = Math.max(1, Math.min(10, Math.ceil(g.desteSayisi / 6)));
    for (let k = 0; k < kat; k++) {
      const t = yatanTas(null, true, 1.15);
      t.position.y = k * TAS_K;
      deste.add(t);
    }
    deste.position.set(-0.3, 0, 0);
    deste.traverse(m => (m.userData.tik = { tur: 'deste' }));
    tiklanabilir.push(deste);
    dinamik.add(deste);
    if (g.gosterge) {
      const gost = yatanTas(g.gosterge, false, 1.15);
      gost.position.set(0.3, 0, 0);
      gost.rotation.y = 0.15;
      dinamik.add(gost);
    }

    // Köşelerde atılan taşlar: her oyuncu sağındaki köşeye atar
    const KOSE = [[3.0, 3.0], [3.0, -3.0], [-3.0, -3.0], [-3.0, 3.0]];
    g.koltuklar.forEach((k, koltuk) => {
      const [x, z] = KOSE[koltuk];
      const yigin = new THREE.Group();
      const son = k.atilanlar.slice(-3);
      son.forEach((t, i) => {
        const m = yatanTas(t, false, 1.2);
        m.position.set(i * 0.05, i * TAS_K, -i * 0.05);
        m.rotation.y = (i - 1) * 0.12;
        yigin.add(m);
      });
      if (!son.length) {  // boş yer işareti
        const halka = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.24, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25 }));
        halka.rotation.x = -Math.PI / 2;
        halka.position.y = 0.01;
        yigin.add(halka);
      }
      yigin.position.set(x, 0, z);
      yigin.traverse(m => (m.userData.tik = { tur: 'atilan', koltuk }));
      tiklanabilir.push(yigin);
      dinamik.add(yigin);
    });

    // Açılan gruplar: her oyuncunun grupları kendi önündeki alana dizilir (taşlar bize doğru okunur)
    const ALAN = [
      { x0: -2.6, x1: 2.6, z0: 1.0, satir: 0.5 },    // alt
      { x0: 0.75, x1: 2.75, z0: -0.85, satir: 0.5 },  // sağ
      { x0: -2.6, x1: 2.6, z0: -2.4, satir: 0.5 },    // üst
      { x0: -2.75, x1: -0.75, z0: -0.85, satir: 0.5 }, // sol
    ];
    const M = 1.25;  // açılan taşlar biraz büyük olsun, okunsun
    const AR = TAS_G * M + 0.01;
    const koltugaGore = [[], [], [], []];
    g.masa.forEach(gr => koltugaGore[(gr.sahip - g.benimNo + 4) % 4].push(gr));
    koltugaGore.forEach((liste, koltuk) => {
      const a = ALAN[koltuk];
      let x = a.x0, z = a.z0;
      liste.forEach(gr => {
        const gen = gr.sirali.length * AR;
        if (x + gen > a.x1 && x > a.x0) {
          x = a.x0;
          z += a.satir;
        }
        const grup = new THREE.Group();
        gr.sirali.forEach((t, i) => {
          const m = yatanTas(t, t.ters && g.okeyMi(t), M);
          m.position.set(i * AR, 0, 0);
          grup.add(m);
        });
        if (g.isaretli?.has(gr.id)) {
          const isik = new THREE.Mesh(
            new THREE.PlaneGeometry(gen + 0.16, TAS_Y * M + 0.16),
            new THREE.MeshBasicMaterial({ color: 0x5dff8a, transparent: true, opacity: 0.8, depthWrite: false }),
          );
          isik.rotation.x = -Math.PI / 2;
          isik.position.set(gen / 2 - TAS_G * M / 2 - 0.005, 0.002, 0);
          grup.add(isik);
        }
        grup.position.set(x + TAS_G * M / 2, 0, z);
        grup.traverse(m => (m.userData.tik = { tur: 'grup', id: gr.id }));
        tiklanabilir.push(grup);
        dinamik.add(grup);
        x += gen + 0.12;
      });
    });
  }

  // ---------- Kamera ve dokunma ----------
  function boyutla() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h);
    kamera.aspect = w / h;
    kamera.updateProjectionMatrix();
    // Dik telefonda masayı sığdırmak için geri çekil
    const k = kamera.aspect < 1 ? Math.min(2.1, 1.15 / kamera.aspect) : 1;
    bakis.konum.set(0, 10.4 * k, 6.2 * k);
    bakis.hedef.set(0, 0, 1.5 + (k - 1) * 1.1);
  }

  function tikla(e) {
    const kutu = renderer.domElement.getBoundingClientRect();
    fare.set(((e.clientX - kutu.left) / kutu.width) * 2 - 1, -((e.clientY - kutu.top) / kutu.height) * 2 + 1);
    isin.setFromCamera(fare, kamera);
    const vurulan = isin.intersectObjects(tiklanabilir, true)[0];
    if (vurulan?.object.userData.tik) tiklaninca(vurulan.object.userData.tik);
  }

  return {
    RENKLER, baslat, ciz, tasYuzu,
    tiklayinca(fn) { tiklaninca = fn; },
  };
})();
