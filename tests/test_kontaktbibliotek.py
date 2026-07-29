"""Tester for kontaktbiblioteket: delte kontakter på tvers av arenakart."""
import json

import pytest

from backend import arena_lagring, kontaktbibliotek
from backend.models import ArenaContact, ArenaSaveRequest


@pytest.fixture
def miljø(tmp_path, monkeypatch):
    """Isolert bibliotekfil og arenamappe for hver test."""
    monkeypatch.setattr(kontaktbibliotek, "BIBLIOTEK_FIL", tmp_path / "contacts.json")
    monkeypatch.setattr(arena_lagring, "DATA_DIR", tmp_path / "arenaer")
    return tmp_path


def _kontakt(tittel="Løpsleder", **ekstra):
    felt = {"navn": "Torgeir", "telefon": "913 51 909", "epost": "post@krultra.no"}
    felt.update(ekstra)  # kalleren kan overstyre hvilket som helst felt
    return ArenaContact(id="k1", tittel=tittel, **felt)


def _arena(navn, kontakter):
    return arena_lagring.opprett_arena(
        ArenaSaveRequest(navn=navn, kontakter=kontakter))


class TestBibliotek:
    def test_opprett_og_les(self, miljø):
        delt = kontaktbibliotek.opprett_kontakt(_kontakt())
        assert len(delt.id) == 8
        kontakter = kontaktbibliotek.les_bibliotek()
        assert [k.id for k in kontakter] == [delt.id]
        assert kontakter[0].tittel == "Løpsleder"
        assert kontakter[0].telefon == "913 51 909"

    def test_to_kontakter_med_samme_tittel(self, miljø):
        """Identiteten er id-en, ikke tittelen (to arrangement, hvert sitt «Sekretariat»)."""
        a = kontaktbibliotek.opprett_kontakt(_kontakt("Sekretariat"))
        b = kontaktbibliotek.opprett_kontakt(_kontakt("Sekretariat"))
        assert a.id != b.id
        assert len(kontaktbibliotek.les_bibliotek()) == 2

    def test_oppdater(self, miljø):
        delt = kontaktbibliotek.opprett_kontakt(_kontakt("Før"))
        oppdatert = kontaktbibliotek.oppdater_kontakt(
            delt.id, _kontakt("Etter", telefon="900 00 000"))
        assert oppdatert.id == delt.id
        lagret = kontaktbibliotek.les_bibliotek()[0]
        assert lagret.tittel == "Etter"
        assert lagret.telefon == "900 00 000"

    def test_oppdater_ukjent_id_feiler(self, miljø):
        with pytest.raises(FileNotFoundError):
            kontaktbibliotek.oppdater_kontakt("ffffffff", _kontakt())

    def test_slett(self, miljø):
        delt = kontaktbibliotek.opprett_kontakt(_kontakt())
        kontaktbibliotek.slett_kontakt(delt.id)
        assert kontaktbibliotek.les_bibliotek() == []
        with pytest.raises(FileNotFoundError):
            kontaktbibliotek.slett_kontakt(delt.id)

    def test_skriving_tar_sikkerhetskopi(self, miljø):
        a = kontaktbibliotek.opprett_kontakt(_kontakt("Første"))
        kontaktbibliotek.opprett_kontakt(_kontakt("Andre"))
        bak = kontaktbibliotek.BIBLIOTEK_FIL.with_suffix(".json.bak")
        assert bak.exists()
        forrige = json.loads(bak.read_text(encoding="utf-8"))
        assert [k["id"] for k in forrige["kontakter"]] == [a.id]


class TestFlettOgSynk:
    def test_åpning_henter_ferske_verdier(self, miljø):
        delt = kontaktbibliotek.opprett_kontakt(_kontakt("Gammel tittel"))
        a = _arena("Teveltunet", [_kontakt("Gammel tittel", bib_id=delt.id)])

        # Endre bibliotekkontakten «utenfra» (som om et annet arenakart gjorde det)
        kontakter = kontaktbibliotek.les_bibliotek()
        kontakter[0].tittel = "Ny tittel"
        kontakter[0].telefon = "111 22 333"
        kontaktbibliotek._skriv_bibliotek(kontakter)

        lastet = arena_lagring.hent_arena(a.id)
        assert lastet.kontakter[0].tittel == "Ny tittel"
        assert lastet.kontakter[0].telefon == "111 22 333"

    def test_lagring_synkroniserer_til_biblioteket(self, miljø):
        delt = kontaktbibliotek.opprett_kontakt(_kontakt("Før"))
        a = _arena("Teveltunet", [_kontakt("Før", bib_id=delt.id)])

        arena_lagring.oppdater_arena(a.id, ArenaSaveRequest(
            navn="Teveltunet",
            kontakter=[_kontakt("Etter", telefon="900 00 000", bib_id=delt.id)]))

        bib = kontaktbibliotek.les_bibliotek()[0]
        assert bib.tittel == "Etter"
        assert bib.telefon == "900 00 000"

    def test_endring_spres_mellom_arenakart(self, miljø):
        """Kjernebehovet: endre i ett arenakart → de andre får det ved åpning."""
        delt = kontaktbibliotek.opprett_kontakt(_kontakt("Sekretariat"))
        a = _arena("Oversikt", [_kontakt("Sekretariat", bib_id=delt.id)])
        b = _arena("Detalj", [_kontakt("Sekretariat", bib_id=delt.id)])

        arena_lagring.oppdater_arena(a.id, ArenaSaveRequest(
            navn="Oversikt",
            kontakter=[_kontakt("Sekretariat", telefon="555 55 555", bib_id=delt.id)]))

        assert arena_lagring.hent_arena(b.id).kontakter[0].telefon == "555 55 555"

    def test_slett_med_fjern_bruk_fjerner_fra_alle_arenakart(self, miljø):
        delt = kontaktbibliotek.opprett_kontakt(_kontakt("Løpsleder"))
        a = _arena("Oversikt", [_kontakt("Løpsleder", bib_id=delt.id),
                                _kontakt("Lokal vakt")])
        b = _arena("Detalj", [_kontakt("Løpsleder", bib_id=delt.id)])

        kontaktbibliotek.slett_kontakt(delt.id, fjern_bruk=True)

        assert kontaktbibliotek.les_bibliotek() == []
        a_k = arena_lagring.hent_arena(a.id).kontakter
        assert [k.tittel for k in a_k] == ["Lokal vakt"]  # lokal kontakt består
        assert arena_lagring.hent_arena(b.id).kontakter == []

    def test_fjern_bruk_rydder_referanser_fra_steder(self, miljø):
        from backend.models import ArenaFeature
        delt = kontaktbibliotek.opprett_kontakt(_kontakt("Løpsleder"))
        arena = arena_lagring.opprett_arena(ArenaSaveRequest(
            navn="Teveltunet",
            kontakter=[_kontakt("Løpsleder", bib_id=delt.id)],
            features=[ArenaFeature(id="f1", navn="Sekretariat", form="punkt",
                                   geometri=[[0.5, 0.5]], kontakt_ids=["k1"])]))
        kontaktbibliotek.slett_kontakt(delt.id, fjern_bruk=True)
        f = arena_lagring.hent_arena(arena.id).features[0]
        assert f.kontakt_ids == []  # referansen til den delte kontakten er borte

    def test_slettet_bibliotekkontakt_gir_lokal_kopi(self, miljø):
        delt = kontaktbibliotek.opprett_kontakt(_kontakt("Midlertidig"))
        a = _arena("Teveltunet", [_kontakt("Midlertidig", bib_id=delt.id)])
        kontaktbibliotek.slett_kontakt(delt.id)

        lastet = arena_lagring.hent_arena(a.id)
        assert lastet.kontakter[0].bib_id is None      # frakoblet
        assert lastet.kontakter[0].tittel == "Midlertidig"  # kopien består

    def test_lokale_kontakter_røres_ikke(self, miljø):
        kontaktbibliotek.opprett_kontakt(_kontakt("Delt"))
        a = _arena("Teveltunet", [_kontakt("Lokal kontakt")])  # uten bib_id
        lastet = arena_lagring.hent_arena(a.id)
        assert lastet.kontakter[0].tittel == "Lokal kontakt"
        assert lastet.kontakter[0].bib_id is None


class TestBrukOversikt:
    def test_teller_bruk_per_arenakart(self, miljø):
        delt = kontaktbibliotek.opprett_kontakt(_kontakt())
        _arena("Teveltunet", [_kontakt(bib_id=delt.id)])
        _arena("Meråker vgs.", [_kontakt(bib_id=delt.id)])
        _arena("Uten delte", [_kontakt()])  # lokal kontakt — telles ikke

        bruk = kontaktbibliotek.bruk_oversikt()
        assert sorted(bruk[delt.id]) == ["Meråker vgs.", "Teveltunet"]
