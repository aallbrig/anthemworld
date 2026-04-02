package sources

import (
	"testing"
)

func TestAudioFallbackMap(t *testing.T) {
	// Verify the fallback map contains known-missing countries
	expectedEntries := map[string]string{
		"Q464551":   "File:National anthem of Burkina Faso.oga",                       // Burkina Faso
		"Q1045701":  "File:Kiribati Anthem Performed by US Navy Band.oga",             // Kiribati
		"Q108167408": "File:National Anthem of Afghanistan (Instrumental).ogg",        // Afghanistan
		"Q602974":   "File:Belau rekid (instrumental).oga",                            // Palau
		"Q862755":   "File:Hymne du Togo - salut a toi.ogg",                          // Togo
		"Q161744":   "File:Mykhailo Zazuliak — Shche ne vmerla Ukraina.oga",          // Ukraine
	}

	for wikidataID, expectedFile := range expectedEntries {
		file, ok := audioFallbackMap[wikidataID]
		if !ok {
			t.Errorf("audioFallbackMap missing entry for %s", wikidataID)
			continue
		}
		if file != expectedFile {
			t.Errorf("audioFallbackMap[%s] = %q, want %q", wikidataID, file, expectedFile)
		}
	}

	// Ensure countries with no audio are NOT in the map
	noAudioCountries := []string{
		"Q188662",  // Bosnia (only former anthem audio)
		"Q857953",  // Solomon Islands (no audio on Wikimedia)
	}
	for _, id := range noAudioCountries {
		if _, ok := audioFallbackMap[id]; ok {
			t.Errorf("audioFallbackMap should NOT contain %s (no valid audio)", id)
		}
	}
}

func TestDeterministicRecordingID(t *testing.T) {
	tests := []struct {
		name      string
		countryID string
		fileName  string
	}{
		{"basic", "US", "File:Star_Spangled_Banner.ogg"},
		{"unicode", "JP", "File:君が代.ogg"},
		{"empty_file", "FR", ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			id1 := deterministicRecordingID(tt.countryID, tt.fileName)
			id2 := deterministicRecordingID(tt.countryID, tt.fileName)

			// Same inputs produce same output
			if id1 != id2 {
				t.Errorf("not deterministic: %q != %q", id1, id2)
			}

			// Not empty
			if id1 == "" {
				t.Error("returned empty string")
			}

			// Reasonable length (sha256 hex = 64 chars + prefix)
			if len(id1) < 10 {
				t.Errorf("too short: %q", id1)
			}
		})
	}

	// Different inputs produce different outputs
	id1 := deterministicRecordingID("US", "File:A.ogg")
	id2 := deterministicRecordingID("US", "File:B.ogg")
	if id1 == id2 {
		t.Error("different inputs produced same ID")
	}

	id3 := deterministicRecordingID("US", "File:A.ogg")
	id4 := deterministicRecordingID("FR", "File:A.ogg")
	if id3 == id4 {
		t.Error("different country IDs produced same ID")
	}
}

func TestFilterAudioByRelevance(t *testing.T) {
	w := NewWikimediaSource()

	tests := []struct {
		name       string
		files      []string
		anthemName string
		country    string
		wantCount  int
	}{
		{
			"filters irrelevant",
			[]string{"File:Star_Spangled_Banner.ogg", "File:Random_Song.ogg"},
			"The Star-Spangled Banner",
			"United States",
			1,
		},
		{
			"keeps country match",
			[]string{"File:France_National_Anthem.ogg"},
			"La Marseillaise",
			"France",
			1,
		},
		{
			"empty input",
			nil,
			"test",
			"test",
			0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := w.filterAudioByRelevance(tt.files, tt.anthemName, tt.country)
			if len(result) != tt.wantCount {
				t.Errorf("got %d files, want %d; files=%v", len(result), tt.wantCount, result)
			}
		})
	}
}
