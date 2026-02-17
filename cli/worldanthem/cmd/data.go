package cmd

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/anthemworld/cli/pkg/db"
	"github.com/anthemworld/cli/pkg/jobs"
	"github.com/anthemworld/cli/pkg/sources"
	"github.com/spf13/cobra"
)

// Helper function to join table names
func joinTables(tables []string) string {
	return strings.Join(tables, ", ")
}

var statusCmd = &cobra.Command{
	Use:   "status",
	Short: "Show overall status of the system",
	Long:  `Display status information including data status and jobs status.`,
	RunE: func(cmd *cobra.Command, args []string) error {
		fmt.Println("=== World Anthem Status ===\n")
		
		// Call data status
		if err := dataStatusCmd.RunE(cmd, args); err != nil {
			return err
		}
		
		fmt.Println()
		
		// Call data sources status
		if err := dataSourcesCmd.RunE(cmd, args); err != nil {
			return err
		}
		
		fmt.Println()
		
		// Call jobs status
		if err := jobsStatusCmd.RunE(cmd, args); err != nil {
			return err
		}
		
		return nil
	},
}

var dataCmd = &cobra.Command{
	Use:   "data",
	Short: "Data management commands",
	Long:  `Commands for discovering, downloading, and managing anthem data.`,
}

var dataDiscoverCmd = &cobra.Command{
	Use:   "discover",
	Short: "Discover available data sources",
	Long:  `Placeholder command to discover data sources for country and anthem information.`,
	RunE: func(cmd *cobra.Command, args []string) error {
		fmt.Println("Data Discovery")
		fmt.Println("==============")
		fmt.Println("TODO: Implement data source discovery")
		fmt.Println("\nThis command will:")
		fmt.Println("  - Check connectivity to REST Countries API")
		fmt.Println("  - Check connectivity to Wikidata SPARQL endpoint")
		fmt.Println("  - Check connectivity to Wikimedia Commons API")
		fmt.Println("  - Initialize data_sources table in database")
		return nil
	},
}

var dataStatusCmd = &cobra.Command{
	Use:   "status",
	Short: "Show data status",
	Long:  `Display information about the database and data.`,
	RunE: func(cmd *cobra.Command, args []string) error {
		fmt.Println("--- Data Status ---")
		
		database, err := db.GetDB()
		if err != nil {
			return fmt.Errorf("failed to get database: %w", err)
		}
		defer database.Close()
		
		stats, err := db.GetDataStats(database)
		if err != nil {
			return fmt.Errorf("failed to get data stats: %w", err)
		}
		
		fmt.Printf("Database File: %s\n", db.GetDBPath())
		fmt.Printf("Database Exists: %v\n", stats.DatabaseExists)
		fmt.Printf("Schema Applied: %v\n", stats.SchemaApplied)
		fmt.Printf("Schema Version: %d\n", stats.SchemaVersion)
		fmt.Printf("Schema Up-to-date: %v\n", stats.SchemaUpToDate)
		fmt.Println("\nData Counts:")
		fmt.Printf("  Countries: %d\n", stats.CountryCount)
		fmt.Printf("  Anthems: %d\n", stats.AnthemCount)
		fmt.Printf("  Audio Recordings: %d\n", stats.AudioCount)
		fmt.Printf("  Job Records: %d\n", stats.JobCount)
		
		return nil
	},
}

var dataSourcesCmd = &cobra.Command{
	Use:   "sources",
	Short: "Check data source health",
	Long:  `Check the health status of all configured data sources.`,
	RunE: func(cmd *cobra.Command, args []string) error {
		fmt.Println("Data Sources Status")
		fmt.Println("===================\n")
		
		database, err := db.GetDB()
		if err != nil {
			return fmt.Errorf("failed to get database: %w", err)
		}
		defer database.Close()
		
		ctx := context.Background()
		allSources := sources.AllSources
		
		if len(allSources) == 0 {
			fmt.Println("No data sources configured.")
			return nil
		}
		
		for i, source := range allSources {
			if i > 0 {
				fmt.Println()
			}
			
			fmt.Printf("[%d] %s\n", i+1, source.Name())
			fmt.Printf("    ID:   %s\n", source.ID())
			fmt.Printf("    Type: %s\n", source.Type())
			fmt.Printf("    URL:  %s\n", source.URL())
			
			// Check schema status
			schemaExists, err := source.SchemaExists(database)
			if err != nil {
				fmt.Printf("    Schema: ✗ Error checking: %v\n", err)
			} else if schemaExists {
				fmt.Printf("    Schema: ✓ Applied (v%d)\n", source.GetSchemaVersion())
				
				// Show tables created by this source
				tables := source.GetTables()
				if len(tables) > 0 {
					fmt.Printf("    Tables: %s\n", joinTables(tables))
				}
			} else {
				fmt.Printf("    Schema: ✗ Not applied\n")
			}
			
			// Get data stats if schema exists
			if schemaExists {
				stats, err := source.GetDataStats(database)
				if err != nil {
					fmt.Printf("    Data: Error: %v\n", err)
				} else {
					fmt.Printf("    Data: %d records", stats.RecordCount)
					if stats.StorageBytes > 0 {
						fmt.Printf(", ~%.1f MB", float64(stats.StorageBytes)/(1024*1024))
					}
					if stats.LastUpdated != "" {
						fmt.Printf(", updated %s", stats.LastUpdated)
					}
					fmt.Println()
					
					// Check if needs update
					needsUpdate, _ := source.NeedsUpdate(database)
					if needsUpdate {
						fmt.Println("    Status: ⚠ Needs update")
					}
				}
			}
			
			// Perform health check
			fmt.Print("    Health: Checking...")
			health := source.HealthCheck(ctx)
			
			// Move cursor back and clear line
			fmt.Print("\r    Health: ")
			
			if health.Healthy {
				fmt.Printf("✓ Healthy")
			} else {
				fmt.Printf("✗ Unhealthy")
			}
			
			fmt.Printf(" (%dms)\n", health.ResponseTime)
			
			if health.StatusCode > 0 {
				fmt.Printf("    Status Code: %d\n", health.StatusCode)
			}
			
			if health.Message != "OK" {
				fmt.Printf("    Message: %s\n", health.Message)
			}
		}
		
		return nil
	},
}

var dataFormatCmd = &cobra.Command{
	Use:   "format",
	Short: "Format and export data to JSON",
	Long:  `Export database data to JSON files for use by the website.`,
	RunE: func(cmd *cobra.Command, args []string) error {
		format, _ := cmd.Flags().GetString("format")
		output, _ := cmd.Flags().GetString("output")
		
		// Create output directory if it doesn't exist (mkdir -p behavior)
		absOutput, err := filepath.Abs(output)
		if err != nil {
			return fmt.Errorf("failed to resolve output path: %w", err)
		}
		
		if err := os.MkdirAll(absOutput, 0755); err != nil {
			return fmt.Errorf("failed to create output directory: %w", err)
		}
		
		fmt.Printf("Data Format: %s\n", format)
		fmt.Printf("Output Directory: %s\n", absOutput)
		
		// Check if directory is writable
		testFile := filepath.Join(absOutput, ".write-test")
		if err := os.WriteFile(testFile, []byte("test"), 0644); err != nil {
			return fmt.Errorf("output directory is not writable: %w", err)
		}
		os.Remove(testFile)
		
		fmt.Println("\nTODO: Implement data formatting")
		fmt.Println("This command will generate:")
		fmt.Println("  - index.json (metadata and file references)")
		fmt.Println("  - countries.json (country data)")
		fmt.Println("  - anthems.json (anthem metadata)")
		fmt.Println("  - audio.json (audio file references)")
		fmt.Println("  - geography.json (GeoJSON country boundaries)")
		
		return nil
	},
}

var dataDownloadCmd = &cobra.Command{
	Use:   "download",
	Short: "Download data from sources",
	Long:  `Download data from all or specified data sources.`,
	RunE: func(cmd *cobra.Command, args []string) error {
		database, err := db.GetDB()
		if err != nil {
			return fmt.Errorf("failed to get database: %w", err)
		}
		defer database.Close()

		fmt.Println("=== Data Download ===\n")

		// Create job
		jobID, err := jobs.CreateJob(database, "data-download", map[string]interface{}{
			"sources": "all",
		})
		if err != nil {
			return fmt.Errorf("failed to create job: %w", err)
		}

		fmt.Printf("Created job: %s\n\n", jobID)

		// Create logger
		logger := jobs.NewJobLogger(database, jobID)

		// Start job
		if err := jobs.StartJob(database, jobID); err != nil {
			return fmt.Errorf("failed to start job: %w", err)
		}

		// Download from all sources
		ctx := context.Background()
		allSources := sources.AllSources
		successCount := 0
		failCount := 0

		for i, source := range allSources {
			fmt.Printf("[%d/%d] %s\n", i+1, len(allSources), source.Name())
			logger.Infof("Starting download from %s", source.Name())

			// Download from source
			if err := source.Download(ctx, database, logger); err != nil {
				logger.Errorf("Failed to download from %s: %v", source.Name(), err.Error())
				fmt.Printf("    ✗ Failed: %v\n\n", err)
				failCount++
				continue
			}

			logger.Infof("✓ Successfully downloaded from %s", source.Name())
			fmt.Printf("    ✓ Success\n\n")
			successCount++
		}

		// Complete or fail job based on results
		if failCount > 0 && successCount == 0 {
			// All sources failed
			errMsg := fmt.Sprintf("All %d sources failed", failCount)
			jobs.FailJob(database, jobID, errMsg)
			logger.Error(errMsg)
			return fmt.Errorf(errMsg)
		} else if failCount > 0 {
			// Partial success
			logger.Warnf("Download completed with %d successes and %d failures", successCount, failCount)
		} else {
			// All succeeded
			logger.Infof("All %d sources downloaded successfully", successCount)
		}

		// Complete job
		if err := jobs.CompleteJob(database, jobID); err != nil {
			return fmt.Errorf("failed to complete job: %w", err)
		}

		fmt.Println("=== Download Summary ===")
		fmt.Printf("✓ Success: %d sources\n", successCount)
		if failCount > 0 {
			fmt.Printf("✗ Failed: %d sources\n", failCount)
		}
		fmt.Printf("\nNext steps:")
		fmt.Printf("\n  1. Check status: worldanthem data sources")
		fmt.Printf("\n  2. Export data: worldanthem data format --output hugo/site/static/data\n")

		return nil
	},
}

func init() {
	rootCmd.AddCommand(statusCmd)
	rootCmd.AddCommand(dataCmd)
	
	dataCmd.AddCommand(dataDiscoverCmd)
	dataCmd.AddCommand(dataStatusCmd)
	dataCmd.AddCommand(dataSourcesCmd)
	dataCmd.AddCommand(dataFormatCmd)
	dataCmd.AddCommand(dataDownloadCmd)
	
	dataFormatCmd.Flags().StringP("format", "f", "json", "Output format (json)")
	dataFormatCmd.Flags().StringP("output", "o", "./output", "Output directory")
}
