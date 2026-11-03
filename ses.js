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

  // Kısa çınlama
  function tini(t, f, sure, seviye) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = f;
    g.gain.setValueAtTime(seviye, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + sure);
    o.connect(g);
    g.connect(ana);
    o.start(t);
    o.stop(t + sure + 0.02);
  }

  // Tek taş vuruşu. guc: 0-1 (atış sert, dizme hafif), masa: ahşap gövde sesi ne kadar
  function vurus(gecikme = 0, guc = 0.6, masa = 0.6) {
    motor();
    const t = ctx.currentTime + gecikme;
    const k = oyna(0.94, 1.06);
    // Taşın kendi çınlaması (sert plastik: tiz, uyumsuz tınılar, çok çabuk söner)
    [[2350, 0.035, 0.09], [3720, 0.025, 0.06], [5480, 0.018, 0.04], [7900, 0.012, 0.025]]
      .forEach(([f, sure, sev]) => tini(t, f * k, sure * oyna(0.8, 1.2), sev * guc));
    // Çarpmanın ilk "tık"ı
    hisirti(t, { sure: 0.012, tip: 'highpass', frekans: 3500, seviye: 0.5 * guc });
    // Masanın tok sesi
    hisirti(t, { sure: 0.07, tip: 'bandpass', frekans: 300 * k, q: 2.5, seviye: 0.9 * guc * masa, atak: 0.002 });
    tini(t, 140 * k, 0.06, 0.15 * guc * masa);
  }

  // Taşın çuhada / ıstakada kayması
  function kayma(gecikme = 0, sure = 0.12, seviye = 0.06) {
    motor();
    const t = ctx.currentTime + gecikme;
    hisirti(t, { sure, tip: 'bandpass', frekans: oyna(1800, 2600), q: 0.7, seviye, atak: sure * 0.4 });
  }

  const sesler = {
    secim: () => vurus(0, 0.25, 0.2),
    cek: () => {
      kayma(0, 0.14, 0.05);
      vurus(0.13, 0.45, 0.35);
    },
    at: () => {
      vurus(0, 0.85, 0.9);
      vurus(0.045, 0.2, 0.3);  // küçük sekme
    },
    diz: () => {
      for (let i = 0; i < 9; i++) vurus(i * oyna(0.035, 0.05), oyna(0.2, 0.35), 0.3);
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
