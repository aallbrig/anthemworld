package sources

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"fmt"
)

// SpecialEntitySeed holds data for a non-UN-member country that needs manual anthem seeding.
type SpecialEntitySeed struct {
	CountryID    string
	AnthemName   string
	NativeName   string
	WikidataID   string
	WikipediaURL string
	AudioFile    string
}

// SeedResult summarizes the outcome of a seed operation.
type SeedResult struct {
	AnthemsInserted int
	AudioInserted   int
	Skipped         int
	Errors          int
}

// SpecialEntitySeeds returns the seed data for Palestine, Taiwan, and Vatican City.
func SpecialEntitySeeds() []SpecialEntitySeed {
	return []SpecialEntitySeed{
		{
			CountryID:    "pse",
			AnthemName:   "Fida'i",
			NativeName:   "فدائي",
			WikidataID:   "Q170099",
			WikipediaURL: "https://en.wikipedia.org/wiki/Fida%27i",
			AudioFile:    "File:Anthem of Palestine.ogg",
		},
		{
			CountryID:    "twn",
			AnthemName:   "National Anthem of the Republic of China",
			NativeName:   "中華民國國歌",
			WikidataID:   "Q715464",
			WikipediaURL: "https://en.wikipedia.org/wiki/National_Anthem_of_the_Republic_of_China",
			AudioFile:    "File:National Flag Anthem of the Republic of China piano version.oga",
		},
		{
			CountryID:    "vat",
			AnthemName:   "Pontifical Anthem and March",
			NativeName:   "Inno e Marcia Pontificale",
			WikidataID:   "Q188954",
			WikipediaURL: "https://en.wikipedia.org/wiki/Pontifical_Anthem_and_March",
			AudioFile:    "File:National Anthem of Vatican City.ogg",
		},
	}
}

// SeedSpecialEntities inserts anthem and audio records for non-UN-member entities
// that have national anthems but aren't populated by the standard data sources.
// The operation is idempotent: existing anthems are skipped.
func SeedSpecialEntities(ctx context.Context, db *sql.DB) (*SeedResult, error) {
	result := &SeedResult{}

	for _, seed := range SpecialEntitySeeds() {
		select {
		case <-ctx.Done():
			return result, ctx.Err()
		default:
		}

		// Verify the country exists
		var exists bool
		err := db.QueryRow(`SELECT EXISTS(SELECT 1 FROM countries WHERE id = ?)`, seed.CountryID).Scan(&exists)
		if err != nil || !exists {
			result.Errors++
			continue
		}

		// Check if anthem already exists for this country
		var anthemCount int
		err = db.QueryRow(`SELECT COUNT(*) FROM anthems WHERE country_id = ?`, seed.CountryID).Scan(&anthemCount)
		if err != nil {
			result.Errors++
			continue
		}
		if anthemCount > 0 {
			result.Skipped++
			continue
		}

		tx, err := db.BeginTx(ctx, nil)
		if err != nil {
			result.Errors++
			continue
		}

		// Insert anthem
		res, err := tx.Exec(`
			INSERT INTO anthems (country_id, name, native_name, wikidata_id, wikipedia_url, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
		`, seed.CountryID, seed.AnthemName, seed.NativeName, seed.WikidataID, seed.WikipediaURL)
		if err != nil {
			_ = tx.Rollback()
			result.Errors++
			continue
		}
		_ = res

		// Insert audio recording
		recordingID := seedRecordingID(seed.CountryID, seed.AudioFile)
		audioURL := fmt.Sprintf("https://commons.wikimedia.org/wiki/Special:FilePath/%s",
			seed.AudioFile[len("File:"):])

		_, err = tx.Exec(`
			INSERT INTO audio_recordings (
				id, country_id, title, url, format, type, source, license, quality,
				created_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
			ON CONFLICT(id) DO NOTHING
		`, recordingID, seed.CountryID, seed.AudioFile, audioURL,
			"audio/ogg", "vocal", "wikimedia-commons", "CC-BY-SA", "standard")
		if err != nil {
			_ = tx.Rollback()
			result.Errors++
			continue
		}

		if err := tx.Commit(); err != nil {
			result.Errors++
			continue
		}

		result.AnthemsInserted++
		result.AudioInserted++
	}

	return result, nil
}

func seedRecordingID(countryID, fileName string) string {
	h := sha256.Sum256([]byte(countryID + "|" + fileName))
	return "wr-" + hex.EncodeToString(h[:16])
}
