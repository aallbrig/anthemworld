package format

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// CountryRecord is the JSON representation of a country for the Hugo site
type CountryRecord struct {
	ID             string `json:"id"`            // ISO alpha-3 lowercase
	Name           string `json:"name"`
	CommonName     string `json:"common_name,omitempty"`
	ISOAlpha2      string `json:"iso_alpha2,omitempty"`
	ISOAlpha3      string `json:"iso_alpha3,omitempty"`
	Capital        string `json:"capital,omitempty"`
	Region         string `json:"region,omitempty"`
	Subregion      string `json:"subregion,omitempty"`
	FactbookCode   string `json:"factbook_code,omitempty"`
	NationalSymbol string `json:"national_symbols,omitempty"`
	NationalColors string `json:"national_colors,omitempty"`
	FlagURL        string `json:"flag_url,omitempty"` // derived from factbook_code
	Anthem         *AnthemRecord      `json:"anthem,omitempty"`
	AudioFiles     []AudioRecord      `json:"audio_files,omitempty"`
}

// AnthemRecord is the JSON representation of an anthem
type AnthemRecord struct {
	ID          int    `json:"id"`
	Name        string `json:"name"`
	TitleEn     string `json:"title_en,omitempty"` // English translation
	Composer    string `json:"composer,omitempty"`
	Lyricist    string `json:"lyricist,omitempty"`
	AdoptedDate string `json:"adopted_date,omitempty"`
	WikidataID  string `json:"wikidata_id,omitempty"`
	WikipediaURL string `json:"wikipedia_url,omitempty"`
	History     string `json:"history,omitempty"` // CIA factbook history paragraph
}

// AudioRecord is the JSON representation of an audio recording
type AudioRecord struct {
	ID       string `json:"id"`
	Title    string `json:"title,omitempty"`
	URL      string `json:"url"`
	Format   string `json:"format,omitempty"`
	Duration int    `json:"duration_seconds,omitempty"`
	Type     string `json:"type,omitempty"`
	Source   string `json:"source,omitempty"`
	License  string `json:"license,omitempty"`
}

// IndexRecord is the manifest file
type IndexRecord struct {
	GeneratedAt    string `json:"generated_at"`
	TotalCountries int    `json:"total_countries"`
	TotalAnthems   int    `json:"total_anthems"`
	TotalAudio     int    `json:"total_audio"`
	WithHistory    int    `json:"with_history"`
	Files          []string `json:"files"`
}

// ExportToDir queries the database and writes JSON files to outputDir.
// It creates the following files:
//   - anthems.json       — all countries indexed by ISO alpha-3, including anthem + audio
//   - countries.geojson  — GeoJSON FeatureCollection of country boundaries
//   - index.json         — manifest with stats
func ExportToDir(db *sql.DB, outputDir string) error {
	countries, err := queryCountries(db)
	if err != nil {
		return fmt.Errorf("querying countries: %w", err)
	}

	// Index by ISO alpha-3 (uppercase, e.g. "USA")
	indexed := make(map[string]*CountryRecord, len(countries))
	for i := range countries {
		key := countries[i].ISOAlpha3
		if key == "" {
			key = countries[i].ID
		}
		indexed[key] = &countries[i]
	}

	withHistory := 0
	for _, c := range indexed {
		if c.Anthem != nil && c.Anthem.History != "" {
			withHistory++
		}
	}

	// Write anthems.json
	anthemsPath := filepath.Join(outputDir, "anthems.json")
	if err := writeJSON(anthemsPath, indexed); err != nil {
		return err
	}

	totalAnthems := 0
	totalAudio := 0
	for _, c := range indexed {
		if c.Anthem != nil {
			totalAnthems++
		}
		totalAudio += len(c.AudioFiles)
	}

	// Write countries.geojson
	geoPath := filepath.Join(outputDir, "countries.geojson")
	geoCount, err := exportGeoJSON(db, geoPath)
	if err != nil {
		// Non-fatal: geojson table may not be populated yet
		fmt.Printf("  ⚠ GeoJSON export skipped: %v\n", err)
		geoCount = 0
	}

	// Write index.json
	files := []string{"anthems.json", "index.json"}
	if geoCount > 0 {
		files = append(files, "countries.geojson")
	}
	idx := IndexRecord{
		GeneratedAt:    time.Now().UTC().Format(time.RFC3339),
		TotalCountries: len(indexed),
		TotalAnthems:   totalAnthems,
		TotalAudio:     totalAudio,
		WithHistory:    withHistory,
		Files:          files,
	}
	indexPath := filepath.Join(outputDir, "index.json")
	if err := writeJSON(indexPath, idx); err != nil {
		return err
	}

	fmt.Printf("  ✓ %d countries, %d anthems, %d audio files, %d with history\n",
		len(indexed), totalAnthems, totalAudio, withHistory)
	if geoCount > 0 {
		fmt.Printf("  ✓ %d GeoJSON features\n", geoCount)
	}
	fmt.Printf("  → %s\n", anthemsPath)
	if geoCount > 0 {
		fmt.Printf("  → %s\n", geoPath)
	}
	fmt.Printf("  → %s\n", indexPath)
	return nil
}

// geoJSONFeature is a minimal GeoJSON feature for serialization.
type geoJSONFeature struct {
	Type       string                 `json:"type"`
	ID         string                 `json:"id"`
	Properties map[string]interface{} `json:"properties"`
	Geometry   json.RawMessage        `json:"geometry"`
}

// geoJSONCollection is a minimal GeoJSON FeatureCollection for serialization.
type geoJSONCollection struct {
	Type     string           `json:"type"`
	Features []geoJSONFeature `json:"features"`
}

// exportGeoJSON reconstructs countries.geojson from the geojson_countries table.
// Returns the number of features written, or an error.
func exportGeoJSON(db *sql.DB, path string) (int, error) {
	rows, err := db.Query(`
		SELECT iso_code, name, feature_type, geometry
		FROM geojson_countries
		ORDER BY iso_code
	`)
	if err != nil {
		return 0, fmt.Errorf("querying geojson_countries: %w", err)
	}
	defer rows.Close()

	var features []geoJSONFeature
	for rows.Next() {
		var isoCode, name, featureType, geometryJSON string
		if err := rows.Scan(&isoCode, &name, &featureType, &geometryJSON); err != nil {
			return 0, err
		}
		features = append(features, geoJSONFeature{
			Type: featureType,
			ID:   isoCode,
			Properties: map[string]interface{}{
				"name": name,
			},
			Geometry: json.RawMessage(geometryJSON),
		})
	}
	if err := rows.Err(); err != nil {
		return 0, err
	}
	if len(features) == 0 {
		return 0, fmt.Errorf("no features in geojson_countries table")
	}

	collection := geoJSONCollection{
		Type:     "FeatureCollection",
		Features: features,
	}
	if err := writeJSON(path, collection); err != nil {
		return 0, err
	}
	return len(features), nil
}

func queryCountries(db *sql.DB) ([]CountryRecord, error) {
	hasFactbookCode := columnExists(db, "countries", "factbook_code")
	hasSymbols := columnExists(db, "countries", "national_symbols")
	hasColors := columnExists(db, "countries", "national_colors")

	query := `SELECT c.id, c.name, COALESCE(c.common_name,''), COALESCE(c.iso_alpha2,''), COALESCE(c.iso_alpha3,''),
		COALESCE(c.capital,''), COALESCE(c.region,''), COALESCE(c.subregion,'')`
	if hasFactbookCode {
		query += `, COALESCE(c.factbook_code,'')`
	} else {
		query += `, ''`
	}
	if hasSymbols {
		query += `, COALESCE(c.national_symbols,'')`
	} else {
		query += `, ''`
	}
	if hasColors {
		query += `, COALESCE(c.national_colors,'')`
	} else {
		query += `, ''`
	}
	query += ` FROM countries c ORDER BY c.name`

	rows, err := db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var countries []CountryRecord
	for rows.Next() {
		var c CountryRecord
		if err := rows.Scan(&c.ID, &c.Name, &c.CommonName, &c.ISOAlpha2, &c.ISOAlpha3,
			&c.Capital, &c.Region, &c.Subregion, &c.FactbookCode,
			&c.NationalSymbol, &c.NationalColors); err != nil {
			return nil, err
		}
		if c.FactbookCode != "" {
			c.FlagURL = fmt.Sprintf("https://raw.githubusercontent.com/factbook/media/master/flags/%s.png", c.FactbookCode)
		}
		countries = append(countries, c)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// Load anthems for each country
	anthems, err := queryAnthems(db)
	if err != nil {
		return nil, err
	}
	audio, err := queryAudio(db)
	if err != nil {
		return nil, err
	}

	for i := range countries {
		if a, ok := anthems[countries[i].ID]; ok {
			countries[i].Anthem = a
		}
		if files, ok := audio[countries[i].ID]; ok {
			countries[i].AudioFiles = files
		}
	}
	return countries, nil
}

func queryAnthems(db *sql.DB) (map[string]*AnthemRecord, error) {
	// Check if new columns exist (added by factbook source)
	hasHistory := columnExists(db, "anthems", "anthem_history")
	hasTitleEn := columnExists(db, "anthems", "anthem_title_en")

	query := `SELECT id, country_id, name, COALESCE(composer,''), COALESCE(lyricist,''),
		COALESCE(adopted_date,''), COALESCE(wikidata_id,''), COALESCE(wikipedia_url,'')`
	if hasTitleEn {
		query += `, COALESCE(anthem_title_en,'')`
	} else {
		query += `, ''`
	}
	if hasHistory {
		query += `, COALESCE(anthem_history,'')`
	} else {
		query += `, ''`
	}
	query += ` FROM anthems`

	rows, err := db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make(map[string]*AnthemRecord)
	for rows.Next() {
		var a AnthemRecord
		var countryID string
		if err := rows.Scan(&a.ID, &countryID, &a.Name, &a.Composer, &a.Lyricist,
			&a.AdoptedDate, &a.WikidataID, &a.WikipediaURL, &a.TitleEn, &a.History); err != nil {
			return nil, err
		}
		// Clean up wikidata blank nodes (raw URLs) that aren't useful labels
		if isBlankNode(a.Composer) {
			a.Composer = ""
		}
		if isBlankNode(a.Lyricist) {
			a.Lyricist = ""
		}
		result[countryID] = &a
	}
	return result, rows.Err()
}

func queryAudio(db *sql.DB) (map[string][]AudioRecord, error) {
	rows, err := db.Query(`
		SELECT id, country_id, COALESCE(title,''), COALESCE(url,''), COALESCE(format,''),
		       COALESCE(duration_seconds,0), COALESCE(type,''), COALESCE(source,''), COALESCE(license,'')
		FROM audio_recordings
		ORDER BY country_id, type
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make(map[string][]AudioRecord)
	for rows.Next() {
		var r AudioRecord
		var countryID string
		if err := rows.Scan(&r.ID, &countryID, &r.Title, &r.URL, &r.Format,
			&r.Duration, &r.Type, &r.Source, &r.License); err != nil {
			return nil, err
		}
		result[countryID] = append(result[countryID], r)
	}
	return result, rows.Err()
}

func columnExists(db *sql.DB, table, col string) bool {
	var exists bool
	err := db.QueryRow(`
		SELECT EXISTS(
			SELECT 1 FROM pragma_table_info(?) WHERE name = ?
		)`, table, col).Scan(&exists)
	return err == nil && exists
}

// isBlankNode checks if a string looks like a Wikidata blank node or raw QID
func isBlankNode(s string) bool {
	return (len(s) >= 7 && s[:7] == "http://") || (len(s) >= 8 && s[:8] == "https://")
}

func writeJSON(path string, v interface{}) error {
	f, err := os.Create(path)
	if err != nil {
		return fmt.Errorf("create %s: %w", path, err)
	}
	defer f.Close()
	enc := json.NewEncoder(f)
	enc.SetIndent("", "  ")
	return enc.Encode(v)
}
