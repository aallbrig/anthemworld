package sources

import (
	"context"
	"database/sql"
	"testing"

	_ "github.com/mattn/go-sqlite3"
)

func setupSeedTestDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatal(err)
	}

	// Create minimal schema needed for seed
	_, err = db.Exec(`
		CREATE TABLE countries (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			common_name TEXT,
			iso_alpha2 TEXT,
			iso_alpha3 TEXT,
			un_member BOOLEAN,
			region TEXT,
			subregion TEXT,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		);
		CREATE TABLE anthems (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			country_id TEXT NOT NULL,
			name TEXT NOT NULL,
			native_name TEXT,
			wikidata_id TEXT,
			wikipedia_url TEXT,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		);
		CREATE TABLE audio_recordings (
			id TEXT PRIMARY KEY,
			country_id TEXT NOT NULL,
			title TEXT NOT NULL,
			url TEXT NOT NULL,
			format TEXT,
			duration_seconds INTEGER,
			type TEXT,
			license TEXT,
			source TEXT,
			quality TEXT,
			file_size_bytes INTEGER,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		);
	`)
	if err != nil {
		t.Fatal(err)
	}
	return db
}

func TestSpecialEntitiesData(t *testing.T) {
	// Verify seed entries exist and contain required fields
	entries := SpecialEntitySeeds()
	if len(entries) != 3 {
		t.Fatalf("expected 3 special entities, got %d", len(entries))
	}

	expected := map[string]struct {
		anthemName string
		wikidataID string
	}{
		"pse": {"Fida'i", "Q170099"},
		"twn": {"National Anthem of the Republic of China", "Q715464"},
		"vat": {"Pontifical Anthem and March", "Q188954"},
	}

	for _, e := range entries {
		want, ok := expected[e.CountryID]
		if !ok {
			t.Errorf("unexpected country ID: %s", e.CountryID)
			continue
		}
		if e.AnthemName != want.anthemName {
			t.Errorf("anthem name for %s: got %q, want %q", e.CountryID, e.AnthemName, want.anthemName)
		}
		if e.WikidataID != want.wikidataID {
			t.Errorf("wikidata ID for %s: got %q, want %q", e.CountryID, e.WikidataID, want.wikidataID)
		}
		if e.AudioFile == "" {
			t.Errorf("audio file for %s is empty", e.CountryID)
		}
	}
}

func TestSeedSpecialEntities(t *testing.T) {
	db := setupSeedTestDB(t)
	defer db.Close()

	// Insert the countries first (seed expects them to exist)
	for _, id := range []string{"pse", "twn", "vat"} {
		_, err := db.Exec(`INSERT INTO countries (id, name, un_member) VALUES (?, ?, false)`,
			id, "Test Country "+id)
		if err != nil {
			t.Fatal(err)
		}
	}

	// First run: should insert anthems and audio
	result, err := SeedSpecialEntities(context.Background(), db)
	if err != nil {
		t.Fatalf("SeedSpecialEntities failed: %v", err)
	}
	if result.AnthemsInserted != 3 {
		t.Errorf("expected 3 anthems inserted, got %d", result.AnthemsInserted)
	}
	if result.AudioInserted != 3 {
		t.Errorf("expected 3 audio inserted, got %d", result.AudioInserted)
	}

	// Verify DB state
	var anthemCount, audioCount int
	_ = db.QueryRow(`SELECT COUNT(*) FROM anthems WHERE country_id IN ('pse','twn','vat')`).Scan(&anthemCount)
	_ = db.QueryRow(`SELECT COUNT(*) FROM audio_recordings WHERE country_id IN ('pse','twn','vat')`).Scan(&audioCount)
	if anthemCount != 3 {
		t.Errorf("expected 3 anthems in DB, got %d", anthemCount)
	}
	if audioCount != 3 {
		t.Errorf("expected 3 audio recordings in DB, got %d", audioCount)
	}

	// Second run: should be idempotent (skip existing)
	result2, err := SeedSpecialEntities(context.Background(), db)
	if err != nil {
		t.Fatalf("SeedSpecialEntities (2nd run) failed: %v", err)
	}
	if result2.AnthemsInserted != 0 {
		t.Errorf("expected 0 anthems on re-run, got %d", result2.AnthemsInserted)
	}
	if result2.AudioInserted != 0 {
		t.Errorf("expected 0 audio on re-run, got %d", result2.AudioInserted)
	}
	if result2.Skipped != 3 {
		t.Errorf("expected 3 skipped on re-run, got %d", result2.Skipped)
	}
}

func TestSeedSpecialEntitiesMissingCountry(t *testing.T) {
	db := setupSeedTestDB(t)
	defer db.Close()

	// Don't insert countries — seed should skip gracefully
	result, err := SeedSpecialEntities(context.Background(), db)
	if err != nil {
		t.Fatalf("SeedSpecialEntities failed: %v", err)
	}
	if result.AnthemsInserted != 0 {
		t.Errorf("expected 0 anthems (no countries), got %d", result.AnthemsInserted)
	}
	if result.Skipped != 0 && result.Errors != 3 {
		t.Errorf("expected all entries to error or skip with missing countries, got skipped=%d errors=%d",
			result.Skipped, result.Errors)
	}
}
