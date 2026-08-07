/* ============================================================
   Videoopptak av en flyover — bilde for bilde.

   HVORFOR DETTE IKKE ER ET «OPPTAK» I VANLIG FORSTAND

   Første utgave brukte canvas.captureStream() + MediaRecorder, altså
   opptak i sanntid. Det gir dårlig video her, av tre grunner som alle
   henger sammen med at videoens tid da følger klokka på veggen:

     - Bruker ett bilde lengre enn 1/30 sekund å tegne — og det gjør det
       stadig, når kartfliser lastes eller terrenget bygges om — blir
       bildet enten hoppet over eller stående dobbelt. Resultatet er
       hakking som ikke lar seg jevne ut i etterkant.
     - MediaRecorder.pause()/resume() klipper riktignok bort ventetid,
       men etterlater et lite rykk i tidslinja ved hvert klipp.
     - Selv uten alt dette blir bildeavstanden ujevn, fordi den styres av
       når nettleseren rakk å levere hvert bilde.

   Her kobles videoens tid HELT fra klokka. Kalleren ber om ett bilde av
   gangen, og hvert bilde får et eksakt tidsstempel: bilde n ligger på
   n/fps sekunder, uansett om det tok to millisekunder eller to sekunder
   å få det ferdig tegnet. Da kan vi vente så lenge vi vil på at
   kartflisene er inne, uten at det setter spor i den ferdige fila.

   Bildene kodes med WebCodecs (VideoEncoder) og pakkes i en MP4 med
   mp4-muxer. Resultatet er en fil med helt jevn bildeavstand — det er
   dette som skiller en video som ser proff ut fra en som ser ut som en
   skjermopptak.

   FLERE SPOR I SAMME OPPTAK

   Ett opptak kan skrive flere videofiler samtidig. Kartbildet — den
   dyre delen, med flislasting og 3D-tegning — lages bare én gang og
   kopieres inn i hvert spor. Derfor koster spor nummer to lite mer enn
   selve kodingen. Det brukes til to ting:

     * to oppløsninger: en full fil og en lett nettversjon, så en video
       som bygges inn i en liten ramme eller åpnes på mobil slipper å
       laste ned en hel 1080p-fil
     * to språk: kartet er det samme, bare teksten i bildet er ulik

   Sidegevinst: skjuler man vinduet, slutter nettleseren å tegne og
   eksporten står bare stille til vinduet er synlig igjen. Siden tida i
   videoen telles i bilder og ikke i sekunder, blir fila nøyaktig den
   samme.
   ============================================================ */
'use strict';

var KULOpptak = (function () {

  var FPS = 30;
  var MAKS_BREDDE = 1920;
  // ~12 Mbit/s ved 1080p. Mindre spor får forholdsmessig mindre — bitrate
  // per piksel er det som avgjør hvordan videoen ser ut, ikke tallet i seg
  // selv. Gulvet hindrer at en liten nettversjon blir klumpete.
  var BITRATE_1080 = 12000000;
  var MIN_BITRATE = 1500000;
  var NØKKELBILDE_SEK = 2;     // nøkkelbilde annethvert sekund
  var MAKS_KØ = 12;            // demmer opp for at koderen henger etter

  // Kodeker i prioritert rekkefølge. H.264 først (spilles av overalt,
  // også på iPhone); VP9 i WebM som reserve.
  var KODEKER = [
    { codec: 'avc1.640028', mime: 'video/mp4', muxer: 'avc', endelse: 'mp4' },
    { codec: 'avc1.42003E', mime: 'video/mp4', muxer: 'avc', endelse: 'mp4' },
    { codec: 'vp09.00.10.08', mime: 'video/mp4', muxer: 'vp9', endelse: 'mp4' },
  ];

  /** Har nettleseren det som skal til for bilde-for-bilde-koding? */
  function tilgjengelig() {
    return typeof VideoEncoder !== 'undefined' &&
      typeof VideoFrame !== 'undefined' &&
      typeof window.Mp4Muxer !== 'undefined';
  }

  /** Partall på begge sider — H.264 krever det. */
  function målFor(kilde, maksBredde) {
    var skala = Math.min(1, (maksBredde || MAKS_BREDDE) / Math.max(1, kilde.b));
    return {
      bredde: Math.max(2, Math.round(kilde.b * skala / 2) * 2),
      høyde: Math.max(2, Math.round(kilde.h * skala / 2) * 2),
    };
  }

  function bitrateFor(bredde, høyde) {
    var forhold = (bredde * høyde) / (1920 * 1080);
    return Math.max(MIN_BITRATE, Math.round(BITRATE_1080 * forhold));
  }

  /** Finn første kodek nettleseren faktisk kan bruke i denne størrelsen. */
  function velgKodek(bredde, høyde) {
    var i = 0;
    function prøv() {
      if (i >= KODEKER.length) return Promise.resolve(null);
      var k = KODEKER[i++];
      return VideoEncoder.isConfigSupported({
        codec: k.codec, width: bredde, height: høyde,
        bitrate: bitrateFor(bredde, høyde), framerate: FPS,
      }).then(function (res) {
        return (res && res.supported) ? k : prøv();
      }).catch(prøv);
    }
    return prøv();
  }

  /**
   * Ett spor: eget lerret, egen koder og egen MP4-fil.
   * `nøkkel` er kallerens eget merkelapp-objekt (språk, størrelse …) og
   * følger med tilbake i resultatet.
   */
  function Spor(opptak, oppsett, kodek, kilde) {
    var mål = målFor(kilde, oppsett.maksBredde);
    this.nøkkel = oppsett.nøkkel || {};
    this.bredde = mål.bredde;
    this.høyde = mål.høyde;
    this.kodek = kodek;

    this.lerret = document.createElement('canvas');
    this.lerret.width = this.bredde;
    this.lerret.height = this.høyde;
    this.ctx = this.lerret.getContext('2d', { alpha: false });
    // Overlegget måles i kartets CSS-piksler (det map.project() gir).
    // Skalaen tar oss derfra til dette sporets oppløsning.
    this.overleggSkala = this.bredde / (kilde.cssB || kilde.b);

    this.muxer = new window.Mp4Muxer.Muxer({
      target: new window.Mp4Muxer.ArrayBufferTarget(),
      video: { codec: kodek.muxer, width: this.bredde, height: this.høyde },
      // Alt holdes i minnet og skrives i riktig rekkefølge til slutt, så
      // fila kan spilles av med en gang den lastes ned (moov først).
      fastStart: 'in-memory',
    });

    var meg = this;
    this.koder = new VideoEncoder({
      output: function (chunk, meta) { meg.muxer.addVideoChunk(chunk, meta); },
      error: function (e) { opptak.feil = e; },
    });
    this.koder.configure({
      codec: kodek.codec,
      width: this.bredde,
      height: this.høyde,
      bitrate: oppsett.bitrate || bitrateFor(this.bredde, this.høyde),
      framerate: opptak.fps,
      latencyMode: 'quality',
    });

    // Himmelen males under kartet: kartlerretet er gjennomsiktig over
    // horisonten, så uten dette ville videoen manglet himmel og hvert
    // bilde ville blitt liggende oppå det forrige.
    this.himmel = this.ctx.createLinearGradient(0, 0, 0, this.høyde);
    this.himmel.addColorStop(0, '#1e3a8a');
    this.himmel.addColorStop(0.42, '#3b82f6');
    this.himmel.addColorStop(0.68, '#93c5fd');
    this.himmel.addColorStop(1, '#dbeafe');
  }

  function Opptak(opts, kodek) {
    this.kartCanvas = opts.kartCanvas;
    this.fps = opts.fps || FPS;
    this.bilder = 0;
    this.stoppet = false;
    this.feil = null;

    var kilde = {
      b: this.kartCanvas.width,
      h: this.kartCanvas.height,
      cssB: this.kartCanvas.clientWidth || this.kartCanvas.width,
    };
    this.kildeBredde = kilde.b;
    this.kildeHøyde = kilde.h;

    var meg = this;
    this.spor = (opts.spor || [{}]).map(function (oppsett) {
      return new Spor(meg, oppsett, kodek, kilde);
    });
  }

  /**
   * Sett sammen og kod ETT bilde i hvert spor. Bildet får tidsstempelet
   * det skal ha i den ferdige videoen, uavhengig av hvor lang tid det tok
   * å lage. Returnerer et løfte som venter hvis en koder henger etter.
   *
   * `tegnOverlegg(ctx, skala, bredde, høyde, nøkkel)` kalles én gang per
   * spor — det er her kalleren tegner tekst på det språket sporet skal ha.
   */
  Opptak.prototype.skrivBilde = function (tegnOverlegg) {
    if (this.stoppet || this.feil) return Promise.resolve();

    var n = this.bilder++;
    var tid = Math.round(n * 1e6 / this.fps);
    var varighetUs = Math.round(1e6 / this.fps);
    var nøkkel = n % (this.fps * NØKKELBILDE_SEK) === 0;
    var maksKø = 0;

    for (var i = 0; i < this.spor.length; i++) {
      var sp = this.spor[i];
      var ctx = sp.ctx;
      ctx.fillStyle = sp.himmel;
      ctx.fillRect(0, 0, sp.bredde, sp.høyde);
      try {
        ctx.drawImage(this.kartCanvas, 0, 0, sp.bredde, sp.høyde);
      } catch (e) {
        this.bilder--;                 // lerretet var ikke klart
        return Promise.resolve();
      }
      if (tegnOverlegg) {
        ctx.save();
        try {
          tegnOverlegg(ctx, sp.overleggSkala, sp.bredde, sp.høyde, sp.nøkkel);
        } catch (e) { /* et overleggsdetalj skal aldri velte eksporten */ }
        ctx.restore();
      }

      var ramme = new VideoFrame(sp.lerret, { timestamp: tid, duration: varighetUs });
      try {
        sp.koder.encode(ramme, { keyFrame: nøkkel });
      } finally {
        ramme.close();
      }
      maksKø = Math.max(maksKø, sp.koder.encodeQueueSize);
    }

    // Motstrøms bremsing: har en koder mange bilder til gode, venter vi
    // heller enn å fylle opp minnet.
    if (maksKø > MAKS_KØ) {
      var meg = this;
      return new Promise(function (ok) {
        var sjekk = function () {
          var kø = 0;
          for (var j = 0; j < meg.spor.length; j++) {
            kø = Math.max(kø, meg.spor[j].koder.encodeQueueSize);
          }
          if (meg.stoppet || kø <= MAKS_KØ / 2) ok();
          else setTimeout(sjekk, 8);
        };
        sjekk();
      });
    }
    return Promise.resolve();
  };

  /** Videoens lengde så langt (sekunder) — telt i bilder, ikke i klokketid. */
  Opptak.prototype.varighet = function () {
    return this.bilder / this.fps;
  };

  /** Avslutt kodingen og få de ferdige filene (én per spor). */
  Opptak.prototype.stopp = function () {
    var meg = this;
    if (this.stoppet) return Promise.resolve([]);
    this.stoppet = true;
    if (!this.bilder) return Promise.resolve([]);

    return Promise.all(this.spor.map(function (sp) {
      return sp.koder.flush()
        .then(function () {
          sp.muxer.finalize();
          return {
            nøkkel: sp.nøkkel,
            blob: new Blob([sp.muxer.target.buffer], { type: sp.kodek.mime }),
            mime: sp.kodek.mime,
            endelse: sp.kodek.endelse,
            varighet: meg.bilder / meg.fps,
            bredde: sp.bredde,
            høyde: sp.høyde,
            bilder: meg.bilder,
          };
        })
        .catch(function () { return null; })
        .then(function (res) {
          try { sp.koder.close(); } catch (e) { /* alt lukket */ }
          return res;
        });
    })).then(function (liste) {
      return liste.filter(function (r) { return r && r.blob && r.blob.size; });
    });
  };

  return {
    tilgjengelig: tilgjengelig,
    fps: FPS,
    maksBredde: MAKS_BREDDE,
    // Gjøres tilgjengelig så grensesnittet kan vise hvor stor fila blir,
    // uten å gjette på tallene koderen faktisk får.
    målFor: målFor,
    bitrateFor: bitrateFor,
    /**
     * Klargjør et opptak.
     *   kartCanvas  WebGL-lerretet kartet tegnes i
     *   spor        [{ nøkkel, maksBredde }] — ett element per fil som
     *               skal lages. Utelatt = ett spor på inntil 1920 px.
     * Løftet gir null hvis ingen kodek passer.
     */
    start: function (opts) {
      if (!tilgjengelig()) return Promise.resolve(null);
      var spor = (opts.spor && opts.spor.length) ? opts.spor : [{}];
      var kilde = { b: opts.kartCanvas.width, h: opts.kartCanvas.height };
      // Kodeken velges ut fra det STØRSTE sporet: klarer nettleseren det,
      // klarer den de mindre også.
      var størst = spor.reduce(function (best, s) {
        var m = målFor(kilde, s.maksBredde);
        return (!best || m.bredde > best.bredde) ? m : best;
      }, null);
      return velgKodek(størst.bredde, størst.høyde).then(function (kodek) {
        return kodek ? new Opptak(Object.assign({}, opts, { spor: spor }), kodek) : null;
      });
    },
  };
})();
