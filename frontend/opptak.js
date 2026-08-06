/* ============================================================
   Videoopptak av en flyover.

   Tar opp flyoveren slik den faktisk kjøres — med kamerabevegelsene
   brukeren gjør underveis og pausene hun selv velger å ta.

   To ting er verdt å vite om hvordan dette virker:

   1) OPPTAKET FANGER IKKE HTML-LAGENE. `captureStream()` på kartets
      WebGL-lerret gir terreng og rutelinjer, men løperprikken,
      punktskiltene og avlesningen er vanlige HTML-elementer OPPÅ
      kartet — de finnes ikke i lerretet. Derfor tegner vi hvert bilde
      inn i et eget sammensetningslerret: først kartet, så overlegget
      på nytt med canvas-tegning. Det er dette lerretet som spilles inn.

   2) VI HOLDER «USYNLIG»-STOPPENE UTE. Når vinduet blir helt skjult av
      et annet program, slutter nettleseren å tegne, og avspillingen
      fryser av seg selv. Uten tiltak ville MediaRecorder likevel spilt
      inn den frosne tida som stillbilde. Vi setter derfor opptaket på
      pause ved `visibilitychange` og fortsetter når vinduet er synlig
      igjen — pause() og resume() klipper tida helt ut av fila.

   Brukerens EGNE pauser tas med, slik at et bevisst opphold der man
   dreier kameraet rundt et sted blir liggende i videoen.
   ============================================================ */
'use strict';

var KULOpptak = (function () {

  // Formater i prioritert rekkefølge. MP4/H.264 først: den spilles av
  // overalt, også på iPhone, som er viktig når videoen skal deles.
  // WebM er reserve for nettlesere uten MP4-opptak.
  var FORMATER = [
    'video/mp4;codecs=avc1.42E01E',
    'video/mp4',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];

  var MAKS_BREDDE = 1920;    // demmer opp for filstørrelsen på store skjermer
  var BILDER_PER_SEK = 30;
  var BITRATE = 8000000;     // ~8 Mbit/s — god kvalitet på 1080p

  /** Kan nettleseren spille inn i det hele tatt? */
  function tilgjengelig() {
    return typeof MediaRecorder !== 'undefined' &&
      typeof HTMLCanvasElement.prototype.captureStream === 'function' &&
      !!velgFormat();
  }

  function velgFormat() {
    for (var i = 0; i < FORMATER.length; i++) {
      try {
        if (MediaRecorder.isTypeSupported(FORMATER[i])) return FORMATER[i];
      } catch (e) { /* prøv neste */ }
    }
    return null;
  }

  /** Filendelsen som passer formatet vi spiller inn i. */
  function endelseFor(mime) {
    return (mime || '').indexOf('mp4') >= 0 ? 'mp4' : 'webm';
  }

  function Opptak(opts) {
    var kartCanvas = opts.kartCanvas;

    // Sammensetningslerretet: samme bildeforhold som kartet, men aldri
    // bredere enn MAKS_BREDDE. Partall på begge sider — enkelte
    // H.264-kodere avviser ulike tall.
    var kilde = { b: kartCanvas.width, h: kartCanvas.height };
    var skala = Math.min(1, MAKS_BREDDE / kilde.b);
    this.bredde = Math.max(2, Math.round(kilde.b * skala / 2) * 2);
    this.høyde = Math.max(2, Math.round(kilde.h * skala / 2) * 2);

    this.lerret = document.createElement('canvas');
    this.lerret.width = this.bredde;
    this.lerret.height = this.høyde;
    this.ctx = this.lerret.getContext('2d');
    this.kartCanvas = kartCanvas;

    // Fra kartets CSS-piksler (det map.project() gir) til lerretet vårt
    this.overleggSkala = this.bredde / (kartCanvas.clientWidth || kilde.b);

    this.mime = velgFormat();
    this.biter = [];
    this.startTid = performance.now();
    this.pausetMs = 0;
    this._pausetFra = 0;
    this.stoppet = false;

    var strøm = this.lerret.captureStream(BILDER_PER_SEK);
    this.opptaker = new MediaRecorder(strøm, {
      mimeType: this.mime,
      videoBitsPerSecond: opts.bitrate || BITRATE,
    });
    var meg = this;
    this.opptaker.ondataavailable = function (e) {
      if (e.data && e.data.size) meg.biter.push(e.data);
    };
    this.opptaker.start(1000);   // samle data i biter på ett sekund

    // Grunner til at opptaket står på vent akkurat nå. Det er flere av
    // dem — vinduet kan være skjult samtidig som kartfliser lastes — så
    // vi teller dem i stedet for å ha én av/på-bryter. Opptaket går
    // videre først når SISTE grunn er borte.
    this._hold = {};

    // Skjult vindu → hold tida ute av fila (se toppkommentaren)
    this._påSynlighet = function () {
      if (meg.stoppet) return;
      meg.hold('skjult', document.hidden);
    };
    document.addEventListener('visibilitychange', this._påSynlighet);
  }

  /**
   * Sett opptaket på vent av en navngitt grunn (eller fjern grunnen).
   * Ventetida klippes helt ut av den ferdige fila, så et opphold mens
   * kartflisene kommer inn blir ikke synlig for den som ser videoen.
   */
  Opptak.prototype.hold = function (grunn, på) {
    if (this.stoppet) return;
    if (på) this._hold[grunn] = true;
    else delete this._hold[grunn];
    if (Object.keys(this._hold).length) this.pause();
    else this.fortsett();
  };

  /** Står opptaket på vent nå? */
  Opptak.prototype.venter = function () {
    return Object.keys(this._hold).length > 0;
  };

  /**
   * Tegn ett bilde: himmel i bunnen, så kartet, så overlegget oppå.
   *
   * Himmelen MÅ tegnes her. Kartlerretet er gjennomsiktig over
   * horisonten — det er nettopp derfor CSS-himmelen synes gjennom det på
   * skjermen — så et `drawImage` alene ville verken gitt videoen en
   * himmel eller viska ut forrige bilde. Uten dette blir alt som tegnes
   * i himmelområdet liggende bilde etter bilde, og toppen av videoen
   * gror igjen med gamle ledestreker.
   */
  Opptak.prototype.bilde = function (tegnOverlegg) {
    if (this.stoppet || this.opptaker.state !== 'recording') return;
    var ctx = this.ctx;
    if (!this._himmel) {
      this._himmel = ctx.createLinearGradient(0, 0, 0, this.høyde);
      this._himmel.addColorStop(0, '#1e3a8a');
      this._himmel.addColorStop(0.42, '#3b82f6');
      this._himmel.addColorStop(0.68, '#93c5fd');
      this._himmel.addColorStop(1, '#dbeafe');
    }
    ctx.fillStyle = this._himmel;
    ctx.fillRect(0, 0, this.bredde, this.høyde);
    try {
      ctx.drawImage(this.kartCanvas, 0, 0, this.bredde, this.høyde);
    } catch (e) {
      return;   // lerretet var ikke klart dette bildet
    }
    if (tegnOverlegg) {
      ctx.save();
      try { tegnOverlegg(ctx, this.overleggSkala, this.bredde, this.høyde); }
      catch (e) { /* et overleggsdetalj skal aldri velte opptaket */ }
      ctx.restore();
    }
  };

  Opptak.prototype.pause = function () {
    if (this.stoppet || this.opptaker.state !== 'recording') return;
    this.opptaker.pause();
    this._pausetFra = performance.now();
  };

  Opptak.prototype.fortsett = function () {
    if (this.stoppet || this.opptaker.state !== 'paused') return;
    this.opptaker.resume();
    if (this._pausetFra) {
      this.pausetMs += performance.now() - this._pausetFra;
      this._pausetFra = 0;
    }
  };

  /** Hvor lang videoen er blitt så langt (sekunder, uten skjult tid). */
  Opptak.prototype.varighet = function () {
    var pauset = this.pausetMs +
      (this._pausetFra ? performance.now() - this._pausetFra : 0);
    return Math.max(0, (performance.now() - this.startTid - pauset) / 1000);
  };

  /** Avslutt og få fila. */
  Opptak.prototype.stopp = function () {
    var meg = this;
    return new Promise(function (ok) {
      if (meg.stoppet) return ok(null);
      meg.stoppet = true;
      document.removeEventListener('visibilitychange', meg._påSynlighet);
      var varighet = meg.varighet();
      meg.opptaker.onstop = function () {
        ok({
          blob: new Blob(meg.biter, { type: meg.mime }),
          mime: meg.mime,
          endelse: endelseFor(meg.mime),
          varighet: varighet,
          bredde: meg.bredde,
          høyde: meg.høyde,
        });
      };
      try {
        if (meg.opptaker.state === 'paused') meg.opptaker.resume();
        meg.opptaker.stop();
      } catch (e) {
        ok({
          blob: new Blob(meg.biter, { type: meg.mime }), mime: meg.mime,
          endelse: endelseFor(meg.mime), varighet: varighet,
          bredde: meg.bredde, høyde: meg.høyde,
        });
      }
    });
  };

  return {
    tilgjengelig: tilgjengelig,
    velgFormat: velgFormat,
    endelseFor: endelseFor,
    start: function (opts) { return new Opptak(opts); },
  };
})();
