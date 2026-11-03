// =============================================================
// Kaptirik - ekran: menü, ıstakam, sürükle-bırak, süre, mesajlar ve puan tablosu
// Oyunun kuralları motor.js'te; burası sadece gösterir ve dokunuşları motora iletir.
//
// Oynanış: ortadaki desteye dokun → taş ıstakana uçar. Soldaki oyuncunun attığı taşa dokun → yandan alırsın.
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
const ISTAKA_YUVA = 30;   // 2 sıra x 15 yuva
const AD_ANAHTARI = 'kaptirik.ad';
const guvenli = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

const ui = {
  benimNo: 0,
  yuvalar: Array(ISTAKA_YUVA).fill(null),  // ıstakamdaki taş id'leri (boş yuva = null)
  surukle: null,      // sürüklenen taş: { id, hayalet, x0, y0, basladi }
  ayar: { elSayisi: 5, yardimli: true, mod: 'essiz' },
  mesajZaman: null,
  ucacak: null,       // ıstakaya uçarak gelecek taş: { id, nereden }
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
    };
  });
  $('yardimli').onchange = () => (ui.ayar.yardimli = $('yardimli').checked);
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
    Motor.yeniOyun([ad, ...BOT_ADLARI], { elSayisi: ui.ayar.elSayisi, yardimli: ui.ayar.yardimli });
  };
}

// ---------- Istakam: yuvalar ----------
function istakayiEsitle(el) {
  const ids = new Set(el.map(t => t.id));
  ui.yuvalar = ui.yuvalar.map(id => (ids.has(id) ? id : null));
  const yerde = new Set(ui.yuvalar.filter(id => id !== null));
  el.forEach(t => {
    if (yerde.has(t.id)) return;
    // Yeni gelen taş üst sıradaki son taşın sağına konur; üst sıra doluysa alt sıraya, en son ilk boşluğa
    const sonUst = ui.yuvalar.slice(0, 15).findLastIndex(id => id !== null);
    let bos = sonUst < 14 ? sonUst + 1 : -1;
    if (bos < 0) {
      const sonAlt = ui.yuvalar.findLastIndex(id => id !== null);
      bos = sonAlt >= 15 && sonAlt < 29 ? sonAlt + 1 : ui.yuvalar.indexOf(null, 15);
    }
    if (bos < 0) bos = ui.yuvalar.indexOf(null);
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
  const bas = Math.floor(hedef / 15) * 15, son = bas + 15;
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
  const satirBas = Math.floor(hedef / 15) * 15;
  const satir = ui.yuvalar.slice(satirBas, satirBas + 15);
  if (satir.filter(id => id === null).length < n) {
    ui.yuvalar = eski;
    return false;
  }
  const bas = Math.min(Math.max(hedef - n + 1, satirBas), satirBas + 15 - n) - satirBas;
  const yeni = [...satir.slice(0, bas), ...ids, ...satir.slice(bas)];
  // Fazladan gelen n yuvayı boşluklardan sil: önce grubun sağındakiler, sonra solundakiler
  let silinecek = n;
  for (let k = bas + n; k < yeni.length && silinecek; k++) if (yeni[k] === null) { yeni.splice(k, 1); k--; silinecek--; }
  for (let k = bas - 1; k >= 0 && silinecek; k--) if (yeni[k] === null) { yeni.splice(k, 1); silinecek--; }
  ui.yuvalar.splice(satirBas, 15, ...yeni);
  return true;
}

// Istakada yan yana dizilmiş taş kümeleri (aralarında boşluk olanlar ayrı küme)
function istakaKumeleri() {
  const kumeler = [];
  for (let satir = 0; satir < 2; satir++) {
    let kume = [];
    for (let k = satir * 15; k < satir * 15 + 15; k++) {
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

// Istakada dizdiğin geçerli gruplar: seri için per/seri, çift için yan yana ikililer
function diziliGruplar(tur) {
  const o = Motor.oyun;
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
      const g = K.grupCoz(ts, o.okey);
      if (g) gruplar.push(g);
    }
  });
  return { gruplar, deger: gruplar.reduce((a, g) => a + g.deger, 0) };
}

// Tutulan taş, dizili bir grubun en sağındaysa bütün grubu ver (çiftte en sağdaki iki taş)
function tutulanGrup(id) {
  const o = Motor.oyun;
  const kume = istakaKumeleri().find(k => k.includes(id));
  if (!kume || kume.length < 2 || kume.at(-1) !== id) return [id];
  const ts = kume.map(tasBul);
  if (K.grupCoz(ts, o.okey)) return kume;
  if (kume.length % 2 === 0 && K.ciftCoz(ts.slice(-2), o.okey)) return kume.slice(-2);
  return [id];
}

// Grupları ıstakaya aralıklı diz (her grup arasında bir boşluk), kalanları sona
function istakayaDiz(gruplar, kalan) {
  const yeni = Array(ISTAKA_YUVA).fill(null);
  let i = 0;
  const sig = n => {
    const satirSonu = Math.floor(i / 15) * 15 + 15;
    if (i + n > satirSonu && i % 15) i = satirSonu;  // grup satıra sığmıyorsa alt satıra
  };
  gruplar.forEach(g => {
    sig(g.length);
    g.forEach(t => (yeni[i++] = t.id));
    i++;
  });
  kalan.forEach(t => {
    if (i >= ISTAKA_YUVA || yeni[i] !== null) i = yeni.indexOf(null);
    yeni[i++] = t.id;
  });
  ui.yuvalar = yeni;
  Ses.diz();
  ciz();
}

const benim = () => Motor.oyun.oyuncular[ui.benimNo];
const siraBende = () => Motor.oyun.asama === 'oyun' && Motor.oyun.sira === ui.benimNo;
const tasBul = id => benim().el.find(t => t.id === id);
// El sürerken bu elin puanı da toplama eklenmiş gösterilir (el bitince motor zaten ekliyor)
const anlikPuan = p => p.toplam + (Motor.oyun.asama === 'oyun' ? p.elPuani : 0);

// HTML taş
function tasHtml(t, { islek = false, mini = false } = {}) {
  const o = Motor.oyun;
  const okey = K.jokerMi(t, o.okey);
  if (t.ters && okey) return `<div class="tas ters${mini ? ' mini' : ''}" data-id="${t.id}"></div>`;
  const ic = t.sahte
    ? '<span class="yildiz">★</span>'
    : `<span class="sayi" style="color:${RENK_KODLARI[t.renk]}">${t.sayi}</span><span class="nokta" style="background:${RENK_KODLARI[t.renk]}"></span>`;
  return `<div class="tas${okey ? ' okey' : ''}${mini ? ' mini' : ''}" data-id="${t.id}">${ic}${islek ? '<span class="islek">işlek</span>' : ''}</div>`;
}

// ---------- Çizim ----------
function ciz() {
  const o = Motor.oyun;
  if (!o) return;
  const ben = benim();
  istakayiEsitle(ben.el);

  // 3D masa
  const koltuklar = [0, 1, 2, 3].map(k => {
    const no = oyuncuNo(k);
    const p = o.oyuncular[no];
    return { ad: p.ad, renk: KOLTUK_RENKLERI[no], tasSayisi: p.el.length, atilanlar: p.atilanlar };
  });
  const tutulan = ui.surukle?.basladi && tasBul(ui.surukle.id);
  const isaretli = new Set(tutulan && ben.acti && siraBende() && ui.ayar.yardimli && o.tur.cekti
    ? o.masa.filter(g => K.isleme(g, tutulan, o.okey)).map(g => g.id) : []);
  Sahne.ciz({
    koltuklar, gosterge: o.gosterge, desteSayisi: o.deste.length, masa: o.masa, benimNo: ui.benimNo, isaretli, koltukNo,
    okeyMi: t => K.jokerMi(t, o.okey),
  });

  // Üst bilgi
  $('elBilgi').textContent = `El ${o.elNo}/${o.ayar.elSayisi}`;
  $('gostergeKutu').innerHTML = `<small>Gösterge</small>${tasHtml(o.gosterge, { mini: true })}<small>Okey</small>${tasHtml({ id: -1, ...o.okey, sahte: false }, { mini: true })}`;
  $('esik').innerHTML = `Açmak için: <b>${Motor.gereken()}+</b>${Motor.kimseAcmadi() ? '' : ' · çift: ' + (Motor.gereken() + (Motor.gereken() % 2)) + '+'}`;

  // Oyuncu kutuları (rakipler üstte: sol, karşı, sağ; ben altta)
  [0, 1, 2, 3].forEach(k => {
    const no = oyuncuNo(k);
    const p = o.oyuncular[no];
    const kutu = $(`koltuk${k}`);
    const puan = anlikPuan(p);
    const sirada = o.sira === no && o.asama === 'oyun';
    kutu.className = `koltuk k${k}${sirada ? ' sirada' : ''}`;
    kutu.style.setProperty('--renk', KOLTUK_RENKLERI[no]);
    kutu.innerHTML = `<span class="yon">${['', '➡️', '⬆️', '⬅️'][k]}</span><b>${guvenli(p.ad)}</b><span class="puan ${puan < 0 ? 'eksi' : ''}">${puan}</span>`
      + (p.acti ? `<span class="acti">${p.acisTuru === 'cift' ? 'ÇİFT' : 'AÇTI'}</span>` : '')
      + `<span class="sn">${sirada ? o.tur.kalan : ''}</span>`;
  });

  dugmeleriCiz();
  // Sürüklerken ıstakayı yeniden çizme (tutulan taş yerinden kopmasın); bırakınca çizilir
  if (ui.surukle) return;

  // Istakam
  const islekler = ui.ayar.yardimli ? new Set(ben.el.filter(t => K.islekMi(t, o.masa, o.okey)).map(t => t.id)) : new Set();
  $('istaka').innerHTML = ui.yuvalar.slice(0, ISTAKA_YUVA).map((id, i) => {
    const t = id !== null && tasBul(id);
    return `<div class="yuva" data-yuva="${i}">${t ? tasHtml(t, { islek: islekler.has(t.id) }) : ''}</div>`;
  }).join('');
  if (o.tur?.yandan && ben.el.includes(o.tur.yandan)) tasEl(o.tur.yandan.id)?.classList.add('yandan');
  if (ui.ucacak) {
    const { id, nereden } = ui.ucacak;
    ui.ucacak = null;
    ucur(id, nereden);
  } else if (ui.ucan && performance.now() < ui.ucan.bitis) {
    tasEl(ui.ucan.id)?.classList.add('gizli');  // uçuş sürerken yeniden çizildiyse yine gizle
  }
}

const tasEl = id => document.querySelector(`#istaka .tas[data-id="${id}"]`);

function dugmeleriCiz() {
  const o = Motor.oyun;
  const ben = benim();
  const g = K.enIyiGruplar(ben.el, o.okey);
  const c = K.enIyiCiftler(ben.el, o.okey);
  const d = [];
  d.push(`<button data-e="seriDiz" class="ikinci">Seri diz <b>${g.deger}</b></button>`);
  d.push(`<button data-e="ciftDiz" class="ikinci">Çift diz <b>${c.ciftler.length}·${c.deger}</b></button>`);
  if (siraBende() && o.tur.cekti) {
    // Açma, ıstakada dizdiğin gruplara göre (düğmedeki sayı dizili olanların toplamı)
    const ds = diziliGruplar('seri'), dc = diziliGruplar('cift');
    if (!ben.acti) {
      d.push(`<button data-e="acSeri" ${ds.gruplar.length ? '' : 'disabled'}>Seri aç (${ds.deger})</button>`);
      d.push(`<button data-e="acCift" ${dc.gruplar.length >= K.CIFT_SAYISI ? '' : 'disabled'}>Çift aç (${dc.gruplar.length})</button>`);
    } else {
      const koyulacak = ben.acisTuru === 'cift' ? dc.gruplar.length : ds.gruplar.length;
      if (koyulacak) d.push(`<button data-e="${ben.acisTuru === 'cift' ? 'acCift' : 'acSeri'}">Yere koy</button>`);
    }
    if (Motor.geriAlinabilir()) d.push('<button data-e="geriAl" class="uyariBtn">↶ Geri al</button>');
    if (o.tur.yandan && ben.el.includes(o.tur.yandan)) d.push('<button data-e="geri" class="uyariBtn">↩️ Geri bırak</button>');
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
  const o = Motor.oyun;
  const ben = benim();
  if (e === 'seriDiz') {
    const g = K.enIyiGruplar(ben.el, o.okey);
    istakayaDiz(g.gruplar.map(x => x.sirali), g.kalan.sort((a, b) => a.renk - b.renk || a.sayi - b.sayi));
    mesaj(`Seri toplamın: <b>${g.deger}</b>${ben.acti ? '' : ` · açmak için ${Motor.gereken()} lazım`}`);
  } else if (e === 'ciftDiz') {
    const c = K.enIyiCiftler(ben.el, o.okey);
    istakayaDiz(c.ciftler.map(x => x.sirali), c.kalan.sort((a, b) => a.renk - b.renk || a.sayi - b.sayi));
    mesaj(`${c.ciftler.length} çift · toplam <b>${c.deger}</b>`);
  } else if (e === 'geri') sonuc(Motor.geriBirak(ui.benimNo));
  else if (e === 'geriAl') {
    const once = ui.yuvaYigini.pop();
    if (once) ui.yuvalar = once;
    sonuc(Motor.geriAl(ui.benimNo));
  }
  else if (e === 'acSeri' || e === 'acCift') {
    const tur = e === 'acSeri' ? 'seri' : 'cift';
    const r = hamle(() => Motor.ac(ui.benimNo, tur, diziliGruplar(tur).gruplar.map(g => g.sirali.map(t => t.id))));
    const enIyi = K.enIyiGruplar(ben.el, o.okey).deger;
    if (!r.ok && !ben.acti && tur === 'seri' && enIyi >= Motor.gereken()) {
      Ses.hata();
      mesaj(`${r.hata}<br><small>İpucu: “Seri diz”e basarsan ${enIyi} oluyor.</small>`, 'hata');
    } else sonuc(r);
  }
}

// ---------- Taş çekme ----------
function ortadanCek() {
  const o = Motor.oyun;
  if (!siraBende()) return mesaj('Sıra sende değil.');
  if (o.tur.cekti) return mesaj('Bu tur taşını aldın. Şimdi bir taşı sağ alttaki köşeye sürükleyip at.');
  const nereden = Sahne.ekranda('deste');
  const r = Motor.ortadanCek(ui.benimNo);
  if (sonuc(r) && r.tas) ui.ucacak = { id: r.tas.id, nereden };
  ciz();
}

function yandanAl() {
  const nereden = Sahne.ekranda(3);
  const r = Motor.yandanAl(ui.benimNo);
  if (sonuc(r)) {
    ui.ucacak = { id: r.tas.id, nereden };
    ciz();
    mesaj('Soldan aldın: bu taşla elini aç ya da işle. Olmazsa “Geri bırak”.');
  }
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
    if (t && K.jokerMi(t, Motor.oyun.okey)) {
      uzun = setTimeout(() => {
        if (!ui.surukle || ui.surukle.basladi) return;
        t.ters = !t.ters;
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
      s.atabilir = s.grup.length === 1 && siraBende() && Motor.oyun.tur.cekti;
      if (s.atabilir) Sahne.atmaYeri(true);
      Ses.secim();
      ciz();
    }
    s.hayalet.style.left = `${e.clientX - s.dx}px`;
    s.hayalet.style.top = `${e.clientY - s.dy}px`;
    if (s.atabilir) Sahne.atmaYeri(true, atmaYerindeMi(e.clientX, e.clientY));
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

// Bırakılan nokta atma köşesine (sağ alt) yakın mı?
function atmaYerindeMi(x, y) {
  const n = Sahne.noktada(x, y);
  if (n.tik?.tur === 'atilan' && n.tik.koltuk === 0) return true;
  const [kx, kz] = Sahne.KOSE[0];
  return Math.hypot(n.x - kx, n.z - kz) < 1.4;
}

function birak(s, x, y) {
  const o = Motor.oyun;
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
  if (!ust || ust.closest('#alt, #ust')) return;  // ıstaka dışı ama masada değil: geri döner
  const n = Sahne.noktada(x, y);
  const sonTas = benim().el.length === 1;
  // İşlenecek grup: tam üstüne bırakıldıysa o; değilse taşın uyduğu en yakın grup (parmak tam isabet etmeyebilir)
  const t = tasBul(id);
  const uyar = gid => K.isleme(o.masa.find(g => g.id === gid), t, o.okey);
  const ustundeki = n.tik?.tur === 'grup' ? n.tik.id : null;
  const yakin = Sahne.yakinGruplar(n.x, n.z, 1.1).find(uyar);
  const grupId = ustundeki && uyar(ustundeki) ? ustundeki : (!atmaYerindeMi(x, y) && yakin) || null;
  if (siraBende() && o.tur.cekti && sonTas) {
    // Son taşı ortaya fırlat: el biter
    sonuc(Motor.at(ui.benimNo, id));
  } else if (grupId || ustundeki) {
    if (!siraBende()) return mesaj('Sıra sende değil.');
    sonuc(hamle(() => Motor.isle(ui.benimNo, id, grupId ?? ustundeki)));
  } else if (atmaYerindeMi(x, y)) {
    if (!siraBende()) return mesaj('Sıra sende değil.');
    if (!o.tur.cekti) return mesaj('Önce ortadan ya da soldan taş al.');
    sonuc(Motor.at(ui.benimNo, id));
  } else if (siraBende() && o.tur.cekti) {
    mesaj('Atmak için taşı sağ alttaki yeşil halkaya bırak.');
  }
}

// ---------- 3D masaya dokunuş: deste, atılan taşlar ----------
function masaDokunus(h) {
  const o = Motor.oyun;
  if (!o || o.asama !== 'oyun') return;
  if (h.tur === 'deste') ortadanCek();
  else if (h.tur === 'atilan') {
    if (siraBende() && !o.tur.cekti && h.koltuk === 3) return yandanAl();
    if (o.ayar.yardimli) atilanlariGoster(oyuncuNo(h.koltuk));
    else mesaj('Atılan taşları görmek için yardımlı modu aç. Aklında tut! 🧠');
  } else if (h.tur === 'grup') {
    mesaj('İşlemek için ıstakandaki taşı tutup bu gruba sürükle.');
  }
}

function atilanlariGoster(no) {
  const p = Motor.oyun.oyuncular[no];
  $('atilanBaslik').textContent = `${p.ad} attıkları (eskiden yeniye)`;
  $('atilanListe').innerHTML = p.atilanlar.length ? p.atilanlar.map(t => tasHtml(t, { mini: true })).join('') : '<p>Henüz taş atmadı.</p>';
  $('atilanEkrani').hidden = false;
}

// ---------- Motor olayları ----------
function olay(tip, v) {
  const o = Motor.oyun;
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
    const yuzde = Math.max(0, v.kalan / Motor.TUR_SURESI);
    $('sureCubugu').style.width = `${yuzde * 100}%`;
    $('sureCubugu').classList.toggle('az', v.kalan <= 10);
    const sn = $(`koltuk${koltukNo(v.no)}`).querySelector('.sn');
    if (sn) sn.textContent = v.kalan;
    if (v.no === ui.benimNo) {
      if (v.kalan <= 5 && v.kalan > 0) Ses.uyari();
      else if (v.kalan <= 10) Ses.tik();
    }
  } else if (tip === 'sureBitti' && v.no === ui.benimNo) {
    mesaj('⏰ Süren bitti: ortadan çekildi, perine girmeyen en küçük taşın atıldı.', 'hata');
  } else if (tip === 'elBitti' || tip === 'oyunBitti') {
    Ses[v.tip === 'bitis' && v.no === ui.benimNo ? 'bitis' : 'at']();
    setTimeout(() => elSonuGoster(tip === 'oyunBitti'), 900);
  }
}

// ---------- Puanlar: cezalar ve düşerler ayrı ayrı ----------
const toplamla = (liste, isaret) => liste.filter(g => Math.sign(g.puan) === isaret).reduce((a, g) => a + g.puan, 0);

function puanTablosuHtml(kayitSec, toplamSec) {
  const o = Motor.oyun;
  const satirlar = o.oyuncular.map((p, i) => ({ p, i, kayit: kayitSec(p), toplam: toplamSec(p) }))
    .sort((a, b) => a.toplam - b.toplam);
  const tablo = '<tr><th></th><th>Ceza</th><th>Düşer</th><th>Toplam</th></tr>'
    + satirlar.map((s, k) => `<tr class="${s.i === ui.benimNo ? 'ben' : ''}"><td>${k + 1}. ${guvenli(s.p.ad)}</td>`
      + `<td class="arti">${toplamla(s.kayit, 1) ? '+' + toplamla(s.kayit, 1) : '–'}</td>`
      + `<td class="eksi">${toplamla(s.kayit, -1) || '–'}</td><td><b>${s.toplam}</b></td></tr>`).join('');
  const hepsi = o.oyuncular.flatMap(kayitSec);
  const liste = (isaret, bos) => {
    const l = hepsi.filter(g => Math.sign(g.puan) === isaret).reverse();
    return l.length ? `<ul>${l.map(g => `<li><b>${g.puan > 0 ? '+' : ''}${g.puan}</b> ${guvenli(g.neden)}${o.ayar.elSayisi > 1 ? ` <small>(el ${g.el})</small>` : ''}</li>`).join('')}</ul>` : `<p>${bos}</p>`;
  };
  return {
    tablo,
    detay: `<div class="listeler"><div class="liste cezalar"><h3>🔺 Cezalar</h3>${liste(1, 'Ceza yok.')}</div>`
      + `<div class="liste duserler"><h3>🔻 Düşerler</h3>${liste(-1, 'Düşer yok.')}</div></div>`,
  };
}

function elSonuGoster(son) {
  const o = Motor.oyun;
  const s = o.sonuc;
  const baslik = s.tip === 'deste' ? '🀫 Deste bitti' : `🏁 ${guvenli(o.oyuncular[s.no].ad)} ${guvenli(s.neden)}`;
  const kazanan = [...o.oyuncular].sort((a, b) => a.toplam - b.toplam)[0];
  $('elSonuBaslik').innerHTML = son ? `🏆 ${guvenli(kazanan.ad)} kazandı!` : baslik;
  const h = son ? puanTablosuHtml(p => p.gecmis, p => p.toplam) : puanTablosuHtml(p => p.gecmis.filter(g => g.el === o.elNo), p => p.toplam);
  $('elSonuTablo').innerHTML = h.tablo;
  $('elSonuDetay').innerHTML = h.detay;
  $('sonrakiElBtn').textContent = son ? 'Ana menü' : `Sonraki el (${o.elNo + 1}/${o.ayar.elSayisi})`;
  $('elSonu').hidden = false;
  if (son) Ses.kazanma();
}

function puanTablosu() {
  const o = Motor.oyun;
  $('elSonuBaslik').textContent = `📊 Puanlar (El ${o.elNo}/${o.ayar.elSayisi})`;
  const h = puanTablosuHtml(p => p.gecmis, anlikPuan);
  $('elSonuTablo').innerHTML = h.tablo;
  $('elSonuDetay').innerHTML = h.detay;
  $('sonrakiElBtn').textContent = 'Kapat';
  ui.tabloAcik = true;
  $('elSonu').hidden = false;
}

// ---------- Başlangıç ----------
Sahne.baslat($('sahne'));
Sahne.tiklayinca(masaDokunus);
Motor.dinleyici('degisti', () => ciz());
Motor.dinleyici('olay', olay);
surukleKur();
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
  if (Motor.oyun.asama === 'bitti') location.reload();
  else {
    Ses.karistir();
    Motor.sonrakiEl();
  }
};
$('puanBtn').onclick = puanTablosu;
$('atilanKapat').onclick = () => ($('atilanEkrani').hidden = true);
$('sesBtn').onclick = () => ($('sesBtn').textContent = Ses.acKapa() ? '🔊' : '🔇');
$('sesBtn').textContent = Ses.acik ? '🔊' : '🔇';
$('menuBtn').onclick = () => ($('cikisEkrani').hidden = false);
$('cikisHayir').onclick = () => ($('cikisEkrani').hidden = true);
$('cikisEvet').onclick = () => location.reload();
// iPhone'da çift dokunuşla ya da iki parmakla yakınlaşma olmasın
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
menuKur();
