// =============================================================
// Kaptırık - ekran: menü, ıstakam, düğmeler, süre, mesajlar ve puan tablosu
// Oyunun kuralları motor.js'te; burası sadece gösterir ve dokunuşları motora iletir.
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
  secili: null,       // seçili taş id
  ayar: { elSayisi: 5, yardimli: true, mod: 'essiz' },
  mesajZaman: null,
};

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
    Motor.yeniOyun([ad, ...BOT_ADLARI], { elSayisi: ui.ayar.elSayisi, yardimli: ui.ayar.yardimli });
    $('menu').hidden = true;
    $('oyun').hidden = false;
  };
}

// ---------- Istakam: yuvalar ----------
function istakayiEsitle(el) {
  const ids = new Set(el.map(t => t.id));
  ui.yuvalar = ui.yuvalar.map(id => (ids.has(id) ? id : null));
  const yerde = new Set(ui.yuvalar.filter(Boolean));
  el.forEach(t => {
    if (yerde.has(t.id)) return;
    const bos = ui.yuvalar.indexOf(null);
    ui.yuvalar[bos >= 0 ? bos : ui.yuvalar.length] = t.id;
  });
  if (!ids.has(ui.secili)) ui.secili = null;
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
    if (i >= ISTAKA_YUVA) i = yeni.indexOf(null);
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
    const p = o.oyuncular[(ui.benimNo + k) % 4];
    return { ad: p.ad, renk: KOLTUK_RENKLERI[(ui.benimNo + k) % 4], tasSayisi: p.el.length, atilanlar: p.atilanlar };
  });
  const secili = ui.secili && tasBul(ui.secili);
  const isaretli = new Set(secili && ben.acti && siraBende() && ui.ayar.yardimli && o.tur.cekti
    ? o.masa.filter(g => K.isleme(g, secili, o.okey)).map(g => g.id) : []);
  Sahne.ciz({
    koltuklar, gosterge: o.gosterge, desteSayisi: o.deste.length, masa: o.masa, benimNo: ui.benimNo, isaretli,
    okeyMi: t => K.jokerMi(t, o.okey),
  });

  // Üst bilgi
  $('elBilgi').textContent = `El ${o.elNo}/${o.ayar.elSayisi}`;
  $('gostergeKutu').innerHTML = `<small>Gösterge</small>${tasHtml(o.gosterge, { mini: true })}<small>Okey</small>${tasHtml({ id: -1, ...o.okey, sahte: false }, { mini: true })}`;
  $('esik').innerHTML = `Açmak için: <b>${Motor.gereken()}+</b>${Motor.kimseAcmadi() ? '' : ' · çift: ' + (Motor.gereken() + (Motor.gereken() % 2)) + '+'}`;
  $('desteBilgi').textContent = `🀫 ${o.deste.length}`;

  // Oyuncu kutuları (koltuklara göre)
  [0, 1, 2, 3].forEach(k => {
    const no = (ui.benimNo + k) % 4;
    const p = o.oyuncular[no];
    const kutu = $(`koltuk${k}`);
    const puan = anlikPuan(p);
    kutu.className = `koltuk k${k}${o.sira === no && o.asama === 'oyun' ? ' sirada' : ''}`;
    kutu.style.setProperty('--renk', KOLTUK_RENKLERI[no]);
    kutu.innerHTML = `<b>${guvenli(p.ad)}</b><span class="puan ${puan < 0 ? 'eksi' : ''}">${puan}</span>`
      + (p.acti ? `<span class="acti">${p.acisTuru === 'cift' ? 'ÇİFT' : 'AÇTI'}</span>` : '')
      + (k ? `<span class="tasSayisi">🀫${p.el.length}</span>` : '');
  });

  // Istakam
  const islekler = ui.ayar.yardimli ? new Set(ben.el.filter(t => K.islekMi(t, o.masa, o.okey)).map(t => t.id)) : new Set();
  $('istaka').innerHTML = ui.yuvalar.slice(0, ISTAKA_YUVA).map((id, i) => {
    const t = id && tasBul(id);
    return `<div class="yuva" data-yuva="${i}">${t ? tasHtml(t, { islek: islekler.has(t.id) }) : ''}</div>`;
  }).join('');
  if (ui.secili) document.querySelector(`#istaka .tas[data-id="${ui.secili}"]`)?.classList.add('secili');
  if (o.tur?.yandan && ben.el.includes(o.tur.yandan)) document.querySelector(`#istaka .tas[data-id="${o.tur.yandan}"]`)?.classList.add('yandan');

  dugmeleriCiz();
}

function dugmeleriCiz() {
  const o = Motor.oyun;
  const ben = benim();
  const g = K.enIyiGruplar(ben.el, o.okey);
  const c = K.enIyiCiftler(ben.el, o.okey);
  const d = [];
  d.push(`<button data-e="seriDiz" class="ikinci">Seri diz <b>${g.deger}</b></button>`);
  d.push(`<button data-e="ciftDiz" class="ikinci">Çift diz <b>${c.ciftler.length}·${c.deger}</b></button>`);
  if (siraBende()) {
    if (!o.tur.cekti) {
      d.push('<button data-e="cek">⬇️ Ortadan çek</button>');
      const yan = Motor.yandakiTas(ui.benimNo);
      if (yan) d.push(`<button data-e="yandan">↙️ Yandan al ${tasHtml(yan, { mini: true })}</button>`);
    } else {
      if (!ben.acti) {
        d.push(`<button data-e="acSeri" ${g.deger >= Motor.gereken() ? '' : 'disabled'}>Seri aç (${g.deger})</button>`);
        d.push(`<button data-e="acCift" ${c.ciftler.length >= K.CIFT_SAYISI ? '' : 'disabled'}>Çift aç (${c.ciftler.length})</button>`);
      } else {
        const koyulacak = ben.acisTuru === 'cift' ? c.ciftler.length : g.gruplar.length;
        if (koyulacak) d.push(`<button data-e="${ben.acisTuru === 'cift' ? 'acCift' : 'acSeri'}">Yere koy</button>`);
      }
      if (o.tur.yandan && ben.el.includes(o.tur.yandan)) d.push('<button data-e="geri" class="uyariBtn">↩️ Geri bırak</button>');
      d.push(`<button data-e="at" class="atBtn" ${ui.secili ? '' : 'disabled'}>Taşı at</button>`);
    }
  }
  $('eylemler').innerHTML = d.join('');
}

// ---------- Mesajlar ----------
function mesaj(html, tur = '') {
  const kutu = $('mesaj');
  kutu.innerHTML = html;
  kutu.className = tur;
  kutu.hidden = false;
  clearTimeout(ui.mesajZaman);
  ui.mesajZaman = setTimeout(() => (kutu.hidden = true), tur === 'ceza' ? 3500 : 2200);
}

function sonuc(r) {
  if (!r.ok) {
    Ses.hata();
    mesaj(r.hata, 'hata');
  }
  return r.ok;
}

// ---------- Dokunuşlar ----------
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
  } else if (e === 'cek') sonuc(Motor.ortadanCek(ui.benimNo));
  else if (e === 'yandan') sonuc(Motor.yandanAl(ui.benimNo));
  else if (e === 'geri') sonuc(Motor.geriBirak(ui.benimNo));
  else if (e === 'acSeri') sonuc(Motor.ac(ui.benimNo, 'seri'));
  else if (e === 'acCift') sonuc(Motor.ac(ui.benimNo, 'cift'));
  else if (e === 'at' && ui.secili) {
    if (sonuc(Motor.at(ui.benimNo, ui.secili))) ui.secili = null;
  }
}

function istakaDokunus(e) {
  const yuva = e.target.closest('.yuva');
  if (!yuva) return;
  const i = +yuva.dataset.yuva;
  const id = ui.yuvalar[i];
  if (ui.uzunBasildi) {
    ui.uzunBasildi = false;
    return;
  }
  if (ui.secili && ui.secili !== id) {
    // Seçili taşı bu yuvaya taşı (doluysa yer değiştir)
    const eski = ui.yuvalar.indexOf(ui.secili);
    ui.yuvalar[eski] = id;
    ui.yuvalar[i] = ui.secili;
    ui.secili = null;
    Ses.secim();
  } else if (id) {
    ui.secili = ui.secili === id ? null : id;
    Ses.secim();
  }
  ciz();
}

// Okeye basılı tutunca ters döner (yere de ters gider)
function uzunBasma() {
  let zaman = null;
  $('istaka').addEventListener('pointerdown', e => {
    const el = e.target.closest('.tas');
    if (!el) return;
    const t = tasBul(+el.dataset.id);
    if (!t || !K.jokerMi(t, Motor.oyun.okey)) return;
    zaman = setTimeout(() => {
      t.ters = !t.ters;
      ui.uzunBasildi = true;
      ui.secili = null;
      Ses.secim();
      mesaj(t.ters ? 'Okey ters çevrildi 🙈 (yere de ters gider)' : 'Okey açıldı');
      ciz();
    }, 550);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ad => $('istaka').addEventListener(ad, () => clearTimeout(zaman)));
}

// 3D masaya dokunuş: deste, atılan taşlar, gruplar
function masaDokunus(h) {
  const o = Motor.oyun;
  if (!o || o.asama !== 'oyun') return;
  if (h.tur === 'deste') {
    if (siraBende() && !o.tur.cekti) sonuc(Motor.ortadanCek(ui.benimNo));
  } else if (h.tur === 'atilan') {
    const no = (ui.benimNo + h.koltuk) % 4;
    if (siraBende() && !o.tur.cekti && h.koltuk === 3) sonuc(Motor.yandanAl(ui.benimNo));
    else if (o.ayar.yardimli) atilanlariGoster(no);
    else mesaj('Atılan taşları görmek için yardımlı modu aç. Aklında tut! 🧠');
  } else if (h.tur === 'grup') {
    if (!ui.secili) return mesaj('İşlemek için önce ıstakandan bir taş seç, sonra gruba dokun.');
    if (sonuc(Motor.isle(ui.benimNo, ui.secili, h.id))) ui.secili = null;
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
      mesaj(o.tur.cekti ? 'İlk sen başlıyorsun: 15 taşın var, bir taş at.' : 'Sıra sende! Ortadan çek ya da yandan al.');
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
    mesaj(`${v.puan > 0 ? '+' : ''}${v.puan} · ${guvenli(v.neden)}`, v.puan > 0 ? 'ceza' : 'iyi');
  } else if (tip === 'sure') {
    const yuzde = Math.max(0, v.kalan / Motor.TUR_SURESI);
    $('sureCubugu').style.width = `${yuzde * 100}%`;
    $('sureCubugu').classList.toggle('az', v.kalan <= 10);
    if (v.no === ui.benimNo) {
      if (v.kalan <= 5 && v.kalan > 0) Ses.uyari();
      else if (v.kalan <= 10) Ses.tik();
    }
  } else if (tip === 'sureBitti' && v.no === ui.benimNo) {
    mesaj('⏰ Süren bitti: ortadan çekildi, en küçük taşın atıldı.', 'hata');
  } else if (tip === 'elBitti' || tip === 'oyunBitti') {
    Ses[v.tip === 'bitis' && v.no === ui.benimNo ? 'bitis' : 'at']();
    setTimeout(() => elSonuGoster(tip === 'oyunBitti'), 900);
  }
}

function elSonuGoster(son) {
  const o = Motor.oyun;
  const s = o.sonuc;
  const baslik = s.tip === 'deste' ? '🀫 Deste bitti' : `🏁 ${guvenli(o.oyuncular[s.no].ad)} ${guvenli(s.neden)}`;
  const sirali = o.oyuncular.map((p, i) => ({ ...p, i })).sort((a, b) => a.toplam - b.toplam);
  $('elSonuBaslik').innerHTML = son ? `🏆 ${guvenli(sirali[0].ad)} kazandı!` : baslik;
  $('elSonuTablo').innerHTML = `<tr><th></th><th>Bu el</th><th>Toplam</th></tr>`
    + sirali.map((p, k) => `<tr class="${p.i === ui.benimNo ? 'ben' : ''}"><td>${k + 1}. ${guvenli(p.ad)}</td><td class="${p.elPuani < 0 ? 'eksi' : p.elPuani > 0 ? 'arti' : ''}">${p.elPuani > 0 ? '+' : ''}${p.elPuani}</td><td><b>${p.toplam}</b></td></tr>`).join('');
  const bueldekiler = o.oyuncular.flatMap(p => p.gecmis.filter(g => g.el === o.elNo)).map(g => `<li>${g.puan > 0 ? '+' : ''}${g.puan} · ${guvenli(g.neden)}</li>`).join('');
  $('elSonuDetay').innerHTML = bueldekiler ? `<ul>${bueldekiler}</ul>` : '';
  $('sonrakiElBtn').textContent = son ? 'Ana menü' : `Sonraki el (${o.elNo + 1}/${o.ayar.elSayisi})`;
  $('elSonu').hidden = false;
  if (son) Ses.kazanma();
}

function puanTablosu() {
  const o = Motor.oyun;
  $('elSonuBaslik').textContent = `📊 Puanlar (El ${o.elNo}/${o.ayar.elSayisi})`;
  const sirali = o.oyuncular.map((p, i) => ({ ...p, i })).sort((a, b) => anlikPuan(a) - anlikPuan(b));
  $('elSonuTablo').innerHTML = `<tr><th></th><th>Bu el</th><th>Toplam</th></tr>`
    + sirali.map((p, k) => `<tr class="${p.i === ui.benimNo ? 'ben' : ''}"><td>${k + 1}. ${guvenli(p.ad)}</td><td>${p.elPuani}</td><td><b>${anlikPuan(p)}</b></td></tr>`).join('');
  const hepsi = o.oyuncular.flatMap(p => p.gecmis).slice(-12).reverse().map(g => `<li>El ${g.el}: ${g.puan > 0 ? '+' : ''}${g.puan} · ${guvenli(g.neden)}</li>`).join('');
  $('elSonuDetay').innerHTML = hepsi ? `<ul>${hepsi}</ul>` : '<p>Henüz ceza ya da düşer yok.</p>';
  $('sonrakiElBtn').textContent = 'Kapat';
  ui.tabloAcik = true;
  $('elSonu').hidden = false;
}

// ---------- Başlangıç ----------
Sahne.baslat($('sahne'));
Sahne.tiklayinca(masaDokunus);
Motor.dinleyici('degisti', () => ciz());
Motor.dinleyici('olay', olay);
$('istaka').addEventListener('click', istakaDokunus);
uzunBasma();
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
