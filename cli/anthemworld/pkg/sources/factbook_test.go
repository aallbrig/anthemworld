package sources

import (
	"database/sql"
	"testing"

	_ "github.com/mattn/go-sqlite3"
)

func TestParseAnthemTitle(t *testing.T) {
	tests := []struct {
		raw      string
		wantName string
		wantEn   string
	}{
		{
			`"La Marseillaise" (The Song of Marseille)`,
			"La Marseillaise",
			"The Song of Marseille",
		},
		{
			`"The Star-Spangled Banner"`,
			"The Star-Spangled Banner",
			"",
		},
		{
			"",
			"",
			"",
		},
		{
			`"Kimigayo" (His Imperial Majesty's Reign)`,
			"Kimigayo",
			"His Imperial Majesty's Reign",
		},
	}

	for _, tt := range tests {
		name, titleEn := parseAnthemTitle(tt.raw)
		if name != tt.wantName {
			t.Errorf("parseAnthemTitle(%q): name = %q, want %q", tt.raw, name, tt.wantName)
		}
		if titleEn != tt.wantEn {
			t.Errorf("parseAnthemTitle(%q): titleEn = %q, want %q", tt.raw, titleEn, tt.wantEn)
		}
	}
}

func TestStripHTML(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"<p>Hello <b>world</b></p>", "Hello world"},
		{"no tags here", "no tags here"},
		{"&amp; &lt; &gt;", "& < >"},
		{"  lots   of   spaces  ", "lots of spaces"},
	}

	for _, tt := range tests {
		got := stripHTML(tt.input)
		if got != tt.want {
			t.Errorf("stripHTML(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}

func TestFactbookSkipAlreadyEnriched(t *testing.T) {
	db, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	// Create minimal schema
	_, err = db.Exec(`
		CREATE TABLE countries (
			id TEXT PRIMARY KEY,
			name TEXT,
			common_name TEXT,
			iso_alpha2 TEXT,
			factbook_code TEXT,
			national_symbols TEXT,
			national_colors TEXT,
			updated_at TEXT
		)
	`)
	if err != nil {
		t.Fatal(err)
	}

	// Country without factbook_code — needs enrichment
	_, err = db.Exec(`INSERT INTO countries (id, name, iso_alpha2) VALUES ('c1', 'TestLand', 'TL')`)
	if err != nil {
		t.Fatal(err)
	}

	// Country with factbook_code — already enriched
	_, err = db.Exec(`INSERT INTO countries (id, name, iso_alpha2, factbook_code) VALUES ('c2', 'DoneLand', 'DL', 'dl')`)
	if err != nil {
		t.Fatal(err)
	}

	needsEnrichment, err := countryNeedsFactbookEnrichment(db, "c1")
	if err != nil {
		t.Fatal(err)
	}
	if !needsEnrichment {
		t.Error("c1 should need enrichment (no factbook_code)")
	}

	needsEnrichment, err = countryNeedsFactbookEnrichment(db, "c2")
	if err != nil {
		t.Fatal(err)
	}
	if needsEnrichment {
		t.Error("c2 should NOT need enrichment (has factbook_code)")
	}

	// Non-existent country
	needsEnrichment, err = countryNeedsFactbookEnrichment(db, "c999")
	if err != nil {
		t.Fatal(err)
	}
	if !needsEnrichment {
		t.Error("non-existent country should return true (will be skipped later by matchCountry)")
	}
}

func TestCIAToISOMapping(t *testing.T) {
	// Verify key mappings exist
	knownMappings := map[string]string{
		"gm": "DE", // Germany
		"rs": "RU", // Russia
		"is": "IL", // Israel
		"bh": "BZ", // Belize
		"ci": "CL", // Chile
		"kn": "KP", // North Korea
		"bm": "MM", // Myanmar
	}

	for cia, wantISO := range knownMappings {
		gotISO, ok := ciaToISO[cia]
		if !ok {
			t.Errorf("ciaToISO missing entry for CIA code %q (expected ISO %q)", cia, wantISO)
			continue
		}
		if gotISO != wantISO {
			t.Errorf("ciaToISO[%q] = %q, want %q", cia, gotISO, wantISO)
		}
	}

	// Ensure no nil map
	if ciaToISO == nil {
		t.Fatal("ciaToISO map is nil")
	}
}

func TestMatchCountryWithCIAAlias(t *testing.T) {
	db, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	_, err = db.Exec(`
		CREATE TABLE countries (
			id TEXT PRIMARY KEY,
			name TEXT,
			common_name TEXT,
			iso_alpha2 TEXT,
			factbook_code TEXT,
			national_symbols TEXT,
			national_colors TEXT,
			updated_at TEXT
		)
	`)
	if err != nil {
		t.Fatal(err)
	}

	// Germany: ISO alpha2 = DE, CIA code = gm
	_, err = db.Exec(`INSERT INTO countries (id, name, iso_alpha2) VALUES ('deu', 'Federal Republic of Germany', 'DE')`)
	if err != nil {
		t.Fatal(err)
	}

	f := NewFactbookSource()
	profile := &factbookProfile{}
	profile.Government.CountryName.ConvShortForm.Text = "Germany"

	// The CIA code "gm" doesn't match ISO "DE" directly,
	// but with the alias map it should resolve
	countryID, err := f.matchCountry(db, "gm", profile)
	if err != nil {
		t.Fatal(err)
	}
	if countryID != "deu" {
		t.Errorf("matchCountry('gm') = %q, want 'deu'", countryID)
	}
}
