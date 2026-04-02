package sources

import (
	"context"
	"crypto/sha256"
	"database/sql"
	_ "embed"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/anthemworld/cli/pkg/httpclient"
	"github.com/anthemworld/cli/pkg/jobs"
)

//go:embed wikimedia.schema.sql
var wikimediaSchema string

// WikimediaSource downloads anthem audio files from Wikimedia Commons
type WikimediaSource struct {
	id   string
	name string
	url  string
}

// NewWikimediaSource creates a new Wikimedia Commons data source
func NewWikimediaSource() *WikimediaSource {
	return &WikimediaSource{
		id:   "wikimedia-commons",
		name: "Wikimedia Commons",
		url:  "https://commons.wikimedia.org/w/api.php",
	}
}

func (w *WikimediaSource) ID() string   { return w.id }
func (w *WikimediaSource) Name() string { return w.name }
func (w *WikimediaSource) Type() string { return "audio-files" }
func (w *WikimediaSource) URL() string  { return w.url }

const wikimediaSchemaVersion = 1

func (w *WikimediaSource) GetSchema() string {
	return wikimediaSchema
}

func (w *WikimediaSource) GetSchemaVersion() int {
	return wikimediaSchemaVersion
}

func (w *WikimediaSource) GetTables() []string {
	return []string{"wikimedia_metadata"}
}

// HealthCheck verifies the Wikimedia Commons API is accessible
func (w *WikimediaSource) HealthCheck(ctx context.Context) HealthStatus {
	testURL := fmt.Sprintf("%s?action=query&meta=siteinfo&format=json", w.url)

	c := httpclient.New(httpclient.WithTimeout(10 * time.Second))

	start := time.Now()
	resp, err := c.Get(ctx, testURL)
	elapsed := time.Since(start).Milliseconds()

	if err != nil {
		return HealthStatus{
			Healthy:      false,
			StatusCode:   0,
			Message:      fmt.Sprintf("Connection failed: %v", err),
			ResponseTime: elapsed,
		}
	}
	defer resp.Body.Close()

	healthy := resp.StatusCode >= 200 && resp.StatusCode < 300
	message := "OK"
	if !healthy {
		message = fmt.Sprintf("HTTP %d", resp.StatusCode)
	}

	return HealthStatus{
		Healthy:      healthy,
		StatusCode:   resp.StatusCode,
		Message:      message,
		ResponseTime: elapsed,
	}
}

// WikidataEntityResponse represents the Wikidata API entity response for P51 claims
type WikidataEntityResponse struct {
	Entities map[string]struct {
		Claims map[string][]struct {
			Mainsnak struct {
				Datavalue struct {
					// Value is interface{} because Wikidata claims can be strings (commonsMedia)
					// or objects (entity-type references). P51 (audio) is always a string.
					Value interface{} `json:"value"`
				} `json:"datavalue"`
			} `json:"mainsnak"`
		} `json:"claims"`
	} `json:"entities"`
}

// getWikidataAudioFile looks up the canonical Wikimedia Commons audio file for an anthem
// using Wikidata's P51 (audio) property. Returns the "File:Foo.ogg" title, or "" if not found.
func (w *WikimediaSource) getWikidataAudioFile(ctx context.Context, client *httpclient.Client, wikidataID string) (string, error) {
	apiURL := fmt.Sprintf(
		"https://www.wikidata.org/w/api.php?action=wbgetentities&ids=%s&props=claims&format=json",
		url.QueryEscape(wikidataID),
	)

	resp, err := client.Get(ctx, apiURL)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("Wikidata API returned status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	var result WikidataEntityResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return "", err
	}

	entity, ok := result.Entities[wikidataID]
	if !ok {
		return "", nil
	}

	p51Claims, ok := entity.Claims["P51"]
	if !ok || len(p51Claims) == 0 {
		return "", nil
	}

	// P51 (audio) datavalue is a commonsMedia string (the Wikimedia Commons filename)
	for _, claim := range p51Claims {
		if strVal, ok := claim.Mainsnak.Datavalue.Value.(string); ok && strVal != "" {
			return "File:" + strVal, nil
		}
	}
	return "", nil
}

// SearchResponse represents the API response for search
type SearchResponse struct {
	Query struct {
		Search []struct {
			Title  string `json:"title"`
			PageID int    `json:"pageid"`
		} `json:"search"`
	} `json:"query"`
}

// CategoryMembersResponse represents the API response for category members
type CategoryMembersResponse struct {
	Query struct {
		CategoryMembers []struct {
			PageID int    `json:"pageid"`
			Title  string `json:"title"`
		} `json:"categorymembers"`
	} `json:"query"`
}

// ImageInfoResponse represents the API response for image info
type ImageInfoResponse struct {
	Query struct {
		Pages map[string]struct {
			PageID    int    `json:"pageid"`
			Title     string `json:"title"`
			ImageInfo []struct {
				URL       string `json:"url"`
				Size      int    `json:"size"`
				Mime      string `json:"mime"`
				MediaType string `json:"mediatype"`
				Duration  float64 `json:"duration,omitempty"`
			} `json:"imageinfo"`
		} `json:"pages"`
	} `json:"query"`
}

// deterministicRecordingID generates a stable, unique recording ID from the
// country ID and Wikimedia filename. The same inputs always produce the same
// output, making re-runs idempotent.
func deterministicRecordingID(countryID, fileName string) string {
	h := sha256.Sum256([]byte(countryID + "|" + fileName))
	return "wr-" + hex.EncodeToString(h[:16]) // 32 hex chars + prefix
}

// Download fetches audio files from Wikimedia Commons
func (w *WikimediaSource) Download(ctx context.Context, db *sql.DB, logger *jobs.JobLogger) error {
	logger.Info("Starting Wikimedia Commons download")

	// Ensure schema exists
	if err := w.ApplySchema(db); err != nil {
		return fmt.Errorf("failed to apply schema: %w", err)
	}

	client := httpclient.New(httpclient.WithRateLimit(5, 1))

	// Get all countries that have anthems in our database
	rows, err := db.Query(`
		SELECT c.id, c.name, a.id as anthem_id, a.name as anthem_name, a.wikidata_id
		FROM countries c
		JOIN anthems a ON c.id = a.country_id
		WHERE a.wikidata_id IS NOT NULL AND a.wikidata_id != ''
		ORDER BY c.name
	`)
	if err != nil {
		return fmt.Errorf("failed to query countries: %w", err)
	}
	defer rows.Close()

	type countryAnthem struct {
		countryID   string
		countryName string
		anthemID    int
		anthemName  string
		wikidataID  string
	}

	var countries []countryAnthem
	for rows.Next() {
		var ca countryAnthem
		if err := rows.Scan(&ca.countryID, &ca.countryName, &ca.anthemID, &ca.anthemName, &ca.wikidataID); err != nil {
			return fmt.Errorf("failed to scan country: %w", err)
		}
		countries = append(countries, ca)
	}

	logger.Infof("Processing %d countries with anthems (with Wikidata IDs)", len(countries))

	inserted := 0
	skipped := 0
	alreadyHave := 0
	errors := 0

	// For each country, search for audio files in Wikimedia Commons
	for i, ca := range countries {
		if err := httpclient.CheckContext(ctx); err != nil {
			return fmt.Errorf("cancelled: %w", err)
		}

		if i > 0 && i%5 == 0 {
			logger.Infof("Progress: %d/%d countries processed", i, len(countries))
		}

		// Skip countries that already have audio recordings (makes re-runs resumable)
		var existingCount int
		_ = db.QueryRow(`SELECT COUNT(*) FROM audio_recordings WHERE country_id = ? AND source = 'wikimedia-commons'`, ca.countryID).Scan(&existingCount)
		if existingCount > 0 {
			alreadyHave++
			continue
		}

		// Strategy 0: Get canonical audio file directly from Wikidata (P51 property)
		var audioFiles []string
		if ca.wikidataID != "" {
			wikidataFile, err := w.getWikidataAudioFile(ctx, client, ca.wikidataID)
			if err != nil {
				logger.Infof("Wikidata P51 lookup failed for %s (%s): %v", ca.countryName, ca.wikidataID, err)
			} else if wikidataFile != "" {
				logger.Infof("Found Wikidata P51 audio for %s: %s", ca.countryName, wikidataFile)
				audioFiles = []string{wikidataFile}
			}
		}

		if len(audioFiles) == 0 {
			// Strategy 1: Search by anthem name
			searchQuery := ca.anthemName
			audioFiles, err = w.searchAudioFiles(ctx, client, searchQuery)
			if err != nil {
				logger.Infof("Error searching for '%s': %v", ca.anthemName, err)
			}
			// Filter search results: filename must contain a word from the anthem or country name
			if len(audioFiles) > 0 {
				audioFiles = w.filterAudioByRelevance(audioFiles, ca.anthemName, ca.countryName)
			}
		}

		if len(audioFiles) == 0 {
			// Strategy 2: Search by country name + "national anthem"
			searchQuery := fmt.Sprintf("National anthem %s", ca.countryName)
			audioFiles, err = w.searchAudioFiles(ctx, client, searchQuery)
			if err != nil {
				logger.Infof("Error searching for 'National anthem %s': %v", ca.countryName, err)
			}
			if len(audioFiles) > 0 {
				audioFiles = w.filterAudioByRelevance(audioFiles, ca.anthemName, ca.countryName)
			}
			if len(audioFiles) == 0 {
				skipped++
				continue
			}
		}

		logger.Infof("Found %d audio files for %s (%s)", len(audioFiles), ca.countryName, ca.anthemName)

		// Wrap per-country audio inserts in a transaction for atomicity
		tx, txErr := db.BeginTx(ctx, nil)
		if txErr != nil {
			errors++
			continue
		}

		// Get file info for each audio file (limit to first 3 to avoid too many recordings)
		countryInserted := 0
		for j, fileName := range audioFiles {
			if j >= 3 {
				break
			}

			fileInfo, err := w.getFileInfo(ctx, client, fileName)
			if err != nil {
				logger.Infof("Error getting file info for '%s': %v", fileName, err)
				errors++
				continue
			}

			// Determine recording type from filename
			recordingType := "vocal"
			filenameLower := strings.ToLower(fileName)
			if strings.Contains(filenameLower, "instrumental") {
				recordingType = "instrumental"
			}

			recordingID := deterministicRecordingID(ca.countryID, fileName)

			// Insert audio recording (ON CONFLICT skip for idempotency)
			_, err = tx.Exec(`
				INSERT INTO audio_recordings (
					id, country_id, title, url, format, duration_seconds,
					type, source, license, file_size_bytes, quality, created_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
				ON CONFLICT(id) DO UPDATE SET
					url = excluded.url,
					format = excluded.format,
					duration_seconds = excluded.duration_seconds,
					file_size_bytes = excluded.file_size_bytes,
					updated_at = CURRENT_TIMESTAMP
			`, recordingID, ca.countryID, fileName, fileInfo.url, fileInfo.mime, int(fileInfo.duration),
				recordingType, "wikimedia-commons", "CC-BY-SA", fileInfo.size, "standard")

			if err != nil {
				logger.Infof("Error inserting recording for '%s': %v", fileName, err)
				errors++
				continue
			}

			logger.Infof("✓ Inserted audio recording for %s: %s", ca.countryName, fileName)
			countryInserted++
		}

		if err := tx.Commit(); err != nil {
			logger.Infof("Error committing recordings for %s: %v", ca.countryName, err)
			errors++
			continue
		}
		inserted += countryInserted
	}

	// Update metadata
	_, err = db.Exec(`
		INSERT OR REPLACE INTO wikimedia_metadata (key, value, updated_at)
		VALUES ('last_download', ?, CURRENT_TIMESTAMP)
	`, time.Now().Format(time.RFC3339))
	if err != nil {
		return fmt.Errorf("failed to update metadata: %w", err)
	}

	_, err = db.Exec(`
		INSERT OR REPLACE INTO wikimedia_metadata (key, value, updated_at)
		VALUES ('record_count', ?, CURRENT_TIMESTAMP)
	`, fmt.Sprintf("%d", inserted))
	if err != nil {
		return fmt.Errorf("failed to update record count: %w", err)
	}

	logger.Infof("✓ Inserted %d audio recordings, skipped %d countries (no results), %d already had recordings, %d errors", inserted, skipped, alreadyHave, errors)
	return nil
}

type fileInfo struct {
	url      string
	size     int
	mime     string
	duration float64
}

// searchAudioFiles searches for audio files using MediaWiki search API
func (w *WikimediaSource) searchAudioFiles(ctx context.Context, client *httpclient.Client, searchQuery string) ([]string, error) {
	apiURL := fmt.Sprintf("%s?action=query&list=search&srsearch=%s&srnamespace=6&srlimit=10&format=json",
		w.url, url.QueryEscape(searchQuery))

	resp, err := client.Get(ctx, apiURL)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("API returned status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var result SearchResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, err
	}

	// Filter for audio files only (.ogg, .mp3, .wav, .flac)
	var audioFiles []string
	for _, item := range result.Query.Search {
		title := item.Title
		if strings.HasPrefix(title, "File:") {
			lowerTitle := strings.ToLower(title)
			if strings.HasSuffix(lowerTitle, ".ogg") ||
				strings.HasSuffix(lowerTitle, ".mp3") ||
				strings.HasSuffix(lowerTitle, ".wav") ||
				strings.HasSuffix(lowerTitle, ".flac") {
				audioFiles = append(audioFiles, title)
			}
		}
	}

	return audioFiles, nil
}

// filterAudioByRelevance filters search results to those whose filename contains at least
// one meaningful word from the anthem name or country name. This prevents clearly wrong
// results like "God Save the King" appearing for Jamaica, or an opera piece for Bosnia.
func (w *WikimediaSource) filterAudioByRelevance(files []string, anthemName, countryName string) []string {
	stopWords := map[string]bool{
		"the": true, "of": true, "and": true, "in": true, "a": true, "an": true,
		"to": true, "for": true, "national": true, "anthem": true, "song": true,
		"file": true, "music": true, "instrumental": true,
	}

	// Build keyword set from anthem name + country name
	keywords := make(map[string]bool)
	for _, word := range strings.Fields(strings.ToLower(anthemName + " " + countryName)) {
		word = strings.Trim(word, ".,;:'\"()-")
		if len(word) > 3 && !stopWords[word] {
			keywords[word] = true
		}
	}

	var filtered []string
	for _, f := range files {
		filenameLower := strings.ToLower(strings.ReplaceAll(f, "_", " "))
		for kw := range keywords {
			if strings.Contains(filenameLower, kw) {
				filtered = append(filtered, f)
				break
			}
		}
	}
	return filtered
}

// getCategoryAudioFiles retrieves audio files from a Wikimedia Commons category
func (w *WikimediaSource) getCategoryAudioFiles(ctx context.Context, client *httpclient.Client, category string) ([]string, error) {
	apiURL := fmt.Sprintf("%s?action=query&list=categorymembers&cmtitle=%s&cmlimit=50&format=json",
		w.url, url.QueryEscape(category))

	resp, err := client.Get(ctx, apiURL)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("API returned status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var result CategoryMembersResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, err
	}

	// Filter for audio files only (.ogg, .mp3, .wav, .flac)
	var audioFiles []string
	for _, member := range result.Query.CategoryMembers {
		title := member.Title
		if strings.HasPrefix(title, "File:") {
			lowerTitle := strings.ToLower(title)
			if strings.HasSuffix(lowerTitle, ".ogg") ||
				strings.HasSuffix(lowerTitle, ".mp3") ||
				strings.HasSuffix(lowerTitle, ".wav") ||
				strings.HasSuffix(lowerTitle, ".flac") {
				audioFiles = append(audioFiles, title)
			}
		}
	}

	return audioFiles, nil
}

// getFileInfo retrieves metadata for a specific file
func (w *WikimediaSource) getFileInfo(ctx context.Context, client *httpclient.Client, fileName string) (*fileInfo, error) {
	apiURL := fmt.Sprintf("%s?action=query&titles=%s&prop=imageinfo&iiprop=url|size|mime|mediatype&format=json",
		w.url, url.QueryEscape(fileName))

	resp, err := client.Get(ctx, apiURL)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("API returned status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var result ImageInfoResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, err
	}

	// Extract file info from first page
	for _, page := range result.Query.Pages {
		if len(page.ImageInfo) > 0 {
			info := page.ImageInfo[0]
			return &fileInfo{
				url:      info.URL,
				size:     info.Size,
				mime:     info.Mime,
				duration: info.Duration,
			}, nil
		}
	}

	return nil, fmt.Errorf("no file info found for %s", fileName)
}

func (w *WikimediaSource) ApplySchema(db *sql.DB) error {
	_, err := db.Exec(w.GetSchema())
	return err
}

func (w *WikimediaSource) SchemaExists(db *sql.DB) (bool, error) {
	var exists bool
	err := db.QueryRow(`
		SELECT EXISTS(
			SELECT 1 FROM sqlite_master 
			WHERE type='table' AND name='wikimedia_metadata'
		)
	`).Scan(&exists)
	return exists, err
}

func (w *WikimediaSource) GetDataStats(db *sql.DB) (DataStats, error) {
	stats := DataStats{
		SchemaVersion: wikimediaSchemaVersion,
	}

	exists, err := w.SchemaExists(db)
	if err != nil || !exists {
		return stats, err
	}

	var countStr string
	err = db.QueryRow(`
		SELECT value FROM wikimedia_metadata WHERE key = 'record_count'
	`).Scan(&countStr)
	if err != nil && err != sql.ErrNoRows {
		return stats, err
	}
	fmt.Sscanf(countStr, "%d", &stats.RecordCount)

	err = db.QueryRow(`
		SELECT value FROM wikimedia_metadata WHERE key = 'last_download'
	`).Scan(&stats.LastUpdated)
	if err != nil && err != sql.ErrNoRows {
		return stats, err
	}

	var pageCount, pageSize int64
	db.QueryRow("PRAGMA page_count").Scan(&pageCount)
	db.QueryRow("PRAGMA page_size").Scan(&pageSize)
	stats.StorageBytes = (pageCount * pageSize) / int64(len(AllSources)+1)

	return stats, nil
}

func (w *WikimediaSource) NeedsUpdate(db *sql.DB) (bool, error) {
	exists, err := w.SchemaExists(db)
	if err != nil {
		return false, err
	}
	if !exists {
		return true, nil
	}

	var countStr string
	err = db.QueryRow(`
		SELECT value FROM wikimedia_metadata WHERE key = 'record_count'
	`).Scan(&countStr)
	if err == sql.ErrNoRows {
		return true, nil
	}
	if err != nil {
		return false, err
	}

	var count int
	fmt.Sscanf(countStr, "%d", &count)
	if count == 0 {
		return true, nil
	}

	var lastDownload string
	err = db.QueryRow(`
		SELECT value FROM wikimedia_metadata WHERE key = 'last_download'
	`).Scan(&lastDownload)
	if err == sql.ErrNoRows {
		return true, nil
	}
	if err != nil {
		return false, err
	}

	lastTime, err := time.Parse(time.RFC3339, lastDownload)
	if err != nil {
		return true, nil
	}

	age := time.Since(lastTime)
	return age > 30*24*time.Hour, nil
}
