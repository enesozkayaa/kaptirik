// =============================================================
// Kaptirik - oyun motoru: sıra, hamleler, cezalar, düşerler ve botlar
// Ekran bilmez: hamleleri kontrol edip uygular, değişince "degisti", önemli anlarda "olay" haber verir.
//
// Puanlar: cezalar artı, düşerler eksi yazılır. Oyun sonunda en düşük toplam kazanır.
//   - Yandan alıp elini açarsan: seri açtıysan taşı atana taş × 10, çift açtıysan × 20 ceza
//   - İşlek taş atmak: 500 ceza
//   - Başkasının dizdiği gruba okey koymak (çakallık): grubun sahibine 100 ceza
//   - O okeyin yerine gerçek taş konursa: grubun sahibine 500 + taş × 10 ceza
//   - El bitince: hiç açamayana 1000, açmış olana elinde kalan taşların toplamı × 10 ceza
//   - Biten oyuncu:
//       kimse açmamışken kafadan biterse -5000 (okeyle -10000, çiftle okeyle -20000), diğerlerine ceza yok
//       başkası açmışken kafadan biterse -1000, okeyle biterse -2000, normal biterse 0
//   - Deste biterse el biter, herkese yukarıdaki el sonu cezaları yazılır
// =============================================================

const Motor = (() => {
  const K = Kurallar;
  const TUR_SURESI = 30;     // saniye
  const BOT_HIZ = 900;       // botun her hamlesi arasında bekleme (ms)

  let o = null;
  const dinle = { degisti: () => {}, olay: () => {} };
  let sayac = null;

  const bekle = ms => new Promise(coz => setTimeout(coz, ms));
  const karistir = l => {
    for (let i = l.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [l[i], l[j]] = [l[j], l[i]];
    }
    return l;
  };
  const oncekiNo = no => (no + 3) % 4;     // yandan taş bu oyuncudan alınır
  const degisti = () => dinle.degisti(o);
  const olay = (tip, veri) => dinle.olay(tip, veri);

  // ---------- Oyun ve el başlatma ----------
  function yeniOyun(isimler, ayar) {
    o = {
      ayar,
      // ayar.botlar: hangi koltuklarda bot oturduğu (verilmezse sadece 0. koltuk insan)
      oyuncular: isimler.map((ad, i) => ({ ad, bot: ayar.botlar ? !!ayar.botlar[i] : i > 0, el: [], atilanlar: [], acti: false, acisTuru: null, toplam: 0, elPuani: 0, gecmis: [] })),
      elNo: 0,
      baslayan: Math.floor(Math.random() * 4),
      asama: 'oyun',
    };
    elBaslat();
  }

  function elBaslat() {
    o.elNo++;
    if (o.elNo > 1) o.baslayan = (o.baslayan + 1) % 4;
    const deste = karistir(K.desteOlustur());
    // Gösterge sahte okey olamaz
    let g = deste.findIndex(t => !t.sahte);
    o.gosterge = deste.splice(g, 1)[0];
    o.okey = K.okeyBul(o.gosterge);
    o.oyuncular.forEach((p, i) => {
      p.el = deste.splice(0, i === o.baslayan ? 15 : 14);
      p.atilanlar = [];
      p.acti = false;
      p.acisTuru = null;
      p.elPuani = 0;
    });
    o.deste = deste;
    o.masa = [];
    o.esik = K.ILK_ESIK;
    o.grupSayaci = 0;
    o.asama = 'oyun';
    o.sonuc = null;
    siraBasla(o.baslayan, true);
  }

  function siraBasla(no, ilk = false) {
    o.sira = no;
    const p = o.oyuncular[no];
    o.tur = { cekti: ilk, yandan: null, acikBasta: p.acti, kalan: TUR_SURESI, sureSifirlandi: false, geriAl: [] };
    zamanlayiciBaslat();
    degisti();
    olay('sira', { no });
    if (p.bot) botOyna(no);
  }

  // ---------- Süre ----------
  function zamanlayiciBaslat() {
    clearInterval(sayac);
    const no = o.sira;
    sayac = setInterval(() => {
      if (o.asama !== 'oyun' || o.sira !== no) return clearInterval(sayac);
      o.tur.kalan--;
      olay('sure', { kalan: o.tur.kalan, no });
      if (o.tur.kalan <= 0) {
        clearInterval(sayac);
        if (!o.oyuncular[no].bot) sureBitti(no);
      }
    }, 1000);
  }

  // Süre bitince: ortadan çek (yandan alınan geri bırakılır), per/seri/çiftine girmeyen, işlek olmayan en küçük taşı at
  function sureBitti(no) {
    const p = o.oyuncular[no];
    if (o.tur.yandan && p.el.includes(o.tur.yandan)) geriBirak(no);
    if (!o.tur.cekti) ortadanCek(no);
    if (o.asama !== 'oyun' || o.sira !== no) return;
    olay('sureBitti', { no });
    at(no, enKucukBosTas(p).id);
  }

  function enKucukBosTas(p) {
    const kalan = (p.acisTuru === 'cift' ? K.enIyiCiftler(p.el, o.okey) : K.enIyiGruplar(p.el, o.okey)).kalan;
    const adaylar = kalan.filter(t => !K.jokerMi(t, o.okey));
    const liste = adaylar.length ? adaylar : (kalan.length ? kalan : p.el);
    // İşlek taş atılmaz (500 ceza): işlek olmayan en küçüğü at, hepsi işlekse en küçüğü
    const islekOlmayan = liste.filter(t => !K.islekMi(t, o.masa, o.okey));
    return (islekOlmayan.length ? islekOlmayan : liste).reduce((a, t) => (K.deger(t, o.okey) < K.deger(a, o.okey) ? t : a));
  }

  // ---------- Hamleler ----------
  const hata = mesaj => ({ ok: false, hata: mesaj });
  const tamam = (veri = {}) => ({ ok: true, ...veri });
  const siraKimde = no => o && o.asama === 'oyun' && o.sira === no;

  function ortadanCek(no) {
    if (!siraKimde(no)) return hata('Sıra sende değil.');
    if (o.tur.cekti) return hata('Bu tur zaten taş çektin.');
    if (!o.deste.length) {
      elSonu({ tip: 'deste' });
      return tamam();
    }
    const t = o.deste.shift();
    o.oyuncular[no].el.push(t);
    o.tur.cekti = true;
    olay('cekti', { no, tas: t, yandan: false });
    degisti();
    return tamam({ tas: t });
  }

  const yandakiTas = no => o.oyuncular[oncekiNo(no)].atilanlar.at(-1) ?? null;

  // Yandan alınan taş bu tur kullanılmalı (elini açmak ya da işlemek için); olmazsa geri bırakılır
  function yandanAl(no) {
    if (!siraKimde(no)) return hata('Sıra sende değil.');
    if (o.tur.cekti) return hata('Bu tur zaten taş çektin.');
    const kimden = oncekiNo(no);
    const t = o.oyuncular[kimden].atilanlar.pop();
    if (!t) return hata('Yanda alınacak taş yok.');
    o.oyuncular[no].el.push(t);
    o.tur.cekti = true;
    o.tur.yandan = t;
    o.tur.yandanKimden = kimden;
    olay('cekti', { no, tas: t, yandan: true });
    degisti();
    return tamam({ tas: t });
  }

  // Yandan alınan taş geri bırakılır, yerine ortadan çekilir
  function geriBirak(no) {
    if (!siraKimde(no)) return hata('Sıra sende değil.');
    const p = o.oyuncular[no];
    const t = o.tur.yandan;
    if (!t || !p.el.includes(t)) return hata('Geri bırakılacak taş yok.');
    p.el.splice(p.el.indexOf(t), 1);
    o.oyuncular[o.tur.yandanKimden].atilanlar.push(t);
    o.tur.yandan = null;
    o.tur.cekti = false;
    olay('geriBirakti', { no, tas: t });
    return ortadanCek(no);
  }

  // Açma için gereken en az değer (masada açılmış en yüksek değerden 1 fazla)
  const gereken = () => o.esik + 1;
  const kimseAcmadi = () => o.oyuncular.every(p => !p.acti);

  // Elini aç ya da (açtıysan) yeni grupları yere koy. tur: 'seri' | 'cift'
  // idGruplari: oyuncunun ıstakasında dizdiği gruplar (taş id listeleri). Verilmezse en iyi diziliş bulunur (botlar).
  // Son taş atılarak bitirilir: elde en az bir taş kalmalı.
  function ac(no, tur, idGruplari) {
    if (!siraKimde(no)) return hata('Sıra sende değil.');
    if (!o.tur.cekti) return hata('Önce taş çek.');
    const p = o.oyuncular[no];
    let gruplar;
    if (idGruplari) {
      const coz = tur === 'cift' ? K.ciftCoz : K.grupCoz;
      gruplar = idGruplari.map(ids => ids.map(id => p.el.find(t => t.id === id)))
        .filter(ts => ts.every(Boolean)).map(ts => coz(ts, o.okey)).filter(Boolean);
    } else {
      const en = tur === 'cift' ? K.enIyiCiftler(p.el, o.okey) : K.enIyiGruplar(p.el, o.okey);
      gruplar = [...(tur === 'cift' ? en.ciftler : en.gruplar)];
      // Bütün taşlar gruba girdiyse en küçük grubu elde tut (atacak taş kalsın)
      if (gruplar.reduce((a, g) => a + g.sirali.length, 0) >= p.el.length) {
        gruplar.sort((a, b) => b.deger - a.deger).pop();
      }
    }
    const sonuc = { deger: gruplar.reduce((a, g) => a + g.deger, 0) };
    if (!gruplar.length) return hata(tur === 'cift' ? 'Istakanda dizili çift yok. Çiftleri yan yana koy, aralarına boşluk bırak.' : 'Istakanda dizili per ya da seri yok. Grupları yan yana diz, aralarına boşluk bırak.');
    if (gruplar.reduce((a, g) => a + g.sirali.length, 0) >= p.el.length) return hata('Elinde atacak bir taş kalmalı. Son taşı ortaya atarak bitirirsin.');
    if (p.acti) {
      if (p.acisTuru !== tur) return hata(p.acisTuru === 'cift' ? 'Çift açtın: yere sadece çift koyabilirsin.' : 'Seri açtın: yere çift koyamazsın.');
    } else {
      if (tur === 'cift') {
        if (gruplar.length < K.CIFT_SAYISI) return hata(`Çift açmak için en az ${K.CIFT_SAYISI} çift lazım (sende ${gruplar.length}).`);
        if (!kimseAcmadi() && sonuc.deger < gereken()) return hata(`Çiftlerin toplamı ${sonuc.deger}. En az ${gereken()} olmalı.`);
      } else if (sonuc.deger < gereken()) {
        return hata(`Elin ${sonuc.deger}. Açmak için en az ${gereken()} lazım.`);
      }
      const yandanVar = o.tur.yandan && p.el.includes(o.tur.yandan);
      if (yandanVar && !gruplar.some(g => g.sirali.includes(o.tur.yandan))) {
        return hata('Yandan aldığın taş açtığın gruplarda yok. Geri bırakabilirsin.');
      }
    }
    // Grupları masaya koy
    kaydet();
    const ilkAcis = !p.acti;
    const yandanKullanildi = o.tur.yandan && gruplar.some(g => g.sirali.includes(o.tur.yandan));
    gruplar.forEach(g => masayaKoy(no, g));
    if (ilkAcis) {
      p.acti = true;
      p.acisTuru = tur;
      o.esik = Math.max(o.esik, sonuc.deger);
      olay('acti', { no, tur, deger: sonuc.deger });
      // Yandan alıp açtıysan taşı atana ceza: seri × 10, çift × 20
      if (yandanKullanildi) {
        const t = o.tur.yandan;
        ceza(o.tur.yandanKimden, K.deger(t, o.okey) * (tur === 'cift' ? 20 : 10), `taşı veren: ${o.oyuncular[o.tur.yandanKimden].ad} (${p.ad} ${tur === 'cift' ? 'çift açtı, × 20' : 'seri açtı, × 10'})`);
      }
    } else {
      olay('koydu', { no, tur, deger: sonuc.deger });
    }
    // İlk açışta düşünmek için süre baştan başlar (geri alıp tekrar açınca bir daha başlamaz)
    if (!o.tur.sureSifirlandi) {
      o.tur.sureSifirlandi = true;
      o.tur.kalan = TUR_SURESI;
      olay('sure', { kalan: o.tur.kalan, no });
    }
    degisti();
    return tamam({ deger: sonuc.deger });
  }

  function masayaKoy(no, g) {
    const p = o.oyuncular[no];
    const ids = new Set(g.sirali.map(t => t.id));
    p.el = p.el.filter(t => !ids.has(t.id));
    o.masa.push({ id: ++o.grupSayaci, sahip: no, tur: g.tur, sirali: g.sirali, temsil: g.temsil, deger: g.deger });
  }

  // Elindeki bir taşı masadaki bir gruba işle
  function isle(no, tasId, grupId) {
    if (!siraKimde(no)) return hata('Sıra sende değil.');
    if (!o.tur.cekti) return hata('Önce taş çek.');
    const p = o.oyuncular[no];
    if (!p.acti) return hata('İşlemek için önce elini açmalısın.');
    const t = p.el.find(x => x.id === tasId);
    const g = o.masa.find(x => x.id === grupId);
    if (!t || !g) return hata('Taş ya da grup bulunamadı.');
    const s = K.isleme(g, t, o.okey);
    if (!s) return hata('Bu taş bu gruba uymuyor.');
    if (!s.takas && p.el.length === 1) return hata('Son taşını işleyemezsin: ortaya atarak bitir.');
    kaydet();
    p.el.splice(p.el.indexOf(t), 1);
    const sahip = o.oyuncular[g.sahip];
    if (s.takas) {
      // Okeyin yerine gerçek taş: okey işleyenin eline geçer, grubun sahibine ceza
      const okeyTasi = g.sirali[s.yer];
      g.sirali[s.yer] = t;
      okeyTasi.ters = false;
      p.el.push(okeyTasi);
      // Kendi grubundaki okeyi alana ceza yok
      if (g.sahip !== no) ceza(g.sahip, 500 + K.deger(t, o.okey) * 10, `${p.ad}, ${sahip.ad} grubundaki okeyin yerine taşını koydu`);
      olay('takas', { no, grupId });
    } else {
      Object.assign(g, { sirali: s.yeni.sirali, temsil: s.yeni.temsil, deger: s.yeni.deger });
      if (K.jokerMi(t, o.okey) && g.sahip !== no) ceza(g.sahip, 100, `${p.ad}, ${sahip.ad} grubuna okey koydu (çakallık)`);
      olay('isledi', { no, grupId });
    }
    degisti();
    return tamam({ takas: s.takas });
  }

  // Taş at ve sırayı geçir
  function at(no, tasId) {
    if (!siraKimde(no)) return hata('Sıra sende değil.');
    if (!o.tur.cekti) return hata('Önce taş çek.');
    const p = o.oyuncular[no];
    if (o.tur.yandan && p.el.includes(o.tur.yandan)) return hata('Yandan aldığın taşı kullanmadın: elini aç, işle ya da geri bırak.');
    const t = p.el.find(x => x.id === tasId);
    if (!t) return hata('Taş bulunamadı.');
    const bitis = p.el.length === 1;
    p.el.splice(p.el.indexOf(t), 1);
    // İşlek taş atmak 500 ceza (son taşı atıp bitirmek hariç)
    if (!bitis && K.islekMi(t, o.masa, o.okey)) ceza(no, 500, `${p.ad} işlek taş attı`);
    t.ters = false;
    p.atilanlar.push(t);
    olay('atti', { no, tas: t });
    clearInterval(sayac);
    if (bitis) {
      bitir(no, K.jokerMi(t, o.okey));
      return tamam();
    }
    degisti();
    siraBasla((no + 1) % 4);
    return tamam();
  }

  // ---------- Geri alma ----------
  // Açma, yere koyma ve işleme taş atılana kadar geri alınabilir. Süre geri alınmaz.
  function kaydet() {
    const tumTaslar = [...o.oyuncular.flatMap(p => p.el), ...o.masa.flatMap(g => g.sirali)];
    o.tur.geriAl.push({
      eller: o.oyuncular.map(p => [...p.el]),
      puan: o.oyuncular.map(p => ({ elPuani: p.elPuani, gecmis: p.gecmis.length, acti: p.acti, acisTuru: p.acisTuru })),
      masa: o.masa.map(g => ({ ...g, sirali: [...g.sirali], temsil: [...g.temsil] })),
      esik: o.esik,
      grupSayaci: o.grupSayaci,
      ters: tumTaslar.map(t => [t, t.ters]),
    });
  }

  function geriAl(no) {
    if (!siraKimde(no)) return hata('Sıra sende değil.');
    const k = o.tur.geriAl.pop();
    if (!k) return hata('Geri alınacak bir şey yok.');
    o.oyuncular.forEach((p, i) => {
      p.el = k.eller[i];
      p.elPuani = k.puan[i].elPuani;
      p.gecmis.length = k.puan[i].gecmis;
      p.acti = k.puan[i].acti;
      p.acisTuru = k.puan[i].acisTuru;
    });
    o.masa = k.masa;
    o.esik = k.esik;
    o.grupSayaci = k.grupSayaci;
    k.ters.forEach(([t, ters]) => (t.ters = ters));
    olay('geriAldi', { no });
    degisti();
    return tamam();
  }
  const geriAlinabilir = () => !!o?.tur?.geriAl.length;

  // ---------- Puanlama ----------
  function ceza(no, puan, neden) {
    const p = o.oyuncular[no];
    p.elPuani += puan;
    p.gecmis.push({ el: o.elNo, puan, neden });
    olay('ceza', { no, puan, neden });
  }

  function bitir(no, okeyle) {
    const f = o.oyuncular[no];
    const kafadan = !o.tur.acikBasta;
    const digerAcan = o.oyuncular.some((p, i) => i !== no && p.acti);
    const cift = f.acisTuru === 'cift';
    let puan, neden, digerlerine = true;
    if (kafadan && !digerAcan) {
      puan = okeyle ? (cift ? -20000 : -10000) : -5000;
      neden = okeyle ? (cift ? 'kimse açmadan çift açıp okeyle bitti' : 'kimse açmadan okeyle bitti') : 'kimse açmadan kafadan bitti';
      digerlerine = false;
    } else if (okeyle) {
      puan = -2000;
      neden = 'okeyle bitti';
    } else if (kafadan) {
      puan = -1000;
      neden = 'kafadan bitti';
    } else {
      puan = 0;
      neden = 'bitti';
    }
    if (puan) ceza(no, puan, `${f.ad} ${neden}`);
    elSonu({ tip: 'bitis', no, neden, puan, digerlerine });
  }

  function elSonu(bilgi) {
    clearInterval(sayac);
    o.asama = 'elSonu';
    const cezaYaz = bilgi.tip === 'deste' || bilgi.digerlerine;
    if (cezaYaz) {
      o.oyuncular.forEach((p, i) => {
        if (bilgi.tip === 'bitis' && i === bilgi.no) return;
        if (!p.acti) ceza(i, 1000, `${p.ad} elini açamadı`);
        else {
          const toplam = p.el.reduce((a, t) => a + K.deger(t, o.okey), 0);
          if (toplam) ceza(i, toplam * 10, `${p.ad} elinde ${toplam} kaldı (× 10)`);
        }
      });
    }
    o.oyuncular.forEach(p => (p.toplam += p.elPuani));
    o.sonuc = bilgi;
    if (o.elNo >= o.ayar.elSayisi) o.asama = 'bitti';
    degisti();
    olay(o.asama === 'bitti' ? 'oyunBitti' : 'elBitti', bilgi);
  }

  function sonrakiEl() {
    if (o.asama === 'elSonu') elBaslat();
  }

  // ---------- Bot ----------
  // En kötü taş: hiçbir gruba girmeyen, işlek olmayan, okey olmayan; elini açtıysan en büyüğü
  function enKotuTas(p) {
    const kalan = K.enIyiGruplar(p.el, o.okey).kalan;
    const adaylar = (kalan.length ? kalan : p.el).filter(t => !K.jokerMi(t, o.okey));
    const liste = adaylar.length ? adaylar : p.el;
    const guvenli = liste.filter(t => !K.islekMi(t, o.masa, o.okey));
    const secim = guvenli.length ? guvenli : liste;
    return secim.reduce((a, t) => {
      const da = K.deger(a, o.okey), dt = K.deger(t, o.okey);
      // Ceza toplamla hesaplandığı için büyük taştan kurtulmak iyidir
      return dt > da ? t : a;
    });
  }

  // Yandaki taşı almak işe yarar mı?
  function yandanIseYararMi(no, t) {
    const p = o.oyuncular[no];
    if (!t) return false;
    if (!p.acti) {
      const g = K.enIyiGruplar([...p.el, t], o.okey);
      return g.deger >= gereken() && g.gruplar.some(x => x.sirali.includes(t));
    }
    if (p.acisTuru === 'cift') return false;
    return o.masa.some(g => K.isleme(g, t, o.okey) && !K.jokerMi(t, o.okey));
  }

  async function botOyna(no) {
    const p = o.oyuncular[no];
    const el = o.elNo;
    const devam = () => o.asama === 'oyun' && o.sira === no && o.elNo === el;
    await bekle(BOT_HIZ);
    if (!devam()) return;
    if (!o.tur.cekti) {
      const t = yandakiTas(no);
      if (yandanIseYararMi(no, t)) yandanAl(no);
      else ortadanCek(no);
      await bekle(BOT_HIZ);
      if (!devam()) return;
    }
    // Elini açmayı dene: önce seri, olmazsa çift
    if (!p.acti) {
      const g = K.enIyiGruplar(p.el, o.okey);
      const c = K.enIyiCiftler(p.el, o.okey);
      if (g.deger >= gereken()) ac(no, 'seri');
      else if (c.ciftler.length >= K.CIFT_SAYISI + 1 && (kimseAcmadi() || c.deger >= gereken())) ac(no, 'cift');
      if (!devam()) return;
      if (o.tur.yandan && p.el.includes(o.tur.yandan)) geriBirak(no);
      if (p.acti) await bekle(BOT_HIZ);
    }
    if (!devam()) return;
    // Açtıysa: yeni grupları koy, uyan taşları işle (okeyi başkasına çakallık için koymaz)
    if (p.acti) {
      if (p.acisTuru === 'seri' && K.enIyiGruplar(p.el, o.okey).gruplar.length && p.el.length > 1) ac(no, 'seri');
      if (!devam()) return;
      let islendi = true;
      while (islendi && devam() && p.el.length > 1) {
        islendi = false;
        for (const t of [...p.el]) {
          if (K.jokerMi(t, o.okey)) continue;
          const g = o.masa.find(x => K.isleme(x, t, o.okey));
          if (g && p.acisTuru === 'seri') {
            isle(no, t.id, g.id);
            islendi = true;
            await bekle(400);
            break;
          }
        }
      }
      if (o.tur.yandan && p.el.includes(o.tur.yandan)) geriBirak(no);
    }
    if (!devam()) return;
    await bekle(BOT_HIZ / 2);
    if (!devam()) return;
    at(no, enKotuTas(p).id);
  }

  return {
    TUR_SURESI,
    dinleyici(ad, fn) { dinle[ad] = fn; },
    get oyun() { return o; },
    yeniOyun, sonrakiEl, ortadanCek, yandanAl, geriBirak, ac, isle, at, geriAl, geriAlinabilir, gereken, kimseAcmadi, yandakiTas, enKotuTas,
  };
})();

if (typeof module !== 'undefined') module.exports = Motor;
