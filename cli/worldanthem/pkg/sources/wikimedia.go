package sources

import (
	"context"
	"database/sql"
	_ "embed"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

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
	client := &http.Client{
		Timeout: 10 * time.Second,
	}

	// Simple test query to check API health
	testURL := fmt.Sprintf("%s?action=query&meta=siteinfo&format=json", w.url)

	start := time.Now()
	req, err := http.NewRequestWithContext(ctx, "GET", testURL, nil)
	if err != nil {
		return HealthStatus{
			Healthy:      false,
			StatusCode:   0,
			Message:      fmt.Sprintf("Failed to create request: %v", err),
			ResponseTime: 0,
		}
	}

	req.Header.Set("User-Agent", "AnthemWorld-CLI/1.0")
	req.Header.Set("Accept", "application/json")

	resp, err := client.Do(req)
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

// Download fetches audio files from Wikimedia Commons
func (w *WikimediaSource) Download(ctx context.Context, db *sql.DB, logger *jobs.JobLogger) error {
	logger.Info("Starting Wikimedia Commons download")

	// Ensure schema exists
	if err := w.ApplySchema(db); err != nil {
		return fmt.Errorf("failed to apply schema: %w", err)
	}

	client := &http.Client{
		Timeout: 30 * time.Second,
	}

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
		if i > 0 && i%5 == 0 {
			logger.Infof("Progress: %d/%d countries processed", i, len(countries))
			// Rate limiting: sleep between batches
			time.Sleep(3 * time.Second)
		}

		// Skip countries that already have audio recordings (makes re-runs resumable)
		var existingCount int
		_ = db.QueryRow(`SELECT COUNT(*) FROM audio_recordings WHERE country_id = ? AND source = 'wikimedia-commons'`, ca.countryID).Scan(&existingCount)
		if existingCount > 0 {
			alreadyHave++
			continue
		}

		// Strategy 1: Search by anthem name
		searchQuery := fmt.Sprintf("%s", ca.anthemName)
		audioFiles, err := w.searchAudioFiles(ctx, client, searchQuery)
		if err != nil {
			logger.Infof("Error searching for '%s': %v", ca.anthemName, err)
		}
		if len(audioFiles) == 0 {
			// Strategy 2: Search by country name + "national anthem"
			searchQuery = fmt.Sprintf("National anthem %s", ca.countryName)
			audioFiles, err = w.searchAudioFiles(ctx, client, searchQuery)
			if err != nil {
				logger.Infof("Error searching for 'National anthem %s': %v", ca.countryName, err)
			}
			if len(audioFiles) == 0 {
				skipped++
				continue
			}
		}

		logger.Infof("Found %d audio files for %s (%s)", len(audioFiles), ca.countryName, ca.anthemName)

		// Get file info for each audio file (limit to first 3 to avoid too many recordings)
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

			// Generate a unique ID for the recording
			recordingID := fmt.Sprintf("%s-%d", ca.countryID, time.Now().UnixNano())

			// Insert audio recording
			_, err = db.Exec(`
				INSERT INTO audio_recordings (
					id, country_id, title, url, format, duration_seconds,
					type, source, license, file_size_bytes, quality, created_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
			`, recordingID, ca.countryID, fileName, fileInfo.url, fileInfo.mime, int(fileInfo.duration),
				recordingType, "wikimedia-commons", "CC-BY-SA", fileInfo.size, "standard")

			if err != nil {
				// Check if it's a duplicate
				if strings.Contains(err.Error(), "UNIQUE") {
					logger.Infof("Duplicate recording for %s, skipping", fileName)
					continue
				}
				logger.Infof("Error inserting recording for '%s': %v", fileName, err)
				errors++
				continue
			}

			logger.Infof("✓ Inserted audio recording for %s: %s", ca.countryName, fileName)
			inserted++
		}
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
func (w *WikimediaSource) searchAudioFiles(ctx context.Context, client *http.Client, searchQuery string) ([]string, error) {
	apiURL := fmt.Sprintf("%s?action=query&list=search&srsearch=%s&srnamespace=6&srlimit=10&format=json",
		w.url, url.QueryEscape(searchQuery))

	req, err := http.NewRequestWithContext(ctx, "GET", apiURL, nil)
	if err != nil {
		return nil, err
	}

	req.Header.Set("User-Agent", "AnthemWorld-CLI/1.0")
	req.Header.Set("Accept", "application/json")

	resp, err := client.Do(req)
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

// getCategoryAudioFiles retrieves audio files from a Wikimedia Commons category
func (w *WikimediaSource) getCategoryAudioFiles(ctx context.Context, client *http.Client, category string) ([]string, error) {
	apiURL := fmt.Sprintf("%s?action=query&list=categorymembers&cmtitle=%s&cmlimit=50&format=json",
		w.url, url.QueryEscape(category))

	req, err := http.NewRequestWithContext(ctx, "GET", apiURL, nil)
	if err != nil {
		return nil, err
	}

	req.Header.Set("User-Agent", "AnthemWorld-CLI/1.0")
	req.Header.Set("Accept", "application/json")

	resp, err := client.Do(req)
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
func (w *WikimediaSource) getFileInfo(ctx context.Context, client *http.Client, fileName string) (*fileInfo, error) {
	apiURL := fmt.Sprintf("%s?action=query&titles=%s&prop=imageinfo&iiprop=url|size|mime|mediatype&format=json",
		w.url, url.QueryEscape(fileName))

	req, err := http.NewRequestWithContext(ctx, "GET", apiURL, nil)
	if err != nil {
		return nil, err
	}

	req.Header.Set("User-Agent", "AnthemWorld-CLI/1.0")
	req.Header.Set("Accept", "application/json")

	resp, err := client.Do(req)
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
