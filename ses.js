// =============================================================
// Kaptırık - sesler (hepsi o an üretilir, ses dosyası yok)
// =============================================================

const Ses = (() => {
  const ANAHTAR = 'kaptirik.ses';
  let ctx = null, ana = null, acik = true, tampon = null;
  try {
    acik = localStorage.getItem(ANAHTAR) !== 'kapali';
  } catch (e) { /* açık başlar */ }

  function motor() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      ana = ctx.createGain();
      ana.gain.value = acik ? 0.9 : 0;
      ana.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function ton(f, { gecikme = 0, sure = 0.12, tip = 'sine', seviye = 0.12, bitis } = {}) {
    const c = motor();
    const t = c.currentTime + gecikme;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = tip;
    o.frequency.setValueAtTime(f, t);
    if (bitis) o.frequency.exponentialRampToValueAtTime(bitis, t + sure);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(seviye, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + sure);
    o.connect(g);
    g.connect(ana);
    o.start(t);
    o.stop(t + sure + 0.05);
  }

  // Taşların masaya vurduğu "tık": kısa, tok bir gürültü
  function tak({ gecikme = 0, seviye = 0.3, frekans = 2200 } = {}) {
    const c = motor();
    if (!tampon) {
      tampon = c.createBuffer(1, c.sampleRate * 0.3, c.sampleRate);
      const v = tampon.getChannelData(0);
      for (let i = 0; i < v.length; i++) v[i] = (Math.random() * 2 - 1) * Math.exp(-i / (c.sampleRate * 0.012));
    }
    const t = c.currentTime + gecikme;
    const k = c.createBufferSource();
    k.buffer = tampon;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = frekans;
    f.Q.value = 1.5;
    const g = c.createGain();
    g.gain.value = seviye;
    k.connect(f);
    f.connect(g);
    g.connect(ana);
    k.start(t);
  }

  const sesler = {
    secim: () => tak({ seviye: 0.15, frekans: 3000 }),
    cek: () => tak({ seviye: 0.35, frekans: 1800 }),
    at: () => {
      tak({ seviye: 0.5, frekans: 1500 });
      tak({ gecikme: 0.06, seviye: 0.15, frekans: 2500 });
    },
    diz: () => [0, 0.04, 0.08, 0.12, 0.16].forEach(g => tak({ gecikme: g, seviye: 0.2, frekans: 2000 + Math.random() * 800 })),
    karistir: () => {
      for (let k = 0; k < 18; k++) tak({ gecikme: k * 0.05 + Math.random() * 0.03, seviye: 0.18, frekans: 1500 + Math.random() * 1500 });
    },
    tik: () => ton(1400, { sure: 0.04, seviye: 0.06, tip: 'square' }),
    uyari: () => {
      ton(880, { sure: 0.15, seviye: 0.12, tip: 'square' });
      ton(660, { gecikme: 0.18, sure: 0.2, seviye: 0.12, tip: 'square' });
    },
    siraSende: () => {
      ton(523.3, { sure: 0.12, seviye: 0.08, tip: 'triangle' });
      ton(784, { gecikme: 0.1, sure: 0.18, seviye: 0.08, tip: 'triangle' });
    },
    ac: () => [523.3, 659.3, 784, 1046.5].forEach((f, k) => ton(f, { gecikme: k * 0.08, sure: 0.3, seviye: 0.1, tip: 'triangle' })),
    ceza: () => ton(180, { sure: 0.35, seviye: 0.15, tip: 'sawtooth', bitis: 110 }),
    hata: () => ton(220, { sure: 0.15, seviye: 0.1, tip: 'square', bitis: 170 }),
    bitis: () => [784, 988, 1175, 1568].forEach((f, k) => ton(f, { gecikme: k * 0.1, sure: 0.4, seviye: 0.1, tip: 'triangle' })),
    kazanma: () => [523.3, 659.3, 784, 1046.5, 1318.5].forEach((f, k) => ton(f, { gecikme: k * 0.14, sure: 0.6, seviye: 0.12, tip: 'triangle' })),
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
