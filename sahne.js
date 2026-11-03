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
  let masadaBasildi = false;
  let grupKutulari = [];  // masadaki grupların kapladığı alan (taş bırakırken yakındaki grubu bulmak için)
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
    // Sadece masada başlayan dokunuşlar sayılır (ıstakadan sürüklenip bırakılan taş tıklama sayılmaz)
    renderer.domElement.addEventListener('pointerdown', () => (masadaBasildi = true));
    renderer.domElement.addEventListener('pointerup', e => {
      if (masadaBasildi) tikla(e);
      masadaBasildi = false;
    });
    renderer.setAnimationLoop(() => {
      kameraGuncelle();
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

  // ---------- Istaka ----------
  // Masanın ortasına bakan dik ahşap pano; arkasında (sahibinin tarafında) iki üçgen destek ayağı.
  // Taşlar panonun arkasında kalır, rakibin taşları görünmez. Oyuncunun adı panonun ön yüzüne kazılı.
  // Yerel eksenler: +x ıstaka boyunca, +z masanın ortasına doğru, sahibi -z tarafında oturur.
  const ISTAKA_BOY = 4.6, ISTAKA_YUK = 0.75;
  function ahsapDokusu(gen, yuk, yaz) {
    return dokuKanvas(gen, yuk, (g, w, h) => {
      const ton = g.createLinearGradient(0, 0, 0, h);
      ton.addColorStop(0, '#d9963f');
      ton.addColorStop(1, '#b8712a');
      g.fillStyle = ton;
      g.fillRect(0, 0, w, h);
      for (let k = 0; k < 40; k++) {  // ağaç damarları
        g.strokeStyle = `rgba(${Math.random() < 0.6 ? '120,60,15' : '240,180,110'},${0.15 + Math.random() * 0.2})`;
        g.lineWidth = 1 + Math.random() * 2.5;
        g.beginPath();
        const y = Math.random() * h;
        g.moveTo(0, y);
        g.bezierCurveTo(w * 0.3, y + 10 * Math.random(), w * 0.6, y - 10 * Math.random(), w, y + (Math.random() - 0.5) * 12);
        g.stroke();
      }
      if (yaz) yaz(g, w, h);
    });
  }
  const ayakMalz = new THREE.MeshStandardMaterial({ map: ahsapDokusu(256, 256), roughness: 0.55 });

  function istaka(ad, renk) {
    const grup = new THREE.Group();
    const onYuz = ahsapDokusu(1024, 168, (g, w, h) => {
      // Kazılı ad: koyu oyuk + alt kenarında ışık
      g.font = 'bold 74px Georgia, serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = 'rgba(255,225,170,0.5)';
      g.fillText(ad, w / 2 + 2, h / 2 + 3);
      g.fillStyle = 'rgba(95,40,8,0.85)';
      g.fillText(ad, w / 2, h / 2);
      g.fillStyle = renk;
      g.beginPath();
      g.arc(w / 2 - g.measureText(ad).width / 2 - 40, h / 2, 16, 0, Math.PI * 2);
      g.fill();
    });
    const duz = new THREE.MeshStandardMaterial({ map: ahsapDokusu(512, 64), roughness: 0.55 });
    const onMalz = new THREE.MeshStandardMaterial({ map: onYuz, roughness: 0.5 });
    // Pano: hafif geriye (sahibine doğru) yatık
    const pano = new THREE.Mesh(new THREE.BoxGeometry(ISTAKA_BOY, ISTAKA_YUK, 0.1), [duz, duz, duz, duz, onMalz, duz]);
    pano.position.set(0, ISTAKA_YUK / 2, 0);
    pano.rotation.x = -0.12;
    // Ön alt pervaz
    const pervaz = new THREE.Mesh(new THREE.BoxGeometry(ISTAKA_BOY + 0.1, 0.1, 0.16), duz);
    pervaz.position.set(0, 0.05, 0.1);
    // İki uçta üçgen destek ayakları (panonun arkasında)
    const ucgen = new THREE.Shape();
    ucgen.moveTo(0, 0);
    ucgen.lineTo(0.55, 0);
    ucgen.lineTo(0.08, ISTAKA_YUK * 0.95);
    ucgen.lineTo(0, ISTAKA_YUK * 0.95);
    const ayakGeo = new THREE.ExtrudeGeometry(ucgen, { depth: 0.09, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01, bevelSegments: 1 });
    ayakGeo.rotateY(Math.PI / 2);  // şeklin x'i -z yönüne (sahibine doğru) döner
    [-1, 1].forEach(yon => {
      const ayak = new THREE.Mesh(ayakGeo, ayakMalz);
      ayak.position.set(yon * (ISTAKA_BOY / 2 - 0.12) - 0.045, 0, 0);
      ayak.castShadow = true;
      grup.add(ayak);
    });
    pano.castShadow = pervaz.castShadow = true;
    grup.add(pano, pervaz);
    return grup;
  }

  // Koltuk konumu ve dönüşü (ekrana göre). Dönüş, ıstakanın yerel +z yönünü masanın ortasına çevirir.
  const KOLTUK = [
    { x: 0, z: 3.85, don: Math.PI },        // alt (ben)
    { x: 3.85, z: 0, don: -Math.PI / 2 },   // sağ
    { x: 0, z: -3.85, don: 0 },             // üst
    { x: -3.85, z: 0, don: Math.PI / 2 },   // sol
  ];

  // Atılan taşların köşeleri (koltuğa göre). Sıra saatin tersine: ben (alt) → sağ → üst → sol.
  // Ben sağ alt köşeye atarım (sağdaki oradan alır); soldaki sol alt köşeye atar, ben oradan alırım.
  const KOSE = [[3.15, 3.15], [3.15, -3.15], [-3.15, -3.15], [-3.15, 3.15]];
  const DESTE = V(-0.42, 0, 0);
  const BUYUK = 1.6;  // deste ve gösterge taşları

  // Kalan taş sayısı için yuvarlak etiket
  const etiketler = new Map();
  function sayiEtiketi(n) {
    if (etiketler.has(n)) return etiketler.get(n);
    const d = dokuKanvas(140, 100, (g, w, h) => {
      g.fillStyle = 'rgba(0,0,0,0.75)';
      g.beginPath();
      g.roundRect(4, 4, w - 8, h - 8, 40);
      g.fill();
      g.fillStyle = '#f6d58a';
      g.font = 'bold 60px Arial, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(n, w / 2, h / 2 + 3);
    });
    etiketler.set(n, d);
    return d;
  }

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
    grupKutulari = [];
    istakalariKur(g.koltuklar.map(k => k.ad), g.koltuklar.map(k => k.renk));

    // Ortada deste ve gösterge
    const deste = new THREE.Group();
    const kat = Math.max(1, Math.min(10, Math.ceil(g.desteSayisi / 6)));
    for (let k = 0; k < kat; k++) {
      const t = yatanTas(null, true, BUYUK);
      t.position.y = k * TAS_K;
      deste.add(t);
    }
    // Destenin üstünde kalan taş sayısı
    const etiket = new THREE.Sprite(new THREE.SpriteMaterial({ map: sayiEtiketi(g.desteSayisi), depthTest: false }));
    etiket.scale.set(0.42, 0.3, 1);
    etiket.position.set(0, kat * TAS_K + 0.28, 0);
    etiket.renderOrder = 5;
    deste.add(etiket);
    deste.position.copy(DESTE);
    deste.traverse(m => (m.userData.tik = { tur: 'deste' }));
    tiklanabilir.push(deste);
    dinamik.add(deste);
    if (g.gosterge) {
      const gost = yatanTas(g.gosterge, false, BUYUK);
      gost.position.set(DESTE.x + TAS_G * BUYUK + 0.04, 0, 0);  // destenin hemen yanında
      gost.rotation.y = 0.15;
      dinamik.add(gost);
    }

    // Köşelerde atılan taşlar: her oyuncu sağındaki köşeye atar, sıradaki oyuncu oradan alır
    g.koltuklar.forEach((k, koltuk) => {
      const [x, z] = KOSE[koltuk];
      const yigin = new THREE.Group();
      const son = k.atilanlar.slice(-2);
      son.forEach((t, i) => {
        const m = yatanTas(t, false, 1.75);
        const ust = i === son.length - 1;
        m.position.set(ust ? 0 : -0.12, i * TAS_K, ust ? 0 : -0.1);
        m.rotation.y = ust ? 0.05 : -0.2;
        yigin.add(m);
      });
      if (!son.length) {  // boş yer işareti
        const halka = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.35, 28), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25 }));
        halka.rotation.x = -Math.PI / 2;
        halka.position.y = 0.01;
        yigin.add(halka);
      }
      yigin.position.set(x, 0, z);
      yigin.traverse(m => (m.userData.tik = { tur: 'atilan', koltuk }));
      tiklanabilir.push(yigin);
      dinamik.add(yigin);
    });

    // Açılan gruplar: her oyuncunun grupları kendi önüne, kendisine dönük dizilir (gerçek masadaki gibi):
    // benimkiler bana doğru okunur, karşıdakininkiler bana ters, yandakilerinki yan görünür.
    // Alan her koltuk için aynı tanımlanır ("sahibi aşağıda oturuyormuş gibi") ve koltuğun yönüne döndürülür.
    // Alanlar fırıldak gibi kaydırılmıştır, birbirine binmez.
    const ALAN = { x0: -2.55, x1: 0.95, z0: 1.05, satir: 0.52 };  // köşelerdeki atılan taşlardan uzak dursun
    const DONUS = [0, Math.PI / 2, Math.PI, -Math.PI / 2];  // alt, sağ, üst, sol
    const M = 1.45;  // açılan taşlar büyük olsun, okunsun
    const AR = TAS_G * M + 0.01;
    const yereDon = (x, z, a) => ({ x: x * Math.cos(a) + z * Math.sin(a), z: -x * Math.sin(a) + z * Math.cos(a) });
    const koltugaGore = [[], [], [], []];
    g.masa.forEach(gr => koltugaGore[g.koltukNo(gr.sahip)].push(gr));
    koltugaGore.forEach((liste, koltuk) => {
      const a = ALAN;
      const kap = new THREE.Group();
      kap.rotation.y = DONUS[koltuk];
      dinamik.add(kap);
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
        // Masadaki gerçek kapladığı alan (taş bırakırken yakındaki grubu bulmak için)
        const k1 = yereDon(x, z - TAS_Y * M / 2, DONUS[koltuk]), k2 = yereDon(x + gen, z + TAS_Y * M / 2, DONUS[koltuk]);
        grupKutulari.push({ id: gr.id, x0: Math.min(k1.x, k2.x), x1: Math.max(k1.x, k2.x), z0: Math.min(k1.z, k2.z), z1: Math.max(k1.z, k2.z) });
        grup.traverse(m => (m.userData.tik = { tur: 'grup', id: gr.id }));
        tiklanabilir.push(grup);
        kap.add(grup);
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
    // Dik telefonda masayı sığdırmak için geri çekil (kenardaki tahta biraz taşabilir, taşlar büyük görünsün)
    const k = kamera.aspect < 1 ? Math.min(1.9, 0.98 / kamera.aspect) : 1;
    bakis.konum.set(0, 10.4 * k, 6.2 * k);
    bakis.hedef.set(0, 0, 1.1 + (k - 1) * 0.35);
  }

  function tikla(e) {
    kameraGuncelle();
    const kutu = renderer.domElement.getBoundingClientRect();
    fare.set(((e.clientX - kutu.left) / kutu.width) * 2 - 1, -((e.clientY - kutu.top) / kutu.height) * 2 + 1);
    isin.setFromCamera(fare, kamera);
    const vurulan = isin.intersectObjects(tiklanabilir, true)[0];
    if (vurulan?.object.userData.tik) return tiklaninca(vurulan.object.userData.tik);
    // Tam üstüne denk gelmediyse yakındaki köşe yığınını ya da desteyi say (parmak kocaman)
    const p = isin.ray.intersectPlane(new THREE.Plane(V(0, 1, 0), 0), V());
    if (!p) return;
    const kose = KOSE.findIndex(([x, z]) => Math.hypot(p.x - x, p.z - z) < 1.0);
    if (kose >= 0) tiklaninca({ tur: 'atilan', koltuk: kose });
    else if (Math.hypot(p.x - DESTE.x, p.z - DESTE.z) < 0.7) tiklaninca({ tur: 'deste' });
  }

  // Masadaki noktaya yakın gruplar (en yakından uzağa), en fazla 'sinir' uzaklıkta
  function yakinGruplar(x, z, sinir) {
    return grupKutulari
      .map(k => ({ id: k.id, d: Math.hypot(Math.max(k.x0 - x, 0, x - k.x1), Math.max(k.z0 - z, 0, z - k.z1)) }))
      .filter(k => k.d <= sinir).sort((a, b) => a.d - b.d).map(k => k.id);
  }

  function kameraGuncelle() {
    kamera.position.copy(bakis.konum);
    kamera.lookAt(bakis.hedef);
    kamera.updateMatrixWorld();
  }

  // Masadaki bir yerin ekrandaki konumu (taş uçurma animasyonu için)
  function ekranda(yer) {
    kameraGuncelle();
    const v = yer === 'deste' ? DESTE.clone().setY(0.3)
      : typeof yer === 'object' ? V(yer.x, yer.y, yer.z) : V(KOSE[yer][0], 0.1, KOSE[yer][1]);
    v.project(kamera);
    const kutu = renderer.domElement.getBoundingClientRect();
    return { x: kutu.left + (v.x + 1) / 2 * kutu.width, y: kutu.top + (1 - v.y) / 2 * kutu.height };
  }

  // Ekrandaki noktada ne var? (sürüklenen taş bırakılınca) { tik, x, z }
  function noktada(cx, cy) {
    kameraGuncelle();
    const kutu = renderer.domElement.getBoundingClientRect();
    fare.set(((cx - kutu.left) / kutu.width) * 2 - 1, -((cy - kutu.top) / kutu.height) * 2 + 1);
    isin.setFromCamera(fare, kamera);
    const vurulan = isin.intersectObjects(tiklanabilir, true)[0];
    const duz = new THREE.Plane(V(0, 1, 0), 0);
    const p = isin.ray.intersectPlane(duz, V());
    return { tik: vurulan?.object.userData.tik ?? null, x: p?.x ?? 0, z: p?.z ?? 0 };
  }

  // Taş sürüklenirken atma yerini parlat
  let atmaHalkasi;
  function atmaYeri(goster, yakin = false) {
    if (!atmaHalkasi) {
      atmaHalkasi = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.62, 36), new THREE.MeshBasicMaterial({ color: 0x5dff8a, transparent: true, opacity: 0.7, depthWrite: false }));
      atmaHalkasi.rotation.x = -Math.PI / 2;
      atmaHalkasi.position.set(KOSE[0][0], 0.02, KOSE[0][1]);
      sahne.add(atmaHalkasi);
    }
    atmaHalkasi.visible = goster;
    atmaHalkasi.material.opacity = yakin ? 1 : 0.55;
    atmaHalkasi.scale.setScalar(yakin ? 1.25 : 1);
  }

  return {
    RENKLER, KOSE, baslat, ciz, tasYuzu, ekranda, noktada, atmaYeri, yakinGruplar,
    tiklayinca(fn) { tiklaninca = fn; },
  };
})();
