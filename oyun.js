// =============================================================
// Kaptirik - ekran: menü, ıstakam, sürükle-bırak, süre, mesajlar ve puan tablosu
// Oyunun kuralları motor.js'te; burası sadece gösterir ve dokunuşları motora iletir.
//
// Oynanış: ortadaki desteye dokun → taş ıstakana uçar. Sağdaki oyuncunun attığı taşa dokun → yandan alırsın.
// Atmak için taşı sol alttaki köşeye sürükle. İşlemek için taşı masadaki gruba sürükle.
// Istakada taşları parmağınla tutup istediğin yere taşırsın.
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
};

// Ekrandaki koltuklar: 0 alt (ben), 1 sağ, 2 üst, 3 sol. Sıra benden sonra soldakine geçer:
// soldaki benim attığımı alır, ben sağdakinin attığını alırım.
const SIRA_KOLTUK = [0, 3, 2, 1];  // benden kaç sonra oynuyor → hangi koltukta
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
    const ad = $('adim').value.trim().slice(0, 12) || 'Sen';
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
    // Yeni gelen taş, ıstakadaki son taşın hemen sağındaki boşluğa konur
    const son = ui.yuvalar.findLastIndex(id => id !== null);
    let bos = ui.yuvalar.indexOf(null, son + 1);
    if (bos < 0) bos = ui.yuvalar.indexOf(null);
    ui.yuvalar[bos >= 0 ? bos : ui.yuvalar.length] = t.id;
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

  // Istakam
  const islekler = ui.ayar.yardimli ? new Set(ben.el.filter(t => K.islekMi(t, o.masa, o.okey)).map(t => t.id)) : new Set();
  $('istaka').innerHTML = ui.yuvalar.slice(0, ISTAKA_YUVA).map((id, i) => {
    const t = id !== null && tasBul(id);
    return `<div class="yuva" data-yuva="${i}">${t ? tasHtml(t, { islek: islekler.has(t.id) }) : ''}</div>`;
  }).join('');
  if (ui.surukle?.basladi) tasEl(ui.surukle.id)?.classList.add('tutuluyor');
  if (o.tur?.yandan && ben.el.includes(o.tur.yandan)) tasEl(o.tur.yandan.id)?.classList.add('yandan');
  if (ui.ucacak) {
    const { id, nereden } = ui.ucacak;
    ui.ucacak = null;
    ucur(id, nereden);
  }

  dugmeleriCiz();
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
    if (!ben.acti) {
      d.push(`<button data-e="acSeri" ${g.deger >= Motor.gereken() ? '' : 'disabled'}>Seri aç (${g.deger})</button>`);
      d.push(`<button data-e="acCift" ${c.ciftler.length >= K.CIFT_SAYISI ? '' : 'disabled'}>Çift aç (${c.ciftler.length})</button>`);
    } else {
      const koyulacak = ben.acisTuru === 'cift' ? c.ciftler.length : g.gruplar.length;
      if (koyulacak) d.push(`<button data-e="${ben.acisTuru === 'cift' ? 'acCift' : 'acSeri'}">Yere koy</button>`);
    }
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
  hedef.style.visibility = 'hidden';
  requestAnimationFrame(() => requestAnimationFrame(() => (k.style.transform = 'none')));
  setTimeout(() => {
    k.remove();
    const el = tasEl(id);
    if (el) el.style.visibility = '';
  }, 480);
}

// ---------- Mesajlar ----------
function mesaj(html, tur = '') {
  const kutu = $('mesaj');
  kutu.innerHTML = html;
  kutu.className = tur;
  kutu.hidden = false;
  clearTimeout(ui.mesajZaman);
  ui.mesajZaman = setTimeout(() => (kutu.hidden = true), tur === 'ceza' ? 3500 : 2400);
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
  else if (e === 'acSeri') sonuc(Motor.ac(ui.benimNo, 'seri'));
  else if (e === 'acCift') sonuc(Motor.ac(ui.benimNo, 'cift'));
}

// ---------- Taş çekme ----------
function ortadanCek() {
  const o = Motor.oyun;
  if (!siraBende()) return mesaj('Sıra sende değil.');
  if (o.tur.cekti) return mesaj('Bu tur taşını aldın. Şimdi bir taşı sol alttaki köşeye sürükleyip at.');
  const nereden = Sahne.ekranda('deste');
  const r = Motor.ortadanCek(ui.benimNo);
  if (sonuc(r) && r.tas) ui.ucacak = { id: r.tas.id, nereden };
  ciz();
}

function yandanAl() {
  const nereden = Sahne.ekranda(1);
  const r = Motor.yandanAl(ui.benimNo);
  if (sonuc(r)) {
    ui.ucacak = { id: r.tas.id, nereden };
    ciz();
    mesaj('Yandan aldın: bu taşla elini aç ya da işle. Olmazsa “Geri bırak”.');
  }
}

// ---------- Sürükle-bırak ----------
// Basılı tut + kaydır: taş parmağını izler. Istakada bir yuvaya bırakırsan oraya yerleşir,
// sol alttaki köşeye bırakırsan atılır, masadaki gruba bırakırsan işlenir.
// Okeye kıpırdatmadan uzun basarsan ters döner.
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
      const el = tasEl(s.id);
      const kutu = el.getBoundingClientRect();
      s.hayalet = document.createElement('div');
      s.hayalet.className = 'ucan tutulan';
      s.hayalet.innerHTML = tasHtml(tasBul(s.id));
      Object.assign(s.hayalet.style, { width: `${kutu.width}px`, height: `${kutu.height}px` });
      s.hayalet.style.setProperty('--g', getComputedStyle($('istaka')).getPropertyValue('--g'));
      s.dx = s.x0 - kutu.left;
      s.dy = s.y0 - kutu.top;
      document.body.appendChild(s.hayalet);
      s.atabilir = siraBende() && Motor.oyun.tur.cekti;
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
    if (e.type === 'pointerup') birak(s.id, e.clientX, e.clientY);
    ciz();
  };
  document.addEventListener('pointerup', bitir);
  document.addEventListener('pointercancel', bitir);
}

// Bırakılan nokta atma köşesine (sol alt) yakın mı?
function atmaYerindeMi(x, y) {
  const n = Sahne.noktada(x, y);
  if (n.tik?.tur === 'atilan' && n.tik.koltuk === 0) return true;
  const [kx, kz] = Sahne.KOSE[0];
  return Math.hypot(n.x - kx, n.z - kz) < 1.3;
}

function birak(id, x, y) {
  const o = Motor.oyun;
  const ust = document.elementFromPoint(x, y);
  const yuva = ust?.closest('#istaka .yuva');
  if (yuva) {
    yuvayaTasi(id, +yuva.dataset.yuva);
    Ses.secim();
    return;
  }
  if (!ust || ust.closest('#alt, #ust, #rakipler')) return;  // ıstaka dışı ama masada değil: geri döner
  const n = Sahne.noktada(x, y);
  if (n.tik?.tur === 'grup') {
    if (!siraBende()) return mesaj('Sıra sende değil.');
    sonuc(Motor.isle(ui.benimNo, id, n.tik.id));
  } else if (atmaYerindeMi(x, y)) {
    if (!siraBende()) return mesaj('Sıra sende değil.');
    if (!o.tur.cekti) return mesaj('Önce ortadan ya da sağdan taş al.');
    sonuc(Motor.at(ui.benimNo, id));
  } else if (siraBende() && o.tur.cekti) {
    mesaj('Atmak için taşı sol alttaki yeşil halkaya bırak.');
  }
}

// ---------- 3D masaya dokunuş: deste, atılan taşlar ----------
function masaDokunus(h) {
  const o = Motor.oyun;
  if (!o || o.asama !== 'oyun') return;
  if (h.tur === 'deste') ortadanCek();
  else if (h.tur === 'atilan') {
    if (siraBende() && !o.tur.cekti && h.koltuk === 1) return yandanAl();
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
    if (v.no === ui.benimNo) {
      Ses.siraSende();
      mesaj(o.tur.cekti
        ? 'İlk sen başlıyorsun: 15 taşın var. Bir taşı sol alttaki köşeye sürükleyip at.'
        : 'Sıra sende! Ortadaki desteye dokun ya da sağdaki taşı al.');
    }
  } else if (tip === 'cekti') {
    Ses.cek();
    if (v.no !== ui.benimNo && v.yandan) mesaj(`${ad(v.no)} yandan aldı`);
  } else if (tip === 'atti') {
    Ses.at();
  } else if (tip === 'acti') {
    Ses.ac();
    mesaj(`${ad(v.no)} ${v.tur === 'cift' ? 'çift' : 'seri'} açtı: <b>${v.deger}</b>`, 'iyi');
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
