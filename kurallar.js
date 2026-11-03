// =============================================================
// Kaptirik (51 Okey) - kurallar
// Ekrandan bağımsız: taşlar, okey, per/seri/çift kontrolü, en iyi diziliş, işlek kontrolü.
//
// Taş: { id, renk: 0-3 (sarı, mavi, siyah, kırmızı), sayi: 1-13, sahte: bool, ters: bool }
// Okey: göstergenin bir üstü (13'ün üstü 1). Okey taşları her taşın yerine geçer (joker).
// Sahte okey: okeyin "kendisi" gibi davranır (okeyin rengi ve sayısındaki normal bir taş).
// Per:  aynı sayı, farklı renk, 3-4 taş (7-7-7).
// Seri: aynı renk, ardışık, en az 3 taş (4-5-6). 12-13-1 olur, 13-1-2 olmaz.
// Çift: aynı iki taş (renk ve sayı aynı). Okey her taşla çift olur.
// =============================================================

const Kurallar = (() => {
  const RENK_ADLARI = ['Sarı', 'Mavi', 'Siyah', 'Kırmızı'];
  const ILK_ESIK = 50;   // ilk açan en az 51 ile açar
  const CIFT_SAYISI = 4; // çiftle açmak için en az 4 çift

  // ---------- Deste ----------
  function desteOlustur() {
    const deste = [];
    let id = 0;
    for (let kopya = 0; kopya < 2; kopya++) {
      for (let renk = 0; renk < 4; renk++) {
        for (let sayi = 1; sayi <= 13; sayi++) deste.push({ id: id++, renk, sayi, sahte: false, ters: false });
      }
    }
    deste.push({ id: id++, renk: -1, sayi: 0, sahte: true, ters: false });
    deste.push({ id: id++, renk: -1, sayi: 0, sahte: true, ters: false });
    return deste;
  }

  // Göstergeye göre okey taşı (renk + sayı)
  const okeyBul = gosterge => ({ renk: gosterge.renk, sayi: gosterge.sayi === 13 ? 1 : gosterge.sayi + 1 });

  // Taşın "etkin" hâli: sahte okey, okeyin rengi ve sayısındaki normal taş gibidir
  const etkin = (t, okey) => (t.sahte ? { renk: okey.renk, sayi: okey.sayi } : { renk: t.renk, sayi: t.sayi });
  const jokerMi = (t, okey) => !t.sahte && t.renk === okey.renk && t.sayi === okey.sayi;
  const anahtar = (renk, sayi) => renk * 100 + sayi;

  // ---------- Per / seri kontrolü ----------
  // Geçerliyse { tur, deger, sirali: taşlar dizildiği sırayla, temsil: her taşın yerine geçtiği {renk, sayi} }
  function perCoz(taslar, okey) {
    if (taslar.length < 3 || taslar.length > 4) return null;
    const normal = taslar.filter(t => !jokerMi(t, okey));
    const jokerler = taslar.filter(t => jokerMi(t, okey));
    if (!normal.length) return null;
    const sayi = etkin(normal[0], okey).sayi;
    const renkler = new Set();
    for (const t of normal) {
      const e = etkin(t, okey);
      if (e.sayi !== sayi || renkler.has(e.renk)) return null;
      renkler.add(e.renk);
    }
    const bosRenkler = [0, 1, 2, 3].filter(r => !renkler.has(r));
    const sirali = [...normal, ...jokerler];
    const temsil = [...normal.map(t => etkin(t, okey)), ...jokerler.map((_, k) => ({ renk: bosRenkler[k], sayi }))];
    return { tur: 'per', deger: sayi * taslar.length, sirali, temsil };
  }

  // Serideki konum: 1..13, 14 = 13'ten sonra gelen 1
  const konumDegeri = p => (p === 14 ? 1 : p);

  function seriCoz(taslar, okey) {
    const n = taslar.length;
    if (n < 3 || n > 13) return null;
    const normal = taslar.filter(t => !jokerMi(t, okey));
    const jokerler = taslar.filter(t => jokerMi(t, okey));
    if (!normal.length) return null;
    const renk = etkin(normal[0], okey).renk;
    if (normal.some(t => etkin(t, okey).renk !== renk)) return null;
    let enIyi = null;
    // 1'i hem baş (1) hem son (14) olarak dene
    for (const birYuksek of [false, true]) {
      const konumlar = normal.map(t => {
        const s = etkin(t, okey).sayi;
        return s === 1 && birYuksek ? 14 : s;
      });
      if (new Set(konumlar).size !== konumlar.length) continue;
      const min = Math.min(...konumlar), max = Math.max(...konumlar);
      if (max - min + 1 > n) continue;
      // Jokerler en yüksek değeri verecek şekilde yerleşir (seri olabildiğince yukarı kayar)
      for (let bas = Math.min(min, 15 - n); bas >= Math.max(1, max - n + 1); bas--) {
        if (bas + n - 1 > 14) continue;
        const deger = Array.from({ length: n }, (_, k) => konumDegeri(bas + k)).reduce((a, b) => a + b, 0);
        if (!enIyi || deger > enIyi.deger) enIyi = { bas, deger, konumlar };
        break;
      }
    }
    if (!enIyi) return null;
    const sirali = [], temsil = [];
    const kalanJoker = [...jokerler];
    for (let p = enIyi.bas; p < enIyi.bas + n; p++) {
      const k = enIyi.konumlar.indexOf(p);
      sirali.push(k >= 0 ? normal[k] : kalanJoker.shift());
      temsil.push({ renk, sayi: konumDegeri(p) });
    }
    return { tur: 'seri', deger: enIyi.deger, sirali, temsil };
  }

  const grupCoz = (taslar, okey) => perCoz(taslar, okey) || seriCoz(taslar, okey);

  // Çift: iki aynı taş ya da bir taş + okey (iki okey de çift olur)
  function ciftCoz(taslar, okey) {
    if (taslar.length !== 2) return null;
    const [a, b] = taslar;
    const ja = jokerMi(a, okey), jb = jokerMi(b, okey);
    let e;
    if (ja && jb) e = { renk: okey.renk, sayi: okey.sayi };
    else if (ja) e = etkin(b, okey);
    else if (jb) e = etkin(a, okey);
    else {
      const ea = etkin(a, okey), eb = etkin(b, okey);
      if (ea.renk !== eb.renk || ea.sayi !== eb.sayi) return null;
      e = ea;
    }
    return { tur: 'cift', deger: e.sayi * 2, sirali: [a, b], temsil: [e, e] };
  }

  // ---------- En iyi seri/per dizilişi ----------
  // Elden toplamı en yüksek per ve seri gruplarını seçer (okeyler boşlukları doldurur).
  function enIyiGruplar(el, okey) {
    const jokerler = el.filter(t => jokerMi(t, okey));
    const normal = el.filter(t => !jokerMi(t, okey));
    const sayac = new Map();
    normal.forEach(t => {
      const e = etkin(t, okey);
      const k = anahtar(e.renk, e.sayi);
      sayac.set(k, (sayac.get(k) || 0) + 1);
    });
    const J = jokerler.length;
    const var_ = (r, s) => (sayac.get(anahtar(r, s)) || 0) > 0;

    // Aday gruplar: { gerek: [anahtar...], joker, deger }
    const adaylar = [];
    for (let r = 0; r < 4; r++) {
      for (let bas = 1; bas <= 12; bas++) {
        for (let n = 3; bas + n - 1 <= 14 && n <= 13; n++) {
          const gerek = [];
          let joker = 0, deger = 0;
          for (let p = bas; p < bas + n; p++) {
            const s = konumDegeri(p);
            deger += s;
            if (var_(r, s)) gerek.push(anahtar(r, s));
            else joker++;
          }
          if (joker > J) {
            if (joker > J + 2) break;  // daha uzun seriler daha da fazla joker ister
            continue;
          }
          if (gerek.length) adaylar.push({ gerek, joker, deger, tur: 'seri' });
        }
      }
    }
    for (let s = 1; s <= 13; s++) {
      const renkKumeleri = [[0, 1, 2], [0, 1, 3], [0, 2, 3], [1, 2, 3], [0, 1, 2, 3]];
      for (const kume of renkKumeleri) {
        const gerek = kume.filter(r => var_(r, s)).map(r => anahtar(r, s));
        const joker = kume.length - gerek.length;
        if (joker <= J && gerek.length) adaylar.push({ gerek, joker, deger: s * kume.length, tur: 'per' });
      }
    }

    // Her taşın içinde geçtiği adaylar
    const taslar = [...sayac.entries()].flatMap(([k, c]) => Array(c).fill(k)).sort((a, b) => a - b);
    const adayIndeks = new Map();
    adaylar.forEach((a, i) => a.gerek.forEach(k => {
      if (!adayIndeks.has(k)) adayIndeks.set(k, []);
      adayIndeks.get(k).push(i);
    }));

    let enIyi = { deger: 0, secim: [] };
    const kalan = new Map(sayac);
    const secim = [];
    let adim = 0;
    function ara(i, jokerKalan, deger) {
      if (++adim > 200000) return;  // telefonu yormasın
      if (deger > enIyi.deger) enIyi = { deger, secim: [...secim] };
      while (i < taslar.length && kalan.get(taslar[i]) === 0) i++;
      if (i >= taslar.length) return;
      const k = taslar[i];
      for (const ai of adayIndeks.get(k) || []) {
        const a = adaylar[ai];
        if (a.joker > jokerKalan || !a.gerek.every(g => kalan.get(g) > 0)) continue;
        a.gerek.forEach(g => kalan.set(g, kalan.get(g) - 1));
        secim.push(ai);
        ara(i, jokerKalan - a.joker, deger + a.deger);
        secim.pop();
        a.gerek.forEach(g => kalan.set(g, kalan.get(g) + 1));
      }
      // Bu taşı hiçbir gruba koymadan geç
      kalan.set(k, kalan.get(k) - 1);
      ara(i + 1, jokerKalan, deger);
      kalan.set(k, kalan.get(k) + 1);
    }
    ara(0, J, 0);

    // Seçilen adayları gerçek taşlara dönüştür
    const kullanilmamis = [...normal];
    const kalanJoker = [...jokerler];
    const gruplar = enIyi.secim.map(ai => {
      const a = adaylar[ai];
      const grup = a.gerek.map(k => {
        const yer = kullanilmamis.findIndex(t => {
          const e = etkin(t, okey);
          return anahtar(e.renk, e.sayi) === k;
        });
        return kullanilmamis.splice(yer, 1)[0];
      });
      for (let j = 0; j < a.joker; j++) grup.push(kalanJoker.shift());
      return grupCoz(grup, okey);
    }).filter(Boolean);
    const kullanilan = new Set(gruplar.flatMap(g => g.sirali.map(t => t.id)));
    return { gruplar, deger: gruplar.reduce((a, g) => a + g.deger, 0), kalan: el.filter(t => !kullanilan.has(t.id)) };
  }

  // ---------- En iyi çiftler ----------
  function enIyiCiftler(el, okey) {
    const jokerler = el.filter(t => jokerMi(t, okey));
    const normal = el.filter(t => !jokerMi(t, okey));
    const gruplar = new Map();
    normal.forEach(t => {
      const e = etkin(t, okey);
      const k = anahtar(e.renk, e.sayi);
      if (!gruplar.has(k)) gruplar.set(k, []);
      gruplar.get(k).push(t);
    });
    const ciftler = [];
    const tekler = [];
    gruplar.forEach(liste => {
      for (let i = 0; i + 1 < liste.length; i += 2) ciftler.push(ciftCoz([liste[i], liste[i + 1]], okey));
      if (liste.length % 2) tekler.push(liste[liste.length - 1]);
    });
    // Okeyler en büyük tek taşlarla eşleşir
    tekler.sort((a, b) => etkin(b, okey).sayi - etkin(a, okey).sayi);
    const kalanJoker = [...jokerler];
    while (kalanJoker.length && tekler.length) ciftler.push(ciftCoz([tekler.shift(), kalanJoker.shift()], okey));
    if (kalanJoker.length >= 2) ciftler.push(ciftCoz([kalanJoker.shift(), kalanJoker.shift()], okey));
    ciftler.sort((a, b) => b.deger - a.deger);
    const kullanilan = new Set(ciftler.flatMap(c => c.sirali.map(t => t.id)));
    return { ciftler, deger: ciftler.reduce((a, c) => a + c.deger, 0), kalan: el.filter(t => !kullanilan.has(t.id)) };
  }

  // ---------- İşleme ----------
  // Bu taş masadaki bu gruba işlenebilir mi? Okeyin yerine gerçek taş konuyorsa "takas" döner.
  function isleme(grup, tas, okey) {
    if (grup.tur === 'cift') return null;
    // Takas: grupta, bu taşın yerine geçen bir okey varsa
    const e = etkin(tas, okey);
    if (!jokerMi(tas, okey)) {
      const yer = grup.temsil.findIndex((tm, k) => jokerMi(grup.sirali[k], okey) && tm.renk === e.renk && tm.sayi === e.sayi);
      if (yer >= 0) return { takas: true, yer };
    }
    const yeni = grupCoz([...grup.sirali, tas], okey);
    if (!yeni || yeni.tur !== grup.tur) return null;
    return { takas: false, yeni };
  }

  const islekMi = (tas, masa, okey) => masa.some(g => isleme(g, tas, okey));

  // Taşın değeri (cezalarda): etkin sayısı
  const deger = (t, okey) => etkin(t, okey).sayi;

  return {
    RENK_ADLARI, ILK_ESIK, CIFT_SAYISI,
    desteOlustur, okeyBul, etkin, jokerMi, perCoz, seriCoz, grupCoz, ciftCoz,
    enIyiGruplar, enIyiCiftler, isleme, islekMi, deger,
  };
})();

if (typeof module !== 'undefined') module.exports = Kurallar;
