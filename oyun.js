// =============================================================
// Kaptirik - ekran: menü, ıstakam, sürükle-bırak, süre, mesajlar ve puan tablosu
// Oyunun kuralları motor.js'te; burası sadece gösterir ve dokunuşları motora iletir.
//
// Oynanış: ortadaki desteye dokun → taş ıstakana uçar (ya da desteden tutup ıstakaya kendin çek). Soldaki oyuncunun attığı taşa dokun → yandan alırsın.
// Atmak için taşı sağ alttaki köşeye sürükle. İşlemek için taşı masadaki gruba sürükle.
// Son taşı ortaya (masanın herhangi bir yerine) bırakırsan bitirirsin.
// Istakada taşları parmağınla tutup istediğin yere taşırsın; dizili bir grubun en sağdaki taşını tutarsan bütün grup gelir.
// Açarken ıstakanda yan yana dizdiğin gruplar açılır (aralarında boşluk olmalı).
// =============================================================

const $ = id => document.getElementById(id);
const K = Kurallar;
const RENK_KODLARI = Sahne.RENKLER;
const KOLTUK_RENKLERI = ['#e23b3b', '#3b82f6', '#22c55e', '#facc15'];
const BOT_ADLARI = ['Bot Ayşe', 'Bot Mehmet', 'Bot Zeynep'];
// Istaka: bilgisayarda 2 sıra x 15 yuva; telefonda 3 sıra x 12 (taşlar daha büyük görünsün)
const DAR_EKRAN = window.matchMedia('(max-width: 600px)').matches;
const SIRA = DAR_EKRAN ? 14 : 15;   // bir sıradaki yuva sayısı (telefonda ekrana sığsın diye 14)
const SATIR = 2;                    // sıra sayısı: gerçek ıstaka gibi her yerde 2 kat
const ISTAKA_YUVA = SIRA * SATIR;
const AD_ANAHTARI = 'kaptirik.ad';
const guvenli = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

// Oyunu kim yönetiyor: kendi telefonunda (botlarla ya da odayı açan sensen) motorun kendisi,
// başkasının odasına katıldıysan oda sahibinden gelen durumu tutan uzak masa (ag.js'teki Uzak).
let Masa = Motor;

const ui = {
  benimNo: 0,
  yuvalar: Array(ISTAKA_YUVA).fill(null),  // ıstakamdaki taş id'leri (boş yuva = null)
  surukle: null,      // sürüklenen taş: { id, hayalet, x0, y0, basladi }
  ayar: { elSayisi: 5, yardimli: true, mod: 'essiz' },
  mesajZaman: null,
  ucacak: null,       // ıstakaya uçarak gelecek taş: { id, nereden }
  desteCek: null,     // desteden parmakla çekilen taş: { pid, x0, y0, basladi, hayalet, id, birakilan }
  ucan: null,         // şu an uçmakta olan taş: { id, bitis }
  yuvaYigini: [],     // açma/işleme öncesi ıstaka dizilişleri (geri alınca taşlar eski yerine döner)
};

// Geri alınabilir bir hamle yap: başarılıysa ıstakanın önceki hâli saklanır
function hamle(fn) {
  const once = [...ui.yuvalar];
  const r = fn();
  if (r.ok) ui.yuvaYigini.push(once);
  return r;
}

// Ekrandaki koltuklar: 0 alt (ben), 1 sağ, 2 üst, 3 sol. Sıra saatin tersine döner, benden sonra sağdaki oynar:
// sağdaki benim attığımı alır, ben soldakinin attığını alırım.
const SIRA_KOLTUK = [0, 1, 2, 3];  // benden kaç sonra oynuyor → hangi koltukta
const koltukNo = no => SIRA_KOLTUK[(no - ui.benimNo + 4) % 4];
const oyuncuNo = koltuk => (ui.benimNo + SIRA_KOLTUK[koltuk]) % 4;

// ---------- Menü ----------
function menuKur() {
  try {
    $('adim').value = localStorage.getItem(AD_ANAHTARI) ?? '';
  } catch (e) { /* boş */ }
  document.querySelectorAll('#elSayisi button').forEach(b => {
    b.onclick = () => {
      ui.ayar.elSayisi = +b.dataset.el;
      document.querySelectorAll('#elSayisi button').forEach(x => x.classList.toggle('secili', x === b));
      Ses.secim();
    };
  });
  document.querySelectorAll('#mod button').forEach(b => {
    b.onclick = () => {
      if (b.disabled) return;
      ui.ayar.mod = b.dataset.mod;
      document.querySelectorAll('#mod button').forEach(x => x.classList.toggle('secili', x === b));
      if (typeof Ag !== 'undefined') Ag.lobiGuncelle();
    };
  });
  $('yardimli').onchange = () => (ui.ayar.yardimli = $('yardimli').checked);
  $('adim').addEventListener('input', () => $('adim').classList.remove('eksik'));
  $('botlaBtn').onclick = () => {
    const ad = $('adim').value.trim().slice(0, 12);
    if (!ad) {
      $('adim').classList.add('eksik');
      $('adim').placeholder = 'Önce adını yaz 👈';
      $('adim').focus();
      Ses.hata();
      return;
    }
    try {
      localStorage.setItem(AD_ANAHTARI, ad);
    } catch (e) { /* hatırlanmasa da olur */ }
    Ses.motor();
    Ses.karistir();
    ui.yuvalar = Array(ISTAKA_YUVA).fill(null);
    $('menu').hidden = true;
    $('oyun').hidden = false;
    Masa = Motor;
    Motor.yeniOyun([ad, ...BOT_ADLARI], { elSayisi: ui.ayar.elSayisi, yardimli: ui.ayar.yardimli, esli: ui.ayar.mod === 'esli' });
  };
}

// ---------- Istakam: yuvalar ----------
function istakayiEsitle(el) {
  const ids = new Set(el.map(t => t.id));
  ui.yuvalar = ui.yuvalar.map(id => (ids.has(id) ? id : null));
  const yerde = new Set(ui.yuvalar.filter(id => id !== null));
  el.forEach(t => {
    if (yerde.has(t.id)) return;
    // Yeni gelen taş, son taşının sağında yer olan ilk sıraya konur (üstten başlayarak); yoksa ilk boşluğa
    let bos = -1;
    for (let r = 0; r < SATIR && bos < 0; r++) {
      const sira = ui.yuvalar.slice(r * SIRA, r * SIRA + SIRA);
      const son = sira.findLastIndex(id => id !== null);
      if (son < SIRA - 1) bos = r * SIRA + son + 1;
    }
    if (bos < 0 || ui.yuvalar[bos] !== null) bos = ui.yuvalar.indexOf(null);
    ui.yuvalar[bos] = t.id;
  });
}

// Taşı bir yuvaya taşı. Yuva doluysa o sıradaki taşlar boşluğa doğru kayar (gerçek ıstaka gibi).
function yuvayaTasi(id, hedef) {
  const y = ui.yuvalar;
  const kaynak = y.indexOf(id);
  if (kaynak === hedef) return;
  y[kaynak] = null;
  if (y[hedef] === null) {
    y[hedef] = id;
    return;
  }
  const bas = Math.floor(hedef / SIRA) * SIRA, son = bas + SIRA;
  let r = -1;
  for (let k = hedef + 1; k < son; k++) if (y[k] === null) { r = k; break; }
  if (r >= 0) {
    for (let k = r; k > hedef; k--) y[k] = y[k - 1];
  } else {
    let l = -1;
    for (let k = hedef - 1; k >= bas; k--) if (y[k] === null) { l = k; break; }
    if (l >= 0) {
      for (let k = l; k < hedef; k++) y[k] = y[k + 1];
    } else {
      y[kaynak] = y[hedef];  // sıra tamamen doluysa yer değiştir
    }
  }
  y[hedef] = id;
}

// Bir grubu (en sağdaki taşından tutulmuş) yuvaya taşı: grubun en sağdaki taşı hedef yuvaya gelir.
// Yer yoksa o sıradaki boşluklar kaydırılarak yer açılır; hiç yer yoksa grup yerinde kalır.
function grubuTasi(ids, hedef) {
  const eski = [...ui.yuvalar];
  const n = ids.length;
  ui.yuvalar = ui.yuvalar.map(id => (ids.includes(id) ? null : id));
  const satirBas = Math.floor(hedef / SIRA) * SIRA;
  const satir = ui.yuvalar.slice(satirBas, satirBas + SIRA);
  if (satir.filter(id => id === null).length < n) {
    ui.yuvalar = eski;
    return false;
  }
  const bas = Math.min(Math.max(hedef - n + 1, satirBas), satirBas + SIRA - n) - satirBas;
  const yeni = [...satir.slice(0, bas), ...ids, ...satir.slice(bas)];
  // Fazladan gelen n yuvayı boşluklardan sil: önce grubun sağındakiler, sonra solundakiler
  let silinecek = n;
  for (let k = bas + n; k < yeni.length && silinecek; k++) if (yeni[k] === null) { yeni.splice(k, 1); k--; silinecek--; }
  for (let k = bas - 1; k >= 0 && silinecek; k--) if (yeni[k] === null) { yeni.splice(k, 1); silinecek--; }
  ui.yuvalar.splice(satirBas, SIRA, ...yeni);
  return true;
}

// Istakada yan yana dizilmiş taş kümeleri (aralarında boşluk olanlar ayrı küme)
function istakaKumeleri() {
  const kumeler = [];
  for (let satir = 0; satir < SATIR; satir++) {
    let kume = [];
    for (let k = satir * SIRA; k < satir * SIRA + SIRA; k++) {
      const id = ui.yuvalar[k];
      if (id !== null && id !== undefined) kume.push(id);
      else if (kume.length) {
        kumeler.push(kume);
        kume = [];
      }
    }
    if (kume.length) kumeler.push(kume);
  }
  return kumeler;
}

// Yan yana dizili taşları geçerli gruplara böl. Tek grup olamıyorsa (örneğin 6'lı per diye bir şey yok)
// ardışık parçalara ayrılır: 7-7-7-7-7-7 → 7-7-7 + 7-7-7. Birden çok bölünüş varsa toplamı en yüksek olan seçilir.
function kumeyiBol(ts) {
  const o = Masa.oyun;
  const tek = K.grupCoz(ts, o.okey);
  let enIyi = tek ? [tek] : null;
  for (let k = 3; k <= ts.length - 3; k++) {
    const sol = K.grupCoz(ts.slice(0, k), o.okey);
    if (!sol) continue;
    const sag = kumeyiBol(ts.slice(k));
    if (!sag) continue;
    const aday = [sol, ...sag];
    const toplam = l => l.reduce((a, g) => a + g.deger, 0);
    if (!enIyi || toplam(aday) > toplam(enIyi)) enIyi = aday;
  }
  return enIyi;
}

// Istakada dizdiğin geçerli gruplar: seri için per/seri, çift için yan yana ikililer
function diziliGruplar(tur) {
  const o = Masa.oyun;
  const gruplar = [];
  istakaKumeleri().forEach(kume => {
    const ts = kume.map(tasBul);
    if (ts.some(t => !t)) return;
    if (tur === 'cift') {
      if (ts.length % 2) return;
      const ciftler = [];
      for (let k = 0; k < ts.length; k += 2) ciftler.push(K.ciftCoz([ts[k], ts[k + 1]], o.okey));
      if (ciftler.every(Boolean)) gruplar.push(...ciftler);
    } else {
      const parcalar = kumeyiBol(ts);
      if (parcalar) gruplar.push(...parcalar);
    }
  });
  return { gruplar, deger: gruplar.reduce((a, g) => a + g.deger, 0) };
}

// Tutulan taş, dizili bir grubun en sağındaysa bütün grubu ver (çiftte en sağdaki iki taş)
function tutulanGrup(id) {
  const o = Masa.oyun;
  const kume = istakaKumeleri().find(k => k.includes(id));
  if (!kume || kume.length < 2 || kume.at(-1) !== id) return [id];
  const ts = kume.map(tasBul);
  const parcalar = ts.every(Boolean) && kumeyiBol(ts);
  if (parcalar) return parcalar.at(-1).sirali.map(t => t.id).sort((a, b) => kume.indexOf(a) - kume.indexOf(b));
  if (kume.length % 2 === 0 && K.ciftCoz(ts.slice(-2), o.okey)) return kume.slice(-2);
  return [id];
}

// Grupları ıstakaya aralıklı diz (her grup arasında bir boşluk), kalanları sona
function istakayaDiz(gruplar, kalan) {
  const yeni = Array(ISTAKA_YUVA).fill(null);
  let i = 0;
  const sig = n => {
    const satirSonu = Math.floor(i / SIRA) * SIRA + SIRA;
    if (i + n > satirSonu && i % SIRA) i = satirSonu;  // grup satıra sığmıyorsa alt satıra
  };
  gruplar.forEach(g => {
    sig(g.length);
    g.forEach(t => (yeni[i++] = t.id));
    if (i % SIRA) i++;  // gruplar arasında bir boşluk (sıra bittiyse alttaki sıra boşlukla başlamasın)
  });
  kalan.forEach(t => {
    if (i >= ISTAKA_YUVA || yeni[i] !== null) i = yeni.indexOf(null);
    yeni[i++] = t.id;
  });
  ui.yuvalar = yeni;
  Ses.diz();
  ciz();
}

const benim = () => Masa.oyun.oyuncular[ui.benimNo];
const siraBende = () => Masa.oyun.asama === 'oyun' && Masa.oyun.sira === ui.benimNo;
const tasBul = id => benim().el.find(t => t.id === id);
// Soldan alınan taş hâlâ elimde mi? (online'da taşlar kopya olduğu için id ile bakılır)
const yandanElde = () => {
  const y = Masa.oyun.tur?.yandan;
  return !!y && benim().el.some(t => t.id === y.id);
};
// El sürerken bu elin puanı da toplama eklenmiş gösterilir (el bitince motor zaten ekliyor)
const anlikPuan = p => p.toplam + (Masa.oyun.asama === 'oyun' ? p.elPuani : 0);
// Eşli oyun: karşılıklı oturanlar (0-2, 1-3) eştir, takımın puanı iki eşin toplamı
const esliMi = () => !!Masa.oyun?.ayar.esli;
const esMi = (a, b) => esliMi() && a !== b && a % 2 === b % 2;
const takimPuani = (t, puan = anlikPuan) => [t, t + 2].reduce((a, i) => a + puan(Masa.oyun.oyuncular[i]), 0);
const takimAdi = t => `${guvenli(Masa.oyun.oyuncular[t].ad)} & ${guvenli(Masa.oyun.oyuncular[t + 2].ad)}`;

// HTML taş
function tasHtml(t, { islek = false, mini = false } = {}) {
  const o = Masa.oyun;
  const okey = K.jokerMi(t, o.okey);
  if (t.ters && okey) return `<div class="tas ters${mini ? ' mini' : ''}" data-id="${t.id}"></div>`;
  const ic = t.sahte
    ? '<span class="yildiz">★</span><span class="nokta" style="background:#1f9d48"></span>'
    : `<span class="sayi" style="color:${RENK_KODLARI[t.renk]}">${t.sayi}</span><span class="nokta" style="background:${RENK_KODLARI[t.renk]}"></span>`;
  return `<div class="tas${okey ? ' okey' : ''}${mini ? ' mini' : ''}${islek ? ' islek' : ''}" data-id="${t.id}">${ic}</div>`;
}

// ---------- Çizim ----------
function ciz() {
  const o = Masa.oyun;
  if (!o) return;
  const ben = benim();
  istakayiEsitle(ben.el);

  // 3D masa
  const koltuklar = [0, 1, 2, 3].map(k => {
    const no = oyuncuNo(k);
    const p = o.oyuncular[no];
    return { ad: p.ad, renk: KOLTUK_RENKLERI[no], tasSayisi: p.el.length, atilanlar: p.atilanlar, ikram: o.ikram?.[no] };
  });
  const tutulan = ui.surukle?.basladi && tasBul(ui.surukle.id);
  const isaretli = new Set(tutulan && ben.acti && siraBende() && o.ayar.yardimli && o.tur.cekti
    ? o.masa.filter(g => K.isleme(g, tutulan, o.okey)).map(g => g.id) : []);
  Sahne.ciz({
    koltuklar, gosterge: o.gosterge, desteSayisi: o.deste.length, masa: o.masa, benimNo: ui.benimNo, isaretli, koltukNo,
    okeyMi: t => K.jokerMi(t, o.okey),
  });

  // Üst bilgi
  $('elBilgi').textContent = `El ${o.elNo}/${o.ayar.elSayisi}`;
  $('esik').innerHTML = `Açmak için: <b>${Masa.gereken()}+</b>`
    + (esliMi() ? ` <span class="takimSkor">🤝 Biz <b>${takimPuani(ui.benimNo % 2)}</b> · Onlar <b>${takimPuani(1 - ui.benimNo % 2)}</b></span>` : '');

  // Oyuncu kartları (rakipler ıstakalarının yanında, ben altta)
  [0, 1, 2, 3].forEach(k => {
    const no = oyuncuNo(k);
    const p = o.oyuncular[no];
    const kutu = $(`koltuk${k}`);
    const puan = anlikPuan(p);
    const sirada = o.sira === no && o.asama === 'oyun';
    kutu.className = `koltuk${k ? ' rakip' : ''}${sirada ? ' sirada' : ''}${esMi(no, ui.benimNo) ? ' es' : ''}`;
    kutu.style.setProperty('--renk', KOLTUK_RENKLERI[no]);
    // Avatarda ismin son kelimesinin baş harfi ("Bot Zeynep" → Z)
    const harf = [...(p.ad.trim().split(/\s+/).at(-1) || '?')][0].toLocaleUpperCase('tr');
    const seste = typeof Ag !== 'undefined' && Ag.sesteMi(no);
    kutu.innerHTML = `<span class="avatar">${guvenli(harf)}${seste ? '<span class="mik" title="Sesli sohbette">🎙️</span>' : ''}`
      + `${p.uzakta ? '<span class="uyku" title="Oynamıyor: süresi 10 saniye">💤</span>' : ''}</span>`
      + `<span class="bilgi"><b>${guvenli(p.ad)}</b><span class="puan ${puan < 0 ? 'eksi' : ''}">${puan}</span></span>`;
  });
  kartlariYerlestir();

  if (o.tur) sayaciGoster(o.tur.kalan, o.tur.toplam);
  dugmeleriCiz();
  // Sürüklerken ıstakayı yeniden çizme (tutulan taş yerinden kopmasın); bırakınca çizilir
  if (ui.surukle) return;

  // Istakam
  const islekler = o.ayar.yardimli ? new Set(ben.el.filter(t => K.islekMi(t, o.masa, o.okey)).map(t => t.id)) : new Set();
  $('istaka').innerHTML = ui.yuvalar.slice(0, ISTAKA_YUVA).map((id, i) => {
    const t = id !== null && tasBul(id);
    return `<div class="yuva" data-yuva="${i}">${t ? tasHtml(t, { islek: islekler.has(t.id) }) : ''}</div>`;
  }).join('');
  if (yandanElde()) tasEl(o.tur.yandan.id)?.classList.add('yandan');
  if (ui.ucacak) {
    const { id, nereden } = ui.ucacak;
    ui.ucacak = null;
    ucur(id, nereden);
  } else if (ui.ucan && performance.now() < ui.ucan.bitis) {
    tasEl(ui.ucan.id)?.classList.add('gizli');  // uçuş sürerken yeniden çizildiyse yine gizle
  }
  if (ui.desteCek?.id != null) tasEl(ui.desteCek.id)?.classList.add('gizli');  // taş hâlâ parmakta
}

// Sağdaki yuvarlak sayaç: sıra bendeyken kalan süre
function sayaciGoster(kalan, toplam) {
  const o = Masa.oyun;
  const s = $('sayac');
  s.hidden = o.asama !== 'oyun' || o.sira !== ui.benimNo;  // sadece sıra bendeyken
  s.querySelector('b').textContent = Math.max(0, kalan);
  s.style.setProperty('--oran', Math.max(0, kalan / toplam));
  s.classList.toggle('az', kalan <= 10);
  s.style.boxShadow = `0 0 0 2px ${KOLTUK_RENKLERI[o.sira]}, 0 2px 8px #0008`;
  s.title = `${o.oyuncular[o.sira].ad} için kalan süre`;
}

// Rakip kartları ıstakalarının dış yanında durur (ekran dışına taşmasın, üst çubuğun altına girmesin)
const KART_YERI = { 1: { x: 4.45, y: 0.5, z: 0 }, 2: { x: 3.4, y: 0.5, z: -4.05 }, 3: { x: -4.45, y: 0.5, z: 0 } };  // karşıdakinin kartı ıstakanın sağ ucunda (yazıyı kapatmasın)
function kartlariYerlestir() {
  const ustAlt = $('ust').getBoundingClientRect().bottom;
  [1, 2, 3].forEach(k => {
    const kart = $(`koltuk${k}`);
    const p = Sahne.ekranda(KART_YERI[k]);
    const w = kart.offsetWidth / 2 + 4, h = kart.offsetHeight / 2 + 4;
    kart.style.left = `${Math.min(Math.max(p.x, w), innerWidth - w)}px`;
    kart.style.top = `${Math.min(Math.max(p.y, ustAlt + h), innerHeight - h)}px`;
  });
  balonlariYerlestir();
}

// ---------- Sohbet balonu ----------
// Yazılan mesaj, yazan oyuncunun kartının (isminin) üstünde konuşma balonu olarak 3 saniye görünür.
const BALON_SURESI = 3000;
const balonlar = new Map();  // oyuncu no → { el, zaman }
function balonGoster(no, metin) {
  if (!Masa.oyun || $('oyun').hidden) return false;
  const eski = balonlar.get(no);
  if (eski) {
    clearTimeout(eski.zaman);
    eski.el.remove();
  }
  const el = document.createElement('div');
  el.className = 'balon';
  el.textContent = metin;
  document.body.appendChild(el);
  const b = { el, zaman: setTimeout(() => {
    el.classList.add('gidiyor');
    setTimeout(() => el.remove(), 300);
    if (balonlar.get(no) === b) balonlar.delete(no);
  }, BALON_SURESI) };
  balonlar.set(no, b);
  balonlariYerlestir();
  return true;
}
function balonlariYerlestir() {
  balonlar.forEach(({ el }, no) => {
    const kart = $(`koltuk${koltukNo(no)}`);
    if (!kart) return;
    const r = kart.getBoundingClientRect();
    const yari = el.offsetWidth / 2 + 6;
    el.style.left = `${Math.min(Math.max(r.left + r.width / 2, yari), innerWidth - yari)}px`;
    el.style.top = `${Math.max(r.top - 8, el.offsetHeight + 4)}px`;
  });
}
// Kamera kendi resize dinleyicisinde güncellenir; kartlar ondan sonra (bir sonraki karede) yerleşsin
window.addEventListener('resize', () => setTimeout(() => Masa.oyun && ciz(), 30));  // telefon yan çevrilince sehpa yeri de değişir

const tasEl = id => document.querySelector(`#istaka .tas[data-id="${id}"]`);

function dugmeleriCiz() {
  const o = Masa.oyun;
  const ben = benim();
  const g = K.enIyiGruplar(ben.el, o.okey);
  const c = K.enIyiCiftler(ben.el, o.okey);
  const d = [];
  if (o.ayar.yardimli) {
    d.push(`<button data-e="seriDiz" class="ikinci">Seri diz <b>${g.deger}</b></button>`);
    d.push(`<button data-e="ciftDiz" class="ikinci">Çift diz <b>${c.ciftler.length}·${c.deger}</b></button>`);
  } else {
    // Yardımsız: otomatik dizme yok, ama kendi dizdiğin grupların toplamı yazılır (tek tek saymaya gerek yok)
    const ds = diziliGruplar('seri'), dc = diziliGruplar('cift');
    d.push(`<span class="diziliBilgi">Dizili: <b>${ds.deger}</b>${dc.gruplar.length ? ` · ${dc.gruplar.length} çift <b>${dc.deger}</b>` : ''}</span>`);
  }
  if (siraBende() && o.tur.cekti) {
    // Açma, ıstakada dizdiğin gruplara göre (düğmedeki sayı dizili olanların toplamı)
    const ds = diziliGruplar('seri'), dc = diziliGruplar('cift');
    if (!ben.acti) {
      d.push(`<button data-e="acSeri" ${ds.gruplar.length ? '' : 'disabled'}>Seri aç (${ds.deger})</button>`);
      d.push(`<button data-e="acCift" ${dc.gruplar.length >= K.CIFT_SAYISI ? '' : 'disabled'}>Çift aç (${dc.gruplar.length})</button>`);
    } else {
      const koyulacak = ben.acisTuru === 'cift' ? dc.gruplar.length : ds.gruplar.length;
      if (koyulacak) d.push(`<button data-e="${ben.acisTuru === 'cift' ? 'acCift' : 'acSeri'}">Yere koy</button>`);
      // Seri açtıysan ve yerde çift açılmışsa çiftlerini de koyabilirsin
      if (ben.acisTuru === 'seri' && dc.gruplar.length && o.masa.some(g => g.tur === 'cift')) d.push('<button data-e="acCift">Çiftleri koy</button>');
    }
    // Yardımlı modda uyan taşların hepsini tek basışla işle (yanlışsa "Geri al" hepsini geri getirir)
    if (ben.acti && o.ayar.yardimli && ben.el.some(t => !K.jokerMi(t, o.okey) && K.islekMi(t, o.masa, o.okey))) {
      d.push('<button data-e="hepsiniIsle">⚡ Hepsini işle</button>');
    }
    if (Masa.geriAlinabilir()) d.push('<button data-e="geriAl" class="uyariBtn">↶ Geri al</button>');
    if (yandanElde()) d.push('<button data-e="geri" class="uyariBtn">↩️ Geri bırak</button>');
  }
  $('eylemler').innerHTML = d.join('');
}

// ---------- Taş uçurma (desteden / yandan ıstakaya) ----------
function ucur(id, nereden) {
  const hedef = tasEl(id);
  if (!hedef) return;
  const kutu = hedef.getBoundingClientRect();
  const k = document.createElement('div');
  k.className = 'ucan';
  k.innerHTML = tasHtml(tasBul(id));
  Object.assign(k.style, { width: `${kutu.width}px`, height: `${kutu.height}px`, left: `${kutu.left}px`, top: `${kutu.top}px` });
  k.style.setProperty('--g', getComputedStyle($('istaka')).getPropertyValue('--g'));
  k.style.transform = `translate(${nereden.x - kutu.left - kutu.width / 2}px, ${nereden.y - kutu.top - kutu.height / 2}px) scale(.8)`;
  document.body.appendChild(k);
  hedef.classList.add('gizli');
  ui.ucan = { id, bitis: performance.now() + 480 };
  requestAnimationFrame(() => requestAnimationFrame(() => (k.style.transform = 'none')));
  setTimeout(() => {
    k.remove();
    ui.ucan = null;
    document.querySelectorAll('#istaka .tas.gizli').forEach(el => el.classList.remove('gizli'));
  }, 480);
}

// ---------- Mesajlar ----------
// Mesajlar ıstakanın üstündeki şeritte çıkar (masanın ortasını kapatmasın)
function mesaj(html, tur = '') {
  const kutu = $('mesaj');
  kutu.innerHTML = `<span>${html}</span>`;
  kutu.className = `gorunur ${tur}`;
  clearTimeout(ui.mesajZaman);
  ui.mesajZaman = setTimeout(() => (kutu.className = ''), tur === 'ceza' ? 3500 : 2600);
}

function sonuc(r) {
  if (!r.ok) {
    Ses.hata();
    mesaj(r.hata, 'hata');
  }
  return r.ok;
}

// ---------- Düğmeler ----------
function eylem(e) {
  const o = Masa.oyun;
  const ben = benim();
  if (e === 'seriDiz') {
    const g = K.enIyiGruplar(ben.el, o.okey);
    istakayaDiz(g.gruplar.map(x => x.sirali), g.kalan.sort((a, b) => a.renk - b.renk || a.sayi - b.sayi));
    mesaj(`Seri toplamın: <b>${g.deger}</b>${ben.acti ? '' : ` · açmak için ${Masa.gereken()} lazım`}`);
  } else if (e === 'ciftDiz') {
    const c = K.enIyiCiftler(ben.el, o.okey);
    istakayaDiz(c.ciftler.map(x => x.sirali), c.kalan.sort((a, b) => a.renk - b.renk || a.sayi - b.sayi));
    mesaj(`${c.ciftler.length} çift · toplam <b>${c.deger}</b>`);
  } else if (e === 'geri') {
    if (sonuc(Masa.geriBirak(ui.benimNo))) mesaj('Taşı geri bıraktın. Şimdi ortadaki desteye dokunup taş çek.');
  }
  else if (e === 'hepsiniIsle') {
    const r = hamle(() => Masa.hepsiniIsle(ui.benimNo));
    if (sonuc(r) && r.sayi) mesaj(`${r.sayi} taş işlendi. Yanlışsa “Geri al”.`, 'iyi');
  } else if (e === 'geriAl') {
    const once = ui.yuvaYigini.pop();
    if (once) ui.yuvalar = once;
    sonuc(Masa.geriAl(ui.benimNo));
  }
  else if (e === 'acSeri' || e === 'acCift') {
    const tur = e === 'acSeri' ? 'seri' : 'cift';
    const r = hamle(() => Masa.ac(ui.benimNo, tur, diziliGruplar(tur).gruplar.map(g => g.sirali.map(t => t.id))));
    const enIyi = K.enIyiGruplar(ben.el, o.okey).deger;
    if (!r.ok && !ben.acti && tur === 'seri' && enIyi >= Masa.gereken()) {
      Ses.hata();
      mesaj(`${r.hata}<br><small>İpucu: “Seri diz”e basarsan ${enIyi} oluyor.</small>`, 'hata');
    } else sonuc(r);
  }
}

// ---------- Taş çekme ----------
function ortadanCek() {
  const o = Masa.oyun;
  if (!siraBende()) return mesaj('Sıra sende değil.');
  if (o.tur.cekti) return mesaj('Bu tur taşını aldın. Şimdi bir taşı sağ alttaki köşeye sürükleyip at.');
  sonuc(Masa.ortadanCek(ui.benimNo));  // taş "cekti" olayında ıstakaya uçar
}

function yandanAl() {
  if (sonuc(Masa.yandanAl(ui.benimNo))) mesaj('Soldan aldın: bu taşla elini aç ya da işle. Olmazsa “Geri bırak”.');
}

// ---------- Sürükle-bırak ----------
// Basılı tut + kaydır: taş parmağını izler. Istakada bir yuvaya bırakırsan oraya yerleşir,
// sağ alttaki köşeye bırakırsan atılır, masadaki gruba bırakırsan işlenir.
// Elinde tek taş kaldıysa masanın herhangi bir yerine bırakınca atılır ve bitirirsin.
// Dizili bir grubun en sağdaki taşını tutarsan bütün grup taşınır (çiftte iki taş).
// Okeye kıpırdatmadan uzun basarsan ters döner.
// Not: sürükleme sürerken ıstaka yeniden çizilmez; telefonda tutulan taş sayfadan kalkarsa parmak hareketi kaybolur.
function surukleKur() {
  let uzun = null;
  $('istaka').addEventListener('pointerdown', e => {
    const el = e.target.closest('.tas');
    if (!el || ui.surukle) return;
    e.preventDefault();
    const id = +el.dataset.id;
    ui.surukle = { id, x0: e.clientX, y0: e.clientY, basladi: false, pid: e.pointerId };
    const t = tasBul(id);
    if (t && K.jokerMi(t, Masa.oyun.okey)) {
      uzun = setTimeout(() => {
        if (!ui.surukle || ui.surukle.basladi) return;
        Masa.tersCevir(ui.benimNo, t.id);
        ui.surukle = null;
        Ses.secim();
        mesaj(t.ters ? 'Okey ters çevrildi 🙈 (yere de ters gider)' : 'Okey açıldı');
        ciz();
      }, 550);
    }
  });

  document.addEventListener('pointermove', e => {
    const s = ui.surukle;
    if (!s || e.pointerId !== s.pid) return;
    if (!s.basladi) {
      if (Math.hypot(e.clientX - s.x0, e.clientY - s.y0) < 6) return;
      clearTimeout(uzun);
      s.basladi = true;
      s.grup = tutulanGrup(s.id);
      const el = tasEl(s.id);
      const kutu = el.getBoundingClientRect();
      const adim = s.grup.length > 1 ? tasEl(s.grup[1]).getBoundingClientRect().left - tasEl(s.grup[0]).getBoundingClientRect().left : kutu.width;
      s.hayalet = document.createElement('div');
      s.hayalet.className = 'ucan tutulan';
      s.hayalet.innerHTML = s.grup.map(id => tasHtml(tasBul(id))).join('');
      Object.assign(s.hayalet.style, {
        width: `${kutu.width + adim * (s.grup.length - 1)}px`, height: `${kutu.height}px`,
        display: 'grid', gridTemplateColumns: `repeat(${s.grup.length}, ${kutu.width}px)`, columnGap: `${adim - kutu.width}px`,
      });
      s.hayalet.style.setProperty('--g', getComputedStyle($('istaka')).getPropertyValue('--g'));
      // Parmak, hayalet içinde tutulan taşın (en sağdakinin) üstünde dursun
      s.dx = s.x0 - kutu.left + adim * (s.grup.length - 1);
      s.dy = s.y0 - kutu.top;
      document.body.appendChild(s.hayalet);
      s.grup.forEach(id => tasEl(id)?.classList.add('tutuluyor'));
      s.atabilir = s.grup.length === 1 && siraBende() && Masa.oyun.tur.cekti;
      if (s.atabilir) Sahne.atmaYeri(true);
      Ses.secim();
      ciz();
    }
    s.hayalet.style.left = `${e.clientX - s.dx}px`;
    s.hayalet.style.top = `${e.clientY - s.dy}px`;
    if (s.atabilir) Sahne.atmaYeri(true, atmaHalkasiBuyukMu(e.clientX, e.clientY, s.id));
    // Istakada üstünden geçilen yuvayı göster
    document.querySelectorAll('.yuva.hedef').forEach(y => y.classList.remove('hedef'));
    document.elementFromPoint(e.clientX, e.clientY)?.closest('.yuva')?.classList.add('hedef');
  });

  const bitir = e => {
    const s = ui.surukle;
    if (!s || e.pointerId !== s.pid) return;
    clearTimeout(uzun);
    ui.surukle = null;
    if (!s.basladi) return;
    s.hayalet.remove();
    Sahne.atmaYeri(false);
    if (e.type === 'pointerup') birak(s, e.clientX, e.clientY);
    ciz();
  };
  document.addEventListener('pointerup', bitir);
  document.addEventListener('pointercancel', bitir);
}

// ---------- Desteden parmakla taş çekme ----------
// Ortadaki desteye basıp kaydırınca taş parmağını izler. Istakada bir yuvaya bırakırsan oraya yerleşir;
// yarı yolda (başka bir yere) bırakırsan kendiliğinden ıstakaya uçar. Sadece dokunursan eskisi gibi uçar.
function desteSurukleKur() {
  $('sahne').addEventListener('pointerdown', e => {
    const o = Masa.oyun;
    if (!o || o.asama !== 'oyun' || ui.surukle || ui.desteCek) return;
    if (!siraBende() || o.tur.cekti || !Sahne.desteUstunde(e.clientX, e.clientY)) return;
    ui.desteCek = { pid: e.pointerId, x0: e.clientX, y0: e.clientY, basladi: false, hayalet: null, id: null, birakilan: null };
  });

  document.addEventListener('pointermove', e => {
    const s = ui.desteCek;
    if (!s || e.pointerId !== s.pid || s.birakilan) return;
    if (!s.basladi) {
      if (Math.hypot(e.clientX - s.x0, e.clientY - s.y0) < 8) return;
      s.basladi = true;
      Sahne.tiklamayiIptal();
      // Önce sırtı görünen bir taş tutulur; çekilen taş gelince yüzü görünür
      const g = $('istaka').querySelector('.yuva').getBoundingClientRect();
      s.hayalet = document.createElement('div');
      s.hayalet.className = 'ucan tutulan';
      s.hayalet.innerHTML = '<div class="tas ters"></div>';
      Object.assign(s.hayalet.style, { width: `${g.width}px`, height: `${g.height}px` });
      s.hayalet.style.setProperty('--g', getComputedStyle($('istaka')).getPropertyValue('--g'));
      s.dx = g.width / 2;
      s.dy = g.height * 0.7;
      document.body.appendChild(s.hayalet);
      if (!sonuc(Masa.ortadanCek(ui.benimNo))) {
        s.hayalet.remove();
        ui.desteCek = null;
        return;
      }
    }
    s.hayalet.style.left = `${e.clientX - s.dx}px`;
    s.hayalet.style.top = `${e.clientY - s.dy}px`;
    document.querySelectorAll('.yuva.hedef').forEach(y => y.classList.remove('hedef'));
    document.elementFromPoint(e.clientX, e.clientY)?.closest('#istaka .yuva')?.classList.add('hedef');
  });

  const bitir = e => {
    const s = ui.desteCek;
    if (!s || e.pointerId !== s.pid || s.birakilan) return;
    if (!s.basladi) {
      ui.desteCek = null;  // sadece dokunuş: masaya dokunma olarak işlenir (taş uçar)
      return;
    }
    const kutu = s.hayalet.getBoundingClientRect();
    s.hayalet.remove();
    document.querySelectorAll('.yuva.hedef').forEach(y => y.classList.remove('hedef'));
    const nereden = { x: kutu.left + kutu.width / 2, y: kutu.top + kutu.height / 2 };
    if (s.id == null) {
      // Online'da taş henüz gelmedi: gelince bırakılan yerden ıstakaya uçar
      s.birakilan = nereden;
      return;
    }
    ui.desteCek = null;
    const yuva = e.type === 'pointerup' && document.elementFromPoint(e.clientX, e.clientY)?.closest('#istaka .yuva');
    istakayiEsitle(benim().el);
    if (!benim().el.some(t => t.id === s.id)) return ciz();  // bu arada süre dolup atıldıysa
    if (yuva) {
      yuvayaTasi(s.id, +yuva.dataset.yuva);
      Ses.secim();
    } else ui.ucacak = { id: s.id, nereden };
    ciz();
  };
  document.addEventListener('pointerup', bitir);
  document.addEventListener('pointercancel', bitir);
}

// Bırakılan noktanın atma köşesine (sağ alt) uzaklığı; köşedeki yığının üstündeyse 0
function koseUzakligi(x, y) {
  const n = Sahne.noktada(x, y);
  if (n.tik?.tur === 'atilan' && n.tik.koltuk === 0) return 0;
  const [kx, kz] = Sahne.KOSE[0];
  return Math.hypot(n.x - kx, n.z - kz);
}
const atmaYerindeMi = (x, y) => koseUzakligi(x, y) < 1.6;

// Halka büyüdüyse bırakınca taş atılır: köşeye yakınsa ve taş tam üstünde durduğu gruba uymuyorsa.
// Sürüklerken halkanın büyümesi ve bırakınca ne olacağı bu tek kurala bağlı (ikisi hep aynı).
function atmaHalkasiBuyukMu(x, y, id) {
  if (!atmaYerindeMi(x, y)) return false;
  const o = Masa.oyun;
  const n = Sahne.noktada(x, y);
  const t = tasBul(id);
  return !(n.tik?.tur === 'grup' && t && K.isleme(o.masa.find(g => g.id === n.tik.id), t, o.okey));
}

function birak(s, x, y) {
  const o = Masa.oyun;
  const id = s.id;
  const ust = document.elementFromPoint(x, y);
  const yuva = ust?.closest('#istaka .yuva');
  if (yuva) {
    if (s.grup.length > 1) {
      if (!grubuTasi(s.grup, +yuva.dataset.yuva)) mesaj('O sırada grup için yer yok.');
    } else yuvayaTasi(id, +yuva.dataset.yuva);
    Ses.secim();
    return;
  }
  if (s.grup.length > 1) return;  // grup sadece ıstakada taşınır
  // Düğmenin ya da üst çubuğun üstüne bırakıldıysa geri döner; alttaki boş yerler masa sayılır
  if (!ust || ust.closest('button, #istaka, #ust')) return;
  const n = Sahne.noktada(x, y);
  const sonTas = benim().el.length === 1;
  // Öncelik: köşeye yakınsa at; değilse taşın uyduğu gruba (üstündeki ya da en yakın) işle.
  // Köşenin yanındaki rakip gruplarına yanlışlıkla işlenmesin diye köşe önce gelir.
  const t = tasBul(id);
  const uyar = gid => K.isleme(o.masa.find(g => g.id === gid), t, o.okey);
  const ustundeki = n.tik?.tur === 'grup' ? n.tik.id : null;
  const yakin = Sahne.yakinGruplar(n.x, n.z, 1.1).find(uyar);
  const grupId = ustundeki && uyar(ustundeki) ? ustundeki : yakin || null;
  const atilacak = atmaHalkasiBuyukMu(x, y, id);
  const at = () => {
    if (!siraBende()) return mesaj('Sıra sende değil.');
    if (!o.tur.cekti) return mesaj('Önce ortadan ya da soldan taş al.');
    sonuc(Masa.at(ui.benimNo, id));
  };
  const isle = gid => {
    if (!siraBende()) return mesaj('Sıra sende değil.');
    // Okeyi serinin hangi ucuna bıraktıysan oraya konur (2-3-4-5'in soluna bırakırsan 1 olur)
    sonuc(hamle(() => Masa.isle(ui.benimNo, id, gid, Sahne.grupUcu(gid, n.x, n.z))));
  };
  if (siraBende() && o.tur.cekti && sonTas) {
    // Son taşı ortaya fırlat: el biter
    sonuc(Masa.at(ui.benimNo, id));
  } else if (atilacak) {
    at();
  } else if (grupId) {
    isle(grupId);
  } else if (ustundeki) {
    isle(ustundeki);  // uymuyorsa nedenini söyler
  } else if (siraBende() && o.tur.cekti) {
    mesaj('Atmak için taşı sağ alttaki yeşil halkaya bırak.');
  }
}

// ---------- 3D masaya dokunuş: deste, atılan taşlar ----------
function masaDokunus(h) {
  const o = Masa.oyun;
  if (!o || o.asama !== 'oyun') return;
  if (h.tur === 'deste') ortadanCek();
  else if (h.tur === 'atilan') {
    if (siraBende() && !o.tur.cekti && h.koltuk === 3) return yandanAl();
    if (o.ayar.yardimli) atilanlariGoster(oyuncuNo(h.koltuk));
    else mesaj('Atılan taşları görmek için yardımlı modu aç. Aklında tut! 🧠');
  } else if (h.tur === 'grup') {
    mesaj('İşlemek için ıstakandaki taşı tutup bu gruba sürükle.');
  } else if (h.tur === 'ikram' && h.koltuk === 0) {
    // Kendi çayından bir yudum / tostundan bir ısırık
    const kalan = o.ikram?.[ui.benimNo]?.[h.ne];
    if (kalan > 0) Masa.ikram(ui.benimNo, h.ne, 'tuket');
    else mesaj(`${KANTIN[h.ne].simge} Bitti.`);
  }
}

function atilanlariGoster(no) {
  const p = Masa.oyun.oyuncular[no];
  $('atilanListe').innerHTML = p.atilanlar.length ? p.atilanlar.map(t => tasHtml(t, { mini: true })).join('') : '<p>Henüz taş atmadı.</p>';
  $('atilanEkrani').hidden = false;
}

// ---------- Kantin (süs) ----------
// Fiyatlar motordakilerle aynı (söyleyenin hesabına borç yazılır)
const KANTIN = {
  cay: { ad: 'Çay', simge: '🫖', aciklama: 'İnce belli bardakta, taze demlenmiş', fiyat: 25 },
  kahve: { ad: 'Türk kahvesi', simge: '☕', aciklama: 'Orta şekerli, köpüklü', fiyat: 40 },
  su: { ad: 'Su', simge: '💧', aciklama: 'Soğuk, küçük şişe', fiyat: 15 },
  simit: { ad: 'Simit', simge: '🥯', aciklama: 'Susamlı, çıtır', fiyat: 20 },
  tost: { ad: 'Kaşarlı tost', simge: '🥪', aciklama: 'Bol kaşarlı, ızgarada', fiyat: 150 },
};
function kantiniAc() {
  const o = Masa.oyun;
  $('kantinListe').innerHTML = Object.entries(KANTIN).map(([ne, u]) => `<button class="urun" data-ne="${ne}">`
    + `<span class="simge">${u.simge}</span><span class="bilgi"><b>${u.ad}</b><small>${u.aciklama}</small></span>`
    + `<span class="soyle">${u.fiyat} TL</span></button>`).join('');
  // Hesap: kim ne aldı, ne kadar borcu var
  const satirlar = o.oyuncular.map((p, i) => {
    const k = o.ikram?.[i] ?? {};
    const neler = Object.entries(k.adet ?? {}).map(([ne, n]) => `${KANTIN[ne].simge}×${n}`).join(' ');
    return `<tr class="${i === ui.benimNo ? 'ben' : ''}"><td><span class="nokta" style="background:${KOLTUK_RENKLERI[i]}"></span>${guvenli(p.ad)}</td>`
      + `<td>${neler || '–'}</td><td><b>${k.borc ?? 0} TL</b></td></tr>`;
  }).join('');
  const toplam = o.oyuncular.reduce((a, p, i) => a + (o.ikram?.[i]?.borc ?? 0), 0);
  $('kantinHesap').innerHTML = `<tr><th>Hesap</th><th>Aldıkları</th><th>Borç</th></tr>${satirlar}<tr class="toplam"><td>Masa toplamı</td><td></td><td><b>${toplam} TL</b></td></tr>`;
  $('kantin').hidden = false;
}

// ---------- Motor olayları ----------
function olay(tip, v) {
  const o = Masa.oyun;
  const ad = no => guvenli(o.oyuncular[no].ad);
  if (tip === 'sira') {
    ui.yuvaYigini = [];
    if (v.no === ui.benimNo) {
      Ses.siraSende();
      mesaj(o.tur.cekti
        ? 'İlk sen başlıyorsun: 15 taşın var. Bir taşı sağ alttaki köşeye sürükleyip at.'
        : 'Sıra sende! Ortadaki desteye dokun ya da soldaki taşı al.');
    }
  } else if (tip === 'cekti') {
    Ses.cek();
    // Benim çektiğim taş desteden (ya da soldan) ıstakama uçar
    const dc = ui.desteCek;
    if (v.no === ui.benimNo && v.tas && dc?.basladi && !v.yandan) {  // sadece gerçekten sürükleniyorsa (dokunuşta taş uçar)
      dc.id = v.tas.id;
      if (dc.birakilan) {
        // Taş sunucudan gelmeden parmak kalktıysa: bırakılan yerden ıstakaya uçar
        ui.ucacak = { id: v.tas.id, nereden: dc.birakilan };
        ui.desteCek = null;
      } else if (dc.hayalet) dc.hayalet.innerHTML = tasHtml(v.tas);
    } else if (v.no === ui.benimNo && v.tas) ui.ucacak = { id: v.tas.id, nereden: Sahne.ekranda(v.yandan ? 3 : 'deste') };
    if (v.no !== ui.benimNo && v.yandan) mesaj(`${ad(v.no)} yandan aldı`);
  } else if (tip === 'atti') {
    Ses.at();
  } else if (tip === 'acti') {
    Ses.ac();
    mesaj(`${ad(v.no)} ${v.tur === 'cift' ? 'çift' : 'seri'} açtı: <b>${v.deger}</b>`, 'iyi');
  } else if (tip === 'geriAldi') {
    Ses.diz();
    mesaj('Geri alındı ↶');
  } else if (tip === 'ceza') {
    if (v.puan > 0) Ses.ceza();
    mesaj(`${v.puan > 0 ? 'Ceza +' : 'Düşer '}${v.puan} · ${guvenli(v.neden)}`, v.puan > 0 ? 'ceza' : 'iyi');
  } else if (tip === 'sure') {
    const yuzde = Math.max(0, v.kalan / (v.toplam || Masa.TUR_SURESI));
    $('sureCubugu').style.width = `${yuzde * 100}%`;
    $('sureCubugu').classList.toggle('az', v.kalan <= 10);
    sayaciGoster(v.kalan, v.toplam || Masa.TUR_SURESI);
    if (v.no === ui.benimNo) {
      // Süre azalınca ses hızlanır: son 10 saniyede saniyede bir, son 6 saniyede yarım saniyede bir,
      // son 3 saniyede çeyrek saniyede bir
      if (v.kalan <= 10 && v.kalan > 0) {
        const kac = v.kalan <= 3 ? 4 : v.kalan <= 6 ? 2 : 1;
        for (let k = 0; k < kac; k++) {
          setTimeout(() => {
            const o2 = Masa.oyun;
            if (o2.asama === 'oyun' && o2.sira === ui.benimNo && o2.tur.kalan === v.kalan) Ses.sayac();
          }, (k * 1000) / kac);
        }
      }
    }
  } else if (tip === 'ikram') {
    const u = KANTIN[v.ne];
    if (v.islem === 'siparis') {
      Ses.cayGeldi();
      mesaj(v.no === ui.benimNo ? `${u.simge} ${u.ad} geldi, afiyet olsun!` : `${u.simge} ${ad(v.no)} ${u.ad.toLocaleLowerCase('tr')} söyledi`);
    } else {
      Ses[['cay', 'kahve', 'su'].includes(v.ne) ? 'yudum' : 'isirik']();
    }
  } else if (tip === 'uzakta') {
    mesaj(v.no === ui.benimNo
      ? '💤 Süren bitti. Bir hamle yapana kadar turların 10 saniye sürecek.'
      : `💤 ${ad(v.no)} oynamıyor: turları 10 saniye sürecek.`);
  } else if (tip === 'sureBitti' && v.no === ui.benimNo) {
    mesaj('⏰ Süren bitti: ortadan çekildi, perine girmeyen en küçük taşın atıldı.', 'hata');
  } else if (tip === 'elBitti' || tip === 'oyunBitti') {
    Ses[v.tip === 'bitis' && v.no === ui.benimNo ? 'bitis' : 'at']();
    setTimeout(() => elSonuGoster(tip === 'oyunBitti'), 900);
  }
}

// ---------- Puanlar: cezalar ve düşerler ayrı ayrı ----------
const toplamla = (liste, isaret) => liste.filter(g => Math.sign(g.puan) === isaret).reduce((a, g) => a + g.puan, 0);

// El el puan tablosu: her oyuncunun altında "Ceza" ve "Düşer" diye iki sütun var.
// Her elin satırında o elde yediği ceza (kırmızı) ve aldığı düşer (yeşil) yazar; toplam en altta.
// Henüz oynanmamış ellerde – görünür.
function elTablosuHtml() {
  const o = Masa.oyun;
  const oyuncular = o.oyuncular.map((p, i) => ({ p, i }));
  const harf = p => [...(p.ad.trim().split(/\s+/).at(-1) || '?')][0].toLocaleUpperCase('tr');
  const bas = '<tr><th rowspan="2" class="elBas">El</th>' + oyuncular.map(({ p, i }) => `<th colspan="2" class="oyuncu${i === ui.benimNo ? ' ben' : ''}">`
    + `<span class="harf" style="background:${KOLTUK_RENKLERI[i]}">${guvenli(harf(p))}</span>`
    + `<span class="isim">${guvenli(p.ad)}</span></th>`).join('') + '</tr>'
    + '<tr class="altBaslik">' + oyuncular.map(() => '<th class="arti">Ceza</th><th class="eksi">Düşer</th>').join('') + '</tr>';
  const birikim = oyuncular.map(() => 0);
  let govde = '';
  for (let el = 1; el <= o.ayar.elSayisi; el++) {
    const oynandi = el <= o.elNo;
    const sinif = `${el === o.elNo && o.asama === 'oyun' ? 'suren' : ''}${oynandi ? '' : ' oynanmadi'}`;
    let ust = '';
    oyuncular.forEach(({ p }, k) => {
      if (!oynandi) {
        ust += '<td class="sifir">–</td><td class="sifir">–</td>';
        return;
      }
      const kayit = p.gecmis.filter(g => g.el === el);
      const ceza = toplamla(kayit, 1), duser = toplamla(kayit, -1);
      birikim[k] += ceza + duser;
      ust += `<td class="${ceza ? 'arti' : 'sifir'}">${ceza ? `+${ceza}` : '0'}</td><td class="${duser ? 'eksi' : 'sifir'}">${duser || '0'}</td>`;
    });
    govde += `<tr class="elSatiri ${sinif}"><td class="elNo">${el}</td>${ust}</tr>`;
  }
  // En düşük toplam önde: 👑 (herkes eşitse kimse)
  const enAz = Math.min(...birikim);
  const herkesEsit = birikim.every(b => b === enAz);
  if (o.ayar.esli) {
    // Eşli: kişi toplamları ve altında takım toplamı (taç kazanan takımda)
    const takim = birikim.map((b, i) => b + birikim[(i + 2) % 4]);
    const enAzT = Math.min(...takim);
    const tEsit = takim.every(t => t === enAzT);
    const son = '<tr class="toplamSatir"><td>Kişi</td>' + birikim.map(b => `<td colspan="2"><b>${b}</b></td>`).join('') + '</tr>'
      + '<tr class="toplamSatir takimSatiri"><td>Takım</td>' + takim.map((t, i) => `<td colspan="2"><b class="takim t${i % 2}">${t === enAzT && !tEsit ? '👑 ' : ''}${t}</b></td>`).join('') + '</tr>';
    return `<thead>${bas}</thead><tbody>${govde}${son}</tbody>`;
  }
  const son = '<tr class="toplamSatir"><td>Toplam</td>' + birikim.map(b => `<td colspan="2"><b>${b === enAz && !herkesEsit ? '👑 ' : ''}${b}</b></td>`).join('') + '</tr>';
  return `<thead>${bas}</thead><tbody>${govde}${son}</tbody>`;
}

// Ceza ve düşerlerin nedenleri (iki ayrı liste)
function puanTablosuHtml(kayitSec) {
  const o = Masa.oyun;
  const hepsi = o.oyuncular.flatMap(kayitSec);
  const liste = (isaret, bos) => {
    const l = hepsi.filter(g => Math.sign(g.puan) === isaret).reverse();
    return l.length ? `<ul>${l.map(g => `<li><b>${g.puan > 0 ? '+' : ''}${g.puan}</b> ${guvenli(g.neden)}${o.ayar.elSayisi > 1 ? ` <small>(el ${g.el})</small>` : ''}</li>`).join('')}</ul>` : `<p>${bos}</p>`;
  };
  return {
    tablo: elTablosuHtml(),
    detay: `<div class="listeler"><div class="liste cezalar"><h3>🔺 Cezalar</h3>${liste(1, 'Ceza yok.')}</div>`
      + `<div class="liste duserler"><h3>🔻 Düşerler</h3>${liste(-1, 'Düşer yok.')}</div></div>`,
  };
}

function elSonuGoster(son) {
  const o = Masa.oyun;
  const s = o.sonuc;
  const baslik = s.tip === 'deste' ? '🀫 Deste bitti' : `🏁 ${guvenli(o.oyuncular[s.no].ad)} ${guvenli(s.neden)}`;
  const kazanan = [...o.oyuncular].sort((a, b) => a.toplam - b.toplam)[0];
  const kazananTakim = takimPuani(0, p => p.toplam) <= takimPuani(1, p => p.toplam) ? 0 : 1;
  $('elSonuBaslik').innerHTML = !son ? baslik
    : o.ayar.esli ? `🏆 ${takimAdi(kazananTakim)} kazandı!${kazananTakim === ui.benimNo % 2 ? ' 🎉' : ''}`
      : `🏆 ${guvenli(kazanan.ad)} kazandı!`;
  const h = son ? puanTablosuHtml(p => p.gecmis) : puanTablosuHtml(p => p.gecmis.filter(g => g.el === o.elNo));
  $('elSonuTablo').innerHTML = h.tablo;
  $('elSonuDetay').innerHTML = (son ? kantinHesabiYazisi() : '') + h.detay;
  $('sonrakiElBtn').textContent = son ? 'Ana menü'
    : Masa === Motor ? `Sonraki el (${o.elNo + 1}/${o.ayar.elSayisi})` : 'Tamam (yeni eli oda sahibi başlatır)';
  $('elSonu').hidden = false;
  if (son) Ses.kazanma();
}

// Oyun sonu: yenilen (puanı en yüksek olan) masadaki herkesin kantin hesabını öder
function kantinHesabiYazisi() {
  const o = Masa.oyun;
  const toplam = o.oyuncular.reduce((a, p, i) => a + (o.ikram?.[i]?.borc ?? 0), 0);
  if (!toplam) return '';
  if (o.ayar.esli) {
    // Eşli: yenilen takımın iki eşi yarı yarıya öder
    const yenilenT = takimPuani(0, p => p.toplam) > takimPuani(1, p => p.toplam) ? 0 : 1;
    const metin = yenilenT === ui.benimNo % 2
      ? `😅 Yenildiğiniz için masadaki herkesin hesabını eşinle yarı yarıya ödüyorsunuz!<br>Toplam borcunuz: <b>${toplam} TL</b> · kişi başı <b>${(toplam / 2).toLocaleString('tr')} TL</b>. Bir dahakine kaptırmayın!`
      : `🧾 ${takimAdi(yenilenT)} yenildi, kantin hesabı onlardan!<br>Toplam: <b>${toplam} TL</b> · kişi başı <b>${(toplam / 2).toLocaleString('tr')} TL</b>. Afiyet olsun 😄`;
    return `<div class="hesapKutusu">${metin}</div>`;
  }
  const yenilen = o.oyuncular.reduce((en, p, i) => (p.toplam > o.oyuncular[en].toplam ? i : en), 0);
  const metin = yenilen === ui.benimNo
    ? `😅 Yenildiğin için masadaki herkesin hesabını sen ödüyorsun!<br>Toplam borcunuz: <b>${toplam} TL</b>. Bir dahakine kaptırma!`
    : `🧾 ${guvenli(o.oyuncular[yenilen].ad)} yenildi, kantin hesabı ondan!<br>Toplam borç: <b>${toplam} TL</b>. Afiyet olsun 😄`;
  return `<div class="hesapKutusu">${metin}</div>`;
}

function puanTablosu() {
  const o = Masa.oyun;
  $('elSonuBaslik').textContent = `📊 Puanlar (El ${o.elNo}/${o.ayar.elSayisi})`;
  const h = puanTablosuHtml(p => p.gecmis);
  $('elSonuTablo').innerHTML = h.tablo;
  $('elSonuDetay').innerHTML = h.detay;
  $('sonrakiElBtn').textContent = 'Kapat';
  ui.tabloAcik = true;
  $('elSonu').hidden = false;
}

// ---------- Başlangıç ----------
$('istaka').style.setProperty('--sira', SIRA);
$('istaka').classList.toggle('dar', DAR_EKRAN);
Sahne.baslat($('sahne'));
Sahne.tiklayinca(masaDokunus);
// Oda sahibiysem her değişiklik ve olay odadakilere de gider
Motor.dinleyici('degisti', () => {
  ciz();
  if (typeof Ag !== 'undefined') Ag.durumYay();
});
Motor.dinleyici('olay', (tip, v) => {
  olay(tip, v);
  if (typeof Ag !== 'undefined') Ag.olayYay(tip, v);
});
surukleKur();
desteSurukleKur();
$('eylemler').addEventListener('click', e => {
  const b = e.target.closest('button[data-e]');
  if (b && !b.disabled) eylem(b.dataset.e);
});
$('sonrakiElBtn').onclick = () => {
  $('elSonu').hidden = true;
  if (ui.tabloAcik) {
    ui.tabloAcik = false;
    return;
  }
  if (Masa.oyun.asama === 'bitti') (typeof Ag !== 'undefined' ? Ag.ayril() : location.reload());
  else if (Masa === Motor) {
    Ses.karistir();
    Motor.sonrakiEl();
  }
  // Odaya katılan oyuncu: yeni eli oda sahibi başlatır, gelince ekran kendiliğinden geçer
};
$('puanBtn').onclick = puanTablosu;
$('kantinBtn').onclick = kantiniAc;
$('kantinKapat').onclick = () => ($('kantin').hidden = true);
$('kantinListe').addEventListener('click', e => {
  const b = e.target.closest('.urun');
  if (!b || !Masa.oyun) return;
  Masa.ikram(ui.benimNo, b.dataset.ne, 'siparis');
  $('kantin').hidden = true;
});
$('atilanKapat').onclick = () => ($('atilanEkrani').hidden = true);
$('sesBtn').onclick = () => ($('sesBtn').textContent = Ses.acKapa() ? '🔊' : '🔇');
$('sesBtn').textContent = Ses.acik ? '🔊' : '🔇';
$('menuBtn').onclick = () => {
  const mod = typeof Ag !== 'undefined' ? Ag.mod : 'yerel';
  $('cikisMetni').textContent = mod === 'ev' ? 'Oda kapanır, arkadaşların da oyundan çıkar.'
    : mod === 'misafir' ? 'Yerine bot oynar. Aynı adla odaya geri girersen kaldığın yerden devam edersin.' : 'Bu oyun biter.';
  $('cikisEkrani').hidden = false;
};
$('cikisHayir').onclick = () => ($('cikisEkrani').hidden = true);
$('cikisEvet').onclick = () => (typeof Ag !== 'undefined' ? Ag.ayril() : location.reload());
// iPhone'da çift dokunuşla ya da iki parmakla yakınlaşma olmasın
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
menuKur();
