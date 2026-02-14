package cmd

import (
	"fmt"

	"github.com/anthemworld/cli/pkg/db"
	"github.com/spf13/cobra"
)

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
		fmt.Println("===================")
		fmt.Println("TODO: Implement data source health checks")
		fmt.Println("\nPlanned sources:")
		fmt.Println("  - REST Countries API")
		fmt.Println("  - Wikidata SPARQL")
		fmt.Println("  - Wikimedia Commons API")
		fmt.Println("  - Wikipedia API")
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
		
		fmt.Printf("Data Format: %s\n", format)
		fmt.Printf("Output Directory: %s\n", output)
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

func init() {
	rootCmd.AddCommand(statusCmd)
	rootCmd.AddCommand(dataCmd)
	
	dataCmd.AddCommand(dataDiscoverCmd)
	dataCmd.AddCommand(dataStatusCmd)
	dataCmd.AddCommand(dataSourcesCmd)
	dataCmd.AddCommand(dataFormatCmd)
	
	dataFormatCmd.Flags().StringP("format", "f", "json", "Output format (json)")
	dataFormatCmd.Flags().StringP("output", "o", "./output", "Output directory")
}
