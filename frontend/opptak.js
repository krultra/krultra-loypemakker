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

   Sidegevinst: skjuler man vinduet, slutter nettleseren å tegne og
   eksporten står bare stille til vinduet er synlig igjen. Siden tida i
   videoen telles i bilder og ikke i sekunder, blir fila nøyaktig den
   samme.
   ============================================================ */
'use strict';

var KULOpptak = (function () {

  var FPS = 30;
  var MAKS_BREDDE = 1920;
  var BITRATE = 12000000;      // ~12 Mbit/s — romslig for 1080p30
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

  /** Finn første kodek nettleseren faktisk kan bruke i denne størrelsen. */
  function velgKodek(bredde, høyde) {
    var i = 0;
    function prøv() {
      if (i >= KODEKER.length) return Promise.resolve(null);
      var k = KODEKER[i++];
      return VideoEncoder.isConfigSupported({
        codec: k.codec, width: bredde, height: høyde,
        bitrate: BITRATE, framerate: FPS,
      }).then(function (res) {
        return (res && res.supported) ? k : prøv();
      }).catch(prøv);
    }
    return prøv();
  }

  function Opptak(opts, kodek) {
    this.kartCanvas = opts.kartCanvas;
    this.fps = opts.fps || FPS;
    this.kodek = kodek;
    this.bilder = 0;
    this.stoppet = false;
    this.feil = null;

    var kilde = { b: this.kartCanvas.width, h: this.kartCanvas.height };
    var skala = Math.min(1, MAKS_BREDDE / kilde.b);
    // Partall på begge sider — H.264 krever det
    this.bredde = Math.max(2, Math.round(kilde.b * skala / 2) * 2);
    this.høyde = Math.max(2, Math.round(kilde.h * skala / 2) * 2);

    this.lerret = document.createElement('canvas');
    this.lerret.width = this.bredde;
    this.lerret.height = this.høyde;
    this.ctx = this.lerret.getContext('2d', { alpha: false });
    this.overleggSkala = this.bredde / (this.kartCanvas.clientWidth || kilde.b);

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
      error: function (e) { meg.feil = e; },
    });
    this.koder.configure({
      codec: kodek.codec,
      width: this.bredde,
      height: this.høyde,
      bitrate: opts.bitrate || BITRATE,
      framerate: this.fps,
      latencyMode: 'quality',
    });

    // Himmelen males under kartet: kartlerretet er gjennomsiktig over
    // horisonten, så uten dette ville videoen manglet himmel og hvert
    // bilde ville blitt liggende oppå det forrige.
    this._himmel = this.ctx.createLinearGradient(0, 0, 0, this.høyde);
    this._himmel.addColorStop(0, '#1e3a8a');
    this._himmel.addColorStop(0.42, '#3b82f6');
    this._himmel.addColorStop(0.68, '#93c5fd');
    this._himmel.addColorStop(1, '#dbeafe');
  }

  /**
   * Sett sammen og kod ETT bilde. Bildet får tidsstempelet det skal ha i
   * den ferdige videoen, uavhengig av hvor lang tid det tok å lage.
   * Returnerer et løfte som venter hvis koderen henger etter.
   */
  Opptak.prototype.skrivBilde = function (tegnOverlegg) {
    if (this.stoppet || this.feil) return Promise.resolve();
    var ctx = this.ctx;

    ctx.fillStyle = this._himmel;
    ctx.fillRect(0, 0, this.bredde, this.høyde);
    try {
      ctx.drawImage(this.kartCanvas, 0, 0, this.bredde, this.høyde);
    } catch (e) {
      return Promise.resolve();     // lerretet var ikke klart
    }
    if (tegnOverlegg) {
      ctx.save();
      try { tegnOverlegg(ctx, this.overleggSkala, this.bredde, this.høyde); }
      catch (e) { /* et overleggsdetalj skal aldri velte eksporten */ }
      ctx.restore();
    }

    var n = this.bilder++;
    var varighetUs = Math.round(1e6 / this.fps);
    var ramme = new VideoFrame(this.lerret, {
      timestamp: Math.round(n * 1e6 / this.fps),
      duration: varighetUs,
    });
    try {
      this.koder.encode(ramme, { keyFrame: n % (this.fps * NØKKELBILDE_SEK) === 0 });
    } finally {
      ramme.close();
    }

    // Motstrøms bremsing: har koderen mange bilder til gode, venter vi
    // heller enn å fylle opp minnet.
    if (this.koder.encodeQueueSize > MAKS_KØ) {
      var meg = this;
      return new Promise(function (ok) {
        var sjekk = function () {
          if (meg.stoppet || meg.koder.encodeQueueSize <= MAKS_KØ / 2) ok();
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

  /** Avslutt kodingen og få den ferdige fila. */
  Opptak.prototype.stopp = function () {
    var meg = this;
    if (this.stoppet) return Promise.resolve(null);
    this.stoppet = true;
    if (!this.bilder) return Promise.resolve(null);
    return this.koder.flush()
      .then(function () {
        meg.muxer.finalize();
        var buffer = meg.muxer.target.buffer;
        return {
          blob: new Blob([buffer], { type: meg.kodek.mime }),
          mime: meg.kodek.mime,
          endelse: meg.kodek.endelse,
          varighet: meg.bilder / meg.fps,
          bredde: meg.bredde,
          høyde: meg.høyde,
          bilder: meg.bilder,
        };
      })
      .catch(function () { return null; })
      .then(function (res) {
        try { meg.koder.close(); } catch (e) { /* alt lukket */ }
        return res;
      });
  };

  return {
    tilgjengelig: tilgjengelig,
    fps: FPS,
    /** Klargjør et opptak. Løftet gir null hvis ingen kodek passer. */
    start: function (opts) {
      if (!tilgjengelig()) return Promise.resolve(null);
      // Målene må regnes ut her også, siden kodeken velges ut fra dem
      var kilde = opts.kartCanvas;
      var skala = Math.min(1, MAKS_BREDDE / kilde.width);
      var b = Math.max(2, Math.round(kilde.width * skala / 2) * 2);
      var h = Math.max(2, Math.round(kilde.height * skala / 2) * 2);
      return velgKodek(b, h).then(function (kodek) {
        return kodek ? new Opptak(opts, kodek) : null;
      });
    },
  };
})();
