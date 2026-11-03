// =============================================================
// Kaptirik - online oda (arkadaşlarla, 2-4 kişi; boş koltuklarda bot oturur)
// Bağlantı PeerJS ile telefonlar arasında doğrudan kurulur (kendi sunucumuz yok).
// Odayı açan telefon ("ev") oyunu yönetir: motor onda çalışır, botlar onda oynar.
// Odaya katılanlar ("misafir") hamlelerini eve yollar, ev de herkese kendi gördüğü durumu yollar
// (başkalarının taşları ve destedeki taşlar gizli).
//
// Oyundan çıkan (bağlantısı kopan) oyuncunun yerine bot oynar. Aynı kişi geri gelince
// (aynı telefon ya da aynı adla) bot bırakır, oyuncu botun kaldığı yerden devam eder.
//
// Mesajlar:
//   misafir → ev: { tip: 'katil', ad, kimlik, surum }  { tip: 'eylem', ad, args }  { tip: 'sohbet', metin }  { tip: 'nabiz' }
//   ev → misafir: { tip: 'kabul', no, surum }  { tip: 'lobi', koltuklar, ayar }  { tip: 'red', neden }
//                 { tip: 'durum', o }  { tip: 'olay', t, v }  { tip: 'hata', eylem, mesaj }  { tip: 'sonuc', eylem, r }
//                 { tip: 'sohbet', no, ad, metin }  { tip: 'nabiz' }
//   sesli sohbet: misafir → ev { tip: 'ses', acik }   ev → herkese { tip: 'sesListesi', liste: [{ no, peerId }] }
//   (ses kendisi PeerJS sesli aramasıyla oyuncular arasında doğrudan gider)
// =============================================================

// Başkasının odasındayken masa: oda sahibinden gelen durumu tutar, hamleleri ona yollar.
// Ekran (oyun.js) bunu motorla aynı şekilde kullanır.
const Uzak = {
  oyun: null,
  TUR_SURESI: 30,
  gereken() { return this.oyun.esik + 1; },
  kimseAcmadi() { return this.oyun.oyuncular.every(p => !p.acti); },
  yandakiTas(no) { return this.oyun.oyuncular[(no + 3) % 4].atilanlar.at(-1) ?? null; },
  geriAlinabilir() { return (this.oyun.tur?.geriAlSayi ?? 0) > 0; },
  // Okey ters çevirme hemen ekranda görünsün diye kendi kopyamızda da çevrilir
  tersCevir(no, id) {
    const t = this.oyun.oyuncular[no].el.find(x => x.id === id);
    if (t) t.ters = !t.ters;
    return Ag.eylem('tersCevir', [id]);
  },
};
['ortadanCek', 'yandanAl', 'geriBirak', 'geriAl', 'ac', 'isle', 'hepsiniIsle', 'at', 'ikram'].forEach(ad => {
  Uzak[ad] = (no, ...args) => Ag.eylem(ad, args);
});

const Ag = (() => {
  // Online kısmı her değiştiğinde 1 artır: eski sürümle gelen oyuncu odaya alınmaz
  const SURUM = 3;
  const ODA_ONEKI = 'kaptirik-oda-';
  const KOD_HARFLERI = 'ABCDEFGHJKLMNPRSTUVYZ23456789';  // karışabilecek O/0, I/1 yok
  const KOD_UZUNLUK = 5;
  const NABIZ_ARALIGI = 3000;
  const NABIZ_ZAMAN_ASIMI = 15000;  // bu kadar ses gelmezse oyundan çıktı sayılır, yerine bot geçer
  const OTOMATIK_KATIL = 'kaptirik.otomatikKatil';  // sayfa yenilenince aynı odaya geri gir
  const SON_ODA = 'kaptirik.sonOda';                 // uygulama kapanıp açılınca "odaya geri dön"
  const KIMLIK = 'kaptirik.kimlik';                  // bu telefonu tanımak için (geri dönünce aynı koltuk)
  const IZINLI = ['ortadanCek', 'yandanAl', 'geriBirak', 'geriAl', 'ac', 'isle', 'hepsiniIsle', 'at', 'tersCevir', 'ikram'];

  const ag = {
    mod: 'yerel',      // 'yerel' | 'ev' | 'misafir'
    peer: null,
    baglanti: null,    // misafirde: eve olan bağlantı
    koltuklar: [null, null, null, null],  // evde: { ad, kimlik, misafir: { baglanti, sonMesaj } | null }
    bekleyen: [],      // evde: henüz koltuk almamış bağlantılar
    basladi: false,
    kod: '',
    sonMesaj: 0,
    nabiz: null,
    okunmamis: 0,
  };

  let kimlik = '';
  try {
    kimlik = localStorage.getItem(KIMLIK) || '';
    if (!kimlik) localStorage.setItem(KIMLIK, (kimlik = Math.random().toString(36).slice(2, 12)));
  } catch (e) {
    kimlik = Math.random().toString(36).slice(2, 12);
  }

  const durumYaz = html => ($('onlineDurum').innerHTML = html);
  const kayit = (ad, deger) => {
    try {
      if (deger === null) localStorage.removeItem(ad);
      else localStorage.setItem(ad, JSON.stringify(deger));
    } catch (e) { /* hatırlanmasa da olur */ }
  };

  function adiAl() {
    const ad = $('adim').value.trim().slice(0, 12);
    if (!ad) {
      $('adim').classList.add('eksik');
      $('adim').placeholder = 'Önce adını yaz 👈';
      $('adim').focus();
      Ses.hata();
      return null;
    }
    try {
      localStorage.setItem(AD_ANAHTARI, ad);
    } catch (e) { /* hatırlanmasa da olur */ }
    return ad;
  }

  function peerVarMi() {
    if (typeof Peer !== 'undefined') return true;
    durumYaz('❌ Online bağlantı kütüphanesi yüklenemedi. İnternet bağlantını kontrol et.');
    return false;
  }

  // Oda kurulurken ya da bir odadayken diğer düğmeler kilitlenir; çıkış için "Odayı kapat / Vazgeç" görünür
  function kilitle(evet = true) {
    ['odaKurBtn', 'katilBtn', 'odaKoduGir', 'botlaBtn', 'adim', 'geriDonBtn'].forEach(id => $(id) && ($(id).disabled = evet));
    $('odaIptalBtn').hidden = !evet;
    $('odaIptalBtn').textContent = ag.mod === 'ev' || $('odaKurBtn').dataset.kuruluyor ? '❌ Odayı kapat' : '↩️ Vazgeç, odadan çık';
  }

  function odaKodunuGoster() {
    $('odaBilgisi').innerHTML = `🔑 <b>${ag.kod}</b>`;
    $('odaBilgisi').hidden = false;
    $('sohbetBtn').hidden = false;
    $('sesliBtn').hidden = false;
  }

  function sunucuyaYenidenBaglan(peer) {
    peer.on('disconnected', () => {
      setTimeout(() => {
        if (peer.destroyed || !peer.disconnected) return;
        try {
          peer.reconnect();
        } catch (e) { /* bir sonraki denemede yine denenir */ }
      }, 2000);
    });
  }

  const misafirler = () => ag.koltuklar.map((k, no) => ({ k, no })).filter(x => x.k?.misafir);
  const gonder = (m, mesaj) => m?.baglanti.open && m.baglanti.send(mesaj);

  function nabziBaslat() {
    ag.sonMesaj = Date.now();
    clearInterval(ag.nabiz);
    ag.nabiz = setInterval(() => {
      if (ag.mod === 'ev') {
        misafirler().forEach(({ k, no }) => {
          gonder(k.misafir, { tip: 'nabiz' });
          if (Date.now() - k.misafir.sonMesaj > NABIZ_ZAMAN_ASIMI) {
            k.misafir.baglanti.close();
            koptu(no);
          }
        });
      } else if (ag.baglanti) {
        if (ag.baglanti.open) ag.baglanti.send({ tip: 'nabiz' });
        if (Date.now() - ag.sonMesaj > NABIZ_ZAMAN_ASIMI) evdenKoptu();
      }
    }, NABIZ_ARALIGI);
  }

  // ---------- Ev: oda kurma ----------
  function odaKur() {
    const ad = adiAl();
    if (!ad || !peerVarMi()) return;
    Ses.motor();
    const kod = [...Array(KOD_UZUNLUK)].map(() => KOD_HARFLERI[Math.floor(Math.random() * KOD_HARFLERI.length)]).join('');
    durumYaz('⏳ Oda açılıyor...');
    oturumuUnut();  // eski bir odaya otomatik girme kaydı kalmasın
    $('odaKurBtn').dataset.kuruluyor = '1';
    kilitle();
    try {
      ag.peer?.destroy();
    } catch (e) { /* eski deneme zaten kapanmış */ }
    const peer = new Peer(ODA_ONEKI + kod);
    ag.peer = peer;
    peer.on('open', () => {
      if (ag.mod === 'ev') return;
      ag.mod = 'ev';
      ag.kod = kod;
      ag.koltuklar = [{ ad, kimlik, misafir: null }, null, null, null];
      ui.benimNo = 0;
      kilitle();
      odaKodunuGoster();
      nabziBaslat();
      lobiyiCiz();
    });
    sunucuyaYenidenBaglan(peer);
    peer.on('call', gelenArama);
    peer.on('connection', baglanti => {
      const misafir = { baglanti, sonMesaj: Date.now(), no: null };
      ag.bekleyen.push(misafir);
      baglanti.on('data', m => {
        misafir.sonMesaj = Date.now();
        if (m?.tip !== 'nabiz') evMesaji(misafir, m);
      });
      const kapandi = () => {
        ag.bekleyen = ag.bekleyen.filter(x => x !== misafir);
        if (misafir.no !== null && ag.koltuklar[misafir.no]?.misafir === misafir) koptu(misafir.no);
      };
      baglanti.on('close', kapandi);
      baglanti.on('error', kapandi);
    });
    peer.on('error', e => {
      if (e.type === 'unavailable-id') odaKur();
      else if (ag.mod !== 'ev') {
        kilitle(false);
        durumYaz(`❌ Oda açılamadı (${e.type}). İnternet bağlantını kontrol et.`);
      }
    });
  }

  const koltukAdi = no => ag.koltuklar[no]?.ad ?? BOT_ADLARI[no - 1];

  function lobiListesi(koltuklar, benimNo) {
    return `<ol class="lobiListesi">${koltuklar.map((k, i) => `<li><span class="nokta" style="background:${KOLTUK_RENKLERI[i]}"></span>`
      + (k ? `${guvenli(k.ad)}${i === 0 ? ' <small>(oda sahibi)</small>' : ''}${i === benimNo ? ' <b>(sen)</b>' : ''}` : `<span class="bos">🤖 ${guvenli(BOT_ADLARI[i - 1])}</span>`)
      + '</li>').join('')}</ol>`;
  }

  function lobiyiCiz() {
    const liste = ag.koltuklar.map(k => (k ? { ad: k.ad } : null));
    const kisi = liste.filter(Boolean).length;
    durumYaz(`Oda kodun: <b class="odaKodu">${ag.kod}</b><br>Bu kodu arkadaşlarına söyle, “Katıl” kısmına yazsınlar.`
      + lobiListesi(liste, 0)
      + (kisi > 1 ? 'Herkes geldiyse “Oyunu başlat”a bas. Boş koltuklarda bot oynar.' : '⏳ Arkadaşların bekleniyor...'));
    $('baslatBtn').hidden = false;
    $('baslatBtn').disabled = kisi < 2;
    const ayar = { elSayisi: ui.ayar.elSayisi, yardimli: ui.ayar.yardimli };
    misafirler().forEach(({ k }) => gonder(k.misafir, { tip: 'lobi', koltuklar: liste, ayar }));
  }

  function reddet(baglanti, neden) {
    baglanti.send({ tip: 'red', neden });
    setTimeout(() => baglanti.close(), 500);
  }

  function evMesaji(misafir, m) {
    if (m?.tip === 'katil' && misafir.no === null) return katilanGeldi(misafir, m);
    if (misafir.no === null || ag.koltuklar[misafir.no]?.misafir !== misafir) return;
    const no = misafir.no;
    if (m?.tip === 'eylem' && ag.basladi && IZINLI.includes(m.ad) && Array.isArray(m.args)) {
      if (m.ad === 'ikram') return Motor.ikram(no, ...m.args);  // süs: hata mesajı yollamaya gerek yok
      const r = Motor[m.ad](no, ...m.args);
      if (!r.ok) gonder(misafir, { tip: 'hata', eylem: m.ad, mesaj: r.hata });
      else if (m.ad === 'hepsiniIsle') gonder(misafir, { tip: 'sonuc', eylem: m.ad, r });
    } else if (m?.tip === 'sohbet' && typeof m.metin === 'string') {
      sohbetDagit(no, koltukAdi(no), m.metin);
    } else if (m?.tip === 'ses') {
      ag.koltuklar[no].ses = !!m.acik;
      sesListesiYay();
    }
  }

  function katilanGeldi(misafir, m) {
    if (m.surum !== SURUM) {
      reddet(misafir.baglanti, 'Uygulaman eski sürümde kalmış. Uygulamayı tamamen kapatıp yeniden aç (tarayıcıdaysan sayfayı yenile), sonra tekrar katıl.');
      return;
    }
    const ad = String(m.ad ?? '').trim().slice(0, 12) || 'Oyuncu';
    const kucuk = s => String(s).trim().toLocaleLowerCase('tr');
    // Daha önce bu odada oturduysa (aynı telefon ya da oyun başladıysa aynı ad) kendi koltuğuna döner
    let no = ag.koltuklar.findIndex((k, i) => i > 0 && k && k.kimlik === m.kimlik);
    if (no < 0 && ag.basladi) no = ag.koltuklar.findIndex((k, i) => i > 0 && k && !k.misafir && kucuk(k.ad) === kucuk(ad));
    if (no < 0) {
      if (ag.basladi) {
        reddet(misafir.baglanti, 'Oyun başlamış. Oyundan çıkan bir oyuncuysan oyundaki adının aynısını yazıp tekrar katıl.');
        return;
      }
      no = ag.koltuklar.findIndex((k, i) => i > 0 && !k);
      if (no < 0) {
        reddet(misafir.baglanti, 'Oda dolu (4 kişi).');
        return;
      }
      ag.koltuklar[no] = { ad, kimlik: m.kimlik, misafir: null };
    }
    const eski = ag.koltuklar[no].misafir;
    if (eski && eski !== misafir) eski.baglanti.close();
    ag.koltuklar[no].misafir = misafir;
    ag.koltuklar[no].ses = false;  // yeniden gelen önce sesten çıkmış sayılır (yeni bağlantı adresi)
    misafir.no = no;
    ag.bekleyen = ag.bekleyen.filter(x => x !== misafir);
    gonder(misafir, { tip: 'kabul', no, surum: SURUM });
    Ses.secim();
    sesListesiYay();
    if (!ag.basladi) {
      lobiyiCiz();
      return;
    }
    // Oyun sürüyor: bot bırakır, oyuncu kaldığı yerden devam eder
    gonder(misafir, { tip: 'durum', o: Motor.gorunum(no) });
    Motor.botYap(no, false);
    sohbetDagit(-1, '', `${koltukAdi(no)} oyuna geri döndü 👋`);
  }

  function koptu(no) {
    const k = ag.koltuklar[no];
    if (!k?.misafir) return;
    k.misafir = null;
    k.ses = false;
    sesListesiYay();
    if (!ag.basladi) {
      ag.koltuklar[no] = null;
      lobiyiCiz();
      return;
    }
    Motor.botYap(no, true);
    sohbetDagit(-1, '', `${k.ad} oyundan çıktı, yerine bot oynuyor. Aynı adla geri girerse kaldığı yerden devam eder.`);
  }

  function oyunuBaslat() {
    if (ag.mod !== 'ev' || ag.basladi) return;
    ag.basladi = true;
    $('baslatBtn').hidden = true;
    const isimler = [0, 1, 2, 3].map(koltukAdi);
    const botlar = ag.koltuklar.map(k => !k);
    Masa = Motor;
    Ses.karistir();
    $('menu').hidden = true;
    $('oyun').hidden = false;
    Motor.yeniOyun(isimler, { elSayisi: ui.ayar.elSayisi, yardimli: ui.ayar.yardimli, botlar });
    sohbetDagit(-1, '', 'Oyun başladı. İyi eğlenceler! 🎉');
  }

  // Motordaki her değişiklikte herkese kendi gördüğü durum gider
  function durumYay() {
    if (ag.mod !== 'ev' || !ag.basladi) return;
    misafirler().forEach(({ k, no }) => gonder(k.misafir, { tip: 'durum', o: Motor.gorunum(no) }));
  }

  // Olaylar (ses, mesaj, animasyon için). Çekilen taşı sadece çeken görür.
  function olayYay(t, v) {
    if (ag.mod !== 'ev' || !ag.basladi) return;
    misafirler().forEach(({ k, no }) => {
      const gizli = t === 'cekti' && !v.yandan && v.no !== no;
      gonder(k.misafir, { tip: 'olay', t, v: gizli ? { ...v, tas: null } : v });
    });
  }

  // ---------- Misafir: odaya katılma ----------
  function odayaKatil(kod = $('odaKoduGir').value.trim().toUpperCase()) {
    const ad = adiAl();
    if (!ad || !peerVarMi()) return;
    Ses.motor();
    if (kod.length !== KOD_UZUNLUK) {
      durumYaz(`Oda kodu ${KOD_UZUNLUK} karakter olmalı.`);
      return;
    }
    ag.kod = kod;
    durumYaz('⏳ Odaya bağlanılıyor...');
    kilitle();
    try {
      ag.peer?.destroy();
    } catch (e) { /* eski bağlantı zaten kapanmış */ }
    const peer = new Peer();
    ag.peer = peer;
    peer.on('call', gelenArama);
    sunucuyaYenidenBaglan(peer);
    // 15 saniyede bağlanılamazsa ne yapılacağını söylesin
    setTimeout(() => {
      if (ag.peer !== peer || ag.baglanti) return;
      durumYaz('❌ 15 saniyedir bağlanılamadı. Şunları dene:<br>'
        + '• Oda sahibi oyunu <b>açık</b> tutsun, ekranı kilitlenmesin (kodu göndermek için WhatsApp’a geçtiyse oyuna geri dönsün).<br>'
        + '• İkiniz de aynı Wi-Fi’ye bağlanın ya da ikiniz de mobil veriye geçin.<br>'
        + '• Sonra tekrar <b>Katıl</b>’a bas.');
      oturumuUnut();  // yenileyince bu odaya kendiliğinden girmeye çalışıp takılmasın
      kilitle(false);
    }, 15000);
    peer.on('open', () => {
      if (ag.peer !== peer || ag.baglanti) return;
      const baglanti = peer.connect(ODA_ONEKI + kod, { reliable: true });
      baglanti.on('open', () => {
        ag.baglanti = baglanti;
        ag.mod = 'misafir';
        baglanti.send({ tip: 'katil', ad, kimlik, surum: SURUM });
        nabziBaslat();
      });
      baglanti.on('data', m => {
        ag.sonMesaj = Date.now();
        if (m?.tip !== 'nabiz') misafirMesaji(m);
      });
      baglanti.on('close', () => ag.baglanti === baglanti && evdenKoptu());
      baglanti.on('error', () => ag.baglanti === baglanti && evdenKoptu());
    });
    peer.on('error', e => {
      if (ag.peer !== peer || ag.baglanti) return;
      kilitle(false);
      // Oda yok: sayfa yenilenince bu odaya tekrar otomatik girmeye çalışmasın
      if (e.type === 'peer-unavailable') {
        oturumuUnut();
        kayit(SON_ODA, null);
        $('geriDonBtn').hidden = true;
      }
      durumYaz(e.type === 'peer-unavailable'
        ? '❌ Bu kodla açık bir oda bulunamadı. Kodu kontrol et. Oda sahibinin oyunu açık mı? (Kodu göndermek için oyundan çıktıysa telefon oyunu uyutur: oyuna geri dönsün, sonra tekrar Katıl’a bas.)'
        : `❌ Bağlanılamadı (${e.type}). İnternet bağlantını kontrol et.`);
    });
  }

  function misafirMesaji(m) {
    if (m?.tip === 'kabul' && Number.isInteger(m.no)) {
      if (m.surum !== SURUM) {
        ag.baglanti.close();
        ag.baglanti = null;
        ag.mod = 'yerel';
        kilitle(false);
        durumYaz('❌ Oda sahibinin uygulaması farklı sürümde. İkiniz de uygulamayı kapatıp yeniden açın.');
        return;
      }
      ui.benimNo = m.no;
      odaKodunuGoster();
      try {
        sessionStorage.setItem(OTOMATIK_KATIL, JSON.stringify({ kod: ag.kod }));
      } catch (e) { /* kopunca kodu elle yazar */ }
      kayit(SON_ODA, { kod: ag.kod, zaman: Date.now() });
      durumYaz('✅ Odaya bağlandın! Oyunu oda sahibi başlatacak, bekle...');
    } else if (m?.tip === 'lobi' && Array.isArray(m.koltuklar)) {
      durumYaz(`✅ Odaya bağlandın! Oyunu oda sahibi başlatacak, bekle...<br><small>${m.ayar?.elSayisi ?? '?'} el · ${m.ayar?.yardimli ? 'yardımlı' : 'yardımsız'}</small>`
        + lobiListesi(m.koltuklar, ui.benimNo));
    } else if (m?.tip === 'red') {
      ag.baglanti = null;
      ag.mod = 'yerel';
      kilitle(false);
      oturumuUnut();
      durumYaz(`❌ Odaya girilemedi: ${guvenli(m.neden ?? '')}`);
    } else if (m?.tip === 'durum' && m.o) {
      const yeniEl = Uzak.oyun && m.o.elNo !== Uzak.oyun.elNo;
      Uzak.oyun = m.o;
      if (Masa !== Uzak) {
        // İlk durum geldi: oyun ekranına geç
        Masa = Uzak;
        ui.yuvalar = Array(ISTAKA_YUVA).fill(null);
        $('menu').hidden = true;
        $('oyun').hidden = false;
      }
      // Oda sahibi yeni eli başlattı: el sonu ekranı kendiliğinden kapanır
      if (yeniEl && !ui.tabloAcik) $('elSonu').hidden = true;
      ciz();
    } else if (m?.tip === 'olay' && Uzak.oyun) {
      olay(m.t, m.v);
    } else if (m?.tip === 'hata') {
      // Ekranda saklanan ıstaka dizilişi de geri alınır (hamle olmadı)
      if (['ac', 'isle', 'hepsiniIsle'].includes(m.eylem)) ui.yuvaYigini.pop();
      Ses.hata();
      mesaj(guvenli(m.mesaj ?? ''), 'hata');
      ciz();
    } else if (m?.tip === 'sonuc' && m.eylem === 'hepsiniIsle' && m.r?.sayi) {
      mesaj(`${m.r.sayi} taş işlendi. Yanlışsa “Geri al”.`, 'iyi');
    } else if (m?.tip === 'sohbet') {
      sohbetGeldi(m.no, m.ad, m.metin);
    } else if (m?.tip === 'sesListesi' && Array.isArray(m.liste)) {
      sesListesiGeldi(m.liste);
    }
  }

  // Misafirde: oda sahibiyle bağlantı koptu
  function evdenKoptu() {
    if (!ag.baglanti) return;
    ag.baglanti = null;
    if ($('oyun').hidden) {
      ag.mod = 'yerel';
      kilitle(false);
      durumYaz('📡 Oda sahibiyle bağlantı koptu. Tekrar katılmayı dene.');
      return;
    }
    $('baglantiEkrani').hidden = false;
  }

  // Oyuncu kendi isteğiyle çıkıyor: sayfa yenilenince odaya otomatik girmesin
  function oturumuUnut() {
    try {
      sessionStorage.removeItem(OTOMATIK_KATIL);
    } catch (e) { /* yoksa da olur */ }
  }

  function ayril() {
    oturumuUnut();
    kayit(SON_ODA, null);
    try {
      ag.peer?.destroy();  // odayı kapat: arkadaşların bağlantısı da kapanır
    } catch (e) { /* zaten kapanmış */ }
    location.reload();
  }

  // ---------- Hamle (misafir) ----------
  function eylem(ad, args) {
    if (ag.mod !== 'misafir' || !ag.baglanti?.open) return { ok: false, hata: 'Oda sahibiyle bağlantı yok.' };
    ag.baglanti.send({ tip: 'eylem', ad, args });
    return { ok: true, uzak: true };
  }

  // ---------- Sohbet ----------
  function sohbetDagit(no, ad, metin) {
    metin = String(metin).trim().slice(0, 120);
    if (!metin) return;
    misafirler().forEach(({ k }) => gonder(k.misafir, { tip: 'sohbet', no, ad, metin }));
    sohbetGeldi(no, ad, metin);
  }

  function sohbetGonder(metin) {
    metin = metin.trim().slice(0, 120);
    if (!metin) return;
    if (ag.mod === 'ev') sohbetDagit(0, ag.koltuklar[0].ad, metin);
    else if (ag.mod === 'misafir' && ag.baglanti?.open) ag.baglanti.send({ tip: 'sohbet', metin });
  }

  // no = -1: oyunun kendi duyurusu (çıktı, geri döndü...)
  function sohbetGeldi(no, ad, metin) {
    const satir = document.createElement('div');
    satir.className = `satir${no === -1 ? ' duyuru' : ''}${no === ui.benimNo ? ' ben' : ''}`;
    satir.innerHTML = no === -1 ? guvenli(metin)
      : `<b style="color:${KOLTUK_RENKLERI[no] ?? '#fff'}">${guvenli(ad)}:</b> ${guvenli(metin)}`;
    $('sohbetListe').appendChild(satir);
    $('sohbetListe').scrollTop = $('sohbetListe').scrollHeight;
    if (no === ui.benimNo) return;
    if ($('sohbetPaneli').hidden) {
      ag.okunmamis++;
      $('okunmamis').textContent = ag.okunmamis;
      $('okunmamis').hidden = false;
      if (!$('oyun').hidden) mesaj(no === -1 ? `💬 ${guvenli(metin)}` : `💬 <b>${guvenli(ad)}:</b> ${guvenli(metin)}`);
    }
    Ses.secim();
  }

  // ---------- Sesli sohbet ----------
  // 🎤'a basan sesli sohbete katılır (mikrofon açılır). Sesteki her iki kişi arasında doğrudan bir ses
  // bağlantısı kurulur; ikiliden koltuk numarası küçük olan arar, diğeri kendi sesiyle cevap verir.
  // Kimin seste olduğunu oda sahibi tutar ve herkese duyurur.
  const ses = { akis: null, liste: [], aramalar: new Map() };  // aramalar: peerId → { call, audio }

  function sesListesiYay() {
    if (ag.mod !== 'ev') return;
    const liste = ag.koltuklar.map((k, no) => {
      const peerId = no === 0 ? ag.peer?.id : k?.misafir?.baglanti.peer;
      return k?.ses && peerId ? { no, peerId } : null;
    }).filter(Boolean);
    misafirler().forEach(({ k }) => gonder(k.misafir, { tip: 'sesListesi', liste }));
    sesListesiGeldi(liste);
  }

  function sesListesiGeldi(liste) {
    ses.liste = liste;
    const benSesteyim = !!ses.akis && liste.some(x => x.no === ui.benimNo);
    // Sesten çıkanlarla (ya da ben çıktıysam herkesle) bağlantıyı kapat
    ses.aramalar.forEach((a, peerId) => {
      if (!benSesteyim || !liste.some(x => x.peerId === peerId)) aramayiKapat(peerId);
    });
    if (benSesteyim) {
      liste.filter(x => x.no > ui.benimNo && !ses.aramalar.has(x.peerId))
        .forEach(x => aramayaBagla(ag.peer.call(x.peerId, ses.akis)));
    }
    sesDugmesiniCiz();
    if (Masa.oyun) ciz();
  }

  function gelenArama(call) {
    if (!ses.akis) {
      call.close();
      return;
    }
    call.answer(ses.akis);
    aramayaBagla(call);
  }

  function aramayaBagla(call) {
    if (!call) return;
    aramayiKapat(call.peer);
    const audio = new Audio();
    audio.autoplay = true;
    audio.setAttribute('playsinline', '');
    ses.aramalar.set(call.peer, { call, audio });
    call.on('stream', akis => {
      audio.srcObject = akis;
      audio.play().catch(() => {});
    });
    const bitti = () => {
      if (ses.aramalar.get(call.peer)?.call === call) aramayiKapat(call.peer);
    };
    call.on('close', bitti);
    call.on('error', bitti);
  }

  function aramayiKapat(peerId) {
    const a = ses.aramalar.get(peerId);
    if (!a) return;
    ses.aramalar.delete(peerId);
    a.audio.srcObject = null;
    try {
      a.call.close();
    } catch (e) { /* zaten kapanmış */ }
  }

  async function sesAcKapa() {
    if (ses.akis) {
      ses.akis.getTracks().forEach(t => t.stop());
      ses.akis = null;
      sesDurumuBildir(false);
      mesaj('🎤 Sesli sohbetten çıktın.');
      return;
    }
    try {
      ses.akis = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch (e) {
      Ses.hata();
      mesaj('🎤 Mikrofona izin verilmedi. Telefon ayarlarından tarayıcıya mikrofon izni ver.', 'hata');
      return;
    }
    sesDurumuBildir(true);
    mesaj('🎙️ Sesli sohbettesin. Seste olanlar birbirini duyar.', 'iyi');
  }

  function sesDurumuBildir(acik) {
    if (ag.mod === 'ev') {
      ag.koltuklar[0].ses = acik;
      sesListesiYay();
    } else if (ag.mod === 'misafir' && ag.baglanti?.open) {
      ag.baglanti.send({ tip: 'ses', acik });
      if (!acik) sesListesiGeldi(ses.liste);  // kendi bağlantılarımı hemen kapat
    }
    sesDugmesiniCiz();
  }

  function sesDugmesiniCiz() {
    const acik = !!ses.akis;
    $('sesliBtn').classList.toggle('acik', acik);
    $('sesliBtn').textContent = acik ? '🎙️' : '🎤';
    $('sesliBtn').title = acik ? 'Sesli sohbetten çık' : 'Sesli sohbete katıl';
  }

  const sesteMi = no => ses.liste.some(x => x.no === no);

  function sohbetiAc() {
    $('sohbetPaneli').hidden = false;
    ag.okunmamis = 0;
    $('okunmamis').hidden = true;
    $('sohbetListe').scrollTop = $('sohbetListe').scrollHeight;
  }

  // ---------- Kurulum ----------
  $('odaKurBtn').addEventListener('click', odaKur);
  $('katilBtn').addEventListener('click', () => odayaKatil());
  $('odaKoduGir').addEventListener('keydown', e => {
    if (e.key === 'Enter') odayaKatil();
  });
  $('baslatBtn').addEventListener('click', oyunuBaslat);
  $('odaIptalBtn').addEventListener('click', ayril);
  $('yenidenBaglanBtn').addEventListener('click', () => location.reload());
  $('baglantiCikBtn').addEventListener('click', ayril);
  $('sohbetBtn').addEventListener('click', sohbetiAc);
  $('sesliBtn').addEventListener('click', sesAcKapa);
  $('sohbetKapat').addEventListener('click', () => ($('sohbetPaneli').hidden = true));
  $('sohbetForm').addEventListener('submit', e => {
    e.preventDefault();
    sohbetGonder($('sohbetYazi').value);
    $('sohbetYazi').value = '';
  });
  // Hızlı mesajlar (yazmadan tek dokunuşla)
  document.querySelectorAll('#hizliMesaj button').forEach(b => b.addEventListener('click', () => sohbetGonder(b.textContent)));

  // Sayfa yenilenince (bağlantı koptuysa) aynı odaya otomatik geri girilir
  try {
    const otomatik = JSON.parse(sessionStorage.getItem(OTOMATIK_KATIL));
    if (otomatik?.kod && $('adim').value.trim()) {
      $('odaKoduGir').value = otomatik.kod;
      setTimeout(() => odayaKatil(otomatik.kod), 300);
    }
  } catch (e) { /* elle katılınır */ }

  // Uygulama kapanıp açıldıysa: son odaya tek dokunuşla geri dön (3 saat içinde)
  try {
    const son = JSON.parse(localStorage.getItem(SON_ODA));
    if (son?.kod && Date.now() - son.zaman < 3 * 3600 * 1000 && !$('odaKoduGir').value) {
      $('geriDonBtn').textContent = `🔁 ${son.kod} odasına geri dön`;
      $('geriDonBtn').hidden = false;
      $('geriDonBtn').addEventListener('click', () => {
        $('odaKoduGir').value = son.kod;
        odayaKatil(son.kod);
      });
    }
  } catch (e) { /* buton görünmez */ }

  return {
    eylem, durumYay, olayYay, ayril, sesteMi,
    // Sorun ararken: kimlerle ses bağlantısı var, ses geliyor mu
    get sesBaglantilari() { return [...ses.aramalar].map(([id, a]) => ({ id, sesGeliyor: !!a.audio.srcObject })); },
    get mod() { return ag.mod; },
  };
})();
