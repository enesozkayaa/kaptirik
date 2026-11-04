// =============================================================
// Kaptirik - sesler (hepsi o an üretilir, ses dosyası yok)
// Taş sesi: sert plastik taşın ahşaba/çuhaya vuruşu. Birkaç tını (taşın kendi çınlaması),
// çok kısa bir "tık" ve masanın tok "tak"ı birlikte çalınır; her vuruş biraz farklı olsun diye
// frekanslar her seferinde hafifçe oynatılır.
// =============================================================

const Ses = (() => {
  const ANAHTAR = 'kaptirik.ses';
  let ctx = null, ana = null, acik = true, gurultu = null;
  try {
    acik = localStorage.getItem(ANAHTAR) !== 'kapali';
  } catch (e) { /* açık başlar */ }

  function motor() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      ana = ctx.createGain();
      ana.gain.value = acik ? 0.9 : 0;
      ana.connect(ctx.destination);
      gurultu = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const v = gurultu.getChannelData(0);
      for (let i = 0; i < v.length; i++) v[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  const oyna = (a, b) => a + Math.random() * (b - a);

  // Filtrelenmiş gürültü parçası
  function hisirti(t, { sure, tip, frekans, q = 1, seviye, atak = 0.001 }) {
    const k = ctx.createBufferSource();
    k.buffer = gurultu;
    const f = ctx.createBiquadFilter();
    f.type = tip;
    f.frequency.value = frekans;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(seviye, t + atak);
    g.gain.exponentialRampToValueAtTime(0.0001, t + sure);
    k.connect(f);
    f.connect(g);
    g.connect(ana);
    k.start(t, Math.random() * 0.3);
    k.stop(t + sure + 0.02);
  }

  // Kısa çınlama (çok kısa bir yükselişle başlar, cızırtı yapmasın)
  function tini(t, f, sure, seviye) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(seviye, t + 0.0008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + sure);
    o.connect(g);
    g.connect(ana);
    o.start(t);
    o.stop(t + sure + 0.02);
  }

  // Tek taş vuruşu. guc: 0-1 (atış sert, dizme hafif), masa: ahşap gövde sesi ne kadar,
  // tiz: taş taşa çarpınca ses biraz daha incedir (>1).
  // Okey taşı kalın, sert bir plastik bloktur: sesi cam gibi çınlamaz, kısa ve tok bir "tak" çıkarır.
  // Çubuk gibi titreşen bir cismin tınıları (1 : 2.76 : 5.4 oranında, çok çabuk sönen) + çarpma anının
  // kuru "çıt"ı + ıstakanın / masanın ahşap gövdesi. Sert vuruşta taş bir kez hafifçe seker.
  function vurus(gecikme = 0, guc = 0.6, masa = 0.6, tiz = 1, sekme = true) {
    motor();
    const t = ctx.currentTime + gecikme;
    const k = oyna(0.92, 1.08) * tiz;
    const f0 = 1180 * k;
    [[1, 0.028, 0.2], [1.62, 0.018, 0.07], [2.76, 0.014, 0.1], [5.4, 0.007, 0.05]]
      .forEach(([m, sure, sev]) => tini(t, f0 * m, sure * oyna(0.8, 1.25), sev * guc));
    // Çarpma anı: çok kısa, kuru bir çıt
    hisirti(t, { sure: 0.007, tip: 'bandpass', frekans: 3000 * k, q: 0.8, seviye: 0.8 * guc });
    // Ahşabın tok sesi (ıstaka / masa)
    hisirti(t, { sure: 0.05, tip: 'bandpass', frekans: oyna(480, 620), q: 2.2, seviye: 0.7 * guc * masa, atak: 0.0015 });
    hisirti(t, { sure: 0.035, tip: 'lowpass', frekans: 240, seviye: 0.55 * guc * masa, atak: 0.002 });
    // Küçük sekme: aynı ses, çok kısa süre sonra ve çok daha hafif
    if (sekme && guc > 0.35) vurus(gecikme + oyna(0.014, 0.028), guc * 0.22, masa * 0.5, tiz * 1.03, false);
  }

  // Taşın çuhada / ıstakada kayması
  function kayma(gecikme = 0, sure = 0.12, seviye = 0.06) {
    motor();
    const t = ctx.currentTime + gecikme;
    hisirti(t, { sure, tip: 'bandpass', frekans: oyna(1800, 2600), q: 0.7, seviye, atak: sure * 0.4 });
  }

  const sesler = {
    // Istakaya taş koyma: kısa bir kayma + ıstakanın ahşabına tok "tak" + yanındaki taşa değme "çıt"ı
    secim: () => {
      kayma(0, 0.04, 0.025);
      vurus(0.025, 0.42, 0.75);
      vurus(0.025 + oyna(0.03, 0.05), 0.14, 0.1, 1.25, false);
    },
    cek: () => {
      kayma(0, 0.14, 0.05);
      vurus(0.13, 0.45, 0.35);
    },
    at: () => {
      vurus(0, 0.85, 0.9);
      vurus(0.045, 0.2, 0.3);  // küçük sekme
    },
    // Istakadaki taşları dizme: taşlar kümeler halinde itilir, birbirine çarpar ("tak-tak-tak ... tak-tak")
    diz: () => {
      let z = 0;
      for (let kume = 0; kume < 5; kume++) {
        kayma(z, 0.06, 0.03);
        const n = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) {
          z += oyna(0.022, 0.045);
          vurus(z, oyna(0.28, 0.45), oyna(0.3, 0.6), oyna(1.05, 1.25));
        }
        z += oyna(0.07, 0.13);
      }
    },
    karistir: () => {
      for (let i = 0; i < 14; i++) kayma(i * 0.07, 0.18, 0.05);
      for (let i = 0; i < 34; i++) vurus(oyna(0, 1.1), oyna(0.15, 0.45), oyna(0.2, 0.6));
    },
    // Süre azalırken saat gibi tıklama, son saniyelerde çift tık
    tik: () => vurus(0, 0.18, 0.5),
    // Süre azalırken tek, tok vuruş (son saniyelerde sıklaşır)
    sayac: () => vurus(0, 0.6, 1),
    uyari: () => {
      vurus(0, 0.5, 0.9);
      vurus(0.12, 0.5, 0.9);
    },
    // Sıra sende: parmakla masaya iki kez vurma
    siraSende: () => {
      motor();
      const t = ctx.currentTime;
      [0, 0.16].forEach(g => {
        hisirti(t + g, { sure: 0.09, tip: 'lowpass', frekans: 420, seviye: 0.9 });
        tini(t + g, 110, 0.08, 0.2);
      });
    },
    // Açınca: taşlar masaya tek tek dizilir
    ac: () => {
      for (let i = 0; i < 10; i++) vurus(i * 0.06, oyna(0.45, 0.6), 0.6);
    },
    ceza: () => {
      motor();
      const t = ctx.currentTime;
      hisirti(t, { sure: 0.3, tip: 'lowpass', frekans: 220, seviye: 1.2 });
      tini(t, 90, 0.3, 0.25);
    },
    hata: () => {
      vurus(0, 0.3, 0.6);
      vurus(0.08, 0.3, 0.6);
    },
    // El bitince taşlar masaya bırakılır
    bitis: () => {
      vurus(0, 1, 1);
      for (let i = 0; i < 20; i++) vurus(0.15 + oyna(0, 0.5), oyna(0.2, 0.5), 0.5);
    },
    // Kantin: bardak tabağa konur (iki çın), çaydan yudum, tosttan ısırık
    cayGeldi: () => {
      motor();
      const t = ctx.currentTime;
      [0, 0.09].forEach((g, i) => {
        tini(t + g, 3100 + i * 350, 0.25, 0.05);
        tini(t + g, 5200 + i * 300, 0.18, 0.03);
      });
      vurus(0, 0.25, 0.4);
    },
    yudum: () => {
      motor();
      const t = ctx.currentTime;
      [0, 0.22].forEach(g => {
        const k = ctx.createBufferSource();
        k.buffer = gurultu;
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.Q.value = 3;
        f.frequency.setValueAtTime(700, t + g);
        f.frequency.exponentialRampToValueAtTime(1800, t + g + 0.18);
        const s = ctx.createGain();
        s.gain.setValueAtTime(0.0001, t + g);
        s.gain.exponentialRampToValueAtTime(0.25, t + g + 0.05);
        s.gain.exponentialRampToValueAtTime(0.0001, t + g + 0.2);
        k.connect(f);
        f.connect(s);
        s.connect(ana);
        k.start(t + g, Math.random() * 0.2);
        k.stop(t + g + 0.22);
      });
    },
    isirik: () => {
      motor();
      const t = ctx.currentTime;
      for (let i = 0; i < 6; i++) hisirti(t + i * 0.035 + Math.random() * 0.02, { sure: 0.03, tip: 'bandpass', frekans: oyna(2500, 4500), q: 1.5, seviye: 0.35 });
      hisirti(t, { sure: 0.08, tip: 'lowpass', frekans: 400, seviye: 0.4 });
    },
    kazanma: () => {
      for (let i = 0; i < 40; i++) vurus(oyna(0, 1.6), oyna(0.2, 0.6), 0.6);
    },
  };

  function acKapa() {
    acik = !acik;
    try {
      localStorage.setItem(ANAHTAR, acik ? 'acik' : 'kapali');
    } catch (e) { /* hatırlanmasa da olur */ }
    if (ana) ana.gain.setTargetAtTime(acik ? 0.9 : 0, ctx.currentTime, 0.05);
    return acik;
  }

  return { ...sesler, motor, acKapa, get acik() { return acik; } };
})();
