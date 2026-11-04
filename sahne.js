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
  // Masadaki taşların yüzü: büyük çözünürlük, koyu ve doygun renkler, sayıların çevresinde ince koyu kenar
  // (uzaktan ve telefonda da okunsun diye)
  const YUZ_RENKLERI = ['#e08600', '#0a58d0', '#111111', '#d01414'];
  function tasYuzu(t, okey) {
    const k = t.sahte ? 'sahte' : `${t.renk}-${t.sayi}`;
    if (onbellek.has(k)) return onbellek.get(k);
    const d = dokuKanvas(256, 352, (g, w, h) => {
      g.fillStyle = '#fffaf0';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = '#d8c9a6';
      g.lineWidth = 8;
      g.strokeRect(4, 4, w - 8, h - 8);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      if (t.sahte) {
        g.fillStyle = '#12753a';
        g.font = 'bold 210px serif';
        g.fillText('★', w / 2, h / 2);
        return;
      }
      const renk = YUZ_RENKLERI[t.renk];
      g.font = `900 ${t.sayi >= 10 ? 170 : 200}px Arial, sans-serif`;
      g.lineJoin = 'round';
      g.lineWidth = 10;
      g.strokeStyle = 'rgba(0,0,0,.28)';
      g.strokeText(t.sayi, w / 2, h * 0.42);
      g.fillStyle = renk;
      g.fillText(t.sayi, w / 2, h * 0.42);
      g.beginPath();
      g.arc(w / 2, h * 0.8, 26, 0, Math.PI * 2);
      g.fill();
    });
    d.anisotropy = 8;
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
      // Yüz ışıktan etkilenmez (renkler sönmesin, sayılar her yerden net okunsun); ters okey sırtı ışıkta kalır
      ters ? new THREE.MeshStandardMaterial({ map: tasSirti(), roughness: 0.45 })
        : new THREE.MeshBasicMaterial({ map: tasYuzu(t), color: 0xf2f2f2, toneMapped: false }),
    );
    yuz.rotation.x = -Math.PI / 2;
    yuz.position.y = TAS_K / 2 + 0.001;
    grup.add(govde, yuz);
    return grup;
  }

  // ---------- Kantin: çay ve tost (süs) ----------
  const DOLU = 4;
  // İnce belli çay bardağı (yandan kesit: yarıçap, yükseklik)
  const BARDAK = [[0.05, 0], [0.058, 0.012], [0.068, 0.06], [0.05, 0.13], [0.044, 0.165], [0.058, 0.22], [0.078, 0.29], [0.083, 0.31]];
  const bardakYaricapi = y => {
    for (let i = 1; i < BARDAK.length; i++) {
      const [r0, y0] = BARDAK[i - 1], [r1, y1] = BARDAK[i];
      if (y <= y1) return r0 + (r1 - r0) * ((y - y0) / (y1 - y0));
    }
    return BARDAK.at(-1)[0];
  };
  const camMalz = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.1, side: THREE.DoubleSide, depthWrite: false });
  const cayMalz = new THREE.MeshStandardMaterial({ color: 0xa8360c, transparent: true, opacity: 0.88, roughness: 0.2 });
  const porselen = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25 });
  const kirmizi = new THREE.MeshStandardMaterial({ color: 0xc8102e, roughness: 0.4 });

  function cayBardagi(kalan) {
    const grup = new THREE.Group();
    const tabak = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.14, 0.022, 28), porselen);
    tabak.position.y = 0.011;
    const kenar = new THREE.Mesh(new THREE.TorusGeometry(0.158, 0.009, 6, 28), kirmizi);
    kenar.rotation.x = -Math.PI / 2;
    kenar.position.y = 0.022;
    const cam = new THREE.Mesh(new THREE.LatheGeometry(BARDAK.map(([r, y]) => new THREE.Vector2(r, y)), 28), camMalz);
    cam.position.y = 0.022;
    grup.add(tabak, kenar, cam);
    // Çay: kalan yudum kadar dolu (dolu bardak ağzına kadar değil, biraz boşluk)
    if (kalan > 0) {
      const h = 0.27 * (kalan / DOLU);
      const noktalar = [new THREE.Vector2(0, 0.012)];
      for (let y = 0.012; y < h; y += 0.02) noktalar.push(new THREE.Vector2(bardakYaricapi(y) * 0.9, y));
      noktalar.push(new THREE.Vector2(bardakYaricapi(h) * 0.9, h), new THREE.Vector2(0, h));
      const cay = new THREE.Mesh(new THREE.LatheGeometry(noktalar, 24), cayMalz);
      cay.position.y = 0.022;
      grup.add(cay);
    }
    grup.traverse(m => (m.castShadow = true));
    return grup;
  }

  let tostDokusu;
  function tostTabagi(kalan) {
    const grup = new THREE.Group();
    const tabak = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.25, 0.025, 32), porselen);
    tabak.position.y = 0.012;
    grup.add(tabak);
    tostDokusu ??= dokuKanvas(128, 128, (g, w, h) => {
      g.fillStyle = '#d9963f';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = '#7a3e10';  // ızgara izleri
      g.lineWidth = 7;
      for (let k = -h; k < w; k += 26) {
        g.beginPath();
        g.moveTo(k, h);
        g.lineTo(k + h, 0);
        g.stroke();
      }
    });
    const ekmek = new THREE.MeshStandardMaterial({ map: tostDokusu, roughness: 0.8 });
    const kabuk = new THREE.MeshStandardMaterial({ color: 0xa85a1c, roughness: 0.85 });
    // Tost dört dilim gibi; her ısırıkta bir dilim eksilir (sağdan)
    for (let i = 0; i < kalan; i++) {
      const dilim = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.06, 0.3), [kabuk, kabuk, ekmek, kabuk, kabuk, kabuk]);
      dilim.position.set(-0.165 + i * 0.11, 0.055, 0);
      dilim.castShadow = true;
      grup.add(dilim);
      // Peynir kenardan taşmış
      const peynir = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.012, 0.31), new THREE.MeshStandardMaterial({ color: 0xffe8a0, roughness: 0.6 }));
      peynir.position.set(dilim.position.x, 0.05, 0);
      grup.add(peynir);
    }
    // Kırıntılar
    for (let i = 0; i < (DOLU - kalan) * 3; i++) {
      const k = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.012, 0.02), ekmek);
      k.position.set(Math.sin(i * 7.3) * 0.18, 0.03, Math.cos(i * 4.1) * 0.15);
      k.rotation.y = i;
      grup.add(k);
    }
    return grup;
  }

  // Türk kahvesi: tabaklı küçük fincan, köpüklü yüzey azaldıkça iner
  function kahveFincani(kalan) {
    const grup = new THREE.Group();
    const tabak = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.12, 0.018, 28), porselen);
    tabak.position.y = 0.009;
    const profil = [[0.045, 0], [0.055, 0.01], [0.07, 0.05], [0.075, 0.1], [0.072, 0.1]].map(([r, y]) => new THREE.Vector2(r, y));
    const fincan = new THREE.Mesh(new THREE.LatheGeometry(profil, 28), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25, side: THREE.DoubleSide }));
    fincan.position.y = 0.018;
    const kulp = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.007, 6, 14), porselen);
    kulp.position.set(0.085, 0.07, 0);
    const desen = new THREE.Mesh(new THREE.TorusGeometry(0.073, 0.004, 6, 28), kirmizi);
    desen.rotation.x = -Math.PI / 2;
    desen.position.y = 0.105;
    grup.add(tabak, fincan, kulp, desen);
    // Kahve yüzeyi (köpüklü), bitince dipte telve
    const y = kalan > 0 ? 0.03 + 0.06 * (kalan / 3) : 0.022;
    const yuzey = new THREE.Mesh(new THREE.CircleGeometry(0.066, 24), new THREE.MeshStandardMaterial({ color: kalan > 0 ? 0x8a5a33 : 0x2b170b, roughness: 0.9 }));
    yuzey.rotation.x = -Math.PI / 2;
    yuzey.position.y = 0.018 + y;
    grup.add(yuzey);
    grup.traverse(m => (m.castShadow = true));
    return grup;
  }

  // Küçük su şişesi: su azaldıkça iner
  function suSisesi(kalan) {
    const grup = new THREE.Group();
    const sise = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.26, 20, 1, true), new THREE.MeshStandardMaterial({ color: 0xdff4ff, transparent: true, opacity: 0.3, roughness: 0.05, side: THREE.DoubleSide, depthWrite: false }));
    sise.position.y = 0.13;
    const boyun = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.055, 0.06, 20, 1, true), sise.material);
    boyun.position.y = 0.29;
    const kapak = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.03, 16), new THREE.MeshStandardMaterial({ color: 0x1f6feb, roughness: 0.4 }));
    kapak.position.y = 0.335;
    const etiket = new THREE.Mesh(new THREE.CylinderGeometry(0.057, 0.057, 0.07, 20, 1, true), new THREE.MeshStandardMaterial({ color: 0x1f6feb, roughness: 0.6 }));
    etiket.position.y = 0.13;
    grup.add(sise, boyun, kapak, etiket);
    if (kalan > 0) {
      const h = 0.24 * (kalan / DOLU);
      const su = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, h, 20), new THREE.MeshStandardMaterial({ color: 0x8fd3ff, transparent: true, opacity: 0.55, roughness: 0.1 }));
      su.position.y = 0.005 + h / 2;
      grup.add(su);
    }
    return grup;
  }

  // Susamlı simit: her ısırıkta halkanın bir parçası eksilir
  let susamMalz;
  function simit(kalan) {
    const grup = new THREE.Group();
    const pecete = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.004, 0.3), new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.9 }));
    pecete.position.y = 0.002;
    grup.add(pecete);
    if (kalan > 0) {
      const yay = 2 * Math.PI * (kalan / DOLU);
      const halka = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.035, 10, 32, yay), new THREE.MeshStandardMaterial({ color: 0xa8571c, roughness: 0.7 }));
      halka.rotation.x = -Math.PI / 2;
      halka.position.y = 0.04;
      halka.castShadow = true;
      grup.add(halka);
      susamMalz ??= new THREE.MeshStandardMaterial({ color: 0xf6e7c1, roughness: 0.8 });
      for (let i = 0; i < 40 * (kalan / DOLU); i++) {
        const a = (i / 40) * 2 * Math.PI * 0.999 + Math.sin(i * 12.9) * 0.05;
        const b = Math.sin(i * 7.7) * 1.2;  // halkanın kesitinde üst yüze yakın
        const susam = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.004, 0.014), susamMalz);
        susam.position.set(Math.cos(a) * (0.1 + Math.sin(b) * 0.03), 0.04 + Math.cos(b) * 0.033, -Math.sin(a) * (0.1 + Math.sin(b) * 0.03));
        susam.rotation.y = a;
        grup.add(susam);
      }
    } else {
      for (let i = 0; i < 6; i++) {  // susam kırıntısı
        const k = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.004, 0.014), susamMalz ?? porselen);
        k.position.set(Math.sin(i * 3.1) * 0.08, 0.006, Math.cos(i * 2.3) * 0.08);
        grup.add(k);
      }
    }
    return grup;
  }

  // Oyuncunun yanındaki küçük ahşap sehpa (tepsi gibi kenarlı)
  const SEHPA_Y = 0.42;  // masanın ahşap kenarından (0.23) yüksek: masanın yanında ayrı duran sehpa gibi görünsün
  const SEHPA_YERI = { tost: [0, 0.02], cay: [-0.36, -0.22], kahve: [0.36, -0.22], su: [0.4, 0.22], simit: [-0.36, 0.24] };
  let sehpaMalz;
  function sehpa() {
    sehpaMalz ??= new THREE.MeshStandardMaterial({ map: ahsapDokusu(256, 256), roughness: 0.55 });
    const grup = new THREE.Group();
    const ust = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.62, 0.05, 40), sehpaMalz);
    ust.position.y = SEHPA_Y - 0.025;
    const kenar = new THREE.Mesh(new THREE.TorusGeometry(0.65, 0.025, 8, 40), sehpaMalz);
    kenar.rotation.x = -Math.PI / 2;
    kenar.position.y = SEHPA_Y;
    // Ayak masanın altına (yere) kadar iner
    const ayak = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.12, SEHPA_Y + 1, 12), sehpaMalz);
    ayak.position.y = (SEHPA_Y - 1) / 2 - 0.05;
    ust.castShadow = ust.receiveShadow = true;
    grup.add(ust, kenar, ayak);
    return grup;
  }
  const IKRAM_CIZ = { cay: cayBardagi, kahve: kahveFincani, su: suSisesi, simit, tost: tostTabagi };

  // ---------- Istaka ----------
  // Masanın ortasına bakan dik ahşap pano; arkasında (sahibinin tarafında) iki üçgen destek ayağı.
  // Taşlar panonun arkasında kalır, rakibin taşları görünmez. Panonun ön yüzüne oyunun adı (KAPTİRİK) kazılı.
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
      // Kazılı oyun adı: koyu oyuk + alt kenarında ışık, harfler aralıklı
      const yazi = 'KAPTİRİK';
      g.font = 'bold 82px Georgia, serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      if ('letterSpacing' in g) g.letterSpacing = '14px';
      g.fillStyle = 'rgba(255,225,170,0.5)';
      g.fillText(yazi, w / 2 + 2, h / 2 + 3);
      g.fillStyle = 'rgba(95,40,8,0.85)';
      g.fillText(yazi, w / 2, h / 2);
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
  const KOSE = [[2.95, 2.95], [2.95, -2.95], [-2.95, -2.95], [-2.95, 2.95]];
  const DONUS = [0, Math.PI / 2, Math.PI, -Math.PI / 2];  // koltuğun önündeki alanı o koltuğa çevirir: alt, sağ, üst, sol
  // Koltuğun yerel konumunu masadaki gerçek konuma çevir
  const yereDon = (x, z, a) => ({ x: x * Math.cos(a) + z * Math.sin(a), z: -x * Math.sin(a) + z * Math.cos(a) });
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
      if (koltuk === 0) return;  // benim ıstakam ekranın altında (HTML); masada ikincisi gereksiz
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

    // Kantinden gelenler: her oyuncunun ıstakasının sağındaki sehpada (masadaki taşları kapatmasın).
    // Karşıdakinin sehpası da kendi sağında, yani çapraz durur. Yatay ekranda benimki masanın sağ dışında.
    g.koltuklar.forEach((k, koltuk) => {
      const urunler = Object.keys(SEHPA_YERI).filter(ne => k.ikram?.[ne] !== undefined);
      if (!urunler.length) return;
      const kap = new THREE.Group();
      const benimYatay = koltuk === 0 && kamera.aspect > 1;
      // Masanın (ahşap kenarıyla 5.1) tamamen dışında dursun
      const yer = benimYatay ? { x: 5.85, z: 2.5 } : yereDon(3.0, 6.0, DONUS[koltuk]);
      kap.position.set(yer.x, 0, yer.z);
      kap.rotation.y = DONUS[koltuk];
      kap.add(sehpa());
      urunler.forEach(ne => {
        const nesne = IKRAM_CIZ[ne](k.ikram[ne]);
        const [x, z] = SEHPA_YERI[ne];
        nesne.scale.setScalar(0.72);
        nesne.position.set(x, SEHPA_Y, z);
        nesne.rotation.y = 0.4;
        nesne.traverse(m => (m.userData.tik = { tur: 'ikram', koltuk, ne }));
        tiklanabilir.push(nesne);
        kap.add(nesne);
      });
      dinamik.add(kap);
    });

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
    // Her grup ayrı bir satırda, alt alta (işlendikçe uzayan grup yandakine taşmasın).
    // Satır çoğalırsa aralık daralır; satıra sığmayan uzun grup küçülerek sığar.
    const ALAN = { x0: -2.0, x1: 0.75, z0: 1.05, zSon: 3.1 };  // köşelerdeki atılan taşlardan uzak dursun
    // (DONUS: koltukların yönü, aşağıda tanımlı; kantin de kullanıyor)
    const M = 1.45;  // açılan taşlar büyük olsun, okunsun
    const koltugaGore = [[], [], [], []];
    g.masa.forEach(gr => koltugaGore[g.koltukNo(gr.sahip)].push(gr));
    koltugaGore.forEach((liste, koltuk) => {
      const a = ALAN;
      const kap = new THREE.Group();
      kap.rotation.y = DONUS[koltuk];
      dinamik.add(kap);
      const aralik = liste.length > 1 ? Math.min(0.52, (a.zSon - a.z0) / (liste.length - 1)) : 0.52;
      liste.forEach((gr, satir) => {
        const m = Math.min(M, (aralik - 0.03) / TAS_Y, (a.x1 - a.x0) / (gr.sirali.length * (TAS_G + 0.01)));
        const AR = TAS_G * m + 0.01;
        const x = a.x0, z = a.z0 + satir * aralik;
        const gen = gr.sirali.length * AR;
        const grup = new THREE.Group();
        gr.sirali.forEach((t, i) => {
          const tm = yatanTas(t, t.ters && g.okeyMi(t), m);
          tm.position.set(i * AR, 0, 0);
          grup.add(tm);
        });
        if (g.isaretli?.has(gr.id)) {
          const isik = new THREE.Mesh(
            new THREE.PlaneGeometry(gen + 0.16, TAS_Y * m + 0.16),
            new THREE.MeshBasicMaterial({ color: 0x5dff8a, transparent: true, opacity: 0.8, depthWrite: false }),
          );
          isik.rotation.x = -Math.PI / 2;
          isik.position.set(gen / 2 - TAS_G * m / 2 - 0.005, 0.002, 0);
          grup.add(isik);
        }
        grup.position.set(x + TAS_G * m / 2, 0, z);
        // Masadaki gerçek kapladığı alan (taş bırakırken yakındaki grubu bulmak için)
        const k1 = yereDon(x, z - TAS_Y * m / 2, DONUS[koltuk]), k2 = yereDon(x + gen, z + TAS_Y * m / 2, DONUS[koltuk]);
        const bas = yereDon(x, z, DONUS[koltuk]), son = yereDon(x + gen, z, DONUS[koltuk]);  // grubun ilk ve son taşı
        grupKutulari.push({
          id: gr.id, x0: Math.min(k1.x, k2.x), x1: Math.max(k1.x, k2.x), z0: Math.min(k1.z, k2.z), z1: Math.max(k1.z, k2.z),
          bas, son,
        });
        grup.traverse(m => (m.userData.tik = { tur: 'grup', id: gr.id }));
        tiklanabilir.push(grup);
        kap.add(grup);
      });
    });
  }

  // ---------- Kamera ve dokunma ----------
  function boyutla() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h);
    kamera.aspect = w / h;
    kamera.updateProjectionMatrix();
    // Dik telefonda masayı sığdırmak için geri çekil. Fazla geri çekilmez: masanın kenarları ve yan ıstakalar
    // biraz taşar ama ortadaki ve köşelerdeki taşlar büyük görünür.
    const k = kamera.aspect < 1 ? Math.min(1.68, 0.8 / kamera.aspect) : 1;
    bakis.konum.set(0, 10.4 * k, 6.2 * k);
    bakis.hedef.set(0, 0, 1.1 + (k - 1) * 0.9);  // telefonda masa üstteki boşluğa doğru kayar
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

  // Masadaki nokta grubun baş tarafına mı ('sol') yakın, son tarafına mı ('sag')? (okeyi hangi uca koyacağız)
  function grupUcu(id, x, z) {
    const k = grupKutulari.find(g => g.id === id);
    if (!k) return 'sag';
    return Math.hypot(x - k.bas.x, z - k.bas.z) < Math.hypot(x - k.son.x, z - k.son.z) ? 'sol' : 'sag';
  }

  // Ekrandaki nokta ortadaki destenin üstünde mi? (parmak kocaman: biraz geniş tutulur)
  function desteUstunde(cx, cy) {
    const n = noktada(cx, cy);
    return n.tik?.tur === 'deste' || Math.hypot(n.x - DESTE.x, n.z - DESTE.z) < 0.7;
  }

  return {
    RENKLER, KOSE, baslat, ciz, tasYuzu, ekranda, noktada, atmaYeri, yakinGruplar, desteUstunde, grupUcu,
    tiklayinca(fn) { tiklaninca = fn; },
    // Masada başlayan dokunuş sürüklemeye döndüyse, parmak kalkınca tıklama sayılmasın
    tiklamayiIptal() { masadaBasildi = false; },
  };
})();
