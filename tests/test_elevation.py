"""Tester for høydeoppslag — kun de rene delene (ingen nettverkskall)."""
from backend.elevation import interpoler_mellom_oppslag


def test_alle_punkter_kjent():
    resultat = interpoler_mellom_oppslag(3, {0: 100.0, 1: 110.0, 2: 120.0})
    assert resultat == [100.0, 110.0, 120.0]


def test_lineær_interpolering_mellom_oppslag():
    resultat = interpoler_mellom_oppslag(5, {0: 100.0, 4: 200.0})
    assert resultat == [100.0, 125.0, 150.0, 175.0, 200.0]


def test_kantene_fylles_med_nærmeste_kjente():
    resultat = interpoler_mellom_oppslag(5, {2: 50.0})
    assert resultat == [50.0, 50.0, 50.0, 50.0, 50.0]


def test_manglende_oppslag_hoppes_over():
    # Punkt 2 fikk None fra API-et — interpoler forbi det
    resultat = interpoler_mellom_oppslag(5, {0: 100.0, 2: None, 4: 200.0})
    assert resultat == [100.0, 125.0, 150.0, 175.0, 200.0]


def test_ingen_kjente_gir_bare_none():
    assert interpoler_mellom_oppslag(3, {1: None}) == [None, None, None]
    assert interpoler_mellom_oppslag(0, {}) == []
